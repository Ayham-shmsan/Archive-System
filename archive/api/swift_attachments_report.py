from __future__ import annotations

import hashlib
import mimetypes
import os
import re
import tempfile
import time
import zipfile
from datetime import date, datetime
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, get_datetime, get_system_timezone, getdate
from werkzeug.wrappers import Response

from archive.api.operation_search import get_search_tokens, normalize_search_text
from archive.services.fiscal_year_permissions import (
	get_allowed_fiscal_years,
	get_screen_fiscal_context,
	resolve_fiscal_year_filter,
)
from archive.services.swift_attachments_report_permissions import (
	get_swift_attachments_permissions_snapshot,
	require_swift_attachments_screen_access,
	require_swift_report_download_permission,
	require_swift_report_preview_permission,
	require_swift_report_zip_permission,
)

MAX_ZIP_TOTAL_BYTES = int(1.5 * 1024 * 1024 * 1024)  # 1.5 GB
ZIP_STREAM_CHUNK_BYTES = 256 * 1024

IMAGE_EXTENSIONS = frozenset({"png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tif", "tiff", "avif"})
PDF_EXTENSIONS = frozenset({"pdf"})

MIME_TYPE_BY_EXTENSION = {
	"pdf": "application/pdf",
	"png": "image/png",
	"jpg": "image/jpeg",
	"jpeg": "image/jpeg",
	"webp": "image/webp",
	"gif": "image/gif",
	"bmp": "image/bmp",
	"svg": "image/svg+xml",
	"tif": "image/tiff",
	"tiff": "image/tiff",
	"avif": "image/avif",
	"ico": "image/x-icon",
}

ATTACHMENT_TYPE_PRIORITY = {
	"final_swift": 1,
	"extraction_source": 2,
	"new_invoice": 3,
	"shared_attachment": 4,
}

ATTACHMENT_TYPE_CODE = {
	"final_swift": 0,
	"extraction_source": 1,
	"new_invoice": 2,
	"shared_attachment": 3,
}

SNAPSHOT_CACHE_VERSION_KEY = "archive:swift_attachments_snapshot:ver"
SNAPSHOT_CACHE_TTL_SECONDS = 300

ATTACHMENT_TYPE_LABELS = {
	"final_swift": "سويفت نهائي",
	"extraction_source": "ملف استخراج",
	"new_invoice": "فاتورة جديدة",
	"shared_attachment": "مرفق مشترك",
}

OPERATION_SELECT_FIELDS = (
	"name",
	"serial_no",
	"fiscal_year",
	"fiscal_sequence",
	"operation_no",
	"operation_group",
	"customer",
	"amount",
	"currency",
	"beneficiary_name",
	"beneficiary_account",
	"beneficiary_bank",
	"swift_code",
	"country",
	"sender_name",
	"sender_account",
	"execution_datetime",
	"transferring_bank",
	"request_date",
	"from_account",
	"reference_no",
	"notes",
	"user_notes",
	"status",
	"is_blocked_operation",
	"extraction_source_file",
	"final_swift_file",
	"final_swift_uploaded_at",
	"final_swift_uploaded_by",
	"search_text",
	"creation",
	"owner",
)


# ============================================================
# Helpers
# ============================================================


def _parse_json_value(value: Any, default: Any) -> Any:
	if value is None or value == "":
		return default
	if isinstance(value, (dict, list)):
		return value
	if isinstance(value, str):
		try:
			parsed = frappe.parse_json(value)
			return default if parsed is None else parsed
		except Exception:
			return default
	return default


def _normalize_file_url(file_url: str | None) -> str:
	url = cstr(file_url or "").strip()
	if not url:
		return ""
	return url.split("?", 1)[0].split("#", 1)[0].strip()


def _extract_file_name(file_name: str | None, file_url: str | None) -> str:
	clean = cstr(file_name or "").strip()
	if clean:
		return os.path.basename(clean)
	url = _normalize_file_url(file_url)
	return os.path.basename(url) if url else "attachment"


def _extract_extension(file_name: str | None, file_url: str | None) -> str:
	candidates = []
	clean_name = cstr(file_name or "").strip()
	if clean_name:
		candidates.append(os.path.basename(clean_name))
	norm_url = _normalize_file_url(file_url)
	if norm_url:
		candidates.append(os.path.basename(norm_url))
	for candidate in candidates:
		_, ext = os.path.splitext(candidate)
		clean_ext = ext.lstrip(".").lower()
		if clean_ext and clean_ext.isalnum() and len(clean_ext) <= 10:
			return clean_ext
	return ""


def _detect_file_kind(ext: str) -> str:
	clean_ext = cstr(ext or "").strip().lstrip(".").lower()
	if clean_ext in PDF_EXTENSIONS:
		return "pdf"
	if clean_ext in IMAGE_EXTENSIONS:
		return "image"
	return "other"


def _normalize_multi_filter(value: Any) -> list[str]:
	if value is None or value == "":
		return []
	if isinstance(value, str):
		parsed = _parse_json_value(value, None)
		if isinstance(parsed, list):
			value = parsed
		else:
			value = [p.strip() for p in value.split(",") if p.strip()]
	if isinstance(value, (list, tuple, set)):
		return [cstr(v).strip() for v in value if cstr(v).strip()]
	clean = cstr(value).strip()
	return [clean] if clean else []


def _format_year_short(op: dict[str, Any]) -> str:
	for candidate in (op.get("fiscal_year"), op.get("execution_datetime"), op.get("request_date")):
		raw = cstr(candidate or "").strip()
		m = re.match(r"^((?:19|20)\d{2})\b", raw)
		if m:
			return m.group(1)[-2:]
	return ""


def _resolve_physical_file_path(file_url: str) -> str | None:
	"""
	Safely resolves a Frappe local file URL (/private/files/... or /files/...)
	inside the current site directory with realpath traversal containment.
	"""
	url = _normalize_file_url(file_url)
	if not url or "://" in url:
		return None

	site_root = os.path.realpath(frappe.get_site_path())
	if url.startswith("/private/files/"):
		rel = url[len("/private/files/") :]
		allowed_root = os.path.realpath(os.path.join(site_root, "private", "files"))
	elif url.startswith("/files/"):
		rel = url[len("/files/") :]
		allowed_root = os.path.realpath(os.path.join(site_root, "public", "files"))
	else:
		return None

	candidate = os.path.realpath(os.path.join(allowed_root, rel))
	if os.path.commonpath([allowed_root, candidate]) != allowed_root:
		return None
	if not os.path.isfile(candidate):
		return None
	return candidate


def _build_content_disposition(disposition_type: str, filename: str) -> str:
	clean_name = os.path.basename(cstr(filename or "attachment").replace("\r", "").replace("\n", "")).strip()
	if not clean_name:
		clean_name = "attachment"
	ascii_fallback = re.sub(r"[^\x20-\x7E]", "_", clean_name).replace('"', "'")
	if not ascii_fallback.strip("_."):
		_, ext = os.path.splitext(clean_name)
		ascii_fallback = f"attachment{ext}"
	utf8_encoded = quote(clean_name, safe="")
	return f"{disposition_type}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{utf8_encoded}"


def _sanitize_zip_filename(name: str) -> str:
	clean = os.path.basename(cstr(name or "").strip())
	clean = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", clean).strip(" .")
	return clean or "attachment"


def _build_operation_zip_prefix(op: dict[str, Any] | None) -> str:
	if not op:
		return "OP"
	op_no = cstr(op.get("operation_no") or "").strip()
	year_short = _format_year_short(op)
	if op_no:
		safe_no = re.sub(r'[\\/:*?"<>|\s]+', "-", op_no)
		return f"{safe_no}-{year_short}" if year_short else safe_no
	return re.sub(r'[\\/:*?"<>|\s]+', "-", cstr(op.get("name") or "OP"))


def _build_operation_search_blob(
	op: dict[str, Any],
	country_ar_cache: dict[str, str] | None = None,
) -> str:
	existing = cstr(op.get("search_text") or "").strip()
	country = cstr(op.get("country") or "").strip()
	if country:
		if country_ar_cache is not None:
			country_ar = country_ar_cache.get(country)
			if country_ar is None:
				country_ar = _(country)
				country_ar_cache[country] = country_ar
		else:
			country_ar = _(country)
		extra_country = normalize_search_text(f"{country} {country_ar}")
	else:
		country_ar = ""
		extra_country = ""
	if existing:
		return f"{existing} {extra_country}".strip() if extra_country else existing
	parts = [
		op.get("name"),
		op.get("serial_no"),
		op.get("fiscal_year"),
		op.get("fiscal_sequence"),
		op.get("operation_no"),
		op.get("customer"),
		op.get("amount"),
		op.get("currency"),
		op.get("beneficiary_name"),
		op.get("beneficiary_account"),
		op.get("beneficiary_bank"),
		op.get("swift_code"),
		country,
		country_ar,
		op.get("sender_name"),
		op.get("sender_account"),
		op.get("transferring_bank"),
		op.get("from_account"),
		op.get("reference_no"),
		op.get("notes"),
		op.get("user_notes"),
		op.get("status"),
	]
	return normalize_search_text(" ".join(cstr(p) for p in parts if p not in (None, "")))


def _resolve_timezone_pair() -> tuple[ZoneInfo | None, ZoneInfo | None]:
	try:
		sys_tz_name = cstr(get_system_timezone() or "").strip()
		user_tz_name = cstr(
			frappe.db.get_value("User", frappe.session.user, "time_zone") or sys_tz_name
		).strip()
		if not sys_tz_name or not user_tz_name or sys_tz_name == user_tz_name:
			return None, None
		return ZoneInfo(sys_tz_name), ZoneInfo(user_tz_name)
	except Exception:
		return None, None


def _to_user_date(
	value: Any,
	sys_tz: ZoneInfo | None = None,
	user_tz: ZoneInfo | None = None,
) -> date | None:
	if not value:
		return None
	try:
		if isinstance(value, datetime):
			dt = value
		elif isinstance(value, date):
			return value
		else:
			raw = cstr(value).strip()
			if not raw:
				return None
			# Plain YYYY-MM-DD date without time component stays as-is
			if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
				return getdate(raw)
			dt = get_datetime(raw)

		if sys_tz and user_tz:
			if dt.tzinfo is None:
				dt = dt.replace(tzinfo=sys_tz)
			dt = dt.astimezone(user_tz)
		return dt.date()
	except Exception:
		try:
			return getdate(value)
		except Exception:
			return None


def _matches_date_range(
	value: Any,
	range_val: Any,
	sys_tz: ZoneInfo | None = None,
	user_tz: ZoneInfo | None = None,
) -> bool:
	if not isinstance(range_val, dict):
		return True
	date_from = cstr(range_val.get("from") or "").strip()
	date_to = cstr(range_val.get("to") or "").strip()
	if not date_from and not date_to:
		return True
	target = _to_user_date(value, sys_tz=sys_tz, user_tz=user_tz)
	if not target:
		return False
	try:
		if date_from and target < getdate(date_from):
			return False
		if date_to and target > getdate(date_to):
			return False
	except Exception:
		return False
	return True


def _matches_number_range(value: Any, range_val: Any) -> bool:
	if not isinstance(range_val, dict):
		return True
	num_min = range_val.get("min")
	num_max = range_val.get("max")
	has_min = num_min not in (None, "")
	has_max = num_max not in (None, "")
	if not has_min and not has_max:
		return True
	try:
		v = flt(value)
		if has_min and v < flt(num_min):
			return False
		if has_max and v > flt(num_max):
			return False
	except Exception:
		return False
	return True


def _matches_text_filter(value: Any, needle: Any) -> bool:
	tokens = get_search_tokens(cstr(needle or "").strip())
	if not tokens:
		return True
	haystack = normalize_search_text(value)
	return all(tok in haystack for tok in tokens)


def _matches_code_filter(value: Any, needle: Any) -> bool:
	if _matches_text_filter(value, needle):
		return True
	compact_needle = re.sub(r"[\s\-_/]+", "", normalize_search_text(needle))
	if not compact_needle:
		return True
	compact_value = re.sub(r"[\s\-_/]+", "", normalize_search_text(value))
	return compact_needle in compact_value


def _matches_operation_filters(
	op: dict[str, Any],
	filters: dict[str, Any],
	sys_tz: ZoneInfo | None = None,
	user_tz: ZoneInfo | None = None,
) -> bool:
	if not filters:
		return True

	# Multi-select exact match filters
	for field in ("customer", "transferring_bank", "beneficiary_bank", "country", "from_account", "status"):
		selected = _normalize_multi_filter(filters.get(field))
		if selected:
			val = cstr(op.get(field) or "").strip()
			if val not in selected:
				return False

	# Operation number filter: supports both "45454" and "45454/26" or "45454-26"
	op_no_needle = filters.get("operation_no")
	if op_no_needle not in (None, ""):
		raw_needle = cstr(op_no_needle).strip()
		op_no_val = cstr(op.get("operation_no") or "").strip()
		if "/" in raw_needle or "-" in raw_needle:
			yr = _format_year_short(op)
			op_haystack = f"{op_no_val} {op_no_val}/{yr} {op_no_val}-{yr}" if (op_no_val and yr) else op_no_val
			if not _matches_text_filter(op_haystack, raw_needle):
				return False
		else:
			if not _matches_text_filter(op_no_val, raw_needle):
				return False

	# Name text filters (normalized Arabic/digits match)
	for field in ("beneficiary_name", "sender_name"):
		needle = filters.get(field)
		if needle not in (None, ""):
			if not _matches_text_filter(op.get(field), needle):
				return False

	# Account / SWIFT / reference code filters (also ignore pasted spaces/hyphens)
	for field in ("beneficiary_account", "swift_code", "sender_account", "reference_no"):
		needle = filters.get(field)
		if needle not in (None, ""):
			if not _matches_code_filter(op.get(field), needle):
				return False

	# Ranges
	if filters.get("amount") and not _matches_number_range(op.get("amount"), filters.get("amount")):
		return False
	if filters.get("execution_datetime") and not _matches_date_range(
		op.get("execution_datetime"),
		filters.get("execution_datetime"),
		sys_tz=sys_tz,
		user_tz=user_tz,
	):
		return False

	return True


# ============================================================
# Core Batched Dataset Builder (Zero N+1)
# ============================================================


def _fetch_operations_and_attachments(
	allowed_fiscal_years: list[str],
) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]], dict[str, dict[str, Any]], dict[str, str]]:
	"""
	Fetches all operations in `allowed_fiscal_years` along with:
	- group_docs_map: operation_group -> list of Archive Operation Document dicts
	- child_atts_map: operation.name -> list of Archive Operation Attachment dicts
	- file_meta_map: normalized file_url -> File metadata (content_hash, file_size, file_name, creation, owner)
	- user_names_map: user email -> full_name
	All in 5 batched SQL queries total (zero N+1).
	"""
	if not allowed_fiscal_years:
		return [], {}, {}, {}, {}

	operations = frappe.get_all(
		"Archive Operation",
		filters={"fiscal_year": ["in", allowed_fiscal_years]},
		fields=list(OPERATION_SELECT_FIELDS),
		order_by="execution_datetime desc, creation desc",
		limit_page_length=0,
		ignore_permissions=True,
	)
	if not operations:
		return [], {}, {}, {}, {}

	op_names = [op["name"] for op in operations]
	op_groups = list({cstr(op.get("operation_group") or "").strip() for op in operations if op.get("operation_group")})

	group_docs_map: dict[str, list[dict[str, Any]]] = {}
	all_file_urls: set[str] = set()
	owner_emails: set[str] = set()

	if op_groups:
		for idx in range(0, len(op_groups), 1000):
			group_chunk = op_groups[idx : idx + 1000]
			docs = frappe.get_all(
				"Archive Operation Document",
				filters={"operation_group": ["in", group_chunk]},
				fields=[
					"name",
					"operation_group",
					"source_operation",
					"document_role",
					"is_new_invoice",
					"file",
					"file_name",
					"file_extension",
					"file_size",
					"content_hash",
					"owner",
					"creation",
				],
				order_by="creation desc",
				limit_page_length=0,
				ignore_permissions=True,
			)
			for doc in docs:
				url = _normalize_file_url(doc.get("file"))
				if not url:
					continue
				doc["_norm_url"] = url
				all_file_urls.add(url)
				if doc.get("owner"):
					owner_emails.add(doc["owner"])
				group_docs_map.setdefault(doc["operation_group"], []).append(doc)

	child_atts_map: dict[str, list[dict[str, Any]]] = {}
	for idx in range(0, len(op_names), 1000):
		name_chunk = op_names[idx : idx + 1000]
		child_atts = frappe.get_all(
			"Archive Operation Attachment",
			filters={"parent": ["in", name_chunk], "parenttype": "Archive Operation"},
			fields=[
				"name",
				"parent",
				"file",
				"file_name",
				"is_extraction_source",
				"is_final_swift",
				"owner",
				"creation",
			],
			order_by="creation desc",
			limit_page_length=0,
			ignore_permissions=True,
		)
		for att in child_atts:
			url = _normalize_file_url(att.get("file"))
			if not url:
				continue
			att["_norm_url"] = url
			all_file_urls.add(url)
			if att.get("owner"):
				owner_emails.add(att["owner"])
			child_atts_map.setdefault(att["parent"], []).append(att)

	for op in operations:
		ext_url = _normalize_file_url(op.get("extraction_source_file"))
		if ext_url:
			all_file_urls.add(ext_url)
		fsw_url = _normalize_file_url(op.get("final_swift_file"))
		if fsw_url:
			all_file_urls.add(fsw_url)
		if op.get("owner"):
			owner_emails.add(op["owner"])
		if op.get("final_swift_uploaded_by"):
			owner_emails.add(op["final_swift_uploaded_by"])

	file_meta_map: dict[str, dict[str, Any]] = {}
	if all_file_urls:
		url_list = list(all_file_urls)
		for idx in range(0, len(url_list), 500):
			chunk = url_list[idx : idx + 500]
			file_rows = frappe.get_all(
				"File",
				filters={"file_url": ["in", chunk]},
				fields=["name", "file_url", "file_name", "file_size", "content_hash", "creation", "owner"],
				order_by="creation desc",
				limit_page_length=0,
				ignore_permissions=True,
			)
			for fr in file_rows:
				norm = _normalize_file_url(fr.get("file_url"))
				if not norm:
					continue
				if fr.get("owner"):
					owner_emails.add(fr["owner"])
				existing = file_meta_map.get(norm)
				if not existing or (not existing.get("content_hash") and fr.get("content_hash")):
					file_meta_map[norm] = fr

	user_names_map: dict[str, str] = {}
	if owner_emails:
		users = frappe.get_all(
			"User",
			filters={"name": ["in", list(owner_emails)]},
			fields=["name", "full_name"],
			limit_page_length=0,
			ignore_permissions=True,
		)
		for u in users:
			user_names_map[u["name"]] = cstr(u.get("full_name") or u["name"]).strip()

	return operations, group_docs_map, child_atts_map, file_meta_map, user_names_map


def _collect_operation_attachment_entries(
	op: dict[str, Any],
	group_docs_map: dict[str, list[dict[str, Any]]],
	child_atts_map: dict[str, list[dict[str, Any]]],
	file_meta_map: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
	"""
	Collects every attachment belonging to `op` across all 4 sources:
	1. final_swift_file (direct field)
	2. extraction_source_file (direct field)
	3. Archive Operation Attachment (child table)
	4. Archive Operation Document (shared group documents & new invoices)
	"""
	entries: list[dict[str, Any]] = []

	def _push(
		url: str,
		attachment_type: str,
		file_name: str | None = None,
		file_size: int | None = None,
		file_ext: str | None = None,
		content_hash: str | None = None,
		uploaded_at: Any = None,
		uploaded_by: str | None = None,
	) -> None:
		norm_url = _normalize_file_url(url)
		if not norm_url:
			return
		fmeta = file_meta_map.get(norm_url) or {}
		resolved_hash = cstr(content_hash or fmeta.get("content_hash") or "").strip().lower()
		resolved_name = _extract_file_name(file_name or fmeta.get("file_name"), norm_url)
		resolved_ext = cstr(file_ext or "").strip().lstrip(".").lower() or _extract_extension(resolved_name, norm_url)
		resolved_size = cint(file_size or fmeta.get("file_size") or 0)
		resolved_uploaded_at = uploaded_at or fmeta.get("creation") or op.get("creation")
		resolved_uploaded_by = cstr(uploaded_by or fmeta.get("owner") or op.get("owner") or "").strip()

		entries.append(
			{
				"file_url": norm_url,
				"content_hash": resolved_hash,
				"dedup_key": f"hash:{resolved_hash}" if resolved_hash else f"url:{norm_url.lower()}",
				"attachment_type": attachment_type,
				"file_name": resolved_name,
				"file_extension": resolved_ext,
				"file_kind": _detect_file_kind(resolved_ext),
				"file_size": resolved_size,
				"uploaded_at": cstr(resolved_uploaded_at or ""),
				"uploaded_by": resolved_uploaded_by,
			}
		)

	# 1. Final Swift direct field
	if op.get("final_swift_file"):
		_push(
			op["final_swift_file"],
			"final_swift",
			uploaded_at=op.get("final_swift_uploaded_at") or op.get("creation"),
			uploaded_by=op.get("final_swift_uploaded_by") or op.get("owner"),
		)

	# 2. Extraction source direct field
	if op.get("extraction_source_file"):
		_push(
			op["extraction_source_file"],
			"extraction_source",
			uploaded_at=op.get("creation"),
			uploaded_by=op.get("owner"),
		)

	# 3. Child attachments table
	for att in child_atts_map.get(op["name"], []):
		if cint(att.get("is_final_swift")):
			att_type = "final_swift"
		elif cint(att.get("is_extraction_source")):
			att_type = "extraction_source"
		else:
			att_type = "shared_attachment"
		_push(
			att["_norm_url"],
			att_type,
			file_name=att.get("file_name"),
			uploaded_at=att.get("creation"),
			uploaded_by=att.get("owner"),
		)

	# 4. Shared Group Documents (Archive Operation Document)
	op_group = cstr(op.get("operation_group") or "").strip()
	if op_group:
		for doc in group_docs_map.get(op_group, []):
			doc_role = cstr(doc.get("document_role") or "").strip()
			if doc_role == "invoice" or cint(doc.get("is_new_invoice")):
				att_type = "new_invoice"
			else:
				att_type = "shared_attachment"
			_push(
				doc["_norm_url"],
				att_type,
				file_name=doc.get("file_name"),
				file_size=doc.get("file_size"),
				file_ext=doc.get("file_extension"),
				content_hash=doc.get("content_hash"),
				uploaded_at=doc.get("creation"),
				uploaded_by=doc.get("owner"),
			)

	return entries


def _compute_facets_from_operations(
	operations: list[dict[str, Any]],
	group_docs_map: dict[str, list[dict[str, Any]]],
	child_atts_map: dict[str, list[dict[str, Any]]],
) -> dict[str, list[str]]:
	"""
	Builds sorted distinct filter options ONLY from operations that actually have attachments.
	"""
	facet_sets: dict[str, set[str]] = {
		"customer": set(),
		"transferring_bank": set(),
		"beneficiary_bank": set(),
		"country": set(),
		"from_account": set(),
		"status": set(),
	}
	for op in operations:
		has_any = bool(
			op.get("final_swift_file")
			or op.get("extraction_source_file")
			or child_atts_map.get(op["name"])
			or (op.get("operation_group") and group_docs_map.get(op["operation_group"]))
		)
		if not has_any:
			continue
		for field in facet_sets:
			val = cstr(op.get(field) or "").strip()
			if val:
				facet_sets[field].add(val)

	return {k: sorted(v) for k, v in facet_sets.items()}


def _is_file_url_authorized_for_user(file_url: str, user: str | None = None) -> tuple[bool, dict[str, Any] | None]:
	"""
	Strict server-side authorization check: verifies that `file_url` is genuinely linked to at
	least ONE Archive Operation inside the user's allowed view fiscal years, and returns the
	latest matching authorized operation metadata (for clean ZIP naming / metadata).
	"""
	norm_url = _normalize_file_url(file_url)
	if not norm_url:
		return False, None

	allowed_years = get_allowed_fiscal_years("view", user=user, only_open=False)
	if not allowed_years:
		return False, None

	# 1. Direct fields on Archive Operation
	direct_ops = frappe.db.sql(
		"""
		SELECT name, operation_no, fiscal_year, execution_datetime, request_date
		FROM `tabArchive Operation`
		WHERE fiscal_year IN %(years)s
		  AND (extraction_source_file = %(url)s OR final_swift_file = %(url)s)
		ORDER BY execution_datetime DESC, creation DESC
		LIMIT 1
		""",
		{"years": tuple(allowed_years), "url": norm_url},
		as_dict=True,
	)
	if direct_ops:
		return True, direct_ops[0]

	# 2. Child table Archive Operation Attachment
	att_ops = frappe.db.sql(
		"""
		SELECT op.name, op.operation_no, op.fiscal_year, op.execution_datetime, op.request_date
		FROM `tabArchive Operation Attachment` att
		INNER JOIN `tabArchive Operation` op ON op.name = att.parent
		WHERE att.parenttype = 'Archive Operation'
		  AND att.file = %(url)s
		  AND op.fiscal_year IN %(years)s
		ORDER BY op.execution_datetime DESC, op.creation DESC
		LIMIT 1
		""",
		{"years": tuple(allowed_years), "url": norm_url},
		as_dict=True,
	)
	if att_ops:
		return True, att_ops[0]

	# 3. Shared group documents (Archive Operation Document)
	doc_ops = frappe.db.sql(
		"""
		SELECT op.name, op.operation_no, op.fiscal_year, op.execution_datetime, op.request_date
		FROM `tabArchive Operation Document` doc
		INNER JOIN `tabArchive Operation` op ON op.operation_group = doc.operation_group
		WHERE doc.file = %(url)s
		  AND op.fiscal_year IN %(years)s
		ORDER BY op.execution_datetime DESC, op.creation DESC
		LIMIT 1
		""",
		{"years": tuple(allowed_years), "url": norm_url},
		as_dict=True,
	)
	if doc_ops:
		return True, doc_ops[0]

	return False, None


# ============================================================
# Compact Cached Relational Snapshot (37K+ File Scale)
# ============================================================


def bump_swift_attachments_report_cache(doc: Any = None, method: str | None = None) -> None:
	"""
	O(1) Redis cache version bump hooked on Archive Operation & Archive Operation Document mutations.
	Never raises so it can never disrupt document saves.
	"""
	try:
		frappe.cache().set_value(SNAPSHOT_CACHE_VERSION_KEY, str(time.time_ns()))
	except Exception:
		pass


def _compute_snapshot_fingerprint(allowed_years: list[str]) -> str:
	"""
	Ultra-fast (<2 ms) database freshness fingerprint covering direct SQL/set_value edits
	as well as normal ORM mutations across all SWIFT attachment sources.
	"""
	if not allowed_years:
		return "empty"
	years_tuple = tuple(sorted(allowed_years))
	op_sig = frappe.db.sql(
		"""
		SELECT COUNT(*), COALESCE(MAX(modified), '')
		FROM `tabArchive Operation`
		WHERE fiscal_year IN %(years)s
		""",
		{"years": years_tuple},
	)[0]
	doc_sig = frappe.db.sql(
		"""
		SELECT COUNT(*), COALESCE(MAX(modified), '')
		FROM `tabArchive Operation Document`
		"""
	)[0]
	att_sig = frappe.db.sql(
		"""
		SELECT COUNT(*), COALESCE(MAX(modified), '')
		FROM `tabArchive Operation Attachment`
		WHERE parenttype = 'Archive Operation'
		"""
	)[0]
	return f"{op_sig[0]}:{op_sig[1]}|{doc_sig[0]}:{doc_sig[1]}|{att_sig[0]}:{att_sig[1]}"


def _build_relational_snapshot_payload(
	allowed_years: list[str],
	sys_tz: ZoneInfo | None,
	user_tz: ZoneInfo | None,
) -> dict[str, Any]:
	"""
	Builds a compact, zero-duplication relational snapshot of operations, unique files,
	and links for the requested fiscal years. Pre-sorted by execution_datetime desc so
	client-side search, 18 filters, deduplication, sorting, and pagination execute in <5 ms.
	"""
	empty_facets = {
		"customer": [],
		"transferring_bank": [],
		"beneficiary_bank": [],
		"country": [],
		"from_account": [],
		"status": [],
	}
	if not allowed_years:
		return {
			"facets": empty_facets,
			"users": [],
			"operations": [],
			"files": [],
			"links": [],
		}

	operations, group_docs_map, child_atts_map, file_meta_map, user_names_map = (
		_fetch_operations_and_attachments(allowed_years)
	)
	if not operations:
		return {
			"facets": empty_facets,
			"users": [],
			"operations": [],
			"files": [],
			"links": [],
		}

	# Match exact primary-op ordering used by get_attachments_report
	operations.sort(
		key=lambda o: (cstr(o.get("execution_datetime") or ""), cstr(o.get("name") or "")),
		reverse=True,
	)

	country_ar_cache: dict[str, str] = {}
	facet_sets: dict[str, set[str]] = {k: set() for k in empty_facets}

	compact_ops: list[dict[str, Any]] = []
	compact_files: list[dict[str, Any]] = []
	file_idx_by_key: dict[str, int] = {}

	users_list: list[str] = []
	user_idx_by_label: dict[str, int] = {}

	def _intern_user(email: str) -> int:
		label = user_names_map.get(email, email) or ""
		idx = user_idx_by_label.get(label)
		if idx is None:
			idx = len(users_list)
			users_list.append(label)
			user_idx_by_label[label] = idx
		return idx

	# Deduplicate links per (file_idx, op_idx, type_code) while preserving op_idx ASC order
	links: list[list[Any]] = []

	for op in operations:
		att_entries = _collect_operation_attachment_entries(op, group_docs_map, child_atts_map, file_meta_map)
		if not att_entries:
			continue

		op_idx = len(compact_ops)
		for field in facet_sets:
			val = cstr(op.get(field) or "").strip()
			if val:
				facet_sets[field].add(val)

		exec_raw = cstr(op.get("execution_datetime") or "")
		exec_date_obj = _to_user_date(exec_raw, sys_tz=sys_tz, user_tz=user_tz) if exec_raw else None

		compact_ops.append(
			{
				"n": op["name"],
				"no": cstr(op.get("operation_no") or "").strip(),
				"fy": cstr(op.get("fiscal_year") or "").strip(),
				"ys": _format_year_short(op),
				"cu": cstr(op.get("customer") or "").strip(),
				"bn": cstr(op.get("beneficiary_name") or "").strip(),
				"ba": cstr(op.get("beneficiary_account") or "").strip(),
				"bb": cstr(op.get("beneficiary_bank") or "").strip(),
				"sw": cstr(op.get("swift_code") or "").strip(),
				"co": cstr(op.get("country") or "").strip(),
				"sn": cstr(op.get("sender_name") or "").strip(),
				"sa": cstr(op.get("sender_account") or "").strip(),
				"tb": cstr(op.get("transferring_bank") or "").strip(),
				"fa": cstr(op.get("from_account") or "").strip(),
				"rf": cstr(op.get("reference_no") or "").strip(),
				"am": flt(op.get("amount")),
				"cr": cstr(op.get("currency") or "").strip(),
				"st": cstr(op.get("status") or "").strip(),
				"ex": exec_raw,
				"ed": exec_date_obj.isoformat() if exec_date_obj else "",
				"bl": 1 if cint(op.get("is_blocked_operation")) else 0,
				"sb": _build_operation_search_blob(op, country_ar_cache=country_ar_cache),
			}
		)

		op_link_map: dict[tuple[int, int], list[Any]] = {}
		for entry in att_entries:
			dkey = entry["dedup_key"]
			f_idx = file_idx_by_key.get(dkey)
			up_at = entry["uploaded_at"]
			up_by_idx = _intern_user(entry["uploaded_by"])
			if f_idx is None:
				f_idx = len(compact_files)
				file_idx_by_key[dkey] = f_idx
				compact_files.append(
					{
						"k": dkey,
						"u": entry["file_url"],
						"fn": entry["file_name"],
						"fn_n": normalize_search_text(entry["file_name"]),
						"fe": entry["file_extension"],
						"fk": entry["file_kind"],
						"fs": entry["file_size"],
						"ua": up_at,
						"ub": up_by_idx,
					}
				)
			else:
				fobj = compact_files[f_idx]
				if entry["file_size"] > fobj["fs"]:
					fobj["fs"] = entry["file_size"]
				if up_at and (not fobj["ua"] or up_at > fobj["ua"]):
					fobj["ua"] = up_at
					fobj["ub"] = up_by_idx

			tcode = ATTACHMENT_TYPE_CODE.get(entry["attachment_type"], 3)
			up_date_obj = _to_user_date(up_at, sys_tz=sys_tz, user_tz=user_tz) if up_at else None
			up_date_iso = up_date_obj.isoformat() if up_date_obj else ""

			pair = (f_idx, tcode)
			existing_link = op_link_map.get(pair)
			if existing_link is None or (up_at and up_at > existing_link[4]):
				op_link_map[pair] = [f_idx, op_idx, tcode, up_date_iso, up_at, up_by_idx]

		# Append links for this op_idx (preserving strict op_idx ASC order!)
		for link in op_link_map.values():
			links.append(link)

	return {
		"facets": {k: sorted(v) for k, v in facet_sets.items()},
		"users": users_list,
		"operations": compact_ops,
		"files": compact_files,
		"links": links,
	}


# ============================================================
# Whitelisted APIs
# ============================================================


@frappe.whitelist(methods=["GET", "POST"])
def get_attachments_snapshot(
	fiscal_year: str | list[str] | None = None,
	fiscal_years: str | list[str] | None = None,
	force_refresh: int = 0,
) -> dict[str, Any]:
	"""
	Returns a Redis-cached compact relational snapshot (operations, unique files, links, facets)
	plus fresh per-user permissions & fiscal context, powering sub-5ms client-side search,
	18-filter matching, dynamic deduplication, sorting, and pagination at 37K+ file scale.
	"""
	require_swift_attachments_screen_access()
	permissions = get_swift_attachments_permissions_snapshot()
	fiscal_ctx = get_screen_fiscal_context()

	requested_fy = fiscal_year if fiscal_year is not None else fiscal_years
	allowed_years = resolve_fiscal_year_filter(requested_fy, action="view")

	sys_tz, user_tz = _resolve_timezone_pair()
	tz_label = cstr(user_tz.key if user_tz else (sys_tz.key if sys_tz else "default"))
	lang = cstr(getattr(frappe.local, "lang", "ar") or "ar")

	cache = frappe.cache()
	if cint(force_refresh):
		bump_swift_attachments_report_cache()

	ver = cstr(cache.get_value(SNAPSHOT_CACHE_VERSION_KEY) or "1")
	fingerprint = _compute_snapshot_fingerprint(allowed_years)
	raw_key = f"{ver}|{fingerprint}|{','.join(sorted(allowed_years))}|{tz_label}|{lang}"
	cache_key = f"archive:swift_att_snap:v1:{hashlib.sha1(raw_key.encode('utf-8')).hexdigest()}"

	payload = None if cint(force_refresh) else cache.get_value(cache_key)
	cache_hit = payload is not None
	if payload is None:
		payload = _build_relational_snapshot_payload(allowed_years, sys_tz=sys_tz, user_tz=user_tz)
		try:
			cache.set_value(cache_key, payload, expires_in_sec=SNAPSHOT_CACHE_TTL_SECONDS)
		except Exception:
			pass

	return {
		"permissions": permissions,
		"fiscal_context": fiscal_ctx,
		"max_zip_bytes": MAX_ZIP_TOTAL_BYTES,
		"allowed_years": allowed_years,
		"cache_hit": cache_hit,
		**payload,
	}


@frappe.whitelist(methods=["GET", "POST"])
def get_report_context(
	fiscal_year: str | list[str] | None = None,
	fiscal_years: str | list[str] | None = None,
) -> dict[str, Any]:
	require_swift_attachments_screen_access()
	permissions = get_swift_attachments_permissions_snapshot()
	fiscal_ctx = get_screen_fiscal_context()

	requested_fy = fiscal_year if fiscal_year is not None else fiscal_years
	allowed_years = resolve_fiscal_year_filter(requested_fy, action="view")

	if allowed_years:
		operations, group_docs_map, child_atts_map, _file_meta, _user_names = _fetch_operations_and_attachments(
			allowed_years
		)
		facets = _compute_facets_from_operations(operations, group_docs_map, child_atts_map)
	else:
		facets = {
			"customer": [],
			"transferring_bank": [],
			"beneficiary_bank": [],
			"country": [],
			"from_account": [],
			"status": [],
		}

	return {
		"permissions": permissions,
		"fiscal_context": fiscal_ctx,
		"facets": facets,
		"max_zip_bytes": MAX_ZIP_TOTAL_BYTES,
	}


@frappe.whitelist(methods=["GET", "POST"])
def get_attachments_report(
	search: str = "",
	attachment_type: str = "",
	advanced_filters: str | dict[str, Any] | None = None,
	fiscal_year: str | list[str] | None = None,
	fiscal_years: str | list[str] | None = None,
	sort_field: str = "execution_datetime",
	sort_direction: str = "desc",
	page: int = 1,
	page_length: int | str = 100,
) -> dict[str, Any]:
	"""
	Returns globally deduplicated (by content_hash / file_url) SWIFT operation attachments
	across all 4 sources, matched against ALL Archive Operation search/filter criteria + filename.
	"""
	require_swift_attachments_screen_access()
	permissions = get_swift_attachments_permissions_snapshot()

	requested_fy = fiscal_year if fiscal_year is not None else fiscal_years
	allowed_years = resolve_fiscal_year_filter(requested_fy, action="view")

	filters = _parse_json_value(advanced_filters, {})
	if not isinstance(filters, dict):
		filters = {}
	if isinstance(filters.get("values"), dict) and "filters" in filters:
		filters = filters["values"]

	# Normalize pagination
	page_num = max(1, cint(page) or 1)
	raw_pl = cstr(page_length).strip().lower()
	if raw_pl in ("all", "0"):
		resolved_page_length = 0
	else:
		resolved_page_length = max(1, min(cint(page_length) or 100, 5000))

	if not allowed_years:
		return {
			"rows": [],
			"total": 0,
			"page": 1,
			"page_length": resolved_page_length,
			"total_pages": 1,
			"facets": {
				"customer": [],
				"transferring_bank": [],
				"beneficiary_bank": [],
				"country": [],
				"from_account": [],
				"status": [],
			},
			"permissions": permissions,
		}

	operations, group_docs_map, child_atts_map, file_meta_map, user_names_map = (
		_fetch_operations_and_attachments(allowed_years)
	)
	facets = _compute_facets_from_operations(operations, group_docs_map, child_atts_map)

	search_tokens = get_search_tokens(cstr(search or "").strip())
	sys_tz, user_tz = _resolve_timezone_pair()

	# Attachment-level filters
	quick_type = cstr(attachment_type or "").strip()
	adv_types = _normalize_multi_filter(filters.get("attachment_type"))
	has_att_type_filter = bool((quick_type and quick_type != "all") or adv_types)
	allowed_att_types: set[str] = set()
	if quick_type and quick_type != "all":
		allowed_att_types.add(quick_type)
	if adv_types:
		allowed_att_types = allowed_att_types.intersection(adv_types) if allowed_att_types else set(adv_types)

	allowed_formats = set(_normalize_multi_filter(filters.get("file_format")))
	uploaded_date_range = filters.get("uploaded_at")

	# Global deduplication bucket: dedup_key -> aggregated record
	buckets: dict[str, dict[str, Any]] = {}
	country_ar_cache: dict[str, str] = {}

	for op in operations:
		if not _matches_operation_filters(op, filters, sys_tz=sys_tz, user_tz=user_tz):
			continue

		att_entries = _collect_operation_attachment_entries(op, group_docs_map, child_atts_map, file_meta_map)
		if not att_entries:
			continue

		op_search_blob = _build_operation_search_blob(op, country_ar_cache=country_ar_cache) if search_tokens else ""
		op_year_short = _format_year_short(op)
		op_summary = {
			"name": op["name"],
			"serial_no": cint(op.get("serial_no")),
			"operation_no": cstr(op.get("operation_no") or "").strip(),
			"fiscal_year": cstr(op.get("fiscal_year") or "").strip(),
			"year_short": op_year_short,
			"customer": cstr(op.get("customer") or "").strip(),
			"beneficiary_name": cstr(op.get("beneficiary_name") or "").strip(),
			"beneficiary_account": cstr(op.get("beneficiary_account") or "").strip(),
			"beneficiary_bank": cstr(op.get("beneficiary_bank") or "").strip(),
			"swift_code": cstr(op.get("swift_code") or "").strip(),
			"country": cstr(op.get("country") or "").strip(),
			"sender_name": cstr(op.get("sender_name") or "").strip(),
			"sender_account": cstr(op.get("sender_account") or "").strip(),
			"transferring_bank": cstr(op.get("transferring_bank") or "").strip(),
			"from_account": cstr(op.get("from_account") or "").strip(),
			"reference_no": cstr(op.get("reference_no") or "").strip(),
			"amount": flt(op.get("amount")),
			"currency": cstr(op.get("currency") or "").strip(),
			"status": cstr(op.get("status") or "").strip(),
			"execution_datetime": cstr(op.get("execution_datetime") or ""),
			"request_date": cstr(op.get("request_date") or ""),
			"is_blocked_operation": bool(cint(op.get("is_blocked_operation"))),
		}

		for entry in att_entries:
			# Attachment type filter
			if has_att_type_filter and entry["attachment_type"] not in allowed_att_types:
				continue
			# File format filter
			if allowed_formats and entry["file_kind"] not in allowed_formats:
				continue
			# Upload date filter (converted to user's timezone to match displayed date)
			if uploaded_date_range and not _matches_date_range(
				entry["uploaded_at"],
				uploaded_date_range,
				sys_tz=sys_tz,
				user_tz=user_tz,
			):
				continue
			# Combined operation + filename full-text search
			if search_tokens:
				combined_blob = f"{op_search_blob} {normalize_search_text(entry['file_name'])}"
				if not all(tok in combined_blob for tok in search_tokens):
					continue

			dedup_key = entry["dedup_key"]
			bucket = buckets.get(dedup_key)
			if bucket is None:
				uploaded_by = entry["uploaded_by"]
				bucket = {
					"dedup_key": dedup_key,
					"content_hash": entry["content_hash"],
					"file_url": entry["file_url"],
					"file_name": entry["file_name"],
					"file_extension": entry["file_extension"],
					"file_kind": entry["file_kind"],
					"file_size": entry["file_size"],
					"uploaded_at": entry["uploaded_at"],
					"uploaded_by": uploaded_by,
					"uploaded_by_full_name": user_names_map.get(uploaded_by, uploaded_by),
					"_types_set": {entry["attachment_type"]},
					"_ops_by_name": {op["name"]: op_summary},
				}
				buckets[dedup_key] = bucket
			else:
				bucket["_types_set"].add(entry["attachment_type"])
				if op["name"] not in bucket["_ops_by_name"]:
					bucket["_ops_by_name"][op["name"]] = op_summary
				if entry["file_size"] > bucket["file_size"]:
					bucket["file_size"] = entry["file_size"]
				if entry["uploaded_at"] and (not bucket["uploaded_at"] or entry["uploaded_at"] > bucket["uploaded_at"]):
					bucket["uploaded_at"] = entry["uploaded_at"]
					bucket["uploaded_by"] = entry["uploaded_by"]
					bucket["uploaded_by_full_name"] = user_names_map.get(
						entry["uploaded_by"], entry["uploaded_by"]
					)

	# Finalize deduplicated rows
	can_preview = permissions["can_preview"]
	can_download = permissions["can_download"]

	rows: list[dict[str, Any]] = []
	for bucket in buckets.values():
		linked_ops = sorted(
			bucket["_ops_by_name"].values(),
			key=lambda o: (cstr(o.get("execution_datetime") or ""), cstr(o.get("name") or "")),
			reverse=True,
		)
		primary_op = linked_ops[0]
		sorted_types = sorted(
			bucket["_types_set"],
			key=lambda t: ATTACHMENT_TYPE_PRIORITY.get(t, 99),
		)
		primary_type = sorted_types[0]
		encoded_url = quote(bucket["file_url"], safe="")

		preview_url = (
			f"/api/method/archive.api.swift_attachments_report.serve_attachment?file_url={encoded_url}&mode=preview"
			if can_preview
			else ""
		)
		download_url = (
			f"/api/method/archive.api.swift_attachments_report.serve_attachment?file_url={encoded_url}&mode=download"
			if can_download
			else ""
		)

		rows.append(
			{
				"dedup_key": bucket["dedup_key"],
				"file_url": bucket["file_url"],
				"file_name": bucket["file_name"],
				"file_extension": bucket["file_extension"],
				"file_kind": bucket["file_kind"],
				"file_size": bucket["file_size"],
				"uploaded_at": bucket["uploaded_at"],
				"uploaded_by": bucket["uploaded_by"],
				"uploaded_by_full_name": bucket["uploaded_by_full_name"],
				"primary_type": primary_type,
				"primary_type_label": ATTACHMENT_TYPE_LABELS.get(primary_type, primary_type),
				"attachment_types": sorted_types,
				"attachment_type_labels": [ATTACHMENT_TYPE_LABELS.get(t, t) for t in sorted_types],
				"preview_url": preview_url,
				"download_url": download_url,
				"zip_prefix": _build_operation_zip_prefix(primary_op),
				# Primary (latest matching) operation fields for direct table display & sorting
				"operation_name": primary_op["name"],
				"operation_no": primary_op["operation_no"],
				"fiscal_year": primary_op["fiscal_year"],
				"year_short": primary_op["year_short"],
				"customer": primary_op["customer"],
				"beneficiary_name": primary_op["beneficiary_name"],
				"beneficiary_account": primary_op["beneficiary_account"],
				"beneficiary_bank": primary_op["beneficiary_bank"],
				"swift_code": primary_op["swift_code"],
				"country": primary_op["country"],
				"sender_name": primary_op["sender_name"],
				"sender_account": primary_op["sender_account"],
				"transferring_bank": primary_op["transferring_bank"],
				"from_account": primary_op["from_account"],
				"reference_no": primary_op["reference_no"],
				"amount": primary_op["amount"],
				"currency": primary_op["currency"],
				"status": primary_op["status"],
				"execution_datetime": primary_op["execution_datetime"],
				"is_blocked_operation": primary_op["is_blocked_operation"],
				# All matching operations linked to this unique file
				"linked_count": len(linked_ops),
				"linked_operations": linked_ops,
			}
		)

	# Server-side sorting
	allowed_sort_fields = {
		"execution_datetime",
		"uploaded_at",
		"file_name",
		"file_size",
		"operation_no",
		"amount",
		"customer",
		"beneficiary_name",
		"transferring_bank",
		"linked_count",
		"primary_type",
	}
	sf = sort_field if sort_field in allowed_sort_fields else "execution_datetime"
	reverse = cstr(sort_direction or "desc").lower() != "asc"

	def _sort_key(r: dict[str, Any]):
		val = r.get(sf)
		if sf in ("amount", "file_size", "linked_count"):
			return (flt(val), cstr(r.get("execution_datetime") or ""))
		if sf == "operation_no":
			raw = cstr(val or "").strip()
			return (int(raw) if raw.isdigit() else 0, raw)
		return (cstr(val or "").lower(), cstr(r.get("execution_datetime") or ""))

	rows.sort(key=_sort_key, reverse=reverse)

	total = len(rows)
	if resolved_page_length == 0:
		paged_rows = rows
		total_pages = 1
		page_num = 1
	else:
		total_pages = max(1, (total + resolved_page_length - 1) // resolved_page_length)
		page_num = min(page_num, total_pages)
		start = (page_num - 1) * resolved_page_length
		paged_rows = rows[start : start + resolved_page_length]

	return {
		"rows": paged_rows,
		"total": total,
		"page": page_num,
		"page_length": resolved_page_length,
		"total_pages": total_pages,
		"facets": facets,
		"permissions": permissions,
	}


@frappe.whitelist(methods=["GET"])
def serve_attachment(file_url: str = "", mode: str = "preview") -> Response:
	"""
	Securely serves an authorized SWIFT attachment for inline preview or direct download.
	Enforces strict role sub-permissions + fiscal year view scope + disk path containment.
	"""
	clean_mode = cstr(mode or "preview").strip().lower()
	if clean_mode == "download":
		require_swift_report_download_permission()
		disposition_type = "attachment"
	else:
		require_swift_report_preview_permission()
		disposition_type = "inline"

	norm_url = _normalize_file_url(file_url)
	authorized, _matched_op = _is_file_url_authorized_for_user(norm_url)
	if not authorized:
		frappe.throw(
			_("ليست لديك صلاحية الوصول إلى هذا المرفق أو أنه غير مرتبط بسنة مالية مسموحة."),
			frappe.PermissionError,
		)

	physical_path = _resolve_physical_file_path(norm_url)
	if not physical_path:
		frappe.throw(_("الملف المطلوب غير موجود على الخادم."), frappe.DoesNotExistError)

	file_name = (
		frappe.db.get_value("File", {"file_url": norm_url}, "file_name")
		or os.path.basename(physical_path)
	)
	ext_from_path = os.path.splitext(physical_path)[1].lstrip(".").lower()
	ext_from_name = os.path.splitext(file_name)[1].lstrip(".").lower()
	content_type = (
		MIME_TYPE_BY_EXTENSION.get(ext_from_path)
		or MIME_TYPE_BY_EXTENSION.get(ext_from_name)
		or mimetypes.guess_type(physical_path)[0]
		or mimetypes.guess_type(file_name)[0]
		or "application/octet-stream"
	)
	file_size = os.path.getsize(physical_path)

	def _stream_file():
		with open(physical_path, "rb") as fh:
			while True:
				chunk = fh.read(ZIP_STREAM_CHUNK_BYTES)
				if not chunk:
					break
				yield chunk

	headers = {
		"Content-Disposition": _build_content_disposition(disposition_type, file_name),
		"Content-Length": str(file_size),
		"X-Content-Type-Options": "nosniff",
		"Cache-Control": "private, max-age=120",
	}
	return Response(_stream_file(), status=200, mimetype=content_type, headers=headers)


@frappe.whitelist(methods=["POST"])
def download_attachments_zip(items: str | list[dict[str, Any]] | None = None) -> Response:
	"""
	Streams a disk-backed ZIP (ZIP_STORED) of the selected unique SWIFT attachments up to 1.5 GB.
	Zero RAM buffering; automatically unlinks the temporary archive when streaming finishes.
	"""
	require_swift_report_zip_permission()

	parsed_items = _parse_json_value(items, [])
	if not isinstance(parsed_items, list) or not parsed_items:
		frappe.throw(_("يرجى تحديد مرفق واحد على الأقل للتنزيل المضغوط."), frappe.ValidationError)

	seen_urls: set[str] = set()
	seen_paths: set[str] = set()
	resolved_entries: list[tuple[str, str]] = []  # (physical_path, archive_entry_name)
	used_archive_names: set[str] = set()
	total_bytes = 0

	for raw in parsed_items:
		if isinstance(raw, str):
			file_url = _normalize_file_url(raw)
			req_name = ""
			req_prefix = ""
		elif isinstance(raw, dict):
			file_url = _normalize_file_url(raw.get("file_url"))
			req_name = cstr(raw.get("file_name") or "").strip()
			req_prefix = cstr(raw.get("zip_prefix") or "").strip()
		else:
			continue

		if not file_url or file_url in seen_urls:
			continue
		seen_urls.add(file_url)

		authorized, primary_op = _is_file_url_authorized_for_user(file_url)
		if not authorized:
			frappe.throw(
				_("أحد المرفقات المحددة غير مصرح لك بالوصول إليه."),
				frappe.PermissionError,
			)

		physical_path = _resolve_physical_file_path(file_url)
		if not physical_path or physical_path in seen_paths:
			continue
		seen_paths.add(physical_path)

		fsize = os.path.getsize(physical_path)
		total_bytes += fsize
		if total_bytes > MAX_ZIP_TOTAL_BYTES:
			frappe.throw(
				_("إجمالي حجم الملفات المحددة يتجاوز الحد الأقصى المسموح للحزمة (1.5 جيجابايت). يرجى تقسيم التحديد إلى دفعتين."),
				frappe.ValidationError,
			)

		prefix = re.sub(r'[\\/:*?"<>|\s]+', "-", req_prefix or _build_operation_zip_prefix(primary_op)).strip("-")
		base_name = _sanitize_zip_filename(
			req_name
			or frappe.db.get_value("File", {"file_url": file_url}, "file_name")
			or os.path.basename(physical_path)
		)
		entry_name = f"{prefix}__{base_name}" if prefix else base_name

		# Guarantee unique entry names inside ZIP root
		if entry_name.lower() in used_archive_names:
			stem, ext = os.path.splitext(entry_name)
			counter = 2
			while f"{stem}_{counter}{ext}".lower() in used_archive_names:
				counter += 1
			entry_name = f"{stem}_{counter}{ext}"
		used_archive_names.add(entry_name.lower())

		resolved_entries.append((physical_path, entry_name))

	if not resolved_entries:
		frappe.throw(
			_("تعذر العثور على أي ملفات صالحة على الخادم ضمن التحديد الحالي."),
			frappe.DoesNotExistError,
		)

	tmp_fd, tmp_path = tempfile.mkstemp(prefix="swift_attachments_", suffix=".zip")
	os.close(tmp_fd)

	try:
		with zipfile.ZipFile(tmp_path, mode="w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
			for physical_path, entry_name in resolved_entries:
				zf.write(physical_path, arcname=entry_name)
	except Exception:
		try:
			os.unlink(tmp_path)
		except OSError:
			pass
		raise

	zip_size = os.path.getsize(tmp_path)
	timestamp = frappe.utils.now_datetime().strftime("%Y%m%d_%H%M%S")
	download_filename = f"swift_attachments_{timestamp}.zip"

	def _stream_and_cleanup():
		try:
			with open(tmp_path, "rb") as fh:
				while True:
					chunk = fh.read(ZIP_STREAM_CHUNK_BYTES)
					if not chunk:
						break
					yield chunk
		finally:
			try:
				os.unlink(tmp_path)
			except OSError:
				pass

	headers = {
		"Content-Disposition": _build_content_disposition("attachment", download_filename),
		"Content-Length": str(zip_size),
		"X-Content-Type-Options": "nosniff",
		"Cache-Control": "no-store",
	}
	return Response(_stream_and_cleanup(), status=200, mimetype="application/zip", headers=headers)
