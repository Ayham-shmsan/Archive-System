from decimal import Decimal, InvalidOperation
import math
import os

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr, flt, now_datetime


_ARABIC_INDIC_TRANS = str.maketrans("٠١٢٣٤٥٦٧٨٩٫", "0123456789.")

GENERAL_SETTINGS_SCALAR_FIELDS = (
	"default_fiscal_year",
	"saudi_customer_rate_min",
	"saudi_customer_rate_max",
	"bank_transfer_rate_min",
	"bank_transfer_rate_max",
	"enable_sender_account_validation",
)

_BACKUP_FIELD_DEFAULTS = {
	"backup_enabled": 0,
	"backup_destination_path": "",
	"backup_require_mount": 0,
	"backup_mode": "حزمة كاملة سريعة (.tar ذكي)",
	"backup_interval_value": 6,
	"backup_interval_unit": "ساعات",
	"backup_enable_retention": 1,
	"backup_max_keep": 10,
	"backup_pigz_threads": 4,
	"backup_min_free_space_gb": 2.0,
}

_RATE_LIMIT_FIELDS = {
	"saudi_customer_rate_min",
	"saudi_customer_rate_max",
	"bank_transfer_rate_min",
	"bank_transfer_rate_max",
}

_CHECK_OR_INT_FIELDS = {
	"enable_sender_account_validation",
	"backup_enabled",
	"backup_require_mount",
	"backup_enable_retention",
	"backup_interval_value",
	"backup_max_keep",
	"backup_pigz_threads",
}


def _normalize_setting_compare(fieldname: str, value):
	if fieldname in _CHECK_OR_INT_FIELDS:
		return cint(value or 0)
	if fieldname in _RATE_LIMIT_FIELDS:
		if value is None or cstr(value).strip() == "":
			return None
		num = flt(value, 6)
		return None if num == 0 else num
	if fieldname == "backup_min_free_space_gb":
		if value is None or cstr(value).strip() == "":
			return 0.0
		return flt(value, 2)
	return cstr(value or "").strip()


def _parse_rate_decimal(raw_value) -> Decimal | None:
	if raw_value is None:
		return None
	if isinstance(raw_value, bool):
		raise ValueError("invalid")
	text = cstr(raw_value).strip().translate(_ARABIC_INDIC_TRANS)
	if not text:
		return None
	try:
		dec = Decimal(text)
	except (InvalidOperation, ValueError) as exc:
		raise ValueError("invalid") from exc
	if not dec.is_finite():
		raise ValueError("invalid")
	return dec


def _format_bound_number(dec: Decimal) -> str:
	normalized = dec.normalize()
	text = format(normalized, "f")
	if "." in text:
		text = text.rstrip("0").rstrip(".")
	return text or "0"


def get_saudi_customer_rate_bounds() -> dict:
	"""
	Read Saudi customer-rate bounds from Archive Settings.
	Returns enabled=False when bounds are not configured yet (None / empty / 0).
	"""
	try:
		raw_min = frappe.db.get_single_value("Archive Settings", "saudi_customer_rate_min")
		raw_max = frappe.db.get_single_value("Archive Settings", "saudi_customer_rate_max")
	except Exception:
		return {
			"enabled": False,
			"min": None,
			"max": None,
			"min_formatted": "",
			"max_formatted": "",
		}

	try:
		min_dec = _parse_rate_decimal(raw_min)
		max_dec = _parse_rate_decimal(raw_max)
	except ValueError:
		return {
			"enabled": False,
			"min": None,
			"max": None,
			"min_formatted": "",
			"max_formatted": "",
		}

	if min_dec is None or max_dec is None or min_dec <= 0 or max_dec <= 0 or min_dec > max_dec:
		return {
			"enabled": False,
			"min": None,
			"max": None,
			"min_formatted": "",
			"max_formatted": "",
		}

	min_f = float(min_dec)
	max_f = float(max_dec)
	if not (math.isfinite(min_f) and math.isfinite(max_f)):
		return {
			"enabled": False,
			"min": None,
			"max": None,
			"min_formatted": "",
			"max_formatted": "",
		}

	return {
		"enabled": True,
		"min": min_f,
		"max": max_f,
		"min_decimal": min_dec,
		"max_decimal": max_dec,
		"min_formatted": _format_bound_number(min_dec),
		"max_formatted": _format_bound_number(max_dec),
	}


def get_saudi_customer_rate_bounds_payload() -> dict:
	"""JSON-serializable bounds payload for UI dialogs."""
	bounds = get_saudi_customer_rate_bounds()
	return {
		"enabled": bool(bounds.get("enabled")),
		"min": bounds.get("min"),
		"max": bounds.get("max"),
		"min_formatted": bounds.get("min_formatted") or "",
		"max_formatted": bounds.get("max_formatted") or "",
	}


def validate_saudi_customer_rate_value(
	rate_currency: str | None,
	customer_rate,
	*,
	bounds: dict | None = None,
) -> None:
	"""
	Enforce Saudi customer-rate bounds ONLY when rate_currency == 'سعودي'
	and bounds are configured in Archive Settings.
	Never applies to Dollar commission.
	"""
	if cstr(rate_currency).strip() != "سعودي":
		return

	resolved_bounds = bounds if bounds is not None else get_saudi_customer_rate_bounds()
	if not resolved_bounds.get("enabled"):
		return

	try:
		rate_dec = _parse_rate_decimal(customer_rate)
	except ValueError:
		frappe.throw(
			_("قيمة سعر العميل غير صالحة. يجب إدخال رقم بين {0} إلى {1}.").format(
				resolved_bounds["min_formatted"],
				resolved_bounds["max_formatted"],
			),
			frappe.ValidationError,
		)

	if rate_dec is None:
		return

	min_dec = resolved_bounds.get("min_decimal")
	if min_dec is None:
		min_dec = Decimal(str(resolved_bounds["min"]))
	max_dec = resolved_bounds.get("max_decimal")
	if max_dec is None:
		max_dec = Decimal(str(resolved_bounds["max"]))

	if rate_dec < min_dec or rate_dec > max_dec:
		frappe.throw(
			_("سعر العميل خارج النطاق المسموح. يجب أن يكون بين {0} إلى {1}.").format(
				resolved_bounds["min_formatted"],
				resolved_bounds["max_formatted"],
			),
			frappe.ValidationError,
		)


def get_bank_transfer_rate_bounds() -> dict:
	"""
	Read bank_transfer_rate bounds from Archive Settings.
	Returns enabled=False when bounds are not configured yet (None / empty / 0).
	"""
	try:
		raw_min = frappe.db.get_single_value("Archive Settings", "bank_transfer_rate_min")
		raw_max = frappe.db.get_single_value("Archive Settings", "bank_transfer_rate_max")
	except Exception:
		return {
			"enabled": False,
			"min": None,
			"max": None,
			"min_formatted": "",
			"max_formatted": "",
		}

	try:
		min_dec = _parse_rate_decimal(raw_min)
		max_dec = _parse_rate_decimal(raw_max)
	except ValueError:
		return {
			"enabled": False,
			"min": None,
			"max": None,
			"min_formatted": "",
			"max_formatted": "",
		}

	if min_dec is None or max_dec is None or min_dec <= 0 or max_dec <= 0 or min_dec > max_dec:
		return {
			"enabled": False,
			"min": None,
			"max": None,
			"min_formatted": "",
			"max_formatted": "",
		}

	min_f = float(min_dec)
	max_f = float(max_dec)
	if not (math.isfinite(min_f) and math.isfinite(max_f)):
		return {
			"enabled": False,
			"min": None,
			"max": None,
			"min_formatted": "",
			"max_formatted": "",
		}

	return {
		"enabled": True,
		"min": min_f,
		"max": max_f,
		"min_decimal": min_dec,
		"max_decimal": max_dec,
		"min_formatted": _format_bound_number(min_dec),
		"max_formatted": _format_bound_number(max_dec),
	}


def get_bank_transfer_rate_bounds_payload() -> dict:
	"""JSON-serializable bank_transfer_rate bounds payload for UI dialogs."""
	bounds = get_bank_transfer_rate_bounds()
	return {
		"enabled": bool(bounds.get("enabled")),
		"min": bounds.get("min"),
		"max": bounds.get("max"),
		"min_formatted": bounds.get("min_formatted") or "",
		"max_formatted": bounds.get("max_formatted") or "",
	}


def is_sender_account_validation_enabled() -> bool:
	"""
	Read the sender_account 14-digit validation switch directly from Archive Settings.
	Defaults to False (disabled) when unset or unavailable.
	"""
	try:
		return bool(
			cint(
				frappe.db.get_single_value(
					"Archive Settings",
					"enable_sender_account_validation",
					cache=False,
				)
			)
		)
	except Exception:
		return False


def get_sender_account_validation_payload() -> dict:
	"""JSON-serializable sender_account validation toggle payload for UI dialogs."""
	return {
		"enabled": is_sender_account_validation_enabled(),
	}


def validate_bank_transfer_rate_value(
	bank_transfer_rate,
	*,
	bounds: dict | None = None,
) -> None:
	"""
	Enforce bank_transfer_rate bounds when configured in Archive Settings.
	Independent of customer_rate and commission currency rules.
	Uses Decimal comparison for financial precision.
	"""
	resolved_bounds = bounds if bounds is not None else get_bank_transfer_rate_bounds()
	if not resolved_bounds.get("enabled"):
		return

	if bank_transfer_rate is None or cstr(bank_transfer_rate).strip() == "":
		return

	try:
		rate_dec = _parse_rate_decimal(bank_transfer_rate)
	except ValueError:
		frappe.throw(
			_("سعر البنك المحول خارج النطاق المسموح به، يجب أن يكون بين {0} إلى {1}.").format(
				resolved_bounds["min_formatted"],
				resolved_bounds["max_formatted"],
			),
			frappe.ValidationError,
		)

	if rate_dec is None:
		return

	min_dec = resolved_bounds.get("min_decimal")
	if min_dec is None:
		min_dec = Decimal(str(resolved_bounds["min"]))
	max_dec = resolved_bounds.get("max_decimal")
	if max_dec is None:
		max_dec = Decimal(str(resolved_bounds["max"]))

	if rate_dec < min_dec or rate_dec > max_dec:
		frappe.throw(
			_("سعر البنك المحول خارج النطاق المسموح به، يجب أن يكون بين {0} إلى {1}.").format(
				resolved_bounds["min_formatted"],
				resolved_bounds["max_formatted"],
			),
			frappe.ValidationError,
		)


class ArchiveSettings(Document):

	def validate(self):
		in_system_flow = bool(
			getattr(frappe.flags, "in_migrate", False)
			or getattr(frappe.flags, "in_patch", False)
			or getattr(self.flags, "ignore_permissions", False)
		)

		if in_system_flow:
			self.validate_default_fiscal_year()
			self.validate_saudi_customer_rate_limits()
			self.validate_bank_transfer_rate_limits()
			self.validate_final_swift_banks()
			return

		can_general, can_backup, general_changed, backup_changed = self._enforce_section_permissions()

		if can_general or general_changed:
			self.validate_default_fiscal_year()
			self.validate_saudi_customer_rate_limits()
			self.validate_bank_transfer_rate_limits()
			self.validate_final_swift_banks()

		if backup_changed:
			self.validate_backup_settings(backup_changed)

	def _enforce_section_permissions(self) -> tuple[bool, bool, bool, list[str]]:
		from archive.services.backup_manager import (
			BACKUP_SETTINGS_FIELDS,
			BACKUP_SYSTEM_READONLY_FIELDS,
			ROLE_BACKUP_MANAGEMENT,
			has_backup_management_role,
			is_archive_settings_general_admin,
		)

		can_general = is_archive_settings_general_admin()
		can_backup = has_backup_management_role()

		if not can_general and not can_backup:
			frappe.throw(
				_("ليست لديك صلاحية تعديل إعدادات الأرشيف."),
				frappe.PermissionError,
			)

		# Restore system-managed readonly backup status fields from DB so they cannot be forged via API
		for ro_field in BACKUP_SYSTEM_READONLY_FIELDS:
			existing_ro = frappe.db.get_single_value("Archive Settings", ro_field, cache=False)
			self.set(ro_field, existing_ro)

		# Detect changes in Backup section
		backup_changed: list[str] = []
		existing_singles = {
			row[0]: row[1]
			for row in frappe.db.sql(
				"""
				SELECT field, value
				FROM `tabSingles`
				WHERE doctype = 'Archive Settings'
				"""
			)
		}
		for fn in BACKUP_SETTINGS_FIELDS:
			new_val = _normalize_setting_compare(fn, self.get(fn))
			if fn not in existing_singles:
				empty_val = _normalize_setting_compare(fn, None)
				default_val = _normalize_setting_compare(fn, _BACKUP_FIELD_DEFAULTS.get(fn))
				if new_val not in (empty_val, default_val):
					backup_changed.append(fn)
			else:
				db_val = _normalize_setting_compare(fn, existing_singles.get(fn))
				if db_val != new_val:
					backup_changed.append(fn)

		if backup_changed and not can_backup:
			frappe.throw(
				_("ليست لديك صلاحية تعديل إعدادات النسخ الاحتياطي ({0}).").format(ROLE_BACKUP_MANAGEMENT),
				frappe.PermissionError,
			)

		# Detect changes in General settings section
		general_changed = False
		for fn in GENERAL_SETTINGS_SCALAR_FIELDS:
			db_val = _normalize_setting_compare(fn, existing_singles.get(fn))
			new_val = _normalize_setting_compare(fn, self.get(fn))
			if db_val != new_val:
				general_changed = True
				break

		if not general_changed:
			db_banks = [
				cstr(r[0]).strip()
				for r in frappe.db.sql(
					"""
					SELECT bank
					FROM `tabArchive Final Swift Bank`
					WHERE parent = 'Archive Settings'
					  AND parenttype = 'Archive Settings'
					  AND parentfield = 'final_swift_banks'
					ORDER BY idx ASC
					"""
				)
				if cstr(r[0]).strip()
			]
			new_banks = [
				cstr(row.bank).strip()
				for row in (self.final_swift_banks or [])
				if cstr(row.bank).strip()
			]
			if db_banks != new_banks:
				general_changed = True

		if general_changed and not can_general:
			frappe.throw(
				_("ليست لديك صلاحية تعديل الإعدادات العامة لنظام الأرشفة؛ يُسمح لك بتعديل قسم النسخ الاحتياطي فقط."),
				frappe.PermissionError,
			)

		return can_general, can_backup, general_changed, backup_changed

	def validate_backup_settings(self, changed_fields: list[str]) -> None:
		from archive.services.backup_manager import (
			MODE_FULL_TAR_GZ_LABEL,
			MODE_FULL_TAR_LABEL,
			MODE_INCREMENTAL_LABEL,
			UNIT_DAYS_LABEL,
			UNIT_HOURS_LABEL,
			UNIT_MINUTES_LABEL,
			compute_next_run_at,
			estimate_site_backup_footprint,
			get_storage_adapter,
			normalize_backup_mode,
		)

		valid_modes = {MODE_FULL_TAR_LABEL, MODE_FULL_TAR_GZ_LABEL, MODE_INCREMENTAL_LABEL}
		mode_val = cstr(self.backup_mode or MODE_FULL_TAR_LABEL).strip()
		if mode_val not in valid_modes:
			frappe.throw(_("وضع النسخ الاحتياطي المختار غير صالح."), frappe.ValidationError)
		self.backup_mode = mode_val

		unit_val = cstr(self.backup_interval_unit or UNIT_HOURS_LABEL).strip()
		if unit_val not in (UNIT_MINUTES_LABEL, UNIT_HOURS_LABEL, UNIT_DAYS_LABEL):
			frappe.throw(_("وحدة التكرار يجب أن تكون «دقائق» أو «ساعات» أو «أيام»."), frappe.ValidationError)
		self.backup_interval_unit = unit_val

		interval_val = cint(self.backup_interval_value or 0)
		if interval_val < 1:
			frappe.throw(_("قيمة التكرار يجب أن تكون رقماً صحيحاً أكبر من أو يساوي 1."), frappe.ValidationError)
		self.backup_interval_value = interval_val

		enable_retention = cint(self.backup_enable_retention)
		if enable_retention:
			max_keep = cint(self.backup_max_keep or 0)
			if max_keep < 1:
				frappe.throw(
					_("عدد النسخ المحتفظ بها يجب أن يكون 1 على الأقل عند تفعيل الحذف التلقائي."),
					frappe.ValidationError,
				)
			self.backup_max_keep = max_keep

		# Auto-managed optimal engine defaults (not exposed as manual UI knobs)
		cpu_count = os.cpu_count() or 4
		default_threads = min(4, max(1, cpu_count // 2))
		threads = cint(self.backup_pigz_threads or default_threads)
		self.backup_pigz_threads = min(max(cpu_count, 32), max(1, threads))

		min_free = flt(self.backup_min_free_space_gb or 2.0, 2)
		self.backup_min_free_space_gb = max(0.5, min_free)

		dest_path = cstr(self.backup_destination_path or "").strip()
		self.backup_destination_path = dest_path
		enabled = cint(self.backup_enabled)

		if enabled:
			if not dest_path:
				frappe.throw(
					_("يرجى تحديد «مسار حفظ النسخ الاحتياطي» قبل تفعيل النسخ التلقائي."),
					frappe.ValidationError,
				)
			mode_key = normalize_backup_mode(mode_val)
			is_single_file = mode_key in ("full_tar", "full_tar_gz")
			footprint = estimate_site_backup_footprint()
			estimated_needed = (
				footprint["estimated_bundle_bytes"] if is_single_file else footprint["estimated_db_gz_bytes"]
			)
			get_storage_adapter().validate_destination(
				dest_path,
				require_mount=bool(cint(self.backup_require_mount)),
				create_if_missing=False,
				estimated_bytes=estimated_needed,
				min_free_space_gb=min_free,
				single_file_mode=is_single_file,
			)
			schedule_changed = any(
				f in changed_fields
				for f in ("backup_enabled", "backup_interval_value", "backup_interval_unit")
			)
			if schedule_changed or not self.backup_next_run_at:
				self.backup_next_run_at = compute_next_run_at(now_datetime(), interval_val, unit_val)
		else:
			if dest_path and "backup_destination_path" in changed_fields:
				from archive.services.backup_manager import _get_forbidden_backup_roots, _is_subpath

				if "\x00" in dest_path or "\n" in dest_path or "\r" in dest_path:
					frappe.throw(_("مسار النسخ الاحتياطي يحتوي على محارف غير صالحة."), frappe.ValidationError)
				if not os.path.isabs(dest_path) or os.path.normpath(os.path.abspath(dest_path)) == "/":
					frappe.throw(
						_("مسار النسخ الاحتياطي يجب أن يكون مساراً مطلقاً صحيحاً يبدأ بـ / وليس الجذر."),
						frappe.ValidationError,
					)
				abs_dest = os.path.normpath(os.path.abspath(dest_path))
				real_dest = os.path.realpath(abs_dest)
				for forbidden_root, label in _get_forbidden_backup_roots():
					if _is_subpath(real_dest, forbidden_root) or _is_subpath(abs_dest, forbidden_root):
						frappe.throw(
							_("لا يُسمح بحفظ النسخ الاحتياطي داخل {0} لأسباب أمنية وتقنية.").format(label),
							frappe.ValidationError,
						)
			self.backup_next_run_at = None

	def validate_bank_transfer_rate_limits(self):
		try:
			min_dec = _parse_rate_decimal(self.bank_transfer_rate_min)
		except ValueError:
			frappe.throw(
				_("الحد الأدنى لسعر البنك المحول يجب أن يكون قيمة رقمية صالحة."),
				frappe.ValidationError,
			)

		try:
			max_dec = _parse_rate_decimal(self.bank_transfer_rate_max)
		except ValueError:
			frappe.throw(
				_("الحد الأعلى لسعر البنك المحول يجب أن يكون قيمة رقمية صالحة."),
				frappe.ValidationError,
			)

		if (min_dec is not None and min_dec < 0) or (max_dec is not None and max_dec < 0):
			frappe.throw(
				_("حدود سعر البنك المحول لا يمكن أن تكون قيماً سالبة."),
				frappe.ValidationError,
			)

		min_unset = min_dec is None or min_dec == 0
		max_unset = max_dec is None or max_dec == 0

		if min_unset and max_unset:
			self.bank_transfer_rate_min = None
			self.bank_transfer_rate_max = None
			return

		if min_unset or max_unset:
			frappe.throw(
				_("يجب تحديد كل من الحد الأدنى والحد الأعلى لسعر البنك المحول معاً بقيم أكبر من صفر."),
				frappe.ValidationError,
			)

		if min_dec > max_dec:
			frappe.throw(
				_("الحد الأدنى لسعر البنك المحول لا يمكن أن يتجاوز الحد الأعلى."),
				frappe.ValidationError,
			)

		self.bank_transfer_rate_min = float(min_dec)
		self.bank_transfer_rate_max = float(max_dec)

	def validate_saudi_customer_rate_limits(self):
		try:
			min_dec = _parse_rate_decimal(self.saudi_customer_rate_min)
		except ValueError:
			frappe.throw(
				_("الحد الأدنى لسعر العميل يجب أن يكون قيمة رقمية صالحة."),
				frappe.ValidationError,
			)

		try:
			max_dec = _parse_rate_decimal(self.saudi_customer_rate_max)
		except ValueError:
			frappe.throw(
				_("الحد الأعلى لسعر العميل يجب أن يكون قيمة رقمية صالحة."),
				frappe.ValidationError,
			)

		if (min_dec is not None and min_dec < 0) or (max_dec is not None and max_dec < 0):
			frappe.throw(
				_("حدود سعر العميل لا يمكن أن تكون قيماً سالبة."),
				frappe.ValidationError,
			)

		min_unset = min_dec is None or min_dec == 0
		max_unset = max_dec is None or max_dec == 0

		if min_unset and max_unset:
			self.saudi_customer_rate_min = None
			self.saudi_customer_rate_max = None
			return

		if min_unset or max_unset:
			frappe.throw(
				_("يجب تحديد كل من الحد الأدنى والحد الأعلى لسعر العميل معاً بقيم أكبر من صفر."),
				frappe.ValidationError,
			)

		if min_dec > max_dec:
			frappe.throw(
				_("الحد الأدنى لسعر العميل لا يمكن أن يتجاوز الحد الأعلى."),
				frappe.ValidationError,
			)

		self.saudi_customer_rate_min = float(min_dec)
		self.saudi_customer_rate_max = float(max_dec)

	def validate_default_fiscal_year(self):
		year_name = cstr(self.default_fiscal_year).strip()
		if not year_name:
			return

		if not frappe.db.exists("Archive Fiscal Year", year_name):
			frappe.throw(
				_("السنة المالية الافتراضية ({0}) غير موجودة.").format(frappe.bold(year_name)),
				frappe.ValidationError,
			)

		is_closed = cint(frappe.db.get_value("Archive Fiscal Year", year_name, "is_closed"))
		if is_closed:
			frappe.throw(
				_("لا يمكن اختيار سنة مالية مغلقة ({0}) لتكون السنة الافتراضية.").format(
					frappe.bold(year_name)
				),
				frappe.ValidationError,
			)

		old_default = cstr(
			frappe.db.get_single_value("Archive Settings", "default_fiscal_year")
		).strip()
		self._old_default_fiscal_year = old_default

	def on_update(self):
		old_default = getattr(self, "_old_default_fiscal_year", None)
		new_default = cstr(self.default_fiscal_year).strip()
		if old_default is not None and old_default != new_default and new_default:
			try:
				self.add_comment(
					"Info",
					text=_("تم تغيير السنة المالية الافتراضية من ({0}) إلى ({1}) بواسطة {2}.").format(
						old_default or "غير محدد", new_default, frappe.session.user
					),
				)
			except Exception:
				pass

	def validate_final_swift_banks(self):
		seen = set()

		for row in (
			self.final_swift_banks or []
		):
			if not row.bank:
				continue

			if row.bank in seen:
				frappe.throw(
					_(
						"البنك {0} مكرر في قائمة بنوك السويفت النهائي."
					).format(
						frappe.bold(
							row.bank
						)
					)
				)

			seen.add(
				row.bank
			)
