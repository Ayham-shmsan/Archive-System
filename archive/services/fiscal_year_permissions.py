from __future__ import annotations

import json
import re
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, getdate, now_datetime


FISCAL_YEAR_DOCTYPE = "Archive Fiscal Year"
USER_FISCAL_PERM_DOCTYPE = "Archive User Fiscal Permission"
INITIAL_FISCAL_YEAR = "2026"

SEQUENCED_DOCTYPES = {
	"Archive Operation": "OP",
	"Archive Pending Operation": "PEND",
	"Archive Document Authenticity Check": "AUTH",
}

FISCAL_CONTROLLED_DOCTYPES = (
	"Archive Operation",
	"Archive Pending Operation",
	"Archive Card Deposit",
	"Archive Document Authenticity Check",
)

ACTION_TO_FIELD = {
	"view": "can_view",
	"read": "can_view",
	"select": "can_view",
	"report": "can_view",
	"print": "can_view",
	"add": "can_add",
	"create": "can_add",
	"edit": "can_edit",
	"write": "can_edit",
	"delete": "can_delete",
	"export": "can_export",
}

ACTION_LABELS = {
	"can_view": "الاستعراض",
	"can_add": "الإضافة",
	"can_edit": "التعديل",
	"can_delete": "الحذف",
	"can_export": "التصدير",
}

MUTATING_FIELDS = {"can_add", "can_edit", "can_delete"}


def is_fiscal_admin(user: str | None = None) -> bool:
	resolved = cstr(user or frappe.session.user or "Guest")
	if not resolved or resolved == "Guest":
		return False
	if resolved == "Administrator":
		return True
	return "System Manager" in frappe.get_roles(resolved)


def require_fiscal_admin(user: str | None = None) -> None:
	if not is_fiscal_admin(user=user):
		frappe.throw(
			_("لا تملك الصلاحية الإدارية لإدارة السنوات المالية أو صلاحياتها."),
			frappe.PermissionError,
		)


def ensure_fiscal_year_2026() -> str:
	"""
	ينشئ سنة 2026 كمفتوحة إذا لم تكن موجودة، ويضبطها كسنة افتراضية إذا كانت الإعدادات غير مهيأة.
	آمن وقابل لإعادة التشغيل دون الكتابة فوق إعدادات موجودة.
	"""
	if not frappe.db.table_exists(FISCAL_YEAR_DOCTYPE):
		return INITIAL_FISCAL_YEAR

	prev_flag = getattr(frappe.flags, "in_patch", False)
	try:
		frappe.flags.in_patch = True
		if not frappe.db.exists(FISCAL_YEAR_DOCTYPE, INITIAL_FISCAL_YEAR):
			doc = frappe.get_doc(
				{
					"doctype": FISCAL_YEAR_DOCTYPE,
					"year_name": INITIAL_FISCAL_YEAR,
					"start_date": f"{INITIAL_FISCAL_YEAR}-01-01",
					"end_date": f"{INITIAL_FISCAL_YEAR}-12-31",
					"is_closed": 0,
				}
			)
			doc.insert(ignore_permissions=True)

		if frappe.db.table_exists("Archive Settings") or frappe.db.exists("DocType", "Archive Settings"):
			current_default = cstr(
				frappe.db.get_single_value("Archive Settings", "default_fiscal_year")
			).strip()
			if not current_default:
				frappe.db.set_single_value(
					"Archive Settings",
					"default_fiscal_year",
					INITIAL_FISCAL_YEAR,
					update_modified=False,
				)
	finally:
		frappe.flags.in_patch = prev_flag

	return INITIAL_FISCAL_YEAR


def get_default_fiscal_year() -> str:
	if frappe.db.table_exists(FISCAL_YEAR_DOCTYPE):
		default_year = cstr(
			frappe.db.get_single_value("Archive Settings", "default_fiscal_year")
		).strip()
		if default_year and frappe.db.exists(FISCAL_YEAR_DOCTYPE, default_year):
			return default_year
		if frappe.db.exists(FISCAL_YEAR_DOCTYPE, INITIAL_FISCAL_YEAR):
			return INITIAL_FISCAL_YEAR
		first_open = frappe.db.get_value(
			FISCAL_YEAR_DOCTYPE,
			{"is_closed": 0},
			"year_name",
			order_by="year_name desc",
		)
		if first_open:
			return cstr(first_open)
	return INITIAL_FISCAL_YEAR


def get_all_fiscal_years() -> list[dict[str, Any]]:
	if not frappe.db.table_exists(FISCAL_YEAR_DOCTYPE):
		return []
	default_year = get_default_fiscal_year()
	rows = frappe.get_all(
		FISCAL_YEAR_DOCTYPE,
		fields=[
			"name",
			"year_name",
			"start_date",
			"end_date",
			"is_closed",
			"closed_at",
			"closed_by",
			"reopened_at",
			"reopened_by",
		],
		order_by="year_name desc",
	)
	result = []
	for r in rows:
		yr = cstr(r.get("year_name") or r.get("name")).strip()
		result.append(
			{
				"year_name": yr,
				"start_date": cstr(r.get("start_date") or f"{yr}-01-01"),
				"end_date": cstr(r.get("end_date") or f"{yr}-12-31"),
				"is_closed": cint(r.get("is_closed")),
				"is_default": 1 if yr == default_year else 0,
				"closed_at": r.get("closed_at"),
				"closed_by": r.get("closed_by"),
				"reopened_at": r.get("reopened_at"),
				"reopened_by": r.get("reopened_by"),
			}
		)
	return result


def is_fiscal_year_closed(fiscal_year: str) -> bool:
	yr = cstr(fiscal_year).strip()
	if not yr or not frappe.db.table_exists(FISCAL_YEAR_DOCTYPE):
		return False
	val = frappe.db.get_value(FISCAL_YEAR_DOCTYPE, yr, "is_closed")
	if val is None:
		frappe.throw(
			_("السنة المالية ({0}) غير موجودة في النظام.").format(frappe.bold(yr)),
			frappe.ValidationError,
		)
	return bool(cint(val))


def require_fiscal_year_exists(fiscal_year: str) -> str:
	yr = cstr(fiscal_year).strip()
	if not yr:
		frappe.throw(_("يجب تحديد السنة المالية."), frappe.ValidationError)
	if not frappe.db.table_exists(FISCAL_YEAR_DOCTYPE) or not frappe.db.exists(FISCAL_YEAR_DOCTYPE, yr):
		frappe.throw(
			_("السنة المالية ({0}) غير مسجلة في النظام.").format(frappe.bold(yr)),
			frappe.ValidationError,
		)
	return yr


def require_fiscal_year_open(fiscal_year: str) -> str:
	yr = require_fiscal_year_exists(fiscal_year)
	if is_fiscal_year_closed(yr):
		frappe.throw(
			_("السنة المالية ({0}) مغلقة ولا تسمح بتنفيذ الإجراءات التي تغيّر البيانات.").format(
				frappe.bold(yr)
			),
			frappe.ValidationError,
		)
	return yr


def resolve_perm_field(action: str) -> str:
	key = cstr(action or "view").strip().lower()
	field = ACTION_TO_FIELD.get(key)
	if not field:
		frappe.throw(_("نوع صلاحية السنة المالية غير صالح: {0}").format(key), frappe.ValidationError)
	return field


def get_user_fiscal_permissions_map(user: str | None = None) -> dict[str, dict[str, bool]]:
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	years = get_all_fiscal_years()
	perm_map: dict[str, dict[str, bool]] = {}
	for y in years:
		yr = y["year_name"]
		perm_map[yr] = {
			"can_view": False,
			"can_add": False,
			"can_edit": False,
			"can_delete": False,
			"can_export": False,
		}

	if (
		not resolved_user
		or resolved_user == "Guest"
		or not frappe.db.table_exists(USER_FISCAL_PERM_DOCTYPE)
	):
		return perm_map

	rows = frappe.get_all(
		USER_FISCAL_PERM_DOCTYPE,
		filters={"parent_user": resolved_user},
		fields=["fiscal_year", "can_view", "can_add", "can_edit", "can_delete", "can_export"],
	)
	for row in rows:
		yr = cstr(row.get("fiscal_year")).strip()
		if yr not in perm_map:
			perm_map[yr] = {
				"can_view": False,
				"can_add": False,
				"can_edit": False,
				"can_delete": False,
				"can_export": False,
			}
		perm_map[yr]["can_view"] = bool(cint(row.get("can_view")))
		perm_map[yr]["can_add"] = bool(cint(row.get("can_add")))
		perm_map[yr]["can_edit"] = bool(cint(row.get("can_edit")))
		perm_map[yr]["can_delete"] = bool(cint(row.get("can_delete")))
		perm_map[yr]["can_export"] = bool(cint(row.get("can_export")))

	return perm_map


def has_fiscal_permission(
	fiscal_year: str,
	action: str,
	user: str | None = None,
	check_open: bool | None = None,
) -> bool:
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	if not resolved_user or resolved_user == "Guest":
		return False
	if not cint(frappe.db.get_value("User", resolved_user, "enabled")):
		return False

	yr = cstr(fiscal_year).strip()
	if not yr:
		return False
	if not frappe.db.table_exists(FISCAL_YEAR_DOCTYPE) or not frappe.db.exists(FISCAL_YEAR_DOCTYPE, yr):
		return False

	field = resolve_perm_field(action)
	should_check_open = (field in MUTATING_FIELDS) if check_open is None else bool(check_open)
	if should_check_open and is_fiscal_year_closed(yr):
		return False

	if not frappe.db.table_exists(USER_FISCAL_PERM_DOCTYPE):
		return False

	val = frappe.db.get_value(
		USER_FISCAL_PERM_DOCTYPE,
		{"parent_user": resolved_user, "fiscal_year": yr},
		field,
	)
	return bool(cint(val))


def require_fiscal_permission(
	fiscal_year: str,
	action: str,
	user: str | None = None,
	check_open: bool | None = None,
) -> str:
	yr = require_fiscal_year_exists(fiscal_year)
	field = resolve_perm_field(action)
	action_label = ACTION_LABELS.get(field, action)

	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	if not has_fiscal_permission(yr, action, user=resolved_user, check_open=False):
		frappe.throw(
			_("ليست لديك صلاحية ({0}) للسنة المالية ({1}).").format(
				action_label, frappe.bold(yr)
			),
			frappe.PermissionError,
		)

	should_check_open = (field in MUTATING_FIELDS) if check_open is None else bool(check_open)
	if should_check_open:
		require_fiscal_year_open(yr)

	return yr


def get_allowed_fiscal_years(
	action: str = "view",
	user: str | None = None,
	only_open: bool = False,
) -> list[str]:
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	if not resolved_user or resolved_user == "Guest":
		return []
	if not cint(frappe.db.get_value("User", resolved_user, "enabled")):
		return []

	field = resolve_perm_field(action)
	years = get_all_fiscal_years()
	perm_map = get_user_fiscal_permissions_map(user=resolved_user)

	allowed: list[str] = []
	for y in years:
		yr = y["year_name"]
		if only_open and cint(y.get("is_closed")):
			continue
		if perm_map.get(yr, {}).get(field, False):
			allowed.append(yr)
	return allowed


def resolve_fiscal_year_filter(
	requested_year: str | None = None,
	user: str | None = None,
	action: str = "view",
) -> list[str]:
	"""
	يحلل فلتر السنة المالية القادم من الواجهة أو الـ API:
	- إذا كان فارغًا أو 'all' أو 'جميع السنوات': يعيد فقط السنوات المصرح للمستخدم بها.
	- إذا كان سنة محددة: يتحقق من امتلاك المستخدم صلاحية الإجراء لتلك السنة، ويرفض الوصول إذا لم يمتلكها.
	"""
	allowed_years = get_allowed_fiscal_years(action=action, user=user, only_open=False)
	req = cstr(requested_year or "").strip()
	if not req or req.lower() in ("all", "جميع السنوات", "*"):
		return allowed_years

	require_fiscal_permission(req, action=action, user=user, check_open=False)
	return [req]


def resolve_target_fiscal_year_for_create(
	requested_year: str | None = None,
	user: str | None = None,
) -> str:
	"""
	يحدد السنة المالية عند إنشاء سجل جديد (من الواجهة، أو API، أو Data Import):
	- يمنع تمرير fiscal_year من داخل ملف Excel عند الاستيراد إلا إذا حُددت سنة الدفعة رسميًا.
	- يتحقق من وجود السنة، وأنها مفتوحة، وأن المستخدم يملك صلاحية الإضافة فيها.
	"""
	if getattr(frappe.flags, "in_import", False):
		target_year = cstr(
			getattr(frappe.flags, "import_target_fiscal_year", None) or get_default_fiscal_year()
		).strip()
	else:
		target_year = cstr(requested_year or "").strip() or get_default_fiscal_year()

	return require_fiscal_permission(target_year, action="add", user=user, check_open=True)


def derive_fiscal_year_from_date(date_val: Any) -> str:
	if not date_val:
		frappe.throw(_("يجب تحديد التاريخ لاشتقاق السنة المالية."), frappe.ValidationError)
	parsed = getdate(date_val)
	return f"{parsed.year:04d}"


def enforce_immutable_fiscal_fields(doc: Any, has_sequence: bool = True) -> None:
	"""
	يضمن ثبات السنة المالية والرقم التسلسلي السنوي بعد إنشاء السجل،
	ويمنع أي محاولة لتغييرهما عبر API أو التعديل أو Data Import.
	"""
	if doc.is_new():
		return

	db_fields = ["fiscal_year", "fiscal_sequence"] if has_sequence else ["fiscal_year"]
	db_vals = frappe.db.get_value(doc.doctype, doc.name, db_fields, as_dict=True)
	if not db_vals:
		return

	orig_year = cstr(db_vals.get("fiscal_year") or "").strip()
	curr_year = cstr(getattr(doc, "fiscal_year", "") or "").strip()

	if orig_year:
		if curr_year and curr_year != orig_year:
			frappe.throw(
				_("لا يُسمح بتغيير السنة المالية للسجل بعد إنشائه (السنة الأصلية: {0}).").format(
					frappe.bold(orig_year)
				),
				frappe.ValidationError,
			)
		doc.fiscal_year = orig_year

	if has_sequence:
		orig_seq = cint(db_vals.get("fiscal_sequence"))
		curr_seq = cint(getattr(doc, "fiscal_sequence", 0))
		if orig_seq > 0:
			if curr_seq and curr_seq != orig_seq:
				frappe.throw(
					_("لا يُسمح بتغيير الرقم التسلسلي السنوي للسجل بعد إنشائه (الرقم الأصلي: {0}).").format(
						frappe.bold(orig_seq)
					),
					frappe.ValidationError,
				)
			doc.fiscal_sequence = orig_seq


def get_next_fiscal_sequence(doctype: str, fiscal_year: str) -> int:
	"""
	عداد ذري آمن للتزامن لكل (DocType + fiscal_year) باستخدام قفل صفوف قاعدة البيانات (FOR UPDATE).
	- يبدأ من 1 لكل سنة مالية جديدة.
	- يستمر من آخر رقم مخصص حتى لو حُذفت سجلات سابقة.
	- يمنع تكرار الأرقام عند الإدخال المتزامن أو استيراد Excel.
	"""
	code = SEQUENCED_DOCTYPES.get(doctype)
	if not code:
		frappe.throw(_("المستند {0} لا يدعم الترقيم التسلسلي السنوي.").format(doctype))

	yr = require_fiscal_year_exists(fiscal_year)
	series_key = f"ARCHIVE-FISCAL-SEQ::{code}::{yr}"

	row = frappe.db.sql(
		"SELECT `current` FROM `tabSeries` WHERE `name` = %s FOR UPDATE",
		(series_key,),
	)
	if not row:
		frappe.db.sql(
			"INSERT IGNORE INTO `tabSeries` (`name`, `current`) VALUES (%s, 0)",
			(series_key,),
		)
		row = frappe.db.sql(
			"SELECT `current` FROM `tabSeries` WHERE `name` = %s FOR UPDATE",
			(series_key,),
		)

	current_series_val = cint(row[0][0]) if row else 0
	table_max_row = frappe.db.sql(
		f"SELECT COALESCE(MAX(`fiscal_sequence`), 0) FROM `tab{doctype}` WHERE `fiscal_year` = %s",
		(yr,),
	)
	table_max_val = cint(table_max_row[0][0]) if table_max_row else 0

	next_val = max(current_series_val, table_max_val) + 1
	frappe.db.sql(
		"UPDATE `tabSeries` SET `current` = %s WHERE `name` = %s",
		(next_val, series_key),
	)
	return next_val


def sync_fiscal_series_counter(doctype: str, fiscal_year: str) -> int:
	code = SEQUENCED_DOCTYPES.get(doctype)
	if not code:
		return 0
	yr = cstr(fiscal_year).strip()
	if not yr:
		return 0
	series_key = f"ARCHIVE-FISCAL-SEQ::{code}::{yr}"
	table_max_row = frappe.db.sql(
		f"SELECT COALESCE(MAX(`fiscal_sequence`), 0) FROM `tab{doctype}` WHERE `fiscal_year` = %s",
		(yr,),
	)
	table_max_val = cint(table_max_row[0][0]) if table_max_row else 0

	row = frappe.db.sql(
		"SELECT `current` FROM `tabSeries` WHERE `name` = %s FOR UPDATE",
		(series_key,),
	)
	if not row:
		frappe.db.sql(
			"INSERT INTO `tabSeries` (`name`, `current`) VALUES (%s, %s)",
			(series_key, table_max_val),
		)
		return table_max_val
	curr = cint(row[0][0])
	if table_max_val > curr:
		frappe.db.sql(
			"UPDATE `tabSeries` SET `current` = %s WHERE `name` = %s",
			(table_max_val, series_key),
		)
		return table_max_val
	return curr


def format_fiscal_display_no(fiscal_year: str | None, fiscal_sequence: int | None, fallback_serial: int | None = None) -> str:
	yr = cstr(fiscal_year or "").strip()
	seq = cint(fiscal_sequence) or cint(fallback_serial)
	if yr and seq:
		return f"{yr} / {seq}"
	if seq:
		return cstr(seq)
	return ""


def get_screen_fiscal_context(user: str | None = None) -> dict[str, Any]:
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	default_year = get_default_fiscal_year()
	all_years = get_all_fiscal_years()
	view_years = get_allowed_fiscal_years("view", user=resolved_user, only_open=False)
	add_years = get_allowed_fiscal_years("add", user=resolved_user, only_open=True)
	edit_years = get_allowed_fiscal_years("edit", user=resolved_user, only_open=True)
	delete_years = get_allowed_fiscal_years("delete", user=resolved_user, only_open=True)
	export_years = get_allowed_fiscal_years("export", user=resolved_user, only_open=False)

	default_add_year = default_year if default_year in add_years else (add_years[0] if add_years else "")
	default_view_year = (
		default_year
		if default_year in view_years
		else (view_years[0] if view_years else "")
	)

	return {
		"default_fiscal_year": default_year,
		"default_add_fiscal_year": default_add_year,
		"default_view_fiscal_year": default_view_year,
		"allowed_view_years": view_years,
		"allowed_add_years": add_years,
		"allowed_edit_years": edit_years,
		"allowed_delete_years": delete_years,
		"allowed_export_years": export_years,
		"can_view_multiple_years": len(view_years) > 1,
		"years": all_years,
		"years_meta": {
			y["year_name"]: {
				"year_name": y["year_name"],
				"start_date": y["start_date"],
				"end_date": y["end_date"],
				"is_closed": y["is_closed"],
				"is_default": y["is_default"],
			}
			for y in all_years
		},
	}


@frappe.whitelist()
def get_my_fiscal_context() -> dict[str, Any]:
	return get_screen_fiscal_context()


# =========================================================
# Standard Frappe Hook Gatekeepers for the 4 DocTypes
# =========================================================

def get_fiscal_permission_query_condition(
	doctype: str,
	user: str | None = None,
	table_alias: str | None = None,
) -> str:
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	is_export_req = _is_export_request()
	action = "export" if is_export_req else "view"
	allowed_years = get_allowed_fiscal_years(action=action, user=resolved_user, only_open=False)
	if not allowed_years:
		return "1=0"

	col = f"{table_alias}.`fiscal_year`" if table_alias else f"`tab{doctype}`.`fiscal_year`"
	escaped = ", ".join(frappe.db.escape(y) for y in allowed_years)
	return f"{col} IN ({escaped})"


def _is_export_request() -> bool:
	try:
		cmd = cstr(frappe.form_dict.get("cmd") or "")
		path = cstr(getattr(frappe.request, "path", "") or "")
	except Exception:
		return False
	combined = f"{cmd} {path}".lower()
	return any(
		k in combined
		for k in (
			"export_query",
			"data_export",
			"download_template",
			"export_data",
		)
	)


def check_doctype_fiscal_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
) -> bool:
	"""
	بوابة فحص الصلاحية السنوية لمسارات Frappe القياسية (has_permission hook).
	"""
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	perm = cstr(ptype or "read").strip().lower()

	if perm in ("read", "select", "report", "print"):
		action = "view"
	elif perm == "create":
		action = "add"
	elif perm in ("write", "submit", "cancel", "amend"):
		action = "edit"
	elif perm == "delete":
		action = "delete"
	elif perm == "export":
		action = "export"
	else:
		# Custom permission types (e.g. manage_attachments, change_initial_status)
		# If mutating, map to edit; if viewing timeline/details, map to view
		if "view" in perm or "check_document" in perm or "use_authenticity" in perm:
			action = "add" if "check_document" in perm else "view"
		else:
			action = "edit"

	if doc is None:
		if action == "add":
			return len(get_allowed_fiscal_years("add", user=resolved_user, only_open=True)) > 0
		if action in ("edit", "delete"):
			return len(get_allowed_fiscal_years(action, user=resolved_user, only_open=True)) > 0
		return len(get_allowed_fiscal_years(action, user=resolved_user, only_open=False)) > 0

	doc_year = None
	if isinstance(doc, dict):
		doc_year = cstr(doc.get("fiscal_year") or "").strip()
		if not doc_year and doc.get("deposit_date"):
			doc_year = derive_fiscal_year_from_date(doc.get("deposit_date"))
	elif isinstance(doc, str):
		pass
	else:
		doc_year = cstr(getattr(doc, "fiscal_year", "") or "").strip()
		if not doc_year and getattr(doc, "deposit_date", None):
			doc_year = derive_fiscal_year_from_date(getattr(doc, "deposit_date"))

	if not doc_year:
		is_unsaved = isinstance(doc, dict) or bool(getattr(doc, "is_new", lambda: False)()) or not getattr(doc, "name", None)
		if is_unsaved:
			if action == "add":
				return len(get_allowed_fiscal_years("add", user=resolved_user, only_open=True)) > 0
			if action in ("edit", "delete"):
				return len(get_allowed_fiscal_years(action, user=resolved_user, only_open=True)) > 0
			return len(get_allowed_fiscal_years(action, user=resolved_user, only_open=False)) > 0
		return False

	return has_fiscal_permission(doc_year, action=action, user=resolved_user)


def get_operation_permission_query_conditions(
	user: str | None = None,
	doctype: str | None = None,
) -> str:
	del doctype
	return get_fiscal_permission_query_condition("Archive Operation", user=user)


def get_authenticity_permission_query_conditions(
	user: str | None = None,
	doctype: str | None = None,
) -> str:
	del doctype
	return get_fiscal_permission_query_condition(
		"Archive Document Authenticity Check", user=user
	)


def has_operation_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
	debug: bool = False,
) -> bool:
	del debug
	return check_doctype_fiscal_permission(doc, ptype=ptype, user=user)


def has_authenticity_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
	debug: bool = False,
) -> bool:
	del debug
	return check_doctype_fiscal_permission(doc, ptype=ptype, user=user)


def validate_doc_event_fiscal_guard(doc: Any, method: str | None = None) -> None:
	"""
	حارس doc_events على المستندات الأربعة لمنع أي تجاوز عبر Frappe Desk أو API أو Data Import.
	"""
	if getattr(frappe.flags, "in_patch", False) or getattr(frappe.flags, "in_migrate", False) or getattr(frappe.flags, "in_install", False):
		return

	if method == "on_trash":
		doc_year = cstr(getattr(doc, "fiscal_year", "") or "").strip()
		if not doc_year and getattr(doc, "deposit_date", None):
			doc_year = derive_fiscal_year_from_date(getattr(doc, "deposit_date"))
		if doc_year:
			require_fiscal_permission(doc_year, "delete", check_open=True)


# =========================================================
# Whitelisted Administrative APIs for Settings & User Form
# =========================================================

@frappe.whitelist()
def get_fiscal_years_management_data() -> dict[str, Any]:
	require_fiscal_admin()
	ensure_fiscal_year_2026()
	return {
		"default_fiscal_year": get_default_fiscal_year(),
		"fiscal_years": get_all_fiscal_years(),
	}


@frappe.whitelist(methods=["POST"])
def create_fiscal_year(year_name: str) -> dict[str, Any]:
	require_fiscal_admin()
	yr = cstr(year_name or "").strip()
	if not re.match(r"^\d{4}$", yr):
		frappe.throw(_("اسم السنة المالية يجب أن يتكون من 4 أرقام مثل 2026."), frappe.ValidationError)

	if frappe.db.exists(FISCAL_YEAR_DOCTYPE, yr):
		frappe.throw(
			_("السنة المالية ({0}) موجودة مسبقاً ولا يمكن تكرارها.").format(frappe.bold(yr)),
			frappe.DuplicateEntryError,
		)

	doc = frappe.get_doc(
		{
			"doctype": FISCAL_YEAR_DOCTYPE,
			"year_name": yr,
			"start_date": f"{yr}-01-01",
			"end_date": f"{yr}-12-31",
			"is_closed": 0,
		}
	)
	doc.insert()
	return get_fiscal_years_management_data()


@frappe.whitelist(methods=["POST"])
def set_fiscal_year_status(year_name: str, is_closed: int | str) -> dict[str, Any]:
	require_fiscal_admin()
	yr = require_fiscal_year_exists(year_name)
	doc = frappe.get_doc(FISCAL_YEAR_DOCTYPE, yr)
	doc.is_closed = 1 if cint(is_closed) else 0
	doc.save()
	return get_fiscal_years_management_data()


@frappe.whitelist(methods=["POST"])
def set_default_fiscal_year(year_name: str) -> dict[str, Any]:
	require_fiscal_admin()
	yr = require_fiscal_year_exists(year_name)
	if is_fiscal_year_closed(yr):
		frappe.throw(
			_("لا يمكن تعيين سنة مالية مغلقة ({0}) لتكون السنة الافتراضية.").format(frappe.bold(yr)),
			frappe.ValidationError,
		)
	settings = frappe.get_single("Archive Settings")
	settings.default_fiscal_year = yr
	settings.save()
	return get_fiscal_years_management_data()


@frappe.whitelist()
def get_user_fiscal_permissions_for_editor(user: str | None = None) -> dict[str, Any]:
	require_fiscal_admin()
	ensure_fiscal_year_2026()
	target_user = cstr(user or "").strip()
	years = get_all_fiscal_years()
	matrix = get_user_fiscal_permissions_map(user=target_user) if target_user else {
		y["year_name"]: {
			"can_view": False,
			"can_add": False,
			"can_edit": False,
			"can_delete": False,
			"can_export": False,
		}
		for y in years
	}
	return {
		"user": target_user,
		"fiscal_years": years,
		"permissions": matrix,
	}


@frappe.whitelist(methods=["POST"])
def save_user_fiscal_permissions_from_editor(user: str, permissions: str | dict[str, Any]) -> dict[str, Any]:
	require_fiscal_admin()
	target_user = cstr(user or "").strip()
	if not target_user or not frappe.db.exists("User", target_user):
		frappe.throw(_("المستخدم المحدد غير موجود."), frappe.ValidationError)

	if isinstance(permissions, str):
		parsed = json.loads(permissions or "{}")
	elif isinstance(permissions, dict):
		parsed = permissions
	else:
		parsed = {}

	_apply_user_fiscal_permissions_dict(target_user, parsed)
	return get_user_fiscal_permissions_for_editor(user=target_user)


def _apply_user_fiscal_permissions_dict(target_user: str, parsed: dict[str, Any]) -> None:
	if not isinstance(parsed, dict):
		return
	valid_years = {y["year_name"] for y in get_all_fiscal_years()}
	for yr, actions in parsed.items():
		yr_clean = cstr(yr).strip()
		if yr_clean not in valid_years or not isinstance(actions, dict):
			continue

		existing_name = frappe.db.get_value(
			USER_FISCAL_PERM_DOCTYPE,
			{"parent_user": target_user, "fiscal_year": yr_clean},
			"name",
		)
		values = {
			"can_view": 1 if cint(actions.get("can_view")) else 0,
			"can_add": 1 if cint(actions.get("can_add")) else 0,
			"can_edit": 1 if cint(actions.get("can_edit")) else 0,
			"can_delete": 1 if cint(actions.get("can_delete")) else 0,
			"can_export": 1 if cint(actions.get("can_export")) else 0,
		}
		if existing_name:
			doc = frappe.get_doc(USER_FISCAL_PERM_DOCTYPE, existing_name)
			changed = any(cint(getattr(doc, k)) != v for k, v in values.items())
			if changed:
				for k, v in values.items():
					setattr(doc, k, v)
				doc.save()
		else:
			if any(v == 1 for v in values.values()):
				doc = frappe.get_doc(
					{
						"doctype": USER_FISCAL_PERM_DOCTYPE,
						"parent_user": target_user,
						"fiscal_year": yr_clean,
						**values,
					}
				)
				doc.insert()


def save_user_fiscal_permissions_on_user_validate(doc: Any, method: str | None = None) -> None:
	"""
	يلتقط مصفوفة صلاحيات السنوات المالية المرسلة مع نموذج المستخدم (إن وجدت) ويحفظها بأمان.
	"""
	raw_payload = getattr(doc, "_archive_fiscal_permissions", None) or frappe.form_dict.get(
		"archive_fiscal_permissions"
	)
	if not raw_payload:
		return
	require_fiscal_admin()
	if isinstance(raw_payload, str):
		try:
			parsed = json.loads(raw_payload)
		except Exception:
			return
	elif isinstance(raw_payload, dict):
		parsed = raw_payload
	else:
		return
	if doc.name and frappe.db.exists("User", doc.name):
		_apply_user_fiscal_permissions_dict(doc.name, parsed)
