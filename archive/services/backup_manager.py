from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timedelta
import fcntl
import gzip
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import time
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, get_datetime, now_datetime

ROLE_BACKUP_MANAGEMENT = "صلاحية إدارة النسخ الاحتياطي"
BACKUP_LOG_DOCTYPE = "Archive Backup Log"
SETTINGS_DOCTYPE = "Archive Settings"

MODE_FULL_TAR_LABEL = "حزمة كاملة سريعة (.tar ذكي)"
MODE_FULL_TAR_GZ_LABEL = "حزمة كاملة مضغوطة (.tar.gz)"
MODE_INCREMENTAL_LABEL = "مزامنة تفاضلية سريعة + لقطات القاعدة"

MODE_LABEL_TO_KEY = {
	MODE_FULL_TAR_LABEL: "full_tar",
	MODE_FULL_TAR_GZ_LABEL: "full_tar_gz",
	MODE_INCREMENTAL_LABEL: "incremental_sync",
	"full_tar": "full_tar",
	"full_tar_gz": "full_tar_gz",
	"incremental_sync": "incremental_sync",
}
MODE_KEY_TO_LABEL = {
	"full_tar": MODE_FULL_TAR_LABEL,
	"full_tar_gz": MODE_FULL_TAR_GZ_LABEL,
	"incremental_sync": MODE_INCREMENTAL_LABEL,
	"portable_export": "تصدير حزمة كاملة (.tar)",
}

UNIT_HOURS_LABEL = "ساعات"
UNIT_MINUTES_LABEL = "دقائق"
UNIT_DAYS_LABEL = "أيام"

BACKUP_SETTINGS_FIELDS = (
	"backup_enabled",
	"backup_destination_path",
	"backup_require_mount",
	"backup_mode",
	"backup_interval_value",
	"backup_interval_unit",
	"backup_enable_retention",
	"backup_max_keep",
	"backup_pigz_threads",
	"backup_min_free_space_gb",
)

BACKUP_SYSTEM_READONLY_FIELDS = (
	"backup_last_run_at",
	"backup_last_status",
	"backup_next_run_at",
	"backup_last_output_path",
)

FAT32_FS_TYPES = {"vfat", "msdos", "fat", "fat32"}
FAT32_SAFE_FILE_LIMIT_BYTES = int(3.9 * 1024 * 1024 * 1024)  # 3.9 GiB safety cap before 4 GiB FAT32 limit

FORBIDDEN_SYSTEM_PREFIXES = (
	"/etc",
	"/usr",
	"/bin",
	"/sbin",
	"/lib",
	"/lib64",
	"/proc",
	"/sys",
	"/dev",
	"/boot",
	"/root",
	"/var/lib/mysql",
)

_BUNDLE_TIMESTAMP_RE = re.compile(r"^archive_backup_(?P<slug>[A-Za-z0-9_]+)_(?P<ts>\d{8}_\d{6})\.(?:tar|tar\.gz)$")
_SNAPSHOT_DIR_RE = re.compile(r"^\d{8}_\d{6}$")


# =====================================================================
# 1. STRICT EXPLICIT PERMISSIONS (NO IMPLICIT ADMIN/SYS-MGR BYPASS)
# =====================================================================


def _has_explicit_role_db(role_name: str, user: str | None = None) -> bool:
	"""
	Direct uncached DB check against `tabHas Role`.
	No implicit exemption for Administrator or System Manager.
	"""
	resolved = cstr(user or frappe.session.user or "Guest").strip()
	if not resolved or resolved == "Guest" or not role_name:
		return False

	if resolved != "Administrator":
		enabled_rows = frappe.db.sql(
			"SELECT enabled FROM `tabUser` WHERE name = %s LIMIT 1",
			(resolved,),
			as_dict=True,
		)
		if not enabled_rows or not cint(enabled_rows[0].get("enabled")):
			return False

	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabHas Role`
		WHERE parent = %s
		  AND parenttype = 'User'
		  AND parentfield = 'roles'
		  AND role = %s
		LIMIT 1
		""",
		(resolved, role_name),
		as_dict=True,
	)
	return bool(rows)


def has_backup_management_role(user: str | None = None) -> bool:
	return _has_explicit_role_db(ROLE_BACKUP_MANAGEMENT, user=user)


def require_backup_management_role(user: str | None = None) -> None:
	if not has_backup_management_role(user=user):
		frappe.throw(
			_("ليست لديك صلاحية إدارة النسخ الاحتياطي ({0}).").format(ROLE_BACKUP_MANAGEMENT),
			frappe.PermissionError,
		)


def is_archive_settings_general_admin(user: str | None = None) -> bool:
	"""General Archive Settings admin (Fiscal Years, Rate Limits, Swift Banks)."""
	resolved = cstr(user or frappe.session.user or "Guest").strip()
	if not resolved or resolved == "Guest":
		return False
	if resolved == "Administrator":
		return True
	return _has_explicit_role_db("System Manager", user=resolved)


def get_backup_log_permission_query_conditions(
	user: str | None = None,
	doctype: str | None = None,
) -> str:
	del doctype
	if not has_backup_management_role(user=user):
		return "1=0"
	return "1=1"


def has_backup_log_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
	debug: bool = False,
) -> bool:
	del doc, debug
	if not has_backup_management_role(user=user):
		return False
	perm = (ptype or "read").strip().lower()
	return perm in ("read", "select", "report")


# =====================================================================
# 2. PLUGGABLE STORAGE ADAPTER LAYER (LOCAL / USB / MOUNTED NAS-SMB)
# =====================================================================


class BackupStorageAdapter(ABC):
	"""Abstract storage adapter so future SMB/SFTP/S3 adapters plug in without changing engine logic."""

	@abstractmethod
	def validate_destination(
		self,
		destination: str,
		*,
		require_mount: bool = False,
		create_if_missing: bool = False,
		estimated_bytes: int = 0,
		min_free_space_gb: float = 2.0,
		single_file_mode: bool = True,
	) -> dict[str, Any]:
		raise NotImplementedError


def _resolve_mount_info(path: str) -> dict[str, Any]:
	"""Inspect /proc/mounts to determine mountpoint and filesystem type for `path`."""
	probe = os.path.abspath(path)
	while probe and not os.path.exists(probe):
		parent = os.path.dirname(probe)
		if parent == probe:
			break
		probe = parent
	real_probe = os.path.realpath(probe) if probe else "/"

	best_mount = "/"
	best_fstype = "unknown"
	best_device = ""

	try:
		with open("/proc/mounts", encoding="utf-8", errors="ignore") as f:
			for line in f:
				parts = line.split()
				if len(parts) < 3:
					continue
				dev, mnt, fstype = parts[0], parts[1], parts[2]
				mnt = mnt.replace("\\040", " ").replace("\\011", "\t")
				if real_probe == mnt or real_probe.startswith(mnt.rstrip("/") + "/") or mnt == "/":
					if len(mnt) >= len(best_mount):
						best_mount = mnt
						best_fstype = fstype.lower()
						best_device = dev
	except Exception:
		pass

	return {
		"mountpoint": best_mount,
		"fstype": best_fstype,
		"device": best_device,
		"is_external_mount": best_mount != "/",
	}


def _get_forbidden_backup_roots() -> list[tuple[str, str]]:
	roots: list[tuple[str, str]] = [(p, p) for p in FORBIDDEN_SYSTEM_PREFIXES]
	try:
		site_path = os.path.realpath(frappe.get_site_path())
		roots.append((site_path, "مجلد الموقع الحالي (لمنع النسخ التكراري أو كشف النسخ)"))
		bench_root = os.path.realpath(os.path.join(site_path, "..", ".."))
		for sub in ("apps", "env", "config"):
			roots.append((os.path.join(bench_root, sub), f"مجلد النظام ({sub})"))
	except Exception:
		pass
	return roots


def _is_subpath(child: str, parent: str) -> bool:
	child_n = os.path.normpath(child)
	parent_n = os.path.normpath(parent)
	if child_n == parent_n:
		return True
	return child_n.startswith(parent_n.rstrip(os.sep) + os.sep)


class LocalMountStorageAdapter(BackupStorageAdapter):
	"""
	Handles local disks, external USB drives (ext4/NTFS/exFAT), and OS-mounted
	network shares (SMB/CIFS/NFS) with mount verification, FAT32 safety detection,
	disk-space guards, and atomic .part writes.
	"""

	def validate_destination(
		self,
		destination: str,
		*,
		require_mount: bool = False,
		create_if_missing: bool = False,
		estimated_bytes: int = 0,
		min_free_space_gb: float = 2.0,
		single_file_mode: bool = True,
	) -> dict[str, Any]:
		raw = cstr(destination or "").strip()
		if not raw:
			frappe.throw(_("يرجى تحديد مسار حفظ النسخ الاحتياطي."), frappe.ValidationError)
		if "\x00" in raw or "\n" in raw or "\r" in raw:
			frappe.throw(_("مسار النسخ الاحتياطي يحتوي على محارف غير صالحة."), frappe.ValidationError)
		if not os.path.isabs(raw):
			frappe.throw(
				_("مسار النسخ الاحتياطي يجب أن يكون مساراً مطلقاً يبدأ بـ / (مثال: /mnt/backup/archive)."),
				frappe.ValidationError,
			)

		abs_path = os.path.normpath(os.path.abspath(raw))
		if abs_path == "/":
			frappe.throw(_("لا يُسمح باختيار الجذر (/) كمسار للنسخ الاحتياطي."), frappe.ValidationError)

		# Resolve real path of existing ancestor to prevent symlink bypasses
		existing_ancestor = abs_path
		tail_parts: list[str] = []
		while existing_ancestor and not os.path.exists(existing_ancestor):
			parent = os.path.dirname(existing_ancestor)
			if parent == existing_ancestor:
				break
			tail_parts.append(os.path.basename(existing_ancestor))
			existing_ancestor = parent
		resolved_path = (
			os.path.normpath(os.path.join(os.path.realpath(existing_ancestor), *reversed(tail_parts)))
			if existing_ancestor
			else abs_path
		)

		for forbidden_root, label in _get_forbidden_backup_roots():
			if _is_subpath(resolved_path, forbidden_root) or _is_subpath(abs_path, forbidden_root):
				frappe.throw(
					_("لا يُسمح بحفظ النسخ الاحتياطي داخل {0} لأسباب أمنية وتقنية.").format(label),
					frappe.ValidationError,
				)

		if os.path.exists(resolved_path) and not os.path.isdir(resolved_path):
			frappe.throw(
				_("المسار المحدد ({0}) يشير إلى ملف وليس مجلداً.").format(abs_path),
				frappe.ValidationError,
			)

		mount_info = _resolve_mount_info(resolved_path)
		if require_mount and not mount_info["is_external_mount"]:
			frappe.throw(
				_(
					"القرص الخارجي أو المسار الشبكي غير متصل حالياً على المسار ({0}). "
					"تم إيقاف النسخ لمنع الكتابة على القرص الرئيسي للسيرفر."
				).format(abs_path),
				frappe.ValidationError,
			)

		if not os.path.exists(resolved_path):
			if create_if_missing:
				try:
					os.makedirs(resolved_path, exist_ok=True)
				except OSError as exc:
					frappe.throw(
						_("تعذر إنشاء مجلد النسخ الاحتياطي ({0}): {1}").format(abs_path, cstr(exc)),
						frappe.ValidationError,
					)
			else:
				# Check that the nearest existing ancestor is writable so creation will succeed
				if not os.access(existing_ancestor, os.W_OK | os.X_OK):
					frappe.throw(
						_("لا توجد صلاحية كتابة لإنشاء المجلد ({0}) ضمن ({1}).").format(
							abs_path, existing_ancestor
						),
						frappe.ValidationError,
					)

		probe_dir = resolved_path if os.path.isdir(resolved_path) else existing_ancestor
		probe_file = os.path.join(probe_dir, f".archive_backup_probe_{os.getpid()}_{int(time.time())}")
		try:
			with open(probe_file, "wb") as pf:
				pf.write(b"ok")
			os.remove(probe_file)
		except OSError as exc:
			frappe.throw(
				_("تعذر اختبار الكتابة والحذف في المسار ({0}): {1}").format(abs_path, cstr(exc)),
				frappe.ValidationError,
			)

		usage = shutil.disk_usage(probe_dir)
		free_bytes = int(usage.free)
		total_bytes = int(usage.total)
		min_margin_bytes = int(max(0.5, flt(min_free_space_gb or 2.0)) * 1024 * 1024 * 1024)
		required_bytes = int(estimated_bytes * 1.25) + min_margin_bytes if estimated_bytes > 0 else min_margin_bytes

		warnings: list[str] = []
		fstype = mount_info["fstype"]
		if fstype in FAT32_FS_TYPES:
			warnings.append(
				"نظام ملفات القرص هو FAT32 الذي لا يدعم ملفاً واحداً أكبر من 4 GB؛ يُنصح بتهيئة القرص كـ exFAT أو NTFS أو ext4."
			)
			if single_file_mode and estimated_bytes >= FAT32_SAFE_FILE_LIMIT_BYTES:
				frappe.throw(
					_(
						"حجم النسخة المتوقع ({0:.2f} GB) يقترب من أو يتجاوز حد نظام ملفات FAT32 البالغ 4 GB. "
						"يرجى استخدام قرص بنظام exFAT / NTFS / ext4 أو التحول إلى وضع المزامنة التفاضلية."
					).format(estimated_bytes / (1024**3)),
					frappe.ValidationError,
				)

		if free_bytes < required_bytes:
			frappe.throw(
				_(
					"المساحة الحرة في ({0}) غير كافية: المتاح {1:.2f} GB، بينما المطلوب مع هامش الأمان {2:.2f} GB."
				).format(
					abs_path,
					free_bytes / (1024**3),
					required_bytes / (1024**3),
				),
				frappe.ValidationError,
			)

		return {
			"path": resolved_path,
			"exists": os.path.isdir(resolved_path),
			"mountpoint": mount_info["mountpoint"],
			"fstype": fstype,
			"device": mount_info["device"],
			"is_external_mount": mount_info["is_external_mount"],
			"free_bytes": free_bytes,
			"total_bytes": total_bytes,
			"free_gb": round(free_bytes / (1024**3), 2),
			"total_gb": round(total_bytes / (1024**3), 2),
			"required_gb": round(required_bytes / (1024**3), 2),
			"warnings": warnings,
		}


def get_storage_adapter() -> BackupStorageAdapter:
	return LocalMountStorageAdapter()


# =====================================================================
# 3. SETTINGS HELPERS & SCHEDULING MATH
# =====================================================================


def normalize_backup_mode(raw_mode: str | None) -> str:
	clean = cstr(raw_mode or "").strip()
	return MODE_LABEL_TO_KEY.get(clean, "full_tar")


def get_backup_settings_dict() -> dict[str, Any]:
	"""Read backup configuration directly from Archive Settings without stale cache."""
	def _read(field: str, default: Any = None) -> Any:
		try:
			val = frappe.db.get_single_value(SETTINGS_DOCTYPE, field, cache=False)
			return default if val is None else val
		except Exception:
			return default

	interval_val = max(1, cint(_read("backup_interval_value", 6) or 6))
	raw_unit = cstr(_read("backup_interval_unit", UNIT_HOURS_LABEL) or UNIT_HOURS_LABEL).strip()
	if raw_unit in (UNIT_MINUTES_LABEL, "minutes"):
		unit = UNIT_MINUTES_LABEL
		interval_minutes = interval_val
	elif raw_unit in (UNIT_DAYS_LABEL, "days"):
		unit = UNIT_DAYS_LABEL
		interval_minutes = interval_val * 24 * 60
	else:
		unit = UNIT_HOURS_LABEL
		interval_minutes = interval_val * 60
	cpu_count = os.cpu_count() or 4
	default_threads = min(4, max(1, cpu_count // 2))
	threads = min(cpu_count, max(1, cint(_read("backup_pigz_threads", default_threads) or default_threads)))

	return {
		"enabled": bool(cint(_read("backup_enabled", 0))),
		"destination_path": cstr(_read("backup_destination_path", "") or "").strip(),
		"require_mount": bool(cint(_read("backup_require_mount", 0))),
		"backup_mode": normalize_backup_mode(_read("backup_mode", MODE_FULL_TAR_LABEL)),
		"backup_mode_label": cstr(_read("backup_mode", MODE_FULL_TAR_LABEL) or MODE_FULL_TAR_LABEL).strip(),
		"interval_value": interval_val,
		"interval_unit": unit,
		"interval_minutes": interval_minutes,
		"enable_retention": bool(cint(_read("backup_enable_retention", 1))),
		"max_keep": max(1, cint(_read("backup_max_keep", 10) or 10)),
		"pigz_threads": threads,
		"min_free_space_gb": max(0.5, flt(_read("backup_min_free_space_gb", 2.0) or 2.0, 2)),
		"last_run_at": _read("backup_last_run_at", None),
		"last_status": cstr(_read("backup_last_status", "") or "").strip(),
		"next_run_at": _read("backup_next_run_at", None),
		"last_output_path": cstr(_read("backup_last_output_path", "") or "").strip(),
	}


def compute_next_run_at(
	base_time: datetime | None,
	interval_value: int,
	interval_unit: str,
) -> datetime:
	ref = get_datetime(base_time) if base_time else now_datetime()
	val = max(1, cint(interval_value or 1))
	clean_unit = cstr(interval_unit).strip()
	if clean_unit in (UNIT_MINUTES_LABEL, "minutes"):
		return ref + timedelta(minutes=val)
	if clean_unit in (UNIT_DAYS_LABEL, "days"):
		return ref + timedelta(days=val)
	return ref + timedelta(hours=val)


def estimate_site_backup_footprint() -> dict[str, Any]:
	"""Measure current public/files, private/files, and MariaDB size efficiently."""
	pub_dir = frappe.get_site_path("public", "files")
	priv_dir = frappe.get_site_path("private", "files")

	files_bytes = 0
	files_count = 0
	for root_dir in (pub_dir, priv_dir):
		if not os.path.isdir(root_dir):
			continue
		for dirpath, _dirnames, filenames in os.walk(root_dir):
			for fname in filenames:
				fpath = os.path.join(dirpath, fname)
				try:
					st = os.lstat(fpath)
					if os.path.isfile(fpath):
						files_bytes += int(st.st_size)
						files_count += 1
				except OSError:
					continue

	db_raw_bytes = 0
	try:
		db_name = frappe.conf.db_name
		res = frappe.db.sql(
			"""
			SELECT COALESCE(SUM(data_length + index_length), 0)
			FROM information_schema.TABLES
			WHERE table_schema = %s
			""",
			(db_name,),
		)
		db_raw_bytes = int(res[0][0] or 0) if res else 0
	except Exception:
		db_raw_bytes = 0

	# SQL text compresses ~85-98%; budget 20% with 5 MB floor for safe free-space check
	est_db_gz_bytes = max(5 * 1024 * 1024, int(db_raw_bytes * 0.20))
	est_bundle_bytes = files_bytes + est_db_gz_bytes

	return {
		"files_count": files_count,
		"files_bytes": files_bytes,
		"files_mb": round(files_bytes / (1024 * 1024), 2),
		"db_raw_bytes": db_raw_bytes,
		"db_raw_mb": round(db_raw_bytes / (1024 * 1024), 2),
		"estimated_db_gz_bytes": est_db_gz_bytes,
		"estimated_bundle_bytes": est_bundle_bytes,
		"estimated_bundle_mb": round(est_bundle_bytes / (1024 * 1024), 2),
		"estimated_bundle_gb": round(est_bundle_bytes / (1024**3), 2),
	}


# =====================================================================
# 4. LOW-PRIORITY EXECUTION, LOCKING, DB DUMP & ARCHIVING
# =====================================================================


def _low_priority_prefix() -> list[str]:
	prefix: list[str] = []
	if shutil.which("ionice"):
		prefix.extend(["ionice", "-c", "3"])
	if shutil.which("nice"):
		prefix.extend(["nice", "-n", "19"])
	return prefix


def _sha256_file(path: str) -> str:
	h = hashlib.sha256()
	with open(path, "rb") as f:
		for chunk in iter(lambda: f.read(1024 * 1024), b""):
			h.update(chunk)
	return h.hexdigest()


def _site_slug() -> str:
	site = cstr(frappe.local.site or "site").strip()
	return re.sub(r"[^A-Za-z0-9_]", "_", site)


def _acquire_backup_lock() -> tuple[Any, str] | None:
	"""Acquire non-blocking file lock + Redis lock to prevent overlapping backup runs."""
	locks_dir = frappe.get_site_path("locks")
	os.makedirs(locks_dir, exist_ok=True)
	lock_path = os.path.join(locks_dir, "archive_backup.lock")
	fh = open(lock_path, "a+")
	try:
		fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
	except OSError:
		fh.close()
		return None

	redis_key = f"archive_backup_running:{_site_slug()}"
	try:
		frappe.cache.set_value(redis_key, cstr(now_datetime()), expires_in_sec=4 * 3600)
	except Exception:
		pass

	fh.seek(0)
	fh.truncate()
	fh.write(f"pid={os.getpid()} started={now_datetime()}\n")
	fh.flush()
	return fh, redis_key


def _release_backup_lock(lock_handle: tuple[Any, str] | None) -> None:
	if not lock_handle:
		return
	fh, redis_key = lock_handle
	try:
		frappe.cache.delete_value(redis_key)
	except Exception:
		pass
	try:
		fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
	except OSError:
		pass
	try:
		fh.close()
	except OSError:
		pass


def is_backup_currently_running() -> bool:
	locks_dir = frappe.get_site_path("locks")
	lock_path = os.path.join(locks_dir, "archive_backup.lock")
	if not os.path.exists(lock_path):
		return False
	fh = open(lock_path, "a+")
	try:
		fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
		fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
		return False
	except OSError:
		return True
	finally:
		fh.close()


def _dump_database_gz(output_sql_gz: str, pigz_threads: int = 4) -> dict[str, Any]:
	"""
	Creates a Frappe-compatible, consistent InnoDB SQL dump (`--single-transaction --quick`)
	compressed in parallel via pigz (or gzip fallback), passing password safely via MYSQL_PWD.
	"""
	from frappe.database import get_command
	from frappe.utils.change_log import get_app_branch

	pigz_bin = shutil.which("pigz")
	gzip_bin = shutil.which("gzip")
	if not pigz_bin and not gzip_bin:
		frappe.throw(_("أداة gzip/pigz غير متوفرة على السيرفر."), frappe.ValidationError)

	header_lines = [
		"begin frappe metadata",
		"[frappe]",
		f"version = {frappe.__version__}",
		f"branch = {get_app_branch('frappe') or 'N/A'}",
		"end frappe metadata",
		"",
	]
	header_text = "\n".join(f"-- {x}" for x in header_lines) + "\n"
	with gzip.open(output_sql_gz, "wt", encoding="utf-8") as gf:
		gf.write(header_text)

	dump_bin, raw_args, bin_name = get_command(
		socket=frappe.conf.db_socket,
		host=frappe.conf.db_host,
		port=frappe.conf.db_port,
		user=frappe.conf.db_user,
		password=frappe.conf.db_password,
		db_name=frappe.conf.db_name,
		dump=True,
	)
	if not dump_bin:
		frappe.throw(_("أداة تفريغ قاعدة البيانات ({0}) غير متوفرة.").format(bin_name), frappe.ValidationError)

	# Pass DB password via environment variable instead of process argv
	safe_args: list[str] = []
	skip_next = False
	for arg in raw_args:
		if skip_next:
			skip_next = False
			continue
		if arg == "-p" or arg == "--password":
			skip_next = True
			continue
		if arg.startswith("--password=") or (arg.startswith("-p") and len(arg) > 2):
			continue
		safe_args.append(arg)

	env = os.environ.copy()
	if frappe.conf.db_password:
		env["MYSQL_PWD"] = cstr(frappe.conf.db_password)

	low_prio = _low_priority_prefix()
	dump_cmd = [*low_prio, dump_bin, *safe_args]
	if pigz_bin:
		comp_cmd = [*low_prio, pigz_bin, "-6", "-p", str(max(1, pigz_threads))]
	else:
		comp_cmd = [*low_prio, gzip_bin, "-6"]

	with open(output_sql_gz, "ab") as out_f:
		p_dump = subprocess.Popen(
			dump_cmd,
			stdout=subprocess.PIPE,
			stderr=subprocess.PIPE,
			env=env,
		)
		p_comp = subprocess.Popen(
			comp_cmd,
			stdin=p_dump.stdout,
			stdout=out_f,
			stderr=subprocess.PIPE,
			env=env,
		)
		if p_dump.stdout:
			p_dump.stdout.close()
		_, comp_err = p_comp.communicate()
		_, dump_err = p_dump.communicate()

	if p_dump.returncode != 0:
		raise RuntimeError(f"Database dump failed ({p_dump.returncode}): {dump_err.decode('utf-8', 'ignore').strip()}")
	if p_comp.returncode != 0:
		raise RuntimeError(f"Database compression failed ({p_comp.returncode}): {comp_err.decode('utf-8', 'ignore').strip()}")

	# Integrity verify gzip stream
	test_cmd = [pigz_bin or gzip_bin, "-t", output_sql_gz]
	test_res = subprocess.run(test_cmd, capture_output=True, text=True)
	if test_res.returncode != 0:
		raise RuntimeError(f"Database gzip integrity verification failed: {test_res.stderr.strip()}")

	db_size = os.path.getsize(output_sql_gz)
	db_sha256 = _sha256_file(output_sql_gz)
	return {
		"size_bytes": db_size,
		"sha256": db_sha256,
	}


def _copy_site_config(dest_json_path: str) -> str:
	src = os.path.join(frappe.get_site_path(), "site_config.json")
	shutil.copyfile(src, dest_json_path)
	return _sha256_file(dest_json_path)


def _build_restore_guide_text(site: str, mode_key: str, timestamp: str, archive_name: str) -> str:
	if mode_key == "incremental_sync":
		return (
			f"=== Archive Disaster Recovery Guide ===\n"
			f"Site: {site}\n"
			f"Mode: Smart Incremental Mirror + DB Snapshots\n"
			f"Snapshot Timestamp: {timestamp}\n\n"
			f"Step 1 — Restore Database:\n"
			f"  bench --site {site} restore ./database.sql.gz --force\n\n"
			f"Step 2 — Restore Public & Private Files from files_mirror:\n"
			f"  rsync -rt ../../files_mirror/public/files/ sites/{site}/public/files/\n"
			f"  rsync -rt ../../files_mirror/private/files/ sites/{site}/private/files/\n\n"
			f"Step 3 — Migrate & Clear Cache:\n"
			f"  bench --site {site} migrate\n"
			f"  bench --site {site} clear-cache\n"
		)

	extract_flag = "-xzf" if archive_name.endswith(".tar.gz") else "-xf"
	return (
		f"=== Archive Disaster Recovery Guide ===\n"
		f"Site: {site}\n"
		f"Archive: {archive_name}\n"
		f"Timestamp: {timestamp}\n\n"
		f"Step 1 — Extract Archive to a Temporary Folder:\n"
		f"  mkdir -p /tmp/archive_restore && tar {extract_flag} {archive_name} -C /tmp/archive_restore\n\n"
		f"Step 2 — Verify Database Checksum (optional, compare with manifest.json):\n"
		f"  sha256sum /tmp/archive_restore/database.sql.gz\n\n"
		f"Step 3 — Restore Database:\n"
		f"  bench --site {site} restore /tmp/archive_restore/database.sql.gz --force\n\n"
		f"Step 4 — Restore Public & Private Files:\n"
		f"  rsync -rt /tmp/archive_restore/public/files/ sites/{site}/public/files/\n"
		f"  rsync -rt /tmp/archive_restore/private/files/ sites/{site}/private/files/\n\n"
		f"Step 5 — Migrate & Clear Cache:\n"
		f"  bench --site {site} migrate\n"
		f"  bench --site {site} clear-cache\n"
	)


def _run_full_bundle(
	destination: str,
	mode_key: str,
	pigz_threads: int,
	timestamp: str,
	footprint: dict[str, Any],
) -> dict[str, Any]:
	"""
	Single-pass streaming backup directly to destination as one self-contained `.tar` or `.tar.gz`:
	  - database.sql.gz (pigz -6 compressed)
	  - site_config_backup.json
	  - manifest.json (checksums + metadata)
	  - RESTORE_STEPS.txt
	  - public/files/...
	  - private/files/...
	Writes to `<final>.part` and atomically renames ONLY after verification succeeds.
	"""
	site = cstr(frappe.local.site)
	slug = _site_slug()
	compress_outer = mode_key == "full_tar_gz"
	ext = "tar.gz" if compress_outer else "tar"
	archive_name = f"archive_backup_{slug}_{timestamp}.{ext}"
	final_path = os.path.join(destination, archive_name)
	part_path = final_path + ".part"

	tar_bin = shutil.which("tar")
	if not tar_bin:
		frappe.throw(_("أداة tar غير متوفرة على السيرفر."), frappe.ValidationError)

	pigz_bin = shutil.which("pigz")
	gzip_bin = shutil.which("gzip")

	site_abs = os.path.realpath(frappe.get_site_path())
	pub_rel = os.path.join("public", "files")
	priv_rel = os.path.join("private", "files")
	os.makedirs(os.path.join(site_abs, pub_rel), exist_ok=True)
	os.makedirs(os.path.join(site_abs, priv_rel), exist_ok=True)

	stage_dir = tempfile.mkdtemp(prefix="archive_backup_meta_")
	try:
		db_path = os.path.join(stage_dir, "database.sql.gz")
		conf_path = os.path.join(stage_dir, "site_config_backup.json")
		manifest_path = os.path.join(stage_dir, "manifest.json")
		restore_path = os.path.join(stage_dir, "RESTORE_STEPS.txt")

		db_info = _dump_database_gz(db_path, pigz_threads=pigz_threads)
		conf_sha256 = _copy_site_config(conf_path)

		manifest = {
			"format_version": 1,
			"site": site,
			"site_slug": slug,
			"mode": mode_key,
			"timestamp": timestamp,
			"created_at": cstr(now_datetime()),
			"frappe_version": frappe.__version__,
			"database": {
				"filename": "database.sql.gz",
				"size_bytes": db_info["size_bytes"],
				"sha256": db_info["sha256"],
			},
			"site_config": {
				"filename": "site_config_backup.json",
				"sha256": conf_sha256,
			},
			"files": {
				"public_dir": "public/files",
				"private_dir": "private/files",
				"files_count": footprint["files_count"],
				"files_bytes": footprint["files_bytes"],
			},
		}
		with open(manifest_path, "w", encoding="utf-8") as mf:
			json.dump(manifest, mf, ensure_ascii=False, indent=2)

		with open(restore_path, "w", encoding="utf-8") as rf:
			rf.write(_build_restore_guide_text(site, mode_key, timestamp, archive_name))

		low_prio = _low_priority_prefix()
		tar_sources = [
			"-C",
			stage_dir,
			"database.sql.gz",
			"site_config_backup.json",
			"manifest.json",
			"RESTORE_STEPS.txt",
			"-C",
			site_abs,
			pub_rel,
			priv_rel,
		]

		if not compress_outer:
			tar_cmd = [*low_prio, tar_bin, "--warning=no-file-changed", "-cf", part_path, *tar_sources]
			proc = subprocess.run(tar_cmd, capture_output=True, text=True)
			if proc.returncode not in (0, 1) or (
				proc.returncode == 1 and "file changed as we read it" not in (proc.stderr or "").lower()
			):
				raise RuntimeError(f"tar failed ({proc.returncode}): {(proc.stderr or '').strip()}")
		else:
			tar_cmd = [*low_prio, tar_bin, "--warning=no-file-changed", "-cf", "-", *tar_sources]
			if pigz_bin:
				comp_cmd = [*low_prio, pigz_bin, "-1", "-p", str(max(1, pigz_threads))]
			elif gzip_bin:
				comp_cmd = [*low_prio, gzip_bin, "-1"]
			else:
				raise RuntimeError("Neither pigz nor gzip available for tar.gz compression")

			with open(part_path, "wb") as out_f:
				p_tar = subprocess.Popen(tar_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
				p_comp = subprocess.Popen(
					comp_cmd,
					stdin=p_tar.stdout,
					stdout=out_f,
					stderr=subprocess.PIPE,
				)
				if p_tar.stdout:
					p_tar.stdout.close()
				_, comp_err = p_comp.communicate()
				_, tar_err = p_tar.communicate()

			tar_err_s = (tar_err or b"").decode("utf-8", "ignore").strip()
			comp_err_s = (comp_err or b"").decode("utf-8", "ignore").strip()
			if p_tar.returncode not in (0, 1) or (
				p_tar.returncode == 1 and "file changed as we read it" not in tar_err_s.lower()
			):
				raise RuntimeError(f"tar stream failed ({p_tar.returncode}): {tar_err_s}")
			if p_comp.returncode != 0:
				raise RuntimeError(f"outer compression failed ({p_comp.returncode}): {comp_err_s}")

			# Fast gzip container verification
			verify_gz = subprocess.run([pigz_bin or gzip_bin, "-t", part_path], capture_output=True, text=True)
			if verify_gz.returncode != 0:
				raise RuntimeError(f"tar.gz integrity verification failed: {verify_gz.stderr.strip()}")

		# Verify tar header contains our core entries
		with tarfile.open(part_path, "r:gz" if compress_outer else "r:") as tf:
			top_names = set()
			for member in tf:
				top_names.add(member.name.lstrip("./"))
				if {"database.sql.gz", "site_config_backup.json", "manifest.json"}.issubset(top_names):
					break
			if not {"database.sql.gz", "site_config_backup.json", "manifest.json"}.issubset(top_names):
				raise RuntimeError("Backup archive verification failed: missing core entries")

		os.replace(part_path, final_path)
		final_size = os.path.getsize(final_path)
		return {
			"output_path": final_path,
			"total_size_bytes": final_size,
			"db_size_bytes": db_info["size_bytes"],
			"files_size_bytes": footprint["files_bytes"],
			"files_count": footprint["files_count"],
			"sha256_db": db_info["sha256"],
			"manifest": manifest,
		}
	except Exception:
		if os.path.exists(part_path):
			try:
				os.remove(part_path)
			except OSError:
				pass
		raise
	finally:
		shutil.rmtree(stage_dir, ignore_errors=True)


def _run_incremental_sync(
	destination: str,
	pigz_threads: int,
	timestamp: str,
	footprint: dict[str, Any],
) -> dict[str, Any]:
	"""
	High-speed delta backup compatible with local ext4, external USB (NTFS/exFAT/ext4),
	and network shares (SMB/NFS) without POSIX hardlink dependencies:
	  - `<dest>/archive_incremental_<site>/db_snapshots/<timestamp>/database.sql.gz` (+ config + manifest)
	  - `<dest>/archive_incremental_<site>/files_mirror/{public,private}/files/` via rsync delta
	"""
	rsync_bin = shutil.which("rsync")
	if not rsync_bin:
		frappe.throw(_("أداة rsync غير متوفرة على السيرفر لوضع المزامنة التفاضلية."), frappe.ValidationError)

	site = cstr(frappe.local.site)
	slug = _site_slug()
	root_dir = os.path.join(destination, f"archive_incremental_{slug}")
	snaps_dir = os.path.join(root_dir, "db_snapshots")
	mirror_pub = os.path.join(root_dir, "files_mirror", "public", "files")
	mirror_priv = os.path.join(root_dir, "files_mirror", "private", "files")

	os.makedirs(snaps_dir, exist_ok=True)
	os.makedirs(mirror_pub, exist_ok=True)
	os.makedirs(mirror_priv, exist_ok=True)

	snap_part = os.path.join(snaps_dir, f"{timestamp}.part")
	snap_final = os.path.join(snaps_dir, timestamp)
	os.makedirs(snap_part, exist_ok=True)

	site_abs = os.path.realpath(frappe.get_site_path())
	src_pub = os.path.join(site_abs, "public", "files")
	src_priv = os.path.join(site_abs, "private", "files")
	os.makedirs(src_pub, exist_ok=True)
	os.makedirs(src_priv, exist_ok=True)

	try:
		db_path = os.path.join(snap_part, "database.sql.gz")
		conf_path = os.path.join(snap_part, "site_config_backup.json")
		manifest_path = os.path.join(snap_part, "manifest.json")
		restore_path = os.path.join(snap_part, "RESTORE_STEPS.txt")

		db_info = _dump_database_gz(db_path, pigz_threads=pigz_threads)
		conf_sha256 = _copy_site_config(conf_path)

		# Sync only new/changed files using filesystem-agnostic flags (safe on NTFS/exFAT/SMB/ext4)
		low_prio = _low_priority_prefix()
		rsync_flags = [
			"-rt",
			"--delete",
			"--modify-window=2",
			"--no-perms",
			"--no-owner",
			"--no-group",
			"--partial",
		]
		for src_dir, dst_dir in ((src_pub, mirror_pub), (src_priv, mirror_priv)):
			cmd = [*low_prio, rsync_bin, *rsync_flags, src_dir.rstrip("/") + "/", dst_dir.rstrip("/") + "/"]
			res = subprocess.run(cmd, capture_output=True, text=True)
			# Exit code 24 = "some files vanished before they could be transferred" (benign on live site)
			if res.returncode not in (0, 24):
				raise RuntimeError(f"rsync failed ({res.returncode}): {(res.stderr or '').strip()}")

		manifest = {
			"format_version": 1,
			"site": site,
			"site_slug": slug,
			"mode": "incremental_sync",
			"timestamp": timestamp,
			"created_at": cstr(now_datetime()),
			"frappe_version": frappe.__version__,
			"database": {
				"filename": "database.sql.gz",
				"size_bytes": db_info["size_bytes"],
				"sha256": db_info["sha256"],
			},
			"site_config": {
				"filename": "site_config_backup.json",
				"sha256": conf_sha256,
			},
			"files": {
				"mirror_public": "../../files_mirror/public/files",
				"mirror_private": "../../files_mirror/private/files",
				"files_count": footprint["files_count"],
				"files_bytes": footprint["files_bytes"],
			},
		}
		with open(manifest_path, "w", encoding="utf-8") as mf:
			json.dump(manifest, mf, ensure_ascii=False, indent=2)
		with open(restore_path, "w", encoding="utf-8") as rf:
			rf.write(_build_restore_guide_text(site, "incremental_sync", timestamp, snap_final))

		os.replace(snap_part, snap_final)

		latest_tmp = os.path.join(root_dir, "LATEST_SNAPSHOT.txt.part")
		latest_path = os.path.join(root_dir, "LATEST_SNAPSHOT.txt")
		with open(latest_tmp, "w", encoding="utf-8") as lf:
			lf.write(f"{timestamp}\n")
		os.replace(latest_tmp, latest_path)

		return {
			"output_path": snap_final,
			"total_size_bytes": db_info["size_bytes"] + footprint["files_bytes"],
			"db_size_bytes": db_info["size_bytes"],
			"files_size_bytes": footprint["files_bytes"],
			"files_count": footprint["files_count"],
			"sha256_db": db_info["sha256"],
			"manifest": manifest,
		}
	except Exception:
		if os.path.exists(snap_part):
			shutil.rmtree(snap_part, ignore_errors=True)
		raise


def _apply_retention(destination: str, mode_key: str, max_keep: int) -> int:
	"""
	Deletes ONLY oldest backups matching this site's strict naming pattern beyond `max_keep`.
	Never touches unrelated files in `destination`.
	"""
	keep = max(1, cint(max_keep or 1))
	slug = _site_slug()
	deleted = 0

	if mode_key == "incremental_sync":
		snaps_dir = os.path.join(destination, f"archive_incremental_{slug}", "db_snapshots")
		if not os.path.isdir(snaps_dir):
			return 0
		snap_dirs = sorted(
			[
				name
				for name in os.listdir(snaps_dir)
				if _SNAPSHOT_DIR_RE.match(name) and os.path.isdir(os.path.join(snaps_dir, name))
			],
			reverse=True,
		)
		for old_name in snap_dirs[keep:]:
			target = os.path.join(snaps_dir, old_name)
			try:
				shutil.rmtree(target)
				deleted += 1
			except OSError:
				pass
		return deleted

	# Bundle modes (.tar / .tar.gz): rotate matching site bundles strictly
	if not os.path.isdir(destination):
		return 0
	matched: list[tuple[str, str]] = []
	for fname in os.listdir(destination):
		m = _BUNDLE_TIMESTAMP_RE.match(fname)
		if not m or m.group("slug") != slug:
			continue
		fpath = os.path.join(destination, fname)
		if os.path.isfile(fpath):
			matched.append((m.group("ts"), fpath))

	matched.sort(key=lambda pair: pair[0], reverse=True)
	for _ts, old_path in matched[keep:]:
		try:
			os.remove(old_path)
			deleted += 1
		except OSError:
			pass
	return deleted


def _cleanup_stale_part_files(destination: str, max_age_hours: int = 24) -> None:
	"""Remove abandoned .part files older than `max_age_hours` matching our prefix."""
	if not os.path.isdir(destination):
		return
	cutoff = time.time() - max_age_hours * 3600
	prefix = f"archive_backup_{_site_slug()}_"
	for fname in os.listdir(destination):
		if not (fname.startswith(prefix) and fname.endswith(".part")):
			continue
		fpath = os.path.join(destination, fname)
		try:
			if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
				os.remove(fpath)
		except OSError:
			pass


# =====================================================================
# 5. LOGGING, NOTIFICATIONS & EXECUTION PIPELINE
# =====================================================================


def _get_failure_notification_recipients() -> list[str]:
	"""All enabled users with explicit Backup Management role OR System Manager role."""
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT u.name
		FROM `tabUser` u
		INNER JOIN `tabHas Role` hr
			ON hr.parent = u.name
			AND hr.parenttype = 'User'
			AND hr.parentfield = 'roles'
		WHERE hr.role IN (%s, 'System Manager')
		  AND u.name != 'Guest'
		  AND (u.name = 'Administrator' OR IFNULL(u.enabled, 0) = 1)
		ORDER BY u.name ASC
		""",
		(ROLE_BACKUP_MANAGEMENT,),
		as_dict=True,
	)
	recipients = [cstr(r.name).strip() for r in rows if cstr(r.name).strip()]
	if not recipients:
		recipients = ["Administrator"]
	return recipients


def _notify_backup_failure(log_name: str, error_message: str, trigger_type: str, destination: str) -> None:
	recipients = _get_failure_notification_recipients()
	subject = _("فشل النسخ الاحتياطي التلقائي للموقع ({0})").format(frappe.local.site)
	body = _(
		"فشلت عملية النسخ الاحتياطي ({0}) إلى المسار: {1}<br><br><b>السبب:</b> {2}"
	).format(
		frappe.utils.escape_html(trigger_type),
		frappe.utils.escape_html(destination or "غير محدد"),
		frappe.utils.escape_html(error_message[:1500]),
	)
	for user_id in recipients:
		try:
			notif = frappe.get_doc(
				{
					"doctype": "Notification Log",
					"subject": subject,
					"email_content": body,
					"for_user": user_id,
					"type": "Alert",
					"document_type": BACKUP_LOG_DOCTYPE,
					"document_name": log_name,
				}
			)
			notif.insert(ignore_permissions=True)
		except Exception:
			frappe.log_error(
				title="Archive Backup Failure Notification Error",
				message=frappe.get_traceback(),
			)


def _update_settings_run_metadata(
	*,
	last_run_at: datetime,
	last_status: str,
	next_run_at: datetime | None,
	last_output_path: str | None = None,
) -> None:
	updates: dict[str, Any] = {
		"backup_last_run_at": last_run_at,
		"backup_last_status": last_status,
	}
	if next_run_at is not None:
		updates["backup_next_run_at"] = next_run_at
	if last_output_path is not None:
		updates["backup_last_output_path"] = last_output_path

	for field, val in updates.items():
		frappe.db.set_single_value(SETTINGS_DOCTYPE, field, val, update_modified=False)


def execute_backup_job(
	trigger_type: str = "Scheduled",
	requested_by: str | None = None,
	mode_override: str | None = None,
	destination_override: str | None = None,
	log_name: str | None = None,
) -> dict[str, Any]:
	"""
	Core atomic backup executor (called from RQ `long` worker, manual API, or CLI).
	"""
	started_dt = now_datetime()
	t0 = time.monotonic()
	cfg = get_backup_settings_dict()
	actor = cstr(requested_by or frappe.session.user or "Administrator").strip()

	mode_key = normalize_backup_mode(mode_override) if mode_override else cfg["backup_mode"]
	destination = cstr(destination_override or cfg["destination_path"]).strip()

	# Acquire non-blocking overlap lock
	lock_handle = _acquire_backup_lock()
	if lock_handle is None:
		if log_name and frappe.db.exists(BACKUP_LOG_DOCTYPE, log_name):
			doc = frappe.get_doc(BACKUP_LOG_DOCTYPE, log_name)
			doc.status = "Skipped"
			doc.finished_at = now_datetime()
			doc.error_message = _("تم تخطي التشغيل لوجود عملية نسخ احتياطي أخرى قيد التنفيذ حالياً.")
			doc.flags.from_backup_engine = True
			doc.save(ignore_permissions=True)
			frappe.db.commit()
		return {
			"ok": False,
			"status": "Skipped",
			"message": _("توجد عملية نسخ احتياطي أخرى قيد التنفيذ حالياً."),
		}

	log_doc = None
	try:
		if log_name and frappe.db.exists(BACKUP_LOG_DOCTYPE, log_name):
			log_doc = frappe.get_doc(BACKUP_LOG_DOCTYPE, log_name)
			log_doc.status = "Running"
			log_doc.started_at = started_dt
			log_doc.backup_mode = MODE_KEY_TO_LABEL.get(mode_key, mode_key)
			log_doc.destination_path = destination
			log_doc.flags.from_backup_engine = True
			log_doc.save(ignore_permissions=True)
		else:
			log_doc = frappe.get_doc(
				{
					"doctype": BACKUP_LOG_DOCTYPE,
					"site_name": frappe.local.site,
					"trigger_type": trigger_type,
					"backup_mode": MODE_KEY_TO_LABEL.get(mode_key, mode_key),
					"status": "Running",
					"started_at": started_dt,
					"triggered_by": actor,
					"destination_path": destination,
				}
			)
			log_doc.flags.from_backup_engine = True
			log_doc.insert(ignore_permissions=True)
		frappe.db.commit()

		footprint = estimate_site_backup_footprint()
		is_single_file = mode_key in ("full_tar", "full_tar_gz")
		estimated_needed = (
			footprint["estimated_bundle_bytes"]
			if is_single_file
			else footprint["estimated_db_gz_bytes"]
		)

		adapter = get_storage_adapter()
		dest_info = adapter.validate_destination(
			destination,
			require_mount=cfg["require_mount"] and not destination_override,
			create_if_missing=True,
			estimated_bytes=estimated_needed,
			min_free_space_gb=cfg["min_free_space_gb"],
			single_file_mode=is_single_file,
		)
		resolved_dest = dest_info["path"]
		_cleanup_stale_part_files(resolved_dest)

		ts = started_dt.strftime("%Y%m%d_%H%M%S")
		if mode_key == "incremental_sync":
			result = _run_incremental_sync(
				destination=resolved_dest,
				pigz_threads=cfg["pigz_threads"],
				timestamp=ts,
				footprint=footprint,
			)
		else:
			result = _run_full_bundle(
				destination=resolved_dest,
				mode_key=mode_key,
				pigz_threads=cfg["pigz_threads"],
				timestamp=ts,
				footprint=footprint,
			)

		deleted_old = 0
		if cfg["enable_retention"] and trigger_type != "Manual Export":
			deleted_old = _apply_retention(resolved_dest, mode_key, cfg["max_keep"])

		finished_dt = now_datetime()
		elapsed = round(time.monotonic() - t0, 2)

		log_doc.status = "Success"
		log_doc.finished_at = finished_dt
		log_doc.duration_seconds = elapsed
		log_doc.destination_path = resolved_dest
		log_doc.output_path = result["output_path"]
		log_doc.sha256_db = result["sha256_db"]
		log_doc.total_size_bytes = str(result["total_size_bytes"])
		log_doc.total_size_mb = round(result["total_size_bytes"] / (1024 * 1024), 2)
		log_doc.db_size_mb = round(result["db_size_bytes"] / (1024 * 1024), 2)
		log_doc.files_size_mb = round(result["files_size_bytes"] / (1024 * 1024), 2)
		log_doc.files_count = cint(result["files_count"])
		log_doc.retention_deleted_count = cint(deleted_old)
		log_doc.error_message = "\n".join(dest_info.get("warnings") or [])
		log_doc.details_json = json.dumps(
			{
				"fstype": dest_info["fstype"],
				"mountpoint": dest_info["mountpoint"],
				"free_gb_before": dest_info["free_gb"],
				"mode_key": mode_key,
			},
			ensure_ascii=False,
		)
		log_doc.flags.from_backup_engine = True
		log_doc.save(ignore_permissions=True)

		next_run = None
		if cfg["enabled"] and (
			trigger_type == "Scheduled"
			or not cfg.get("next_run_at")
			or get_datetime(cfg["next_run_at"]) <= finished_dt
		):
			next_run = compute_next_run_at(finished_dt, cfg["interval_value"], cfg["interval_unit"])
		_update_settings_run_metadata(
			last_run_at=finished_dt,
			last_status="نجح",
			next_run_at=next_run,
			last_output_path=result["output_path"],
		)
		frappe.db.commit()

		return {
			"ok": True,
			"status": "Success",
			"log_name": log_doc.name,
			"output_path": result["output_path"],
			"duration_seconds": elapsed,
			"total_size_mb": log_doc.total_size_mb,
			"db_size_mb": log_doc.db_size_mb,
			"files_size_mb": log_doc.files_size_mb,
			"files_count": log_doc.files_count,
			"sha256_db": result["sha256_db"],
			"retention_deleted_count": deleted_old,
			"warnings": dest_info.get("warnings") or [],
		}
	except Exception as exc:
		err_text = cstr(exc).strip() or repr(exc)
		finished_dt = now_datetime()
		elapsed = round(time.monotonic() - t0, 2)
		try:
			frappe.db.rollback()
			if log_doc is not None and frappe.db.exists(BACKUP_LOG_DOCTYPE, log_doc.name):
				log_doc = frappe.get_doc(BACKUP_LOG_DOCTYPE, log_doc.name)
				log_doc.status = "Failed"
				log_doc.finished_at = finished_dt
				log_doc.duration_seconds = elapsed
				log_doc.error_message = err_text
				log_doc.flags.from_backup_engine = True
				log_doc.save(ignore_permissions=True)
			else:
				log_doc = frappe.get_doc(
					{
						"doctype": BACKUP_LOG_DOCTYPE,
						"site_name": frappe.local.site,
						"trigger_type": trigger_type,
						"backup_mode": MODE_KEY_TO_LABEL.get(mode_key, mode_key),
						"status": "Failed",
						"started_at": started_dt,
						"finished_at": finished_dt,
						"duration_seconds": elapsed,
						"triggered_by": actor,
						"destination_path": destination,
						"error_message": err_text,
					}
				)
				log_doc.flags.from_backup_engine = True
				log_doc.insert(ignore_permissions=True)

			next_run = None
			if cfg["enabled"] and (
				trigger_type == "Scheduled"
				or not cfg.get("next_run_at")
				or get_datetime(cfg["next_run_at"]) <= finished_dt
			):
				next_run = compute_next_run_at(finished_dt, cfg["interval_value"], cfg["interval_unit"])
			_update_settings_run_metadata(
				last_run_at=finished_dt,
				last_status="فشل",
				next_run_at=next_run,
			)
			_notify_backup_failure(log_doc.name, err_text, trigger_type, destination)
			frappe.db.commit()
		except Exception:
			frappe.log_error(title="Archive Backup Error Handling Failed", message=frappe.get_traceback())

		return {
			"ok": False,
			"status": "Failed",
			"log_name": log_doc.name if log_doc else "",
			"error": err_text,
		}
	finally:
		_release_backup_lock(lock_handle)


# =====================================================================
# 6. SCHEDULER & CLI ENTRYPOINTS
# =====================================================================


def _is_scheduled_backup_due(cfg: dict[str, Any], now_dt: datetime | None = None) -> bool:
	if not cfg.get("enabled"):
		return False
	if not cfg.get("destination_path"):
		return False
	ref_now = now_dt or now_datetime()
	next_run = cfg.get("next_run_at")
	if next_run:
		return ref_now >= get_datetime(next_run)
	last_run = cfg.get("last_run_at")
	if not last_run:
		return True
	due_at = compute_next_run_at(get_datetime(last_run), cfg["interval_value"], cfg["interval_unit"])
	return ref_now >= due_at


def check_and_enqueue_scheduled_backup() -> dict[str, Any]:
	"""
	Lightweight dispatcher called by Frappe scheduler (`cron: * * * * *`).
	Enqueues the heavy backup onto `queue='long'` only when enabled, due, and not already locked.
	"""
	cfg = get_backup_settings_dict()
	if not _is_scheduled_backup_due(cfg):
		return {"enqueued": False, "reason": "not_due"}

	if is_backup_currently_running():
		return {"enqueued": False, "reason": "already_running"}

	debounce_key = f"archive_backup_enqueued:{_site_slug()}"
	if frappe.cache.get_value(debounce_key):
		return {"enqueued": False, "reason": "already_enqueued"}

	frappe.cache.set_value(debounce_key, "1", expires_in_sec=300)
	log_doc = frappe.get_doc(
		{
			"doctype": BACKUP_LOG_DOCTYPE,
			"site_name": frappe.local.site,
			"trigger_type": "Scheduled",
			"backup_mode": MODE_KEY_TO_LABEL.get(cfg["backup_mode"], cfg["backup_mode"]),
			"status": "Queued",
			"started_at": now_datetime(),
			"triggered_by": "Administrator",
			"destination_path": cfg["destination_path"],
		}
	)
	log_doc.flags.from_backup_engine = True
	log_doc.insert(ignore_permissions=True)
	# Advance next_run_at immediately to prevent duplicate scheduling ticks while queued
	next_run = compute_next_run_at(now_datetime(), cfg["interval_value"], cfg["interval_unit"])
	frappe.db.set_single_value(SETTINGS_DOCTYPE, "backup_next_run_at", next_run, update_modified=False)
	frappe.db.commit()

	frappe.enqueue(
		"archive.services.backup_manager.execute_backup_job",
		queue="long",
		timeout=7200,
		job_id=f"archive_scheduled_backup_{_site_slug()}_{log_doc.name}",
		trigger_type="Scheduled",
		requested_by="Administrator",
		log_name=log_doc.name,
	)
	return {"enqueued": True, "log_name": log_doc.name}


def run_scheduled_backup_if_due() -> dict[str, Any]:
	"""
	Direct CLI / systemd-timer entrypoint:
	  bench --site <site> execute archive.services.backup_manager.run_scheduled_backup_if_due
	"""
	cfg = get_backup_settings_dict()
	if not _is_scheduled_backup_due(cfg):
		return {"ran": False, "reason": "not_due"}
	return execute_backup_job(trigger_type="Scheduled", requested_by="Administrator")


# =====================================================================
# 7. WHITELISTED UI APIS & ARCHIVE INTEGRITY VERIFICATION
# =====================================================================


@frappe.whitelist()
def get_backup_ui_context() -> dict[str, Any]:
	"""
	Returns Archive Settings section visibility flags for the current user,
	plus live backup dashboard state ONLY when the user explicitly holds ROLE_BACKUP_MANAGEMENT.
	"""
	user = cstr(frappe.session.user or "Guest").strip()
	can_manage_backups = has_backup_management_role(user=user)
	can_manage_general = is_archive_settings_general_admin(user=user)

	base: dict[str, Any] = {
		"can_manage_backups": can_manage_backups,
		"can_manage_general_settings": can_manage_general,
		"backup_role_name": ROLE_BACKUP_MANAGEMENT,
	}
	if not can_manage_backups:
		return base

	cfg = get_backup_settings_dict()
	footprint = estimate_site_backup_footprint()
	logs = frappe.db.sql(
		"""
		SELECT
			name,
			trigger_type,
			backup_mode,
			status,
			started_at,
			finished_at,
			duration_seconds,
			triggered_by,
			destination_path,
			output_path,
			total_size_mb,
			db_size_mb,
			files_size_mb,
			files_count,
			retention_deleted_count,
			sha256_db,
			error_message
		FROM `tabArchive Backup Log`
		ORDER BY started_at DESC, creation DESC
		LIMIT 15
		""",
		as_dict=True,
	)

	dest_storage = _inspect_path_storage_summary(cfg["destination_path"]) if cfg["destination_path"] else None

	base.update(
		{
			"is_running": is_backup_currently_running(),
			"settings": cfg,
			"footprint": footprint,
			"destination_storage": dest_storage,
			"logs": logs,
			"tools": {
				"pigz": bool(shutil.which("pigz")),
				"tar": bool(shutil.which("tar")),
				"rsync": bool(shutil.which("rsync")),
				"ionice": bool(shutil.which("ionice")),
				"cpu_count": os.cpu_count() or 1,
			},
		}
	)
	return base


@frappe.whitelist()
def test_backup_destination(
	backup_path: str = "",
	require_mount: int | str = 0,
	backup_mode: str = "",
	min_free_space_gb: float | str = 2.0,
) -> dict[str, Any]:
	require_backup_management_role()
	cfg = get_backup_settings_dict()
	target_path = cstr(backup_path or cfg["destination_path"]).strip()
	mode_key = normalize_backup_mode(backup_mode or cfg["backup_mode"])
	footprint = estimate_site_backup_footprint()
	is_single_file = mode_key in ("full_tar", "full_tar_gz")
	estimated_needed = (
		footprint["estimated_bundle_bytes"] if is_single_file else footprint["estimated_db_gz_bytes"]
	)

	info = get_storage_adapter().validate_destination(
		target_path,
		require_mount=bool(cint(require_mount)),
		create_if_missing=False,
		estimated_bytes=estimated_needed,
		min_free_space_gb=flt(min_free_space_gb or cfg["min_free_space_gb"], 2),
		single_file_mode=is_single_file,
	)
	return {
		"ok": True,
		"destination": info,
		"footprint": footprint,
		"mode_key": mode_key,
	}


@frappe.whitelist()
def trigger_manual_backup(
	mode_override: str = "",
	run_sync: int | str = 0,
) -> dict[str, Any]:
	require_backup_management_role()
	cfg = get_backup_settings_dict()
	if not cfg["destination_path"]:
		frappe.throw(
			_("يرجى إدخال وحفظ «مسار حفظ النسخ الاحتياطي» في الإعدادات أولاً قبل التشغيل."),
			frappe.ValidationError,
		)
	if is_backup_currently_running():
		frappe.throw(
			_("توجد عملية نسخ احتياطي قيد التنفيذ حالياً. يرجى الانتظار حتى اكتمالها."),
			frappe.ValidationError,
		)

	is_export = bool(cstr(mode_override or "").strip())
	trigger_type = "Manual Export" if is_export else "Manual"
	resolved_mode = normalize_backup_mode(mode_override) if is_export else cfg["backup_mode"]

	# Fast pre-flight check before queuing so invalid paths/unmounted drives fail immediately in UI
	footprint = estimate_site_backup_footprint()
	is_single_file = resolved_mode in ("full_tar", "full_tar_gz")
	get_storage_adapter().validate_destination(
		cfg["destination_path"],
		require_mount=cfg["require_mount"],
		create_if_missing=True,
		estimated_bytes=(
			footprint["estimated_bundle_bytes"] if is_single_file else footprint["estimated_db_gz_bytes"]
		),
		min_free_space_gb=cfg["min_free_space_gb"],
		single_file_mode=is_single_file,
	)

	if cint(run_sync):
		return execute_backup_job(
			trigger_type=trigger_type,
			requested_by=frappe.session.user,
			mode_override=resolved_mode,
		)

	log_doc = frappe.get_doc(
		{
			"doctype": BACKUP_LOG_DOCTYPE,
			"site_name": frappe.local.site,
			"trigger_type": trigger_type,
			"backup_mode": MODE_KEY_TO_LABEL.get(resolved_mode, resolved_mode),
			"status": "Queued",
			"started_at": now_datetime(),
			"triggered_by": frappe.session.user,
			"destination_path": cfg["destination_path"],
		}
	)
	log_doc.flags.from_backup_engine = True
	log_doc.insert(ignore_permissions=True)
	frappe.db.commit()

	frappe.enqueue(
		"archive.services.backup_manager.execute_backup_job",
		queue="long",
		timeout=7200,
		job_id=f"archive_manual_backup_{_site_slug()}_{log_doc.name}",
		trigger_type=trigger_type,
		requested_by=frappe.session.user,
		mode_override=resolved_mode,
		log_name=log_doc.name,
	)
	return {
		"ok": True,
		"queued": True,
		"log_name": log_doc.name,
		"message": _("تم جدولة عملية النسخ الاحتياطي للتنفيذ الفوري في الخلفية."),
	}


@frappe.whitelist()
def verify_backup_archive(archive_path: str) -> dict[str, Any]:
	"""
	Verifies integrity of a generated `.tar` / `.tar.gz` bundle OR incremental snapshot directory:
	checks manifest.json, SHA-256 of database.sql.gz & site_config_backup.json, and gzip stream integrity.
	"""
	require_backup_management_role()
	raw_path = cstr(archive_path or "").strip()
	if not raw_path:
		frappe.throw(_("يرجى تحديد مسار النسخة المطلوب فحصها."), frappe.ValidationError)
	clean_path = os.path.realpath(os.path.abspath(raw_path))

	# Defense in depth: restrict verification strictly to logged backup outputs or files inside backup_destination_path
	cfg = get_backup_settings_dict()
	allowed = False
	if cfg["destination_path"]:
		dest_real = os.path.realpath(os.path.abspath(cfg["destination_path"]))
		if _is_subpath(clean_path, dest_real):
			allowed = True
	if not allowed:
		logged_rows = frappe.db.sql(
			"""
			SELECT name
			FROM `tabArchive Backup Log`
			WHERE output_path IN (%s, %s)
			LIMIT 1
			""",
			(raw_path, clean_path),
			as_dict=True,
		)
		if logged_rows:
			allowed = True
	if not allowed:
		frappe.throw(
			_("لا يُسمح بفحص مسار خارج مجلد النسخ الاحتياطي المعتمد أو سجل النسخ."),
			frappe.PermissionError,
		)

	if not os.path.exists(clean_path):
		frappe.throw(_("الملف أو المجلد المطلوب فحصه غير موجود."), frappe.ValidationError)

	pigz_or_gzip = shutil.which("pigz") or shutil.which("gzip")

	if os.path.isdir(clean_path):
		manifest_p = os.path.join(clean_path, "manifest.json")
		db_p = os.path.join(clean_path, "database.sql.gz")
		conf_p = os.path.join(clean_path, "site_config_backup.json")
		for p in (manifest_p, db_p, conf_p):
			if not os.path.isfile(p):
				frappe.throw(_("لقطة النسخ غير مكتملة: ملف مفقود ({0}).").format(os.path.basename(p)))
		with open(manifest_p, encoding="utf-8") as mf:
			manifest = json.load(mf)
		actual_db_sha = _sha256_file(db_p)
		actual_conf_sha = _sha256_file(conf_p)
		if actual_db_sha != manifest["database"]["sha256"]:
			frappe.throw(_("بصمة قاعدة البيانات SHA-256 غير مطابقة!"))
		if actual_conf_sha != manifest["site_config"]["sha256"]:
			frappe.throw(_("بصمة ملف الإعدادات site_config.json غير مطابقة!"))
		if pigz_or_gzip:
			chk = subprocess.run([pigz_or_gzip, "-t", db_p], capture_output=True, text=True)
			if chk.returncode != 0:
				frappe.throw(_("ملف database.sql.gz تالف: {0}").format(chk.stderr))
		return {
			"ok": True,
			"kind": "incremental_snapshot",
			"manifest": manifest,
			"db_sha256_verified": True,
			"config_sha256_verified": True,
		}

	is_gz = clean_path.endswith(".tar.gz") or clean_path.endswith(".tgz")
	tmp_dir = tempfile.mkdtemp(prefix="archive_verify_")
	try:
		with tarfile.open(clean_path, "r:gz" if is_gz else "r:") as tf:
			members = {m.name.lstrip("./"): m for m in tf.getmembers()}
			for req in ("manifest.json", "database.sql.gz", "site_config_backup.json"):
				if req not in members:
					frappe.throw(_("الأرشيف غير مكتمل: ملف مفقود ({0}).").format(req))
			for req in ("manifest.json", "database.sql.gz", "site_config_backup.json"):
				src_f = tf.extractfile(members[req])
				if src_f is None:
					frappe.throw(_("تعذر قراءة الملف ({0}) من الأرشيف.").format(req))
				with open(os.path.join(tmp_dir, req), "wb") as out_f:
					shutil.copyfileobj(src_f, out_f)

			has_pub = any(k.startswith("public/files") for k in members)
			has_priv = any(k.startswith("private/files") for k in members)

		with open(os.path.join(tmp_dir, "manifest.json"), encoding="utf-8") as mf:
			manifest = json.load(mf)
		db_p = os.path.join(tmp_dir, "database.sql.gz")
		conf_p = os.path.join(tmp_dir, "site_config_backup.json")
		actual_db_sha = _sha256_file(db_p)
		actual_conf_sha = _sha256_file(conf_p)
		if actual_db_sha != manifest["database"]["sha256"]:
			frappe.throw(_("بصمة قاعدة البيانات SHA-256 غير مطابقة!"))
		if actual_conf_sha != manifest["site_config"]["sha256"]:
			frappe.throw(_("بصمة ملف الإعدادات site_config.json غير مطابقة!"))
		if pigz_or_gzip:
			chk = subprocess.run([pigz_or_gzip, "-t", db_p], capture_output=True, text=True)
			if chk.returncode != 0:
				frappe.throw(_("ملف database.sql.gz تالف: {0}").format(chk.stderr))

		return {
			"ok": True,
			"kind": "tar_gz_bundle" if is_gz else "tar_bundle",
			"manifest": manifest,
			"db_sha256_verified": True,
			"config_sha256_verified": True,
			"has_public_files": has_pub,
			"has_private_files": has_priv,
			"member_count": len(members),
		}
	finally:
		shutil.rmtree(tmp_dir, ignore_errors=True)


# =====================================================================
# 8. SERVER STORAGE DISCOVERY & SAFE FOLDER BROWSER APIS
# =====================================================================

_IGNORED_FS_TYPES = {
	"proc",
	"sysfs",
	"devtmpfs",
	"devpts",
	"tmpfs",
	"cgroup",
	"cgroup2",
	"pstore",
	"bpf",
	"tracefs",
	"debugfs",
	"securityfs",
	"configfs",
	"fusectl",
	"mqueue",
	"hugetlbfs",
	"autofs",
	"binfmt_misc",
	"nsfs",
	"overlay",
	"squashfs",
	"rootfs",
	"rpc_pipefs",
	"ramfs",
	"efivarfs",
	"fuse.portal",
	"fuse.gvfsd-fuse",
	"fuse.lxcfs",
	"tracefs",
}

_IGNORED_MOUNT_PREFIXES = (
	"/proc",
	"/sys",
	"/dev",
	"/run",
	"/snap",
	"/boot",
	"/usr",
	"/lib",
	"/lib64",
	"/var/lib/docker",
	"/var/lib/containerd",
	"/var/lib/kubelet",
	"/mnt/wsl",
	"/mnt/wslg",
	"/init",
)

_NETWORK_FS_TYPES = {
	"cifs",
	"smb3",
	"smbfs",
	"nfs",
	"nfs4",
	"sshfs",
	"fuse.sshfs",
	"fuse.rclone",
}

_REMOVABLE_FS_TYPES = {
	"vfat",
	"msdos",
	"fat",
	"fat32",
	"exfat",
	"ntfs",
	"ntfs3",
	"fuseblk",
}


def _is_path_forbidden(path: str) -> bool:
	abs_p = os.path.normpath(os.path.abspath(path))
	real_p = os.path.realpath(abs_p)
	for forbidden_root, _label in _get_forbidden_backup_roots():
		if _is_subpath(real_p, forbidden_root) or _is_subpath(abs_p, forbidden_root):
			return True
	return False


def _is_removable_block_device(dev: str) -> bool:
	if not dev.startswith("/dev/"):
		return False
	base = os.path.basename(dev)
	# Strip trailing partition digits (e.g. sdb1 -> sdb, nvme0n1p1 -> nvme0n1)
	if re.match(r"^nvme\d+n\d+p\d+$", base):
		disk_name = re.sub(r"p\d+$", "", base)
	else:
		disk_name = re.sub(r"\d+$", "", base)
	rem_path = f"/sys/block/{disk_name}/removable"
	try:
		with open(rem_path, encoding="utf-8") as rf:
			return rf.read().strip() == "1"
	except OSError:
		return False


def _classify_mount_entry(dev: str, mountpoint: str, fstype: str, opts: str) -> dict[str, Any]:
	fs_l = fstype.lower()
	opts_l = opts.lower()
	mnt = mountpoint.rstrip("/") or "/"

	if fs_l in _NETWORK_FS_TYPES:
		name = os.path.basename(mnt) or dev
		return {
			"category": "network",
			"category_label": "قرص شبكي (NAS / SMB)",
			"title": f"مجلد شبكي — {name}",
			"subtitle": dev,
			"recommend_require_mount": True,
		}

	if fs_l == "9p" and "drvfs" in opts_l:
		drive_letter = re.sub(r"[^A-Za-z]", "", dev[:2]).upper()
		title = f"القرص ({drive_letter}:)" if drive_letter else f"محرك أقراص ({mnt})"
		return {
			"category": "external",
			"category_label": "قرص متصل",
			"title": title,
			"subtitle": f"متصل عبر {mnt}",
			"recommend_require_mount": True,
		}

	if (
		mnt.startswith(("/media/", "/mnt/", "/run/media/"))
		or fs_l in _REMOVABLE_FS_TYPES
		or _is_removable_block_device(dev)
	):
		vol_name = os.path.basename(mnt) or dev
		return {
			"category": "external",
			"category_label": "قرص خارجي / محرك أقراص",
			"title": f"قرص خارجي — {vol_name}",
			"subtitle": mnt,
			"recommend_require_mount": mnt != "/",
		}

	if mnt == "/":
		return {
			"category": "internal",
			"category_label": "القرص الداخلي للسيرفر",
			"title": "القرص الرئيسي للسيرفر",
			"subtitle": "/",
			"recommend_require_mount": False,
		}

	vol_name = os.path.basename(mnt) or mnt
	return {
		"category": "internal",
		"category_label": "قسم داخلي على السيرفر",
		"title": f"القرص الداخلي — {vol_name}",
		"subtitle": mnt,
		"recommend_require_mount": False,
	}


def _inspect_path_storage_summary(raw_path: str) -> dict[str, Any] | None:
	clean = cstr(raw_path or "").strip()
	if not clean or not os.path.isabs(clean):
		return None
	abs_p = os.path.normpath(os.path.abspath(clean))
	probe = abs_p
	while probe and not os.path.exists(probe):
		parent = os.path.dirname(probe)
		if parent == probe:
			break
		probe = parent
	if not probe or not os.path.exists(probe):
		return None

	try:
		usage = shutil.disk_usage(probe)
		mnt = _resolve_mount_info(abs_p)
		total_gb = round(usage.total / (1024**3), 2)
		free_gb = round(usage.free / (1024**3), 2)
		used_gb = round(max(0, usage.total - usage.free) / (1024**3), 2)
		used_pct = round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0.0
		opts_str = ""
		try:
			with open("/proc/mounts", encoding="utf-8", errors="ignore") as mf:
				for line in mf:
					parts = line.split()
					if len(parts) >= 4 and parts[1].replace("\\040", " ") == mnt["mountpoint"]:
						opts_str = parts[3]
						break
		except OSError:
			pass
		meta = _classify_mount_entry(mnt["device"], mnt["mountpoint"], mnt["fstype"], opts_str)
		return {
			"path": abs_p,
			"exists": os.path.isdir(abs_p),
			"writable": os.access(probe, os.W_OK | os.X_OK),
			"mountpoint": mnt["mountpoint"],
			"fstype": mnt["fstype"],
			"is_external_mount": mnt["is_external_mount"],
			"is_fat32": mnt["fstype"] in FAT32_FS_TYPES,
			"total_gb": total_gb,
			"used_gb": used_gb,
			"free_gb": free_gb,
			"used_percent": used_pct,
			"category": meta["category"],
			"category_label": meta["category_label"],
			"title": meta["title"],
			"recommend_require_mount": meta["recommend_require_mount"],
		}
	except Exception:
		return None


def _default_internal_browse_path() -> str:
	candidates = [
		os.path.expanduser("~"),
		"/var/backups",
		"/srv",
		"/home",
		"/",
	]
	for cand in candidates:
		if cand and os.path.isdir(cand) and not _is_path_forbidden(cand) and os.access(cand, os.R_OK | os.X_OK):
			return os.path.realpath(cand)
	return "/"


@frappe.whitelist()
def list_storage_volumes() -> dict[str, Any]:
	"""
	Lists detected writable storage volumes (internal server disk, external USB drives,
	and mounted network NAS/SMB/NFS shares) with real capacity metrics for the Folder Picker modal.
	"""
	require_backup_management_role()

	volumes: list[dict[str, Any]] = []
	seen_mounts: set[str] = set()

	try:
		with open("/proc/mounts", encoding="utf-8", errors="ignore") as mf:
			for line in mf:
				parts = line.split()
				if len(parts) < 4:
					continue
				dev, mnt_raw, fstype, opts = parts[0], parts[1], parts[2].lower(), parts[3]
				mnt = mnt_raw.replace("\\040", " ").replace("\\011", "\t")
				if mnt in seen_mounts:
					continue
				if fstype in _IGNORED_FS_TYPES:
					continue
				if any(mnt == p or mnt.startswith(p + "/") for p in _IGNORED_MOUNT_PREFIXES):
					continue
				opt_tokens = {o.strip() for o in opts.split(",")}
				if "ro" in opt_tokens:
					continue
				if not os.path.isdir(mnt):
					continue
				if mnt != "/" and _is_path_forbidden(mnt):
					continue

				try:
					usage = shutil.disk_usage(mnt)
				except OSError:
					continue
				if usage.total <= 0:
					continue

				seen_mounts.add(mnt)
				meta = _classify_mount_entry(dev, mnt, fstype, opts)
				browse_path = _default_internal_browse_path() if mnt == "/" else mnt
				total_gb = round(usage.total / (1024**3), 2)
				free_gb = round(usage.free / (1024**3), 2)
				used_gb = round(max(0, usage.total - usage.free) / (1024**3), 2)
				used_pct = round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0.0

				volumes.append(
					{
						"mountpoint": mnt,
						"browse_path": browse_path,
						"device": dev,
						"fstype": fstype,
						"category": meta["category"],
						"category_label": meta["category_label"],
						"title": meta["title"],
						"subtitle": meta["subtitle"],
						"total_gb": total_gb,
						"used_gb": used_gb,
						"free_gb": free_gb,
						"used_percent": used_pct,
						"writable": os.access(browse_path, os.W_OK | os.X_OK),
						"is_external_mount": mnt != "/",
						"is_fat32": fstype in FAT32_FS_TYPES,
						"recommend_require_mount": meta["recommend_require_mount"],
					}
				)
	except OSError:
		pass

	order = {"internal": 0, "external": 1, "network": 2}
	volumes.sort(key=lambda v: (order.get(v["category"], 9), v["mountpoint"]))

	quick_paths: list[dict[str, str]] = []
	home_dir = os.path.expanduser("~")
	if home_dir and os.path.isdir(home_dir) and not _is_path_forbidden(home_dir):
		quick_paths.append({"label": "مجلد المستخدم", "path": os.path.realpath(home_dir)})
	if os.path.isdir("/var/backups") and os.access("/var/backups", os.R_OK | os.X_OK):
		quick_paths.append({"label": "مجلد النسخ بالنظام (/var/backups)", "path": "/var/backups"})
	if os.path.isdir("/mnt") and os.access("/mnt", os.R_OK | os.X_OK):
		quick_paths.append({"label": "الأقراص المثبتة (/mnt)", "path": "/mnt"})
	if os.path.isdir("/media") and os.access("/media", os.R_OK | os.X_OK):
		quick_paths.append({"label": "الوسائط الخارجية (/media)", "path": "/media"})

	return {
		"ok": True,
		"volumes": volumes,
		"quick_paths": quick_paths,
	}


def _folder_contains_site_backups(folder_path: str) -> bool:
	slug = _site_slug()
	bundle_prefix = f"archive_backup_{slug}_"
	inc_name = f"archive_incremental_{slug}"
	try:
		with os.scandir(folder_path) as it:
			for idx, entry in enumerate(it):
				if idx > 80:
					break
				if entry.name.startswith(bundle_prefix) or entry.name == inc_name:
					return True
	except OSError:
		return False
	return False


@frappe.whitelist()
def browse_backup_directory(path: str = "") -> dict[str, Any]:
	"""
	Safely browses server/external/network directories for selecting a backup destination.
	Blocks forbidden system paths and the active Frappe site directory.
	"""
	require_backup_management_role()

	raw = cstr(path or "").strip()
	if not raw:
		cfg = get_backup_settings_dict()
		cand = cfg["destination_path"]
		while cand and not os.path.isdir(cand):
			parent = os.path.dirname(cand)
			if parent == cand:
				cand = ""
				break
			cand = parent
		raw = cand or _default_internal_browse_path()

	if "\x00" in raw or "\n" in raw or "\r" in raw or not os.path.isabs(raw):
		frappe.throw(_("المسار المطلوب تصفحه غير صالح."), frappe.ValidationError)

	abs_p = os.path.normpath(os.path.abspath(raw))
	real_p = os.path.realpath(abs_p) if os.path.exists(abs_p) else abs_p

	if real_p != "/" and _is_path_forbidden(real_p):
		frappe.throw(
			_("لا يُسمح بتصفح هذا المجلد أو اختياره لحفظ النسخ الاحتياطي لأسباب أمنية."),
			frappe.PermissionError,
		)

	if not os.path.isdir(real_p):
		frappe.throw(_("المجلد غير موجود: {0}").format(abs_p), frappe.ValidationError)

	if not os.access(real_p, os.R_OK | os.X_OK):
		frappe.throw(_("لا توجد صلاحية قراءة لعرض محتويات المجلد: {0}").format(real_p), frappe.PermissionError)

	# Build breadcrumbs
	breadcrumbs: list[dict[str, str]] = [{"label": "/", "path": "/"}]
	if real_p != "/":
		parts = [p for p in real_p.strip("/").split("/") if p]
		acc = ""
		for part in parts:
			acc += "/" + part
			breadcrumbs.append({"label": part, "path": acc})

	parent_path = "" if real_p == "/" else os.path.dirname(real_p)

	folders: list[dict[str, Any]] = []
	truncated = False
	max_entries = 250
	try:
		entries = sorted(os.scandir(real_p), key=lambda e: e.name.lower())
	except OSError as exc:
		frappe.throw(_("تعذر قراءة المجلد: {0}").format(cstr(exc)), frappe.ValidationError)

	for entry in entries:
		if entry.name.startswith("."):
			continue
		try:
			if not entry.is_dir(follow_symlinks=True):
				continue
			full_p = os.path.normpath(entry.path)
			if _is_path_forbidden(full_p):
				continue
			if any(full_p == p or full_p.startswith(p + "/") for p in ("/mnt/wsl", "/mnt/wslg", "/init")):
				continue
			readable = os.access(full_p, os.R_OK | os.X_OK)
			writable = os.access(full_p, os.W_OK | os.X_OK)
			folders.append(
				{
					"name": entry.name,
					"path": full_p,
					"readable": readable,
					"writable": writable,
					"has_existing_backups": _folder_contains_site_backups(full_p) if readable else False,
				}
			)
			if len(folders) >= max_entries:
				truncated = True
				break
		except OSError:
			continue

	storage = _inspect_path_storage_summary(real_p)
	can_select = real_p != "/" and not _is_path_forbidden(real_p) and os.access(real_p, os.W_OK | os.X_OK)

	return {
		"ok": True,
		"current_path": real_p,
		"parent_path": parent_path,
		"breadcrumbs": breadcrumbs,
		"can_select_current": can_select,
		"can_create_folder": can_select,
		"storage": storage,
		"folders": folders,
		"truncated": truncated,
	}


@frappe.whitelist()
def create_backup_folder(parent_path: str, folder_name: str) -> dict[str, Any]:
	"""Creates a new subfolder inside an allowed writable destination directory."""
	require_backup_management_role()

	raw_parent = cstr(parent_path or "").strip()
	clean_name = cstr(folder_name or "").strip()

	if not clean_name:
		frappe.throw(_("يرجى إدخال اسم المجلد الجديد."), frappe.ValidationError)
	if (
		len(clean_name) > 100
		or "/" in clean_name
		or "\\" in clean_name
		or ".." in clean_name
		or clean_name.startswith(".")
		or any(ord(ch) < 32 for ch in clean_name)
	):
		frappe.throw(
			_("اسم المجلد غير صالح. استخدم حروفاً أو أرقاماً أو شرطات بدون رموز مسارات."),
			frappe.ValidationError,
		)

	if not raw_parent or not os.path.isabs(raw_parent):
		frappe.throw(_("المجلد الأب غير صالح."), frappe.ValidationError)

	real_parent = os.path.realpath(os.path.normpath(os.path.abspath(raw_parent)))
	if real_parent == "/" or _is_path_forbidden(real_parent):
		frappe.throw(_("لا يُسمح بإنشاء مجلد داخل هذا المسار."), frappe.PermissionError)
	if not os.path.isdir(real_parent) or not os.access(real_parent, os.W_OK | os.X_OK):
		frappe.throw(_("لا توجد صلاحية كتابة لإنشاء مجلد داخل: {0}").format(real_parent), frappe.PermissionError)

	new_path = os.path.normpath(os.path.join(real_parent, clean_name))
	if _is_path_forbidden(new_path):
		frappe.throw(_("لا يُسمح بإنشاء مجلد في هذا المسار."), frappe.PermissionError)
	if os.path.exists(new_path):
		frappe.throw(_("يوجد مجلد أو ملف بهذا الاسم بالفعل: {0}").format(clean_name), frappe.ValidationError)

	try:
		os.makedirs(new_path, exist_ok=False)
	except OSError as exc:
		frappe.throw(_("تعذر إنشاء المجلد ({0}): {1}").format(clean_name, cstr(exc)), frappe.ValidationError)

	return {
		"ok": True,
		"path": new_path,
		"name": clean_name,
	}
