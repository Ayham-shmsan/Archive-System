from decimal import Decimal, InvalidOperation
import math

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr


_ARABIC_INDIC_TRANS = str.maketrans("٠١٢٣٤٥٦٧٨٩٫", "0123456789.")


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
		self.validate_default_fiscal_year()
		self.validate_saudi_customer_rate_limits()
		self.validate_bank_transfer_rate_limits()
		self.validate_final_swift_banks()

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
