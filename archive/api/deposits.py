from __future__ import annotations

import calendar
from datetime import date, timedelta
import json
import math
import re
from typing import Any

from urllib.parse import unquote

import frappe
from frappe import _
from frappe.utils import add_days, cint, cstr, flt, get_datetime, getdate, now_datetime, today


def _format_audit_datetime(value: Any) -> str:
	if not value:
		return ""
	try:
		return get_datetime(value).strftime("%Y-%m-%d %H:%M:%S")
	except Exception:
		return cstr(value).split(".")[0].strip()

from archive.api.card_search import (
	CARD_TYPE_BUSINESS,
	CARD_TYPE_MADA,
	VALID_CARD_TYPES,
	clean_card_type,
	format_copy_badge_label,
	make_deposit_group_key,
	normalize_account_number,
)
from archive.api.operation_search import normalize_search_text
from archive.services.fiscal_year_permissions import (
	derive_fiscal_year_from_date,
	get_allowed_fiscal_years,
	get_screen_fiscal_context,
	get_user_fiscal_permissions_map,
	has_fiscal_permission,
	is_fiscal_year_closed,
	require_fiscal_permission,
	require_fiscal_year_open,
)

DEPOSIT_DOCTYPE = "Archive Card Deposit"
ACTIVE_CARD_STATUS = "نشطة"

ROLE_DEPOSITS_VIEW = "صلاحية الوصول إلى شاشة الإيداعات"
ROLE_DEPOSITS_SCREEN_ACCESS = ROLE_DEPOSITS_VIEW
ROLE_DEPOSITS_EDIT_TODAY = "صلاحية تعديل إيداعات اليوم"
ROLE_DEPOSITS_EDIT_PAST = "صلاحية تعديل إيداعات الأيام السابقة"
ROLE_DEPOSITS_EDIT_FUTURE = "صلاحية تعديل إيداعات الأيام القادمة"
ROLE_DEPOSITS_APPROVE = "صلاحية اعتماد الإيداعات وإلغاء اعتمادها"
ROLE_DEPOSITS_STOPPED_REASON = "صلاحية تفعيل وإلغاء موقف لسبب"

ALL_DEPOSITS_ROLES = (
	ROLE_DEPOSITS_VIEW,
	ROLE_DEPOSITS_EDIT_TODAY,
	ROLE_DEPOSITS_EDIT_PAST,
	ROLE_DEPOSITS_EDIT_FUTURE,
	ROLE_DEPOSITS_APPROVE,
	ROLE_DEPOSITS_STOPPED_REASON,
)

USER_PAST_DAYS_FIELD = "allowed_past_deposit_days"
USER_FUTURE_DAYS_FIELD = "allowed_future_deposit_days"
USER_PAST_APPROVAL_DAYS_FIELD = "allowed_past_approval_days"
USER_FUTURE_APPROVAL_DAYS_FIELD = "allowed_future_approval_days"
USER_PAST_STOPPED_REASON_DAYS_FIELD = "allowed_past_stopped_reason_days"
USER_FUTURE_STOPPED_REASON_DAYS_FIELD = "allowed_future_stopped_reason_days"

USER_DEPOSIT_DAY_FIELDS = (
	USER_PAST_DAYS_FIELD,
	USER_FUTURE_DAYS_FIELD,
	USER_PAST_APPROVAL_DAYS_FIELD,
	USER_FUTURE_APPROVAL_DAYS_FIELD,
	USER_PAST_STOPPED_REASON_DAYS_FIELD,
	USER_FUTURE_STOPPED_REASON_DAYS_FIELD,
)

VALID_DEPOSIT_FILTERS = ("", "all", "deposited", "not_deposited", "stopped_for_reason")
VALID_PERIOD_MODES = ("day", "month", "year", "range")

SORTABLE_COLUMNS = (
	"serial_no",
	"deposit_date",
	"card_name",
	"card_type",
	"card_number",
	"bank",
	"representative",
	"region",
	"card_owner",
	"deposit_amount",
	"remaining_limit",
	"stopped_for_reason",
	"status",
	"approval",
)


def _has_explicit_user_role(role_name: str, user: str | None = None) -> bool:
	"""
	Strict explicit DB check against `tabHas Role` on the User record without cache.
	No implicit exemption for Administrator, System Manager, or any other user.
	"""
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	if not resolved_user or resolved_user == "Guest" or not role_name:
		return False

	if resolved_user != "Administrator":
		enabled_rows = frappe.db.sql(
			"SELECT enabled FROM `tabUser` WHERE name = %s LIMIT 1",
			(resolved_user,),
			as_dict=True,
		)
		if not enabled_rows or not cint(enabled_rows[0].get("enabled")):
			return False

	role_rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabHas Role`
		WHERE parent = %s
		  AND parenttype = 'User'
		  AND parentfield = 'roles'
		  AND role = %s
		LIMIT 1
		""",
		(resolved_user, role_name),
		as_dict=True,
	)
	return bool(role_rows)


def has_deposits_screen_access_role(user: str | None = None) -> bool:
	return _has_explicit_user_role(ROLE_DEPOSITS_VIEW, user=user)


def has_any_deposit_edit_role(user: str | None = None) -> bool:
	return any(
		_has_explicit_user_role(r, user=user)
		for r in (
			ROLE_DEPOSITS_EDIT_TODAY,
			ROLE_DEPOSITS_EDIT_PAST,
			ROLE_DEPOSITS_EDIT_FUTURE,
		)
	)


def has_deposit_approval_role(user: str | None = None) -> bool:
	return _has_explicit_user_role(ROLE_DEPOSITS_APPROVE, user=user) or _has_explicit_user_role(
		"اعتماد الإيداعات وإلغاء اعتمادها", user=user
	)


def has_deposit_stopped_reason_role(user: str | None = None) -> bool:
	return _has_explicit_user_role(
		ROLE_DEPOSITS_STOPPED_REASON, user=user
	) or _has_explicit_user_role("تفعيل وإلغاء موقف لسبب", user=user)


def _get_user_pair_day_limits(
	past_field: str,
	future_field: str,
	user: str | None = None,
) -> dict[str, int]:
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	if not resolved_user or resolved_user == "Guest":
		return {"past_days": 0, "future_days": 0}

	has_past = frappe.db.has_column("User", past_field)
	has_future = frappe.db.has_column("User", future_field)
	if not has_past and not has_future:
		return {"past_days": 0, "future_days": 0}

	select_cols = [
		f"IFNULL(`{past_field}`, 0) AS past_days" if has_past else "0 AS past_days",
		f"IFNULL(`{future_field}`, 0) AS future_days" if has_future else "0 AS future_days",
	]
	rows = frappe.db.sql(
		f"SELECT {', '.join(select_cols)} FROM `tabUser` WHERE name = %s LIMIT 1",
		(resolved_user,),
		as_dict=True,
	)
	if not rows:
		return {"past_days": 0, "future_days": 0}

	return {
		"past_days": max(0, cint(rows[0].get("past_days") or 0)),
		"future_days": max(0, cint(rows[0].get("future_days") or 0)),
	}


def get_user_deposit_day_limits(user: str | None = None) -> dict[str, int]:
	"""
	Reads per-user day window limits directly from `tabUser` without cache so any
	permission/day-limit update takes effect immediately on the next API request.
	"""
	return _get_user_pair_day_limits(
		USER_PAST_DAYS_FIELD,
		USER_FUTURE_DAYS_FIELD,
		user=user,
	)


def get_user_approval_day_limits(user: str | None = None) -> dict[str, int]:
	return _get_user_pair_day_limits(
		USER_PAST_APPROVAL_DAYS_FIELD,
		USER_FUTURE_APPROVAL_DAYS_FIELD,
		user=user,
	)


def get_user_stopped_reason_day_limits(user: str | None = None) -> dict[str, int]:
	return _get_user_pair_day_limits(
		USER_PAST_STOPPED_REASON_DAYS_FIELD,
		USER_FUTURE_STOPPED_REASON_DAYS_FIELD,
		user=user,
	)


def get_all_user_deposit_day_limits(user: str | None = None) -> dict[str, int]:
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	default_res = {f: 0 for f in USER_DEPOSIT_DAY_FIELDS}
	if not resolved_user or resolved_user == "Guest":
		return default_res

	select_parts = []
	for fname in USER_DEPOSIT_DAY_FIELDS:
		if frappe.db.has_column("User", fname):
			select_parts.append(f"IFNULL(`{fname}`, 0) AS `{fname}`")
		else:
			select_parts.append(f"0 AS `{fname}`")
	rows = frappe.db.sql(
		f"SELECT {', '.join(select_parts)} FROM `tabUser` WHERE name = %s LIMIT 1",
		(resolved_user,),
		as_dict=True,
	)
	if not rows:
		return default_res
	return {fname: max(0, cint(rows[0].get(fname) or 0)) for fname in USER_DEPOSIT_DAY_FIELDS}


def require_deposits_screen_access(user: str | None = None) -> None:
	if not has_deposits_screen_access_role(user=user):
		frappe.throw(
			_("ليست لديك صلاحية الوصول إلى شاشة الإيداعات."),
			frappe.PermissionError,
		)


def can_view_deposits(user: str | None = None) -> bool:
	if not has_deposits_screen_access_role(user=user):
		return False
	return bool(get_allowed_fiscal_years(user=user, action="view", only_open=False))


def _can_edit_deposits_date_window(
	deposit_date: str | None = None,
	user: str | None = None,
) -> bool:
	if not has_deposits_screen_access_role(user=user):
		return False

	resolved_date = _resolve_valid_date(deposit_date)
	target_dt = getdate(resolved_date)
	server_today_dt = getdate(today())
	delta_days = (target_dt - server_today_dt).days

	if delta_days == 0:
		return _has_explicit_user_role(ROLE_DEPOSITS_EDIT_TODAY, user=user)

	if delta_days < 0:
		if not _has_explicit_user_role(ROLE_DEPOSITS_EDIT_PAST, user=user):
			return False
		limits = get_user_deposit_day_limits(user=user)
		past_days = -delta_days
		return limits["past_days"] > 0 and past_days <= limits["past_days"]

	# delta_days > 0
	if not _has_explicit_user_role(ROLE_DEPOSITS_EDIT_FUTURE, user=user):
		return False
	limits = get_user_deposit_day_limits(user=user)
	return limits["future_days"] > 0 and delta_days <= limits["future_days"]


def _can_approve_deposits_date_window(
	deposit_date: str | None = None,
	user: str | None = None,
) -> bool:
	if not has_deposits_screen_access_role(user=user):
		return False
	if not has_deposit_approval_role(user=user):
		return False

	resolved_date = _resolve_valid_date(deposit_date)
	target_dt = getdate(resolved_date)
	server_today_dt = getdate(today())
	delta_days = (target_dt - server_today_dt).days

	if delta_days == 0:
		return True

	limits = get_user_approval_day_limits(user=user)
	if delta_days < 0:
		past_days = -delta_days
		return limits["past_days"] > 0 and past_days <= limits["past_days"]

	return limits["future_days"] > 0 and delta_days <= limits["future_days"]


def _can_stopped_reason_date_window(
	deposit_date: str | None = None,
	user: str | None = None,
) -> bool:
	if not has_deposits_screen_access_role(user=user):
		return False
	if not has_deposit_stopped_reason_role(user=user):
		return False

	resolved_date = _resolve_valid_date(deposit_date)
	target_dt = getdate(resolved_date)
	server_today_dt = getdate(today())
	delta_days = (target_dt - server_today_dt).days

	if delta_days == 0:
		return True

	limits = get_user_stopped_reason_day_limits(user=user)
	if delta_days < 0:
		past_days = -delta_days
		return limits["past_days"] > 0 and past_days <= limits["past_days"]

	return limits["future_days"] > 0 and delta_days <= limits["future_days"]


def can_edit_deposits_for_date(
	deposit_date: str | None = None,
	user: str | None = None,
) -> bool:
	"""
	Evaluates whether `user` can edit deposits for `deposit_date` relative to the
	Frappe server site date (`today()`) AND whether the fiscal year of `deposit_date`
	is open and user has add/edit permission on that fiscal year.
	"""
	if not _can_edit_deposits_date_window(deposit_date=deposit_date, user=user):
		return False

	resolved_date = _resolve_valid_date(deposit_date)
	try:
		fy = derive_fiscal_year_from_date(resolved_date)
	except Exception:
		return False

	if is_fiscal_year_closed(fy):
		return False

	return bool(
		has_fiscal_permission(fy, "add", user=user, check_open=True)
		or has_fiscal_permission(fy, "edit", user=user, check_open=True)
	)


def can_approve_deposits_for_date(
	deposit_date: str | None = None,
	user: str | None = None,
) -> bool:
	if not _can_approve_deposits_date_window(deposit_date=deposit_date, user=user):
		return False

	resolved_date = _resolve_valid_date(deposit_date)
	try:
		fy = derive_fiscal_year_from_date(resolved_date)
	except Exception:
		return False

	if is_fiscal_year_closed(fy):
		return False

	return bool(has_fiscal_permission(fy, "view", user=user, check_open=False))


def can_toggle_stopped_reason_for_date(
	deposit_date: str | None = None,
	user: str | None = None,
) -> bool:
	if not _can_stopped_reason_date_window(deposit_date=deposit_date, user=user):
		return False

	resolved_date = _resolve_valid_date(deposit_date)
	try:
		fy = derive_fiscal_year_from_date(resolved_date)
	except Exception:
		return False

	if is_fiscal_year_closed(fy):
		return False

	return bool(has_fiscal_permission(fy, "view", user=user, check_open=False))


def can_save_deposits(
	deposit_date: str | None = None,
	user: str | None = None,
) -> bool:
	return can_edit_deposits_for_date(deposit_date=deposit_date, user=user)


def require_deposit_view_permission(user: str | None = None) -> None:
	require_deposits_screen_access(user=user)


def require_deposit_save_permission(
	deposit_date: str | None = None,
	user: str | None = None,
) -> None:
	require_deposits_screen_access(user=user)
	resolved_date = _resolve_valid_date(deposit_date)
	fy = derive_fiscal_year_from_date(resolved_date)
	require_fiscal_year_open(fy)
	if not (
		has_fiscal_permission(fy, "add", user=user, check_open=True)
		or has_fiscal_permission(fy, "edit", user=user, check_open=True)
	):
		frappe.throw(
			_("ليست لديك صلاحية لإضافة أو تعديل الإيداعات في السنة المالية ({0}).").format(fy),
			frappe.PermissionError,
		)
	if not _can_edit_deposits_date_window(resolved_date, user=user):
		frappe.throw(
			_("ليست لديك صلاحية لتعديل أو حفظ الإيداعات في التاريخ ({0}).").format(resolved_date),
			frappe.PermissionError,
		)


def require_deposit_approval_permission(
	deposit_date: str | None = None,
	user: str | None = None,
) -> None:
	require_deposits_screen_access(user=user)
	resolved_date = _resolve_valid_date(deposit_date)
	fy = derive_fiscal_year_from_date(resolved_date)
	require_fiscal_year_open(fy)
	if not has_fiscal_permission(fy, "view", user=user, check_open=False):
		frappe.throw(
			_("ليست لديك صلاحية الوصول إلى السنة المالية ({0}).").format(fy),
			frappe.PermissionError,
		)
	if not has_deposit_approval_role(user=user):
		frappe.throw(
			_("ليست لديك صلاحية اعتماد الإيداعات وإلغاء اعتمادها."),
			frappe.PermissionError,
		)
	if not _can_approve_deposits_date_window(resolved_date, user=user):
		frappe.throw(
			_("تاريخ السجل ({0}) خارج النطاق الزمني المسموح لصلاحية الاعتماد.").format(resolved_date),
			frappe.PermissionError,
		)


def require_stopped_reason_permission(
	deposit_date: str | None = None,
	user: str | None = None,
) -> None:
	require_deposits_screen_access(user=user)
	resolved_date = _resolve_valid_date(deposit_date)
	fy = derive_fiscal_year_from_date(resolved_date)
	require_fiscal_year_open(fy)
	if not has_fiscal_permission(fy, "view", user=user, check_open=False):
		frappe.throw(
			_("ليست لديك صلاحية الوصول إلى السنة المالية ({0}).").format(fy),
			frappe.PermissionError,
		)
	if not has_deposit_stopped_reason_role(user=user):
		frappe.throw(
			_("ليست لديك صلاحية تفعيل وإلغاء «موقف لسبب»."),
			frappe.PermissionError,
		)
	if not _can_stopped_reason_date_window(resolved_date, user=user):
		frappe.throw(
			_("تاريخ السجل ({0}) خارج النطاق الزمني المسموح لصلاحية «موقف لسبب».").format(resolved_date),
			frappe.PermissionError,
		)


def is_user_deposit_settings_admin(user: str | None = None) -> bool:
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	if not resolved_user or resolved_user == "Guest":
		return False
	if resolved_user == "Administrator":
		return True
	return _has_explicit_user_role("System Manager", user=resolved_user)


def _coerce_non_negative_day_limit(raw_val: Any, field_label: str) -> int:
	if raw_val is None or raw_val == "":
		return 0
	if isinstance(raw_val, bool):
		frappe.throw(
			_("{0} يجب أن يكون عدداً صحيحاً غير سالب.").format(field_label),
			frappe.ValidationError,
		)
	if isinstance(raw_val, str):
		cleaned = raw_val.strip()
		if cleaned == "":
			return 0
		if not re.match(r"^-?\d+$", cleaned):
			frappe.throw(
				_("{0} يجب أن يكون عدداً صحيحاً غير سالب.").format(field_label),
				frappe.ValidationError,
			)
		int_val = int(cleaned)
	elif isinstance(raw_val, (int, float)):
		if not math.isfinite(raw_val) or abs(raw_val - round(raw_val)) > 1e-9:
			frappe.throw(
				_("{0} يجب أن يكون عدداً صحيحاً غير سالب.").format(field_label),
				frappe.ValidationError,
			)
		int_val = int(round(raw_val))
	else:
		frappe.throw(
			_("{0} يجب أن يكون عدداً صحيحاً غير سالب.").format(field_label),
			frappe.ValidationError,
		)

	if int_val < 0:
		frappe.throw(
			_("{0} لا يمكن أن يكون رقماً سالباً.").format(field_label),
			frappe.ValidationError,
		)
	return int_val


def validate_user_deposit_day_limits(doc: Any, method: str | None = None) -> None:
	"""
	Validates all 6 deposit day-limit fields on User:
	- Non-negative integers only (default 0).
	- Employees cannot modify their own day limits (even via API).
	- Only an authorized User/Permissions administrator can modify these fields.
	"""
	del method
	meta = doc.meta if hasattr(doc, "meta") else None
	field_labels = {
		USER_PAST_DAYS_FIELD: _("عدد الأيام السابقة المسموح بتعديلها"),
		USER_FUTURE_DAYS_FIELD: _("عدد الأيام القادمة المسموح بتعديلها"),
		USER_PAST_APPROVAL_DAYS_FIELD: _("عدد الأيام السابقة المسموح باعتمادها"),
		USER_FUTURE_APPROVAL_DAYS_FIELD: _("عدد الأيام القادمة المسموح باعتمادها"),
		USER_PAST_STOPPED_REASON_DAYS_FIELD: _("عدد الأيام السابقة المسموح بتفعيل موقف لسبب فيها"),
		USER_FUTURE_STOPPED_REASON_DAYS_FIELD: _("عدد الأيام القادمة المسموح بتفعيل موقف لسبب فيها"),
	}

	present_fields = [f for f in USER_DEPOSIT_DAY_FIELDS if bool(meta and meta.has_field(f))]
	if not present_fields:
		return

	new_vals: dict[str, int] = {}
	for fname in present_fields:
		coerced = _coerce_non_negative_day_limit(doc.get(fname), field_labels[fname])
		doc.set(fname, coerced)
		new_vals[fname] = coerced

	if getattr(frappe.flags, "in_migrate", False) or getattr(frappe.flags, "in_patch", False):
		return

	if not doc.is_new() and frappe.db.exists("User", doc.name):
		old_vals = get_all_user_deposit_day_limits(user=doc.name)
	else:
		old_vals = {f: 0 for f in USER_DEPOSIT_DAY_FIELDS}

	if all(new_vals.get(f, 0) == old_vals.get(f, 0) for f in present_fields):
		return

	acting_user = cstr(frappe.session.user or "Guest").strip()
	if not is_user_deposit_settings_admin(user=acting_user) or (
		acting_user != "Administrator" and cstr(doc.name).strip() == acting_user
	):
		frappe.throw(
			_("لا يُسمح بتعديل حدود أيام الإيداعات إلا من قِبل المسؤول المخوّل بإدارة المستخدمين."),
			frappe.PermissionError,
		)


def get_deposit_permission_query_conditions(
	user: str | None = None,
	doctype: str | None = None,
) -> str:
	del doctype
	if not can_view_deposits(user=user):
		return "1=0"
	allowed_years = get_allowed_fiscal_years(user=user, action="view", only_open=False)
	if not allowed_years:
		return "1=0"
	escaped_years = ", ".join(frappe.db.escape(y) for y in allowed_years)
	return f"`tabArchive Card Deposit`.`fiscal_year` IN ({escaped_years})"


def has_deposit_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
	debug: bool = False,
) -> bool:
	del debug
	if not has_deposits_screen_access_role(user=user):
		return False
	perm = ptype or "read"
	doc_fy = None
	doc_date = None
	if isinstance(doc, dict):
		doc_fy = doc.get("fiscal_year")
		doc_date = doc.get("deposit_date")
	elif doc is not None:
		doc_fy = getattr(doc, "fiscal_year", None)
		doc_date = getattr(doc, "deposit_date", None)
	if not doc_fy and doc_date:
		try:
			doc_fy = derive_fiscal_year_from_date(cstr(doc_date))
		except Exception:
			return False

	if perm in ("export", "print"):
		if doc_fy:
			return has_fiscal_permission(doc_fy, "export", user=user, check_open=False)
		return bool(get_allowed_fiscal_years(user=user, action="export", only_open=False))
	if perm in ("read", "select", "report"):
		if doc_fy:
			return has_fiscal_permission(doc_fy, "view", user=user, check_open=False)
		return can_view_deposits(user=user)
	if perm in ("create", "write"):
		action = "add" if perm == "create" else "edit"
		if doc_fy and not has_fiscal_permission(doc_fy, action, user=user, check_open=True):
			return False
		if doc_date:
			return can_edit_deposits_for_date(cstr(doc_date), user=user)
		return has_any_deposit_edit_role(user=user) and bool(
			get_allowed_fiscal_years(user=user, action=action, only_open=True)
		)
	if perm == "delete":
		if doc_fy:
			return has_fiscal_permission(doc_fy, "delete", user=user, check_open=True)
		return bool(get_allowed_fiscal_years(user=user, action="delete", only_open=True))
	return False


def get_all_screens_access_map(user: str | None = None) -> dict[str, bool]:
	from archive.api.document_authenticity import has_authenticity_screen_access_role
	from archive.services.card_permissions import has_card_permission
	from archive.services.commercial_registry_permissions import (
		has_commercial_registries_screen_access_role,
	)
	from archive.services.operation_permissions import has_operations_screen_access_role
	from archive.services.pending_operation_permissions import has_pending_screen_access_role

	resolved_user = cstr(user or frappe.session.user or "Guest")
	return {
		"archive-cards": has_card_permission("view_cards", user=resolved_user),
		"archive-pending-operations": has_pending_screen_access_role(user=resolved_user),
		"archive-operations": has_operations_screen_access_role(user=resolved_user),
		"archive-deposits": has_deposits_screen_access_role(user=resolved_user),
		"document-authenticity": has_authenticity_screen_access_role(user=resolved_user),
		"archive-commercial-registries": has_commercial_registries_screen_access_role(
			user=resolved_user
		),
	}


def get_archive_role_containers_catalog() -> dict[str, Any]:
	from archive.api.document_authenticity import ROLE_AUTHENTICITY_SCREEN_ACCESS
	from archive.services.card_permissions import (
		ROLE_CARD_EVENT_HISTORY,
		ROLE_CARD_IMAGE_PREVIEW,
		ROLE_CARD_MANAGER,
		ROLE_CARD_OFFICER,
		ROLE_CARD_READER,
		ROLE_CHANGE_CARD_STATUS,
		ROLE_CREATE_CARD,
		ROLE_DELETE_CARD,
		ROLE_EDIT_CARD,
		ROLE_EDIT_CARD_IMAGES,
		ROLE_ENFORCE_CARD_IMAGE_BLUR,
		ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD,
		ROLE_TRANSFER_CARD,
		ROLE_VIEW_CARD_ACTIVITY_TIMELINE,
		ROLE_VIEW_CARD_IMAGES,
		ROLE_VIEW_CARD_PIN,
		ROLE_VIEW_CARD_TRANSFER_TIMELINE,
		ROLE_VIEW_CARDS,
	)
	from archive.services.operation_permissions import (
		ROLE_ATTACH_INCOMPLETE_INVOICE,
		ROLE_EDIT_IMPORTED_OPERATION_FIELDS,
		ROLE_OPERATIONS_SCREEN_ACCESS,
		ROLE_PREVIEW_OPERATION_ATTACHMENTS,
		ROLE_VIEW_OPERATION_TIMELINE,
	)
	from archive.services.pending_operation_permissions import (
		ROLE_ADD_PENDING_RETURN,
		ROLE_CHANGE_PENDING_FAILURE_STATUS,
		ROLE_CLOSE_REOPEN_PENDING_OPERATION,
		ROLE_CORRECT_PENDING_LEDGER,
		ROLE_CREATE_PENDING_OPERATION,
		ROLE_EDIT_ALL_PENDING_OPERATIONS,
		ROLE_EDIT_OWN_PENDING_OPERATIONS,
		ROLE_PENDING_SCREEN_ACCESS,
		ROLE_VIEW_ALL_PENDING_OPERATIONS,
		ROLE_VIEW_OWN_PENDING_OPERATIONS,
		ROLE_VIEW_PENDING_OPERATION_TIMELINE,
	)
	from archive.services.commercial_registry_permissions import (
		COMMERCIAL_REGISTRY_DOCTYPE,
		COMMERCIAL_REGISTRY_ROLES,
		ROLE_COMMERCIAL_REGISTRY_SCREEN_ACCESS,
	)

	deprecated_roles = (
		ROLE_CARD_MANAGER,
		ROLE_CARD_OFFICER,
		ROLE_CARD_READER,
		"موظف المعلقات",
		"مشرف المعلقات",
		"مدقق المعلقات المالي",
		"قارئ المعلقات",
	)
	system_roles = {"System Manager", "Administrator", "All", "Guest", "Desk User"}

	enabled_roles = set(
		frappe.get_all("Role", filters={"disabled": 0}, pluck="name")
	)

	raw_containers = [
		{
			"id": "cards",
			"title": "إدارة البطاقات",
			"icon": "credit-card",
			"doctype": "Archive Card",
			"entry_role": ROLE_VIEW_CARDS,
			"roles": [
				ROLE_VIEW_CARDS,
				ROLE_VIEW_CARD_IMAGES,
				ROLE_CARD_IMAGE_PREVIEW,
				ROLE_VIEW_CARD_PIN,
				ROLE_CREATE_CARD,
				ROLE_EDIT_CARD,
				ROLE_EDIT_CARD_IMAGES,
				ROLE_DELETE_CARD,
				ROLE_CHANGE_CARD_STATUS,
				ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD,
				ROLE_TRANSFER_CARD,
				ROLE_ENFORCE_CARD_IMAGE_BLUR,
				ROLE_VIEW_CARD_TRANSFER_TIMELINE,
				ROLE_CARD_EVENT_HISTORY,
				ROLE_VIEW_CARD_ACTIVITY_TIMELINE,
			],
		},
		{
			"id": "pending_operations",
			"title": "العمليات المعلقة",
			"icon": "clock",
			"doctype": "Archive Pending Operation",
			"entry_role": ROLE_PENDING_SCREEN_ACCESS,
			"roles": [
				ROLE_PENDING_SCREEN_ACCESS,
				ROLE_VIEW_OWN_PENDING_OPERATIONS,
				ROLE_VIEW_ALL_PENDING_OPERATIONS,
				ROLE_CREATE_PENDING_OPERATION,
				ROLE_EDIT_OWN_PENDING_OPERATIONS,
				ROLE_EDIT_ALL_PENDING_OPERATIONS,
				ROLE_CHANGE_PENDING_FAILURE_STATUS,
				ROLE_CLOSE_REOPEN_PENDING_OPERATION,
				ROLE_ADD_PENDING_RETURN,
				ROLE_CORRECT_PENDING_LEDGER,
				ROLE_VIEW_PENDING_OPERATION_TIMELINE,
			],
		},
		{
			"id": "operations",
			"title": "إدارة العمليات",
			"icon": "layers",
			"doctype": "Archive Operation",
			"entry_role": ROLE_OPERATIONS_SCREEN_ACCESS,
			"roles": [
				ROLE_OPERATIONS_SCREEN_ACCESS,
				"Archive Viewer",
				"Archive Creator",
				"Archive Editor",
				"Archive Initial Status",
				"Archive Advanced Status",
				"Archive Attachment Manager",
				"Archive Final Swift",
				ROLE_PREVIEW_OPERATION_ATTACHMENTS,
				ROLE_ATTACH_INCOMPLETE_INVOICE,
				ROLE_VIEW_OPERATION_TIMELINE,
				ROLE_EDIT_IMPORTED_OPERATION_FIELDS,
			],
		},
		{
			"id": "deposits",
			"title": "الإيداعات",
			"icon": "wallet",
			"doctype": "Archive Card Deposit",
			"entry_role": ROLE_DEPOSITS_VIEW,
			"roles": [
				ROLE_DEPOSITS_VIEW,
				ROLE_DEPOSITS_EDIT_TODAY,
				ROLE_DEPOSITS_EDIT_PAST,
				ROLE_DEPOSITS_EDIT_FUTURE,
				ROLE_DEPOSITS_APPROVE,
				ROLE_DEPOSITS_STOPPED_REASON,
			],
		},
		{
			"id": "document_authenticity",
			"title": "فحص المستندات",
			"icon": "shield-check",
			"doctype": "Archive Document Authenticity Check",
			"entry_role": ROLE_AUTHENTICITY_SCREEN_ACCESS,
			"roles": [
				ROLE_AUTHENTICITY_SCREEN_ACCESS,
				"archive document authenticity history",
				"archive document authenticity all history",
				"archive document authenticity check",
				"archive document authenticity technical details",
				"archive document authenticity manager",
			],
		},
		{
			"id": "commercial_registries",
			"title": "السجلات التجارية",
			"icon": "file-text",
			"doctype": COMMERCIAL_REGISTRY_DOCTYPE,
			"entry_role": ROLE_COMMERCIAL_REGISTRY_SCREEN_ACCESS,
			"roles": list(COMMERCIAL_REGISTRY_ROLES),
		},
	]

	doctype_to_container = {c["doctype"]: c for c in raw_containers if c.get("doctype")}
	archive_doctypes = frappe.get_all("DocType", filters={"module": "Archive"}, pluck="name")
	other_archive_roles: list[str] = []

	if archive_doctypes:
		for perm_table in ("DocPerm", "Custom DocPerm"):
			rows = frappe.get_all(
				perm_table,
				filters={"parent": ["in", archive_doctypes]},
				fields=["parent", "role"],
				 order_by="idx asc",
			)
			for row in rows:
				role_name = cstr(row.get("role")).strip()
				if (
					not role_name
					or role_name in system_roles
					or role_name in deprecated_roles
				):
					continue
				target_container = doctype_to_container.get(row.get("parent"))
				if target_container is not None:
					if role_name not in target_container["roles"]:
						target_container["roles"].append(role_name)
				else:
					if role_name not in other_archive_roles:
						other_archive_roles.append(role_name)

	seen_roles: set[str] = set()
	containers: list[dict[str, Any]] = []
	for item in raw_containers:
		filtered_roles: list[str] = []
		for role_name in item["roles"]:
			if role_name in enabled_roles and role_name not in seen_roles:
				filtered_roles.append(role_name)
				seen_roles.add(role_name)
		containers.append(
			{
				"id": item["id"],
				"title": item["title"],
				"icon": item["icon"],
				"entry_role": item["entry_role"] if item["entry_role"] in filtered_roles else (filtered_roles[0] if filtered_roles else ""),
				"roles": filtered_roles,
			}
		)

	extra_roles = [
		r for r in other_archive_roles if r in enabled_roles and r not in seen_roles
	]
	if extra_roles:
		containers.append(
			{
				"id": "other_archive",
				"title": "صلاحيات أخرى للأرشفة",
				"icon": "grid",
				"entry_role": "",
				"roles": extra_roles,
			}
		)

	return {
		"containers": containers,
		"deprecated_roles": [r for r in deprecated_roles if r in enabled_roles],
	}


def extend_deposits_bootinfo(bootinfo: Any) -> None:
	user = cstr(frappe.session.user or "Guest")
	screen_access = get_all_screens_access_map(user=user)
	has_access = screen_access["archive-deposits"]
	bootinfo["archive_can_access_deposits"] = has_access
	bootinfo["archive_screen_access"] = screen_access
	bootinfo["archive_role_containers"] = get_archive_role_containers_catalog()
	if isinstance(bootinfo.get("allowed_pages"), dict):
		for page_name, allowed in screen_access.items():
			if not allowed:
				bootinfo["allowed_pages"].pop(page_name, None)


def _extract_request_target_doctypes() -> set[str]:
	targets: set[str] = set()
	form_dict = getattr(frappe.local, "form_dict", None) or {}
	for key in ("doctype", "dt", "ref_doctype", "reference_doctype"):
		val = form_dict.get(key)
		if isinstance(val, str) and val.strip():
			targets.add(val.strip())

	raw_doc = form_dict.get("doc")
	if raw_doc:
		parsed_doc = _parse_json_arg(raw_doc, None)
		if isinstance(parsed_doc, dict) and parsed_doc.get("doctype"):
			targets.add(cstr(parsed_doc.get("doctype")).strip())

	req = getattr(frappe.local, "request", None)
	if req:
		args = getattr(req, "args", None) or {}
		for key in ("doctype", "dt", "ref_doctype", "reference_doctype"):
			val = args.get(key)
			if isinstance(val, str) and val.strip():
				targets.add(val.strip())
		try:
			if getattr(req, "is_json", False):
				json_body = req.get_json(silent=True)
				if isinstance(json_body, dict):
					for key in ("doctype", "dt", "ref_doctype", "reference_doctype"):
						val = json_body.get(key)
						if isinstance(val, str) and val.strip():
							targets.add(val.strip())
					inner_doc = _parse_json_arg(json_body.get("doc"), None)
					if isinstance(inner_doc, dict) and inner_doc.get("doctype"):
						targets.add(cstr(inner_doc.get("doctype")).strip())
		except Exception:
			pass
	return targets


def enforce_deposits_request_guard() -> None:
	"""
	Blocks direct and alternative HTTP endpoints targeting `archive-deposits` or
	`Archive Card Deposit` (including Frappe REST / reportview / client / desk_page endpoints)
	when the session user does not explicitly hold `ROLE_DEPOSITS_SCREEN_ACCESS` in `Has Role`
	— preventing Administrator or System Manager implicit Frappe bypasses.
	"""
	req = getattr(frappe.local, "request", None)
	if not req:
		return

	raw_path = unquote(cstr(getattr(req, "path", "") or "")).strip()
	if not raw_path:
		return

	form_dict = getattr(frappe.local, "form_dict", None) or {}
	req_args = getattr(req, "args", None) or {}
	http_method = cstr(getattr(req, "method", "GET") or "GET").upper()
	cmd_name = cstr(form_dict.get("cmd") or "").strip()

	# 1. Direct calls to screen APIs
	if "archive.api.deposits." in raw_path or cmd_name.startswith("archive.api.deposits."):
		require_deposits_screen_access()
		return

	if any(
		prefix in raw_path or cmd_name.startswith(prefix)
		for prefix in (
			"archive.api.cards.",
			"archive.api.card_timeline.",
			"archive.api.card_family.",
		)
	):
		from archive.services.card_permissions import require_card_permission

		require_card_permission("view_cards")
		return

	if any(
		prefix in raw_path or cmd_name.startswith(prefix)
		for prefix in (
			"archive.api.pending_operations.",
			"archive.api.pending_operation_timeline.",
			"archive.api.pending_operation_attachments.",
			"archive.api.pending_lookups.",
		)
	):
		from archive.services.pending_operation_permissions import require_pending_screen_access

		require_pending_screen_access()
		return

	if any(
		prefix in raw_path or cmd_name.startswith(prefix)
		for prefix in (
			"archive.api.operations.",
			"archive.api.operation_timeline.",
			"archive.api.operation_documents.",
			"archive.api.pdf_parser.",
		)
	):
		from archive.services.operation_permissions import require_operations_screen_access

		require_operations_screen_access()
		return

	if "archive.api.document_authenticity." in raw_path or cmd_name.startswith(
		"archive.api.document_authenticity."
	):
		from archive.api.document_authenticity import require_authenticity_screen_access

		require_authenticity_screen_access()
		return

	if "archive.api.commercial_registries." in raw_path or cmd_name.startswith(
		"archive.api.commercial_registries."
	):
		from archive.services.commercial_registry_permissions import (
			require_commercial_registries_screen_access,
		)

		require_commercial_registries_screen_access()
		return

	# 2. Direct REST v1/v2 access to Archive Card Deposit or Archive Commercial Registry
	lower_path = raw_path.lower()
	if (
		"/api/resource/archive card deposit" in lower_path
		or "/api/v2/document/archive card deposit" in lower_path
	):
		require_deposits_screen_access()
		if http_method not in ("GET", "HEAD", "OPTIONS"):
			frappe.throw(
				_("لا يُسمح بتعديل أو حذف سجلات الإيداعات مباشرة عبر REST."),
				frappe.PermissionError,
			)
		return

	if (
		"/api/resource/archive commercial registry" in lower_path
		or "/api/v2/document/archive commercial registry" in lower_path
	):
		from archive.services.commercial_registry_permissions import (
			require_commercial_registries_screen_access,
		)

		require_commercial_registries_screen_access()
		if http_method not in ("GET", "HEAD", "OPTIONS"):
			frappe.throw(
				_("لا يُسمح بتعديل أو حذف السجلات التجارية مباشرة عبر REST."),
				frappe.PermissionError,
			)
		return

	# 3. Direct Desk Page loader for the Archive screens
	if "frappe.desk.desk_page.getpage" in raw_path or cmd_name == "frappe.desk.desk_page.getpage":
		page_name = cstr(form_dict.get("name") or req_args.get("name") or "").strip()
		if page_name == "archive-deposits":
			require_deposits_screen_access()
			return
		if page_name == "archive-cards":
			from archive.services.card_permissions import require_card_permission

			require_card_permission("view_cards")
			return
		if page_name == "archive-pending-operations":
			from archive.services.pending_operation_permissions import require_pending_screen_access

			require_pending_screen_access()
			return
		if page_name == "archive-operations":
			from archive.services.operation_permissions import require_operations_screen_access

			require_operations_screen_access()
			return
		if page_name == "document-authenticity":
			from archive.api.document_authenticity import require_authenticity_screen_access

			require_authenticity_screen_access()
			return
		if page_name == "archive-commercial-registries":
			from archive.services.commercial_registry_permissions import (
				require_commercial_registries_screen_access,
			)

			require_commercial_registries_screen_access()
			return

	# 4. Generic Frappe RPC endpoints querying or mutating Archive Card Deposit, Archive Commercial Registry, or User day limits
	if raw_path.startswith("/api/method/"):
		target_doctypes = _extract_request_target_doctypes()
		if "Archive Commercial Registry" in target_doctypes:
			from archive.services.commercial_registry_permissions import (
				require_commercial_registries_screen_access,
			)

			require_commercial_registries_screen_access()
			write_rpc_markers = (
				"frappe.client.insert",
				"frappe.client.save",
				"frappe.client.set_value",
				"frappe.client.delete",
				"frappe.client.rename_doc",
				"frappe.desk.form.save.savedocs",
			)
			if any(m in raw_path or cmd_name == m for m in write_rpc_markers):
				frappe.throw(
					_("لا يُسمح بتعديل أو حذف السجلات التجارية خارج مسار الحفظ المعتمد."),
					frappe.PermissionError,
				)
			return
		if DEPOSIT_DOCTYPE in target_doctypes:
			require_deposits_screen_access()
			write_rpc_markers = (
				"frappe.client.insert",
				"frappe.client.save",
				"frappe.client.set_value",
				"frappe.client.delete",
				"frappe.client.rename_doc",
				"frappe.desk.form.save.savedocs",
			)
			if any(m in raw_path or cmd_name == m for m in write_rpc_markers):
				frappe.throw(
					_("لا يُسمح بتعديل أو حذف سجلات الإيداعات خارج مسار الحفظ المعتمد."),
					frappe.PermissionError,
				)
			return

		if "User" in target_doctypes and (
			"frappe.client.set_value" in raw_path or cmd_name == "frappe.client.set_value"
		):
			raw_fieldname = form_dict.get("fieldname")
			parsed_fieldname = _parse_json_arg(raw_fieldname, raw_fieldname)
			touched_day_field = False
			if isinstance(parsed_fieldname, str):
				touched_day_field = parsed_fieldname.strip() in USER_DEPOSIT_DAY_FIELDS
			elif isinstance(parsed_fieldname, dict):
				touched_day_field = any(k in parsed_fieldname for k in USER_DEPOSIT_DAY_FIELDS)
			if touched_day_field:
				acting_user = cstr(frappe.session.user or "Guest").strip()
				target_user = cstr(form_dict.get("name") or "").strip()
				if not is_user_deposit_settings_admin(user=acting_user) or (
					acting_user != "Administrator" and target_user == acting_user
				):
					frappe.throw(
						_(
							"لا يُسمح بتعديل حدود أيام تعديل الإيداعات إلا من قِبل المسؤول المخوّل بإدارة المستخدمين."
						),
						frappe.PermissionError,
					)


def format_financial_amount(value: Any, zero_as_zero: bool = True) -> str:
	num = flt(value, 2)
	if abs(num) < 0.0001:
		return "0" if zero_as_zero else ""
	if abs(num - round(num)) < 0.0001:
		return f"{int(round(num)):,}"
	return f"{num:,.2f}"


def _parse_json_arg(raw: Any, default: Any) -> Any:
	if raw is None or raw == "":
		return default
	if isinstance(raw, (dict, list)):
		return raw
	if isinstance(raw, str):
		try:
			parsed = json.loads(raw)
			return parsed if parsed is not None else default
		except Exception:
			return default
	return default


def _resolve_valid_date(raw_date: str | None) -> str:
	if not raw_date or not cstr(raw_date).strip():
		return cstr(today())
	clean = cstr(raw_date).strip()
	try:
		parsed = getdate(clean)
	except Exception:
		frappe.throw(_("تاريخ الإيداعات غير صالح."), frappe.ValidationError)
	if not parsed:
		frappe.throw(_("تاريخ الإيداعات غير صالح."), frappe.ValidationError)
	return cstr(parsed)


def _validate_and_clean_amount(raw_amount: Any, card_label: str = "") -> float:
	label_prefix = f" ({card_label})" if card_label else ""
	if raw_amount is None or isinstance(raw_amount, bool):
		frappe.throw(
			_("قيمة مبلغ الإيداع غير صالحة{0}.").format(label_prefix),
			frappe.ValidationError,
		)

	if isinstance(raw_amount, str):
		cleaned = raw_amount.replace(",", "").strip()
		if cleaned == "":
			return 0.0
		if not re.match(r"^\d+(\.\d{1,2})?$", cleaned):
			frappe.throw(
				_("مبلغ الإيداع يجب أن يكون رقماً موجباً صالحاً بحد أقصى منزلتين عشريتين{0}.").format(
					label_prefix
				),
				frappe.ValidationError,
			)
		try:
			val = float(cleaned)
		except ValueError:
			frappe.throw(
				_("مبلغ الإيداع غير صالح{0}.").format(label_prefix),
				frappe.ValidationError,
			)
	elif isinstance(raw_amount, (int, float)):
		val = float(raw_amount)
	else:
		frappe.throw(
			_("قيمة مبلغ الإيداع غير صالحة{0}.").format(label_prefix),
			frappe.ValidationError,
		)

	if not math.isfinite(val) or val < 0:
		frappe.throw(
			_("لا يُسمح بإدخال مبلغ إيداع سالب أو غير صالح{0}.").format(label_prefix),
			frappe.ValidationError,
		)

	# Reject > 2 decimal places when passed as float
	rounded = round(val, 2)
	if abs(val - rounded) > 1e-6:
		frappe.throw(
			_("مبلغ الإيداع يجب ألا يتجاوز منزلتين عشريتين{0}.").format(label_prefix),
			frappe.ValidationError,
		)

	if rounded > 999_999_999_999.99:
		frappe.throw(
			_("مبلغ الإيداع يتجاوز الحد المسموح به{0}.").format(label_prefix),
			frappe.ValidationError,
		)

	return flt(rounded, 2)


def _fetch_masters() -> dict[str, list[dict[str, Any]]]:
	banks = frappe.get_all(
		"Archive Bank",
		fields=["name", "bank_name"],
		order_by="bank_name asc",
	)
	representatives = frappe.get_all(
		"Archive Representative",
		fields=["name", "representative_name"],
		order_by="representative_name asc",
	)
	regions = frappe.get_all(
		"Archive Region",
		fields=["name", "region_name"],
		order_by="region_name asc",
	)
	raw_owners = frappe.get_all(
		"Archive Account",
		fields=["name", "account_name"],
		order_by="account_name asc",
	)
	card_owners = [
		{
			"name": r.get("name"),
			"account_name": r.get("account_name") or r.get("name"),
			"card_owner_name": r.get("account_name") or r.get("name"),
		}
		for r in raw_owners
		if r.get("name")
	]
	return {
		"banks": banks,
		"representatives": representatives,
		"regions": regions,
		"card_owners": card_owners,
	}


def _resolve_user_full_names(user_ids: set[str]) -> dict[str, str]:
	clean_ids = [u for u in user_ids if u]
	if not clean_ids:
		return {}
	rows = frappe.get_all(
		"User",
		filters={"name": ["in", clean_ids]},
		fields=["name", "full_name"],
	)
	result: dict[str, str] = {}
	for r in rows:
		result[r.name] = cstr(r.full_name or r.name).strip()
	for u in clean_ids:
		if u not in result:
			result[u] = u
	return result


def _resolve_deposit_group_key(
	base_card_name: Any,
	account_number_normalized: Any,
	account_number: Any,
	bank: Any,
	fallback_card_id: str,
) -> str:
	norm = cstr(account_number_normalized or "").strip() or normalize_account_number(
		cstr(account_number or "")
	)
	if not norm:
		return f"__card__:{fallback_card_id}"
	return make_deposit_group_key(base_card_name, norm, bank)


def _resolve_account_limits_and_consumption(
	norm_accounts: set[str],
	deposit_date: str,
	today_str: str,
) -> dict[str, dict[str, Any]]:
	if not norm_accounts:
		return {}

	norms_tuple = tuple(sorted(norm_accounts))
	card_rows = frappe.db.sql(
		"""
		SELECT
			name,
			base_card_name,
			account_number,
			account_number_normalized,
			bank,
			IFNULL(card_type, '') AS card_type,
			daily_limit
		FROM `tabArchive Card`
		WHERE account_number_normalized IN %(norms)s
		  AND IFNULL(is_deleted, 0) = 0
		""",
		{"norms": norms_tuple},
		as_dict=True,
	)

	groups: dict[str, dict[str, Any]] = {}

	def _ensure_group(g_key: str) -> dict[str, Any]:
		return groups.setdefault(
			g_key,
			{
				"business_limits": set(),
				"mada_limits": set(),
				"legacy_limits": set(),
				"business_snaps": set(),
				"mada_snaps": set(),
				"legacy_snaps": set(),
				"business_saved_total": 0.0,
				"mada_saved_total": 0.0,
				"legacy_saved_total": 0.0,
				"has_business": False,
				"has_mada": False,
				"has_legacy": False,
			},
		)

	for cr in card_rows:
		g_key = _resolve_deposit_group_key(
			cr.get("base_card_name"),
			cr.get("account_number_normalized"),
			cr.get("account_number"),
			cr.get("bank"),
			cstr(cr.get("name")),
		)
		entry = _ensure_group(g_key)
		c_type = clean_card_type(cr.get("card_type"))
		l_val = flt(cr.get("daily_limit"), 2)
		if c_type == CARD_TYPE_BUSINESS:
			entry["has_business"] = True
			if l_val > 0:
				entry["business_limits"].add(l_val)
		elif c_type == CARD_TYPE_MADA:
			entry["has_mada"] = True
			if l_val > 0:
				entry["mada_limits"].add(l_val)
		else:
			entry["has_legacy"] = True
			if l_val > 0:
				entry["legacy_limits"].add(l_val)

	deposit_rows = frappe.db.sql(
		"""
		SELECT
			c.name AS card_id,
			COALESCE(NULLIF(d.base_card_name_snapshot, ''), c.base_card_name) AS base_card_name,
			c.account_number,
			c.account_number_normalized,
			COALESCE(NULLIF(d.bank_snapshot, ''), c.bank) AS bank,
			COALESCE(NULLIF(d.card_type_snapshot, ''), IFNULL(c.card_type, '')) AS card_type,
			d.deposit_amount,
			d.daily_limit_snapshot
		FROM `tabArchive Card Deposit` d
		INNER JOIN `tabArchive Card` c ON c.name = d.card
		WHERE d.deposit_date = %(deposit_date)s
		  AND c.account_number_normalized IN %(norms)s
		""",
		{"deposit_date": deposit_date, "norms": norms_tuple},
		as_dict=True,
	)

	is_past_date = deposit_date < today_str
	for dr in deposit_rows:
		g_key = _resolve_deposit_group_key(
			dr.get("base_card_name"),
			dr.get("account_number_normalized"),
			dr.get("account_number"),
			dr.get("bank"),
			cstr(dr.get("card_id")),
		)
		entry = _ensure_group(g_key)
		c_type = clean_card_type(dr.get("card_type"))
		amt = max(0.0, flt(dr.get("deposit_amount") or 0, 2))
		snap = dr.get("daily_limit_snapshot")
		snap_val = flt(snap, 2) if snap is not None and flt(snap, 2) > 0 else 0.0
		if c_type == CARD_TYPE_BUSINESS:
			entry["business_saved_total"] = flt(entry["business_saved_total"] + amt, 2)
			if snap_val > 0:
				entry["business_snaps"].add(snap_val)
			if is_past_date and snap_val > 0:
				entry["has_business"] = True
		elif c_type == CARD_TYPE_MADA:
			entry["mada_saved_total"] = flt(entry["mada_saved_total"] + amt, 2)
			if snap_val > 0:
				entry["mada_snaps"].add(snap_val)
			if is_past_date and snap_val > 0:
				entry["has_mada"] = True
		else:
			entry["legacy_saved_total"] = flt(entry["legacy_saved_total"] + amt, 2)
			if snap_val > 0:
				entry["legacy_snaps"].add(snap_val)
			if is_past_date and snap_val > 0:
				entry["has_legacy"] = True

	result: dict[str, dict[str, Any]] = {}
	for g_key, entry in groups.items():
		b_cur = sorted(entry["business_limits"])
		m_cur = sorted(entry["mada_limits"])
		l_cur = sorted(entry["legacy_limits"])
		b_snaps = sorted(entry["business_snaps"])
		m_snaps = sorted(entry["mada_snaps"])
		l_snaps = sorted(entry["legacy_snaps"])

		if is_past_date and b_snaps:
			b_limit = b_snaps[0] if len(b_snaps) == 1 else min(b_snaps)
			b_conflict = False
		else:
			b_limit = b_cur[0] if len(b_cur) == 1 else (min(b_cur) if b_cur else 0.0)
			b_conflict = len(b_cur) > 1

		if is_past_date and m_snaps:
			m_limit = m_snaps[0] if len(m_snaps) == 1 else min(m_snaps)
			m_conflict = False
		else:
			m_limit = m_cur[0] if len(m_cur) == 1 else (min(m_cur) if m_cur else 0.0)
			m_conflict = len(m_cur) > 1

		if is_past_date and l_snaps:
			l_limit = l_snaps[0] if len(l_snaps) == 1 else min(l_snaps)
			l_conflict = False
		else:
			l_limit = l_cur[0] if len(l_cur) == 1 else (min(l_cur) if l_cur else 0.0)
			l_conflict = len(l_cur) > 1

		has_b = bool(entry["has_business"])
		has_m = bool(entry["has_mada"])
		d_a = flt(entry["business_saved_total"], 2)
		d_m = flt(entry["mada_saved_total"], 2)
		d_l = flt(entry["legacy_saved_total"], 2)
		total_saved = flt(d_a + d_m + d_l, 2)

		if has_b and has_m:
			rem_b = max(0.0, flt(b_limit - d_a - d_m, 2))
			rem_m = max(0.0, flt(min(flt(m_limit - d_m, 2), flt(b_limit - d_a - d_m, 2)), 2))
			group_target = b_limit
		elif has_b:
			rem_b = max(0.0, flt(b_limit - d_a, 2))
			rem_m = 0.0
			group_target = b_limit
		elif has_m:
			rem_b = 0.0
			rem_m = max(0.0, flt(m_limit - d_m, 2))
			group_target = m_limit
		else:
			rem_b = 0.0
			rem_m = 0.0
			group_target = l_limit

		rem_l = (
			max(0.0, flt(b_limit - d_a - d_m - d_l, 2))
			if has_b
			else max(0.0, flt(l_limit - d_l, 2))
		)

		result[g_key] = {
			"has_business": has_b,
			"has_mada": has_m,
			"business_limit": b_limit,
			"mada_limit": m_limit,
			"legacy_limit": l_limit,
			"business_saved_total": d_a,
			"mada_saved_total": d_m,
			"legacy_saved_total": d_l,
			"account_saved_total": total_saved,
			"remaining_business": rem_b,
			"remaining_mada": rem_m,
			"remaining_legacy": rem_l,
			"group_daily_target": group_target,
			"business_conflict": b_conflict,
			"mada_conflict": m_conflict,
			"legacy_conflict": l_conflict,
		}
	return result


def _build_user_temporal_permission_evaluator(user: str | None = None) -> Any:
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	has_screen = has_deposits_screen_access_role(user=resolved_user)
	has_edit_today = _has_explicit_user_role(ROLE_DEPOSITS_EDIT_TODAY, user=resolved_user)
	has_edit_past = _has_explicit_user_role(ROLE_DEPOSITS_EDIT_PAST, user=resolved_user)
	has_edit_future = _has_explicit_user_role(ROLE_DEPOSITS_EDIT_FUTURE, user=resolved_user)
	has_approve_role = has_deposit_approval_role(user=resolved_user)
	has_stopped_role = has_deposit_stopped_reason_role(user=resolved_user)

	all_limits = get_all_user_deposit_day_limits(user=resolved_user)
	dep_past = all_limits.get(USER_PAST_DAYS_FIELD, 0)
	dep_future = all_limits.get(USER_FUTURE_DAYS_FIELD, 0)
	app_past = all_limits.get(USER_PAST_APPROVAL_DAYS_FIELD, 0)
	app_future = all_limits.get(USER_FUTURE_APPROVAL_DAYS_FIELD, 0)
	stp_past = all_limits.get(USER_PAST_STOPPED_REASON_DAYS_FIELD, 0)
	stp_future = all_limits.get(USER_FUTURE_STOPPED_REASON_DAYS_FIELD, 0)

	fy_map = get_user_fiscal_permissions_map(user=resolved_user)
	closed_years: set[str] = set()
	if frappe.db.table_exists("Archive Fiscal Year"):
		for r in frappe.get_all(
			"Archive Fiscal Year",
			fields=["year_name", "is_closed"],
		):
			if cint(r.get("is_closed")):
				closed_years.add(cstr(r.get("year_name")))

	server_today_dt = getdate(today())
	memo: dict[str, dict[str, Any]] = {}

	def evaluate(d_str: str) -> dict[str, Any]:
		if d_str in memo:
			return memo[d_str]
		if not has_screen:
			res = {
				"can_view_fy": False,
				"can_edit_amount": False,
				"can_toggle_stopped": False,
				"can_approve": False,
				"fiscal_year": "",
				"fiscal_year_is_closed": True,
			}
			memo[d_str] = res
			return res

		target_dt = getdate(d_str)
		fy = f"{target_dt.year:04d}"
		fy_perms = fy_map.get(fy) or {}
		is_closed = fy in closed_years
		can_view_fy = bool(fy_perms.get("can_view"))
		can_mutate_fy = (not is_closed) and bool(
			fy_perms.get("can_add") or fy_perms.get("can_edit")
		)
		can_act_open_fy = (not is_closed) and can_view_fy

		delta_days = (target_dt - server_today_dt).days

		if delta_days == 0:
			win_edit = has_edit_today
			win_approve = has_approve_role
			win_stopped = has_stopped_role
		elif delta_days < 0:
			p_days = -delta_days
			win_edit = has_edit_past and dep_past > 0 and p_days <= dep_past
			win_approve = has_approve_role and app_past > 0 and p_days <= app_past
			win_stopped = has_stopped_role and stp_past > 0 and p_days <= stp_past
		else:
			win_edit = has_edit_future and dep_future > 0 and delta_days <= dep_future
			win_approve = has_approve_role and app_future > 0 and delta_days <= app_future
			win_stopped = has_stopped_role and stp_future > 0 and delta_days <= stp_future

		res = {
			"can_view_fy": can_view_fy,
			"can_edit_amount": bool(can_mutate_fy and win_edit),
			"can_toggle_stopped": bool(can_act_open_fy and win_stopped),
			"can_approve": bool(can_act_open_fy and win_approve),
			"fiscal_year": fy,
			"fiscal_year_is_closed": is_closed,
		}
		memo[d_str] = res
		return res

	return evaluate


def _iter_date_strings(start_date: str, end_date: str) -> list[str]:
	cur = getdate(start_date)
	end = getdate(end_date)
	dates: list[str] = []
	while cur <= end:
		dates.append(cur.strftime("%Y-%m-%d"))
		cur += timedelta(days=1)
	return dates


def _hydrate_row_audit(row: dict[str, Any], user_names: dict[str, str]) -> None:
	if not row.get("has_saved_record") or row.get("audit") is not None:
		return
	raw_dep = row.get("_raw_dep")
	if not raw_dep:
		return
	recorded_by = cstr(raw_dep.get("recorded_by") or "")
	last_modified_by = cstr(raw_dep.get("last_modified_by") or "")
	approved_by = cstr(raw_dep.get("approved_by") or "")
	unapproved_by = cstr(raw_dep.get("unapproved_by") or "")
	stopped_reason_by = cstr(raw_dep.get("stopped_reason_by") or "")
	audit_history = _parse_json_arg(raw_dep.get("audit_history_json"), [])
	row["audit"] = {
		"recorded_by": recorded_by,
		"recorded_by_name": user_names.get(recorded_by, recorded_by) if recorded_by else "",
		"recorded_at": _format_audit_datetime(raw_dep.get("recorded_at")),
		"last_modified_by": last_modified_by,
		"last_modified_by_name": (
			user_names.get(last_modified_by, last_modified_by) if last_modified_by else ""
		),
		"last_modified_at": _format_audit_datetime(raw_dep.get("last_modified_at")),
		"approved_by": approved_by,
		"approved_by_name": user_names.get(approved_by, approved_by) if approved_by else "",
		"approved_at": _format_audit_datetime(raw_dep.get("approved_at")),
		"approved_amount": flt(raw_dep.get("approved_amount") or 0, 2),
		"unapproved_by": unapproved_by,
		"unapproved_by_name": user_names.get(unapproved_by, unapproved_by) if unapproved_by else "",
		"unapproved_at": _format_audit_datetime(raw_dep.get("unapproved_at")),
		"stopped_reason_by": stopped_reason_by,
		"stopped_reason_by_name": (
			user_names.get(stopped_reason_by, stopped_reason_by) if stopped_reason_by else ""
		),
		"stopped_reason_at": _format_audit_datetime(raw_dep.get("stopped_reason_at")),
		"previous_amount": (
			flt(raw_dep.get("previous_amount"), 2)
			if raw_dep.get("previous_amount") is not None
			else None
		),
		"history_count": len(audit_history) if isinstance(audit_history, list) else 0,
	}


def _load_period_dataset(
	start_date: str,
	end_date: str,
	hydrate_all_audits: bool = False,
	allowed_fiscal_years: set[str] | None = None,
) -> list[dict[str, Any]]:
	"""
	Reconstructs and aggregates daily deposit screens across `[start_date, end_date]`
	using `tabArchive Card State Span` + `tabArchive Card Deposit` in 2 bulk SQL queries.
	"""
	from archive.services.card_audit import ensure_card_state_spans_populated

	ensure_card_state_spans_populated()

	all_dates = _iter_date_strings(start_date, end_date)
	if allowed_fiscal_years is not None:
		all_dates = [d for d in all_dates if d[:4] in allowed_fiscal_years]
	if not all_dates:
		return []

	eff_start = all_dates[0]
	eff_end = all_dates[-1]

	has_span_table = frappe.db.table_exists("Archive Card State Span")
	if has_span_table:
		span_rows = frappe.db.sql(
			"""
			SELECT
				s.name AS span_id,
				s.card AS card_id,
				CAST(s.valid_from AS CHAR) AS valid_from,
				CAST(s.valid_to AS CHAR) AS valid_to,
				s.status AS card_status,
				IFNULL(s.is_active, 0) AS is_active,
				IFNULL(s.is_deleted, 0) AS is_deleted,
				IFNULL(c.serial_no, s.serial_no) AS serial_no,
				s.copy_no,
				COALESCE(NULLIF(s.card_type, ''), IFNULL(c.card_type, '')) AS card_type,
				s.card_name,
				s.base_card_name,
				s.card_number,
				s.account_number,
				s.account_number_normalized,
				s.group_key,
				s.bank,
				COALESCE(b.bank_name, s.bank_name, s.bank) AS bank_name,
				s.representative,
				COALESCE(rep.representative_name, s.representative_name, s.representative) AS representative_name,
				s.region,
				COALESCE(reg.region_name, s.region_name, s.region) AS region_name,
				IFNULL(c.card_owner, '') AS card_owner,
				COALESCE(NULLIF(acc.account_name, ''), NULLIF(co.card_owner_name, ''), IFNULL(c.card_owner, '')) AS card_owner_name,
				s.daily_limit,
				s.history_confidence,
				s.search_norm,
				IFNULL(c.status, s.status) AS current_card_status,
				IFNULL(c.is_deleted, s.is_deleted) AS current_is_deleted
			FROM `tabArchive Card State Span` s
			LEFT JOIN `tabArchive Card` c ON c.name = s.card
			LEFT JOIN `tabArchive Bank` b ON b.name = s.bank
			LEFT JOIN `tabArchive Representative` rep ON rep.name = s.representative
			LEFT JOIN `tabArchive Region` reg ON reg.name = s.region
			LEFT JOIN `tabArchive Account` acc ON acc.name = c.card_owner
			LEFT JOIN `tabArchive Card Owner` co ON co.name = c.card_owner
			WHERE s.valid_from <= %(end_date)s
			  AND s.valid_to >= %(start_date)s
			ORDER BY serial_no DESC, s.card ASC, s.valid_from ASC
			""",
			{"start_date": eff_start, "end_date": eff_end},
			as_dict=True,
		)
	else:
		span_rows = []

	if not span_rows:
		# Fallback if spans table is empty
		fallback_cards = frappe.db.sql(
			"""
			SELECT
				c.name AS span_id,
				c.name AS card_id,
				CAST(DATE(c.creation) AS CHAR) AS valid_from,
				'9999-12-31' AS valid_to,
				c.status AS card_status,
				CASE WHEN IFNULL(c.is_deleted, 0) = 0 AND c.status = %(active_status)s THEN 1 ELSE 0 END AS is_active,
				IFNULL(c.is_deleted, 0) AS is_deleted,
				c.serial_no,
				c.copy_no,
				IFNULL(c.card_type, '') AS card_type,
				c.card_name,
				c.base_card_name,
				c.card_number,
				c.account_number,
				c.account_number_normalized,
				'' AS group_key,
				c.bank,
				b.bank_name,
				c.representative,
				rep.representative_name,
				c.region,
				reg.region_name,
				IFNULL(c.card_owner, '') AS card_owner,
				COALESCE(NULLIF(acc.account_name, ''), NULLIF(co.card_owner_name, ''), IFNULL(c.card_owner, '')) AS card_owner_name,
				c.daily_limit,
				'current_only' AS history_confidence,
				'' AS search_norm,
				c.status AS current_card_status,
				IFNULL(c.is_deleted, 0) AS current_is_deleted
			FROM `tabArchive Card` c
			LEFT JOIN `tabArchive Bank` b ON b.name = c.bank
			LEFT JOIN `tabArchive Representative` rep ON rep.name = c.representative
			LEFT JOIN `tabArchive Region` reg ON reg.name = c.region
			LEFT JOIN `tabArchive Account` acc ON acc.name = c.card_owner
			LEFT JOIN `tabArchive Card Owner` co ON co.name = c.card_owner
			ORDER BY c.serial_no DESC, c.name ASC
			""",
			{"active_status": ACTIVE_CARD_STATUS},
			as_dict=True,
		)
		span_rows = fallback_cards

	# Pre-enrich span rows once (instead of repeating per day)
	for sp in span_rows:
		cid = cstr(sp.get("card_id"))
		c_type = clean_card_type(sp.get("card_type"))
		c_copy = max(1, cint(sp.get("copy_no") or 1))
		c_name = cstr(sp.get("card_name") or "")
		base_name = cstr(sp.get("base_card_name") or c_name)
		acc_num = cstr(sp.get("account_number") or "")
		norm_acc = cstr(sp.get("account_number_normalized") or "").strip() or normalize_account_number(acc_num)
		bank_id = cstr(sp.get("bank") or "")
		bank_name = cstr(sp.get("bank_name") or bank_id)
		rep_id = cstr(sp.get("representative") or "")
		rep_name = cstr(sp.get("representative_name") or rep_id)
		reg_id = cstr(sp.get("region") or "")
		reg_name = cstr(sp.get("region_name") or reg_id)
		owner_id = cstr(sp.get("card_owner") or "")
		owner_name = cstr(sp.get("card_owner_name") or owner_id)
		c_num = cstr(sp.get("card_number") or "")
		d_lim = max(0.0, flt(sp.get("daily_limit") or 0, 2))
		copy_label = format_copy_badge_label(c_type, c_copy)
		g_key = _resolve_deposit_group_key(base_name, norm_acc, acc_num, bank_id, cid)

		sp["_cid"] = cid
		sp["_card_type"] = c_type
		sp["_copy_no"] = c_copy
		sp["_copy_label"] = copy_label
		sp["_card_name"] = c_name
		sp["_base_name"] = base_name
		sp["_card_number"] = c_num
		sp["_account_number"] = acc_num
		sp["_norm_account"] = norm_acc
		sp["_bank"] = bank_id
		sp["_bank_name"] = bank_name
		sp["_rep"] = rep_id
		sp["_rep_name"] = rep_name
		sp["_region"] = reg_id
		sp["_region_name"] = reg_name
		sp["_card_owner"] = owner_id
		sp["_card_owner_name"] = owner_name
		sp["_daily_limit"] = d_lim
		sp["_daily_limit_fmt"] = format_financial_amount(d_lim, zero_as_zero=True)
		sp["_group_key"] = g_key
		sp["_serial_no"] = cint(sp.get("serial_no"))
		sp["_is_active"] = cint(sp.get("is_active")) == 1 and cint(sp.get("is_deleted")) == 0
		sp["_is_non_deleted"] = cint(sp.get("is_deleted")) == 0
		owner_search_norm = normalize_search_text(f"{owner_id} {owner_name}")
		if not sp.get("search_norm"):
			sp["_search_norm"] = normalize_search_text(
				" ".join(
					[
						cid,
						c_name,
						base_name,
						c_type,
						copy_label,
						c_num,
						acc_num,
						norm_acc,
						bank_name,
						rep_name,
						reg_name,
						owner_id,
						owner_name,
						cstr(sp["_serial_no"]),
					]
				)
			)
		else:
			sp["_search_norm"] = (
				f"{cstr(sp.get('search_norm'))} {owner_search_norm}".strip()
				if owner_search_norm
				else cstr(sp.get("search_norm"))
			)

	dep_rows = frappe.db.sql(
		"""
		SELECT
			d.name AS deposit_id,
			d.card AS card_id,
			CAST(d.deposit_date AS CHAR) AS deposit_date,
			d.deposit_amount,
			IFNULL(d.stopped_for_reason, 0) AS stopped_for_reason,
			IFNULL(d.is_approved, 0) AS is_approved,
			d.approved_amount,
			d.approved_by,
			d.approved_at,
			d.unapproved_by,
			d.unapproved_at,
			d.stopped_reason_by,
			d.stopped_reason_at,
			d.daily_limit_snapshot,
			d.previous_amount,
			d.card_name_snapshot,
			d.base_card_name_snapshot,
			d.copy_no_snapshot,
			d.card_type_snapshot,
			d.card_number_snapshot,
			d.account_number_snapshot,
			d.bank_snapshot,
			d.bank_name_snapshot,
			d.representative_snapshot,
			d.representative_name_snapshot,
			d.region_snapshot,
			d.region_name_snapshot,
			d.recorded_by,
			d.recorded_at,
			d.last_modified_by,
			d.last_modified_at,
			d.audit_history_json,
			c.serial_no,
			c.copy_no,
			IFNULL(c.card_type, '') AS card_type,
			c.card_name,
			c.base_card_name,
			c.account_number,
			c.account_number_normalized,
			c.card_number,
			c.bank,
			b.bank_name,
			c.representative,
			rep.representative_name,
			c.region,
			reg.region_name,
			IFNULL(c.card_owner, '') AS card_owner,
			COALESCE(NULLIF(acc.account_name, ''), NULLIF(co.card_owner_name, ''), IFNULL(c.card_owner, '')) AS card_owner_name,
			c.daily_limit,
			c.status AS current_card_status,
			IFNULL(c.is_deleted, 0) AS current_is_deleted
		FROM `tabArchive Card Deposit` d
		LEFT JOIN `tabArchive Card` c ON c.name = d.card
		LEFT JOIN `tabArchive Bank` b ON b.name = c.bank
		LEFT JOIN `tabArchive Representative` rep ON rep.name = c.representative
		LEFT JOIN `tabArchive Region` reg ON reg.name = c.region
		LEFT JOIN `tabArchive Account` acc ON acc.name = c.card_owner
		LEFT JOIN `tabArchive Card Owner` co ON co.name = c.card_owner
		WHERE d.deposit_date BETWEEN %(start_date)s AND %(end_date)s
		ORDER BY d.deposit_date DESC, c.serial_no DESC, d.card ASC
		""",
		{"start_date": eff_start, "end_date": eff_end},
		as_dict=True,
	)

	deposits_by_date: dict[str, dict[str, dict[str, Any]]] = {}
	for dr in dep_rows:
		d_key = cstr(dr.get("deposit_date"))
		c_key = cstr(dr.get("card_id"))
		deposits_by_date.setdefault(d_key, {})[c_key] = dr

	today_str = cstr(today())
	perm_eval = _build_user_temporal_permission_evaluator()

	# Cache group ceiling state for zero-deposit days that share the same span set
	zero_dep_group_cache: dict[tuple[str, ...], dict[str, dict[str, Any]]] = {}

	def _compute_day_groups(
		non_deleted_spans_on_d: list[dict[str, Any]],
		deps_on_d: dict[str, dict[str, Any]],
		is_past_date: bool,
		span_by_card_on_d: dict[str, dict[str, Any]],
	) -> dict[str, dict[str, Any]]:
		if not deps_on_d:
			sig = tuple(cstr(sp.get("span_id")) for sp in non_deleted_spans_on_d)
			cached = zero_dep_group_cache.get(sig)
			if cached is not None:
				return cached

		groups: dict[str, dict[str, Any]] = {}

		def _ensure_grp(gk: str) -> dict[str, Any]:
			return groups.setdefault(
				gk,
				{
					"business_limits": set(),
					"mada_limits": set(),
					"legacy_limits": set(),
					"business_snaps": set(),
					"mada_snaps": set(),
					"legacy_snaps": set(),
					"business_saved_total": 0.0,
					"mada_saved_total": 0.0,
					"legacy_saved_total": 0.0,
					"has_business": False,
					"has_mada": False,
					"has_legacy": False,
					"member_cards": set(),
					"positive_cards": set(),
				},
			)

		for sp in non_deleted_spans_on_d:
			gk = sp["_group_key"]
			entry = _ensure_grp(gk)
			entry["member_cards"].add(sp["_cid"])
			c_type = sp["_card_type"]
			l_val = sp["_daily_limit"]
			if c_type == CARD_TYPE_BUSINESS:
				entry["has_business"] = True
				if l_val > 0:
					entry["business_limits"].add(l_val)
			elif c_type == CARD_TYPE_MADA:
				entry["has_mada"] = True
				if l_val > 0:
					entry["mada_limits"].add(l_val)
			else:
				entry["has_legacy"] = True
				if l_val > 0:
					entry["legacy_limits"].add(l_val)

		for cid, dr in deps_on_d.items():
			sp_ref = span_by_card_on_d.get(cid)
			base_n = cstr(
				dr.get("base_card_name_snapshot")
				or (sp_ref["_base_name"] if sp_ref else dr.get("base_card_name"))
				or ""
			)
			acc_n = cstr(
				dr.get("account_number_snapshot")
				or (sp_ref["_account_number"] if sp_ref else dr.get("account_number"))
				or ""
			)
			norm_n = (
				normalize_account_number(acc_n)
				or (sp_ref["_norm_account"] if sp_ref else cstr(dr.get("account_number_normalized") or ""))
			)
			bnk_n = cstr(
				dr.get("bank_snapshot")
				or (sp_ref["_bank"] if sp_ref else dr.get("bank"))
				or ""
			)
			gk = _resolve_deposit_group_key(base_n, norm_n, acc_n, bnk_n, cid)
			entry = _ensure_grp(gk)
			entry["member_cards"].add(cid)
			c_type = clean_card_type(
				dr.get("card_type_snapshot")
				or (sp_ref["_card_type"] if sp_ref else dr.get("card_type"))
			)
			amt = max(0.0, flt(dr.get("deposit_amount") or 0, 2))
			if amt > 0:
				entry["positive_cards"].add(cid)
			snap = dr.get("daily_limit_snapshot")
			snap_val = flt(snap, 2) if snap is not None and flt(snap, 2) > 0 else 0.0
			if c_type == CARD_TYPE_BUSINESS:
				entry["business_saved_total"] = flt(entry["business_saved_total"] + amt, 2)
				if snap_val > 0:
					entry["business_snaps"].add(snap_val)
				if is_past_date and snap_val > 0:
					entry["has_business"] = True
			elif c_type == CARD_TYPE_MADA:
				entry["mada_saved_total"] = flt(entry["mada_saved_total"] + amt, 2)
				if snap_val > 0:
					entry["mada_snaps"].add(snap_val)
				if is_past_date and snap_val > 0:
					entry["has_mada"] = True
			else:
				entry["legacy_saved_total"] = flt(entry["legacy_saved_total"] + amt, 2)
				if snap_val > 0:
					entry["legacy_snaps"].add(snap_val)
				if is_past_date and snap_val > 0:
					entry["has_legacy"] = True

		res_map: dict[str, dict[str, Any]] = {}
		for gk, entry in groups.items():
			b_cur = sorted(entry["business_limits"])
			m_cur = sorted(entry["mada_limits"])
			l_cur = sorted(entry["legacy_limits"])
			b_snaps = sorted(entry["business_snaps"])
			m_snaps = sorted(entry["mada_snaps"])
			l_snaps = sorted(entry["legacy_snaps"])

			if is_past_date and b_snaps:
				b_limit = b_snaps[0] if len(b_snaps) == 1 else min(b_snaps)
				b_conflict = False
			else:
				b_limit = b_cur[0] if len(b_cur) == 1 else (min(b_cur) if b_cur else 0.0)
				b_conflict = len(b_cur) > 1

			if is_past_date and m_snaps:
				m_limit = m_snaps[0] if len(m_snaps) == 1 else min(m_snaps)
				m_conflict = False
			else:
				m_limit = m_cur[0] if len(m_cur) == 1 else (min(m_cur) if m_cur else 0.0)
				m_conflict = len(m_cur) > 1

			if is_past_date and l_snaps:
				l_limit = l_snaps[0] if len(l_snaps) == 1 else min(l_snaps)
				l_conflict = False
			else:
				l_limit = l_cur[0] if len(l_cur) == 1 else (min(l_cur) if l_cur else 0.0)
				l_conflict = len(l_cur) > 1

			has_b = bool(entry["has_business"])
			has_m = bool(entry["has_mada"])
			d_a = flt(entry["business_saved_total"], 2)
			d_m = flt(entry["mada_saved_total"], 2)
			d_l = flt(entry["legacy_saved_total"], 2)
			total_saved = flt(d_a + d_m + d_l, 2)

			if has_b and has_m:
				rem_b = max(0.0, flt(b_limit - d_a - d_m, 2))
				rem_m = max(0.0, flt(min(flt(m_limit - d_m, 2), flt(b_limit - d_a - d_m, 2)), 2))
				group_target = b_limit
			elif has_b:
				rem_b = max(0.0, flt(b_limit - d_a, 2))
				rem_m = 0.0
				group_target = b_limit
			elif has_m:
				rem_b = 0.0
				rem_m = max(0.0, flt(m_limit - d_m, 2))
				group_target = m_limit
			else:
				rem_b = 0.0
				rem_m = 0.0
				group_target = l_limit

			rem_l = (
				max(0.0, flt(b_limit - d_a - d_m - d_l, 2))
				if has_b
				else max(0.0, flt(l_limit - d_l, 2))
			)

			res_map[gk] = {
				"has_business": has_b,
				"has_mada": has_m,
				"business_limit": b_limit,
				"mada_limit": m_limit,
				"legacy_limit": l_limit,
				"business_saved_total": d_a,
				"mada_saved_total": d_m,
				"legacy_saved_total": d_l,
				"account_saved_total": total_saved,
				"remaining_business": rem_b,
				"remaining_business_fmt": format_financial_amount(rem_b, zero_as_zero=True),
				"remaining_mada": rem_m,
				"remaining_mada_fmt": format_financial_amount(rem_m, zero_as_zero=True),
				"remaining_legacy": rem_l,
				"remaining_legacy_fmt": format_financial_amount(rem_l, zero_as_zero=True),
				"group_daily_target": group_target,
				"business_conflict": b_conflict,
				"mada_conflict": m_conflict,
				"legacy_conflict": l_conflict,
				"group_size": len(entry["member_cards"]),
				"positive_cards_count": len(entry["positive_cards"]),
			}

		if not deps_on_d:
			zero_dep_group_cache[sig] = res_map
		return res_map

	all_items: list[dict[str, Any]] = []

	for d_str in reversed(all_dates):
		is_past_date = d_str < today_str
		d_perms = perm_eval(d_str)
		deps_on_d = deposits_by_date.get(d_str, {})
		d_search_token = f"{d_str} {d_str.replace('-', ' ')}"

		active_spans_on_d: list[dict[str, Any]] = []
		non_deleted_spans_on_d: list[dict[str, Any]] = []
		span_by_card_on_d: dict[str, dict[str, Any]] = {}

		for sp in span_rows:
			if sp["valid_from"] <= d_str <= sp["valid_to"]:
				cid = sp["_cid"]
				span_by_card_on_d[cid] = sp
				if sp["_is_non_deleted"]:
					non_deleted_spans_on_d.append(sp)
				if sp["_is_active"]:
					active_spans_on_d.append(sp)

		day_group_map = _compute_day_groups(
			non_deleted_spans_on_d=non_deleted_spans_on_d,
			deps_on_d=deps_on_d,
			is_past_date=is_past_date,
			span_by_card_on_d=span_by_card_on_d,
		)

		seen_cards_on_d: set[str] = set()
		ordered_card_entries: list[tuple[str, dict[str, Any] | None, dict[str, Any] | None]] = []

		for sp in active_spans_on_d:
			cid = sp["_cid"]
			seen_cards_on_d.add(cid)
			ordered_card_entries.append((cid, sp, deps_on_d.get(cid)))

		# Include saved historical deposit records even if the card was stopped/deleted on or after `d_str`
		for cid, dr in deps_on_d.items():
			if cid not in seen_cards_on_d:
				seen_cards_on_d.add(cid)
				ordered_card_entries.append((cid, span_by_card_on_d.get(cid), dr))

		for cid, sp, dr in ordered_card_entries:
			has_deposit_doc = dr is not None
			saved_amount = max(0.0, flt(dr.get("deposit_amount") or 0, 2)) if has_deposit_doc else 0.0
			stopped_for_reason = bool(cint(dr.get("stopped_for_reason"))) if has_deposit_doc else False
			if saved_amount > 0:
				stopped_for_reason = False
			is_deposited = saved_amount > 0
			is_approved = (
				bool(cint(dr.get("is_approved")))
				if (has_deposit_doc and is_deposited and not stopped_for_reason)
				else False
			)

			if not has_deposit_doc and sp is not None:
				# Fast path for the 95%+ of rows that have no deposit record on `d_str`
				effective_card_name = sp["_card_name"]
				effective_base_name = sp["_base_name"]
				effective_copy_no = sp["_copy_no"]
				effective_card_type = sp["_card_type"]
				effective_copy_label = sp["_copy_label"]
				effective_card_number = sp["_card_number"]
				effective_account_number = sp["_account_number"]
				effective_bank = sp["_bank"]
				effective_bank_name = sp["_bank_name"]
				effective_rep = sp["_rep"]
				effective_rep_name = sp["_rep_name"]
				effective_region = sp["_region"]
				effective_region_name = sp["_region_name"]
				effective_card_owner = sp["_card_owner"]
				effective_card_owner_name = sp["_card_owner_name"]
				account_key = sp["_group_key"]
				serial_no = sp["_serial_no"]
				card_status_at_d = cstr(sp.get("card_status") or ACTIVE_CARD_STATUS)
				is_hist_inactive = not sp["_is_active"]
				base_search_norm = sp["_search_norm"]
			else:
				sp_status = cstr(
					sp.get("card_status")
					if sp
					else (dr.get("current_card_status") if dr else ACTIVE_CARD_STATUS)
				)
				sp_deleted = cint(
					sp.get("is_deleted")
					if sp
					else (dr.get("current_is_deleted") if dr else 0)
				)
				is_hist_inactive = bool(sp_status != ACTIVE_CARD_STATUS or sp_deleted == 1)
				card_status_at_d = sp_status

				use_snapshot = has_deposit_doc and (
					is_past_date or is_hist_inactive or is_deposited or stopped_for_reason
				)
				f_source = sp if sp is not None else (dr or {})

				if use_snapshot and dr is not None:
					effective_card_name = cstr(
						dr.get("card_name_snapshot") or f_source.get("card_name") or ""
					)
					effective_base_name = cstr(
						dr.get("base_card_name_snapshot")
						or f_source.get("base_card_name")
						or effective_card_name
					)
					effective_copy_no = max(
						1, cint(dr.get("copy_no_snapshot") or f_source.get("copy_no") or 1)
					)
					effective_card_type = clean_card_type(
						dr.get("card_type_snapshot")
						if dr.get("card_type_snapshot") is not None
						and cstr(dr.get("card_type_snapshot")).strip() != ""
						else f_source.get("card_type")
					)
					effective_card_number = cstr(
						dr.get("card_number_snapshot") or f_source.get("card_number") or ""
					)
					effective_account_number = cstr(
						dr.get("account_number_snapshot") or f_source.get("account_number") or ""
					)
					effective_bank = cstr(dr.get("bank_snapshot") or f_source.get("bank") or "")
					effective_bank_name = cstr(
						dr.get("bank_name_snapshot")
						or f_source.get("bank_name")
						or effective_bank
					)
					effective_rep = cstr(
						dr.get("representative_snapshot") or f_source.get("representative") or ""
					)
					effective_rep_name = cstr(
						dr.get("representative_name_snapshot")
						or f_source.get("representative_name")
						or effective_rep
					)
					effective_region = cstr(
						dr.get("region_snapshot") or f_source.get("region") or ""
					)
					effective_region_name = cstr(
						dr.get("region_name_snapshot")
						or f_source.get("region_name")
						or effective_region
					)
				else:
					effective_card_name = cstr(f_source.get("card_name") or "")
					effective_base_name = cstr(
						f_source.get("base_card_name") or effective_card_name
					)
					effective_copy_no = max(1, cint(f_source.get("copy_no") or 1))
					effective_card_type = clean_card_type(f_source.get("card_type"))
					effective_card_number = cstr(f_source.get("card_number") or "")
					effective_account_number = cstr(f_source.get("account_number") or "")
					effective_bank = cstr(f_source.get("bank") or "")
					effective_bank_name = cstr(f_source.get("bank_name") or effective_bank)
					effective_rep = cstr(f_source.get("representative") or "")
					effective_rep_name = cstr(
						f_source.get("representative_name") or effective_rep
					)
					effective_region = cstr(f_source.get("region") or "")
					effective_region_name = cstr(
						f_source.get("region_name") or effective_region
					)

				effective_card_owner = cstr(
					f_source.get("card_owner") or (dr.get("card_owner") if dr else "") or ""
				)
				effective_card_owner_name = cstr(
					f_source.get("card_owner_name")
					or (dr.get("card_owner_name") if dr else "")
					or effective_card_owner
				)

				effective_copy_label = format_copy_badge_label(
					effective_card_type, effective_copy_no
				)
				account_key = _resolve_deposit_group_key(
					effective_base_name,
					f_source.get("account_number_normalized"),
					effective_account_number,
					effective_bank,
					cid,
				)
				serial_no = cint(f_source.get("serial_no"))
				base_search_norm = normalize_search_text(
					" ".join(
						[
							cid,
							effective_card_name,
							effective_base_name,
							effective_card_type,
							effective_copy_label,
							effective_card_number,
							effective_account_number,
							effective_bank_name,
							effective_rep_name,
							effective_region_name,
							effective_card_owner,
							effective_card_owner_name,
							cstr(serial_no),
						]
					)
				)

			acc_state = day_group_map.get(account_key)
			if acc_state is not None:
				if effective_card_type == CARD_TYPE_BUSINESS:
					effective_daily_limit = flt(acc_state["business_limit"], 2)
					remaining_limit = flt(acc_state["remaining_business"], 2)
					remaining_limit_fmt = acc_state["remaining_business_fmt"]
					has_limit_conflict = bool(acc_state["business_conflict"])
				elif effective_card_type == CARD_TYPE_MADA:
					effective_daily_limit = flt(acc_state["mada_limit"], 2)
					remaining_limit = flt(acc_state["remaining_mada"], 2)
					remaining_limit_fmt = acc_state["remaining_mada_fmt"]
					has_limit_conflict = bool(acc_state["mada_conflict"])
				else:
					effective_daily_limit = flt(acc_state["legacy_limit"], 2)
					remaining_limit = flt(acc_state["remaining_legacy"], 2)
					remaining_limit_fmt = acc_state["remaining_legacy_fmt"]
					has_limit_conflict = bool(acc_state["legacy_conflict"])
				account_saved_total = flt(acc_state["account_saved_total"], 2)
				has_business = bool(acc_state["has_business"])
				has_mada = bool(acc_state["has_mada"])
				business_limit = flt(acc_state["business_limit"], 2)
				mada_limit = flt(acc_state["mada_limit"], 2)
				legacy_limit = flt(acc_state["legacy_limit"], 2)
				business_saved_total = flt(acc_state["business_saved_total"], 2)
				mada_saved_total = flt(acc_state["mada_saved_total"], 2)
				legacy_saved_total = flt(acc_state["legacy_saved_total"], 2)
				group_daily_target = flt(acc_state["group_daily_target"], 2)
				group_size = cint(acc_state["group_size"])
			else:
				raw_lim = (
					flt(dr.get("daily_limit_snapshot"), 2)
					if (has_deposit_doc and dr and dr.get("daily_limit_snapshot") is not None and flt(dr.get("daily_limit_snapshot"), 2) > 0)
					else (sp["_daily_limit"] if sp else flt((dr or {}).get("daily_limit") or 0, 2))
				)
				effective_daily_limit = max(0.0, raw_lim)
				account_saved_total = saved_amount
				remaining_limit = max(0.0, flt(effective_daily_limit - saved_amount, 2))
				remaining_limit_fmt = format_financial_amount(remaining_limit, zero_as_zero=True)
				has_limit_conflict = False
				has_business = effective_card_type == CARD_TYPE_BUSINESS
				has_mada = effective_card_type == CARD_TYPE_MADA
				business_limit = effective_daily_limit if has_business else 0.0
				mada_limit = effective_daily_limit if has_mada else 0.0
				legacy_limit = (
					effective_daily_limit if (not has_business and not has_mada) else 0.0
				)
				business_saved_total = saved_amount if has_business else 0.0
				mada_saved_total = saved_amount if has_mada else 0.0
				legacy_saved_total = (
					saved_amount if (not has_business and not has_mada) else 0.0
				)
				group_daily_target = effective_daily_limit
				group_size = 1

			if is_deposited:
				status_key = "deposited"
				status_label = "تم الإيداع"
			elif stopped_for_reason:
				status_key = "stopped_for_reason"
				status_label = "موقف لسبب"
			else:
				status_key = "not_deposited"
				status_label = "لم يتم الإيداع"

			daily_limit_fmt = (
				sp["_daily_limit_fmt"]
				if (sp is not None and abs(effective_daily_limit - sp["_daily_limit"]) < 0.0001)
				else format_financial_amount(effective_daily_limit, zero_as_zero=True)
			)
			dep_amount_fmt = (
				format_financial_amount(saved_amount, zero_as_zero=False)
				if is_deposited
				else ("0" if has_deposit_doc and saved_amount == 0 and not stopped_for_reason else "")
			)

			extra_search = d_search_token
			if has_deposit_doc:
				extra_search = f"{d_search_token} {dep_amount_fmt} {int(saved_amount) if saved_amount == int(saved_amount) else saved_amount} { 'موقف لسبب' if stopped_for_reason else '' } { 'معتمد' if is_approved else '' }"

			can_edit_card_on_d = not is_hist_inactive
			row_key = f"{cid}::{d_str}"
			account_day_key = f"{d_str}::{account_key}"

			all_items.append(
				{
					"row_key": row_key,
					"card": cid,
					"deposit_date": d_str,
					"account_key": account_key,
					"group_key": account_key,
					"account_day_key": account_day_key,
					"group_size": group_size,
					"serial_no": serial_no,
					"copy_no": effective_copy_no,
					"copy_label": effective_copy_label,
					"card_type": effective_card_type,
					"card_name": effective_card_name,
					"base_card_name": effective_base_name,
					"card_number": effective_card_number,
					"account_number": effective_account_number,
					"bank": effective_bank,
					"bank_name": effective_bank_name,
					"representative": effective_rep,
					"representative_name": effective_rep_name,
					"region": effective_region,
					"region_name": effective_region_name,
					"card_owner": effective_card_owner,
					"card_owner_name": effective_card_owner_name,
					"card_status": card_status_at_d,
					"is_historical_inactive": is_hist_inactive,
					"daily_limit": effective_daily_limit,
					"daily_limit_formatted": daily_limit_fmt,
					"has_business": has_business,
					"has_mada": has_mada,
					"business_limit": business_limit,
					"mada_limit": mada_limit,
					"legacy_limit": legacy_limit,
					"business_saved_total": business_saved_total,
					"mada_saved_total": mada_saved_total,
					"legacy_saved_total": legacy_saved_total,
					"group_daily_target": group_daily_target,
					"account_saved_total": account_saved_total,
					"has_group_deposit": account_saved_total > 0,
					"has_limit_conflict": has_limit_conflict,
					"deposit_id": cstr(dr.get("deposit_id") or "") if has_deposit_doc else "",
					"has_saved_record": has_deposit_doc,
					"deposit_amount": saved_amount,
					"deposit_amount_formatted": dep_amount_fmt,
					"stopped_for_reason": stopped_for_reason,
					"is_approved": is_approved,
					"approved_amount": flt(dr.get("approved_amount") or 0, 2) if has_deposit_doc else 0.0,
					"remaining_limit": remaining_limit,
					"remaining_limit_formatted": remaining_limit_fmt,
					"status": status_key,
					"status_label": status_label,
					"row_permissions": {
						"can_edit_date": d_perms["can_edit_amount"] and can_edit_card_on_d,
						"can_edit_amount": (
							d_perms["can_edit_amount"]
							and can_edit_card_on_d
							and not is_approved
							and not stopped_for_reason
						),
						"can_toggle_stopped_date": d_perms["can_toggle_stopped"] and can_edit_card_on_d,
						"can_toggle_stopped_reason": (
							d_perms["can_toggle_stopped"]
							and can_edit_card_on_d
							and not is_approved
							and saved_amount <= 0
						),
						"can_approve_date": d_perms["can_approve"],
						"can_approve": (
							d_perms["can_approve"]
							and has_deposit_doc
							and is_deposited
							and not stopped_for_reason
							and not is_approved
						),
						"can_unapprove": (
							d_perms["can_approve"] and has_deposit_doc and is_approved
						),
					},
					"audit": None,
					"_raw_dep": dr if has_deposit_doc else None,
					"_search_blob": base_search_norm,
					"_extra_search": extra_search,
				}
			)

	if hydrate_all_audits:
		u_ids: set[str] = set()
		for r in all_items:
			raw_d = r.get("_raw_dep")
			if raw_d:
				for k in ("recorded_by", "last_modified_by", "approved_by", "unapproved_by", "stopped_reason_by"):
					if raw_d.get(k):
						u_ids.add(cstr(raw_d.get(k)))
		u_names = _resolve_user_full_names(u_ids)
		for r in all_items:
			_hydrate_row_audit(r, u_names)
			r.pop("_raw_dep", None)
			r.pop("_extra_search", None)

	return all_items


def _load_day_dataset(deposit_date: str) -> list[dict[str, Any]]:
	resolved = _resolve_valid_date(deposit_date)
	return _load_period_dataset(resolved, resolved, hydrate_all_audits=True)


def _compute_day_stats(
	base_items: list[dict[str, Any]],
	status_filtered_items: list[dict[str, Any]] | None = None,
	freeze_target: bool = False,
) -> dict[str, Any]:
	"""
	Computes the 6 KPI cards across the active period and filter set:
	  1. `total_cards` (`كل الإيداعات`)
	  2. `deposited_count` (`المودعين`: saved deposit_amount > 0)
	  3. `not_deposited_count` (`لم يودعوا`: deposit_amount <= 0 and not stopped_for_reason)
	  4. `stopped_for_reason_count` (`موقف لسبب`: stopped_for_reason == True)
	  5. `total_deposited_amount` (`إجمالي المبلغ المودع`: reflects active filters + search + status selection)
	  6. `total_daily_target` (`إجمالي الهدف`: summed per `(deposit_date, group_key)` without duplication;
	     `stopped_for_reason` stays included without deduction; freezes ONLY when representative or region filter is active).
	"""
	total_cards = len(base_items)
	deposited_count = 0
	stopped_for_reason_count = 0
	not_deposited_count = 0

	# Track daily targets per `(deposit_date, group_key)` using `group_daily_target` resolved on that day
	seen_day_groups: dict[str, float] = {}

	for item in base_items:
		amt = flt(item.get("deposit_amount"), 2)
		is_stopped = bool(item.get("stopped_for_reason"))
		if amt > 0:
			deposited_count += 1
		elif is_stopped:
			stopped_for_reason_count += 1
		else:
			not_deposited_count += 1

		d_str = cstr(item.get("deposit_date") or "")
		g_key = cstr(item.get("group_key") or item.get("account_key") or item.get("card"))
		day_group_id = f"{d_str}::{g_key}"
		if day_group_id not in seen_day_groups:
			if "group_daily_target" in item and item.get("group_daily_target") is not None:
				seen_day_groups[day_group_id] = flt(item.get("group_daily_target"), 2)
			else:
				seen_day_groups[day_group_id] = flt(item.get("daily_limit"), 2)

	amount_source = status_filtered_items if status_filtered_items is not None else base_items
	total_deposited_amount = flt(
		sum(flt(item.get("deposit_amount"), 2) for item in amount_source if flt(item.get("deposit_amount"), 2) > 0),
		2,
	)

	total_daily_target = flt(sum(seen_day_groups.values()), 2)
	target_formatted = format_financial_amount(total_daily_target, zero_as_zero=True)

	return {
		"total_cards": total_cards,
		"deposited_count": deposited_count,
		"not_deposited_count": not_deposited_count,
		"stopped_for_reason_count": stopped_for_reason_count,
		"total_deposited_amount": total_deposited_amount,
		"total_deposited_amount_formatted": format_financial_amount(
			total_deposited_amount, zero_as_zero=True
		),
		"total_daily_target": total_daily_target,
		"total_daily_target_formatted": target_formatted,
		"target_is_frozen": bool(freeze_target),
		"total_daily_target_display": "—" if freeze_target else target_formatted,
	}


def _sort_items(
	items: list[dict[str, Any]],
	sort_by: str,
	sort_order: str,
) -> list[dict[str, Any]]:
	col = sort_by if sort_by in SORTABLE_COLUMNS else "serial_no"
	reverse = (sort_order or "").strip().lower() != "asc"

	status_rank = {
		"deposited": 2,
		"stopped_for_reason": 1,
		"not_deposited": 0,
	}

	def sort_key(row: dict[str, Any]) -> Any:
		d_str = cstr(row.get("deposit_date") or "")
		s_no = cint(row.get("serial_no"))
		c_id = cstr(row.get("card"))
		if col == "serial_no":
			return (s_no, d_str, c_id)
		if col == "deposit_date":
			return (d_str, s_no, c_id)
		if col == "card_name":
			return (
				cstr(row.get("base_card_name") or row.get("card_name")).lower(),
				cint(row.get("copy_no")),
				d_str,
				s_no,
			)
		if col == "card_type":
			return (cstr(row.get("card_type")).lower(), d_str, s_no)
		if col == "card_number":
			return (cstr(row.get("card_number")), d_str, s_no)
		if col == "bank":
			return (cstr(row.get("bank_name")).lower(), d_str, s_no)
		if col == "representative":
			return (cstr(row.get("representative_name")).lower(), d_str, s_no)
		if col == "region":
			return (cstr(row.get("region_name")).lower(), d_str, s_no)
		if col == "card_owner":
			return (cstr(row.get("card_owner_name") or row.get("card_owner")).lower(), d_str, s_no)
		if col == "deposit_amount":
			return (flt(row.get("deposit_amount"), 2), d_str, s_no)
		if col == "remaining_limit":
			return (flt(row.get("remaining_limit"), 2), d_str, s_no)
		if col == "stopped_for_reason":
			return (1 if row.get("stopped_for_reason") else 0, d_str, s_no)
		if col == "status":
			return (status_rank.get(cstr(row.get("status")), 0), d_str, s_no)
		if col == "approval":
			return (1 if row.get("is_approved") else 0, d_str, s_no)
		return (s_no, d_str, c_id)

	return sorted(items, key=sort_key, reverse=reverse)


def _resolve_period_bounds(
	period_mode: str,
	deposit_date: str,
	period_month: str | int,
	period_year: str | int,
	date_from: str,
	date_to: str,
	clean_fy: str,
	allowed_view_years: list[str],
	fiscal_ctx: dict[str, Any],
) -> dict[str, Any]:
	mode = cstr(period_mode or "day").strip().lower()
	if mode not in VALID_PERIOD_MODES:
		mode = "day"

	# Resolve base date & default fiscal year
	raw_date = cstr(deposit_date or "").strip()
	if not raw_date:
		candidate_date = cstr(today())
		try:
			candidate_fy = derive_fiscal_year_from_date(candidate_date)
		except Exception:
			candidate_fy = ""

		target_fy = clean_fy if (clean_fy and clean_fy != "all") else ""
		if not target_fy:
			if candidate_fy and candidate_fy in allowed_view_years:
				target_fy = candidate_fy
			else:
				default_fy = cstr(fiscal_ctx.get("default_view_fiscal_year") or "")
				if default_fy and default_fy != "all" and default_fy in allowed_view_years:
					target_fy = default_fy
				else:
					target_fy = allowed_view_years[0]

		if candidate_fy != target_fy:
			fy_bounds = frappe.db.get_value(
				"Archive Fiscal Year",
				target_fy,
				["start_date", "end_date"],
				as_dict=True,
			)
			if fy_bounds:
				if getdate(candidate_date) > getdate(fy_bounds.end_date):
					raw_date = cstr(fy_bounds.end_date)
				else:
					raw_date = cstr(fy_bounds.start_date)
			else:
				raw_date = f"{target_fy}-01-01"
		else:
			raw_date = candidate_date

	resolved_date = _resolve_valid_date(raw_date)
	base_dt = getdate(resolved_date)

	if mode == "day":
		derived_fy = derive_fiscal_year_from_date(resolved_date)
		require_fiscal_permission(derived_fy, "view", check_open=False)
		if clean_fy and clean_fy != "all" and derived_fy != clean_fy:
			frappe.throw(
				_(
					"التاريخ المحدد ({0}) يقع في السنة المالية ({1}) ولا ينتمي إلى السنة المالية المحددة ({2})."
				).format(resolved_date, derived_fy, clean_fy),
				frappe.ValidationError,
			)
		return {
			"period_mode": "day",
			"deposit_date": resolved_date,
			"start_date": resolved_date,
			"end_date": resolved_date,
			"period_month": f"{base_dt.month:02d}",
			"period_year": f"{base_dt.year:04d}",
			"date_from": resolved_date,
			"date_to": resolved_date,
			"fiscal_year": derived_fy,
		}

	if mode == "month":
		raw_m = cstr(period_month or "").strip()
		raw_y = cstr(period_year or "").strip()
		if "-" in raw_m and len(raw_m) >= 7:
			parts = raw_m.split("-")
			y_num = cint(parts[0]) or base_dt.year
			m_num = cint(parts[1]) or base_dt.month
		else:
			y_num = (
				cint(raw_y)
				or (cint(clean_fy) if clean_fy and clean_fy != "all" else 0)
				or base_dt.year
			)
			m_num = cint(raw_m) or base_dt.month

		if m_num < 1 or m_num > 12:
			frappe.throw(_("الشهر المحدد غير صالح."), frappe.ValidationError)

		fy_str = f"{y_num:04d}"
		require_fiscal_permission(fy_str, "view", check_open=False)
		if clean_fy and clean_fy != "all" and fy_str != clean_fy:
			frappe.throw(
				_(
					"الشهر المحدد ({0}-{1}) لا ينتمي إلى السنة المالية المحددة ({2})."
				).format(fy_str, f"{m_num:02d}", clean_fy),
				frappe.ValidationError,
			)
		last_day = calendar.monthrange(y_num, m_num)[1]
		s_date = f"{y_num:04d}-{m_num:02d}-01"
		e_date = f"{y_num:04d}-{m_num:02d}-{last_day:02d}"
		return {
			"period_mode": "month",
			"deposit_date": resolved_date,
			"start_date": s_date,
			"end_date": e_date,
			"period_month": f"{m_num:02d}",
			"period_year": fy_str,
			"date_from": s_date,
			"date_to": e_date,
			"fiscal_year": fy_str,
		}

	if mode == "year":
		raw_y = cstr(period_year or "").strip()
		y_str = (
			raw_y
			if (raw_y and raw_y != "all")
			else (clean_fy if (clean_fy and clean_fy != "all") else f"{base_dt.year:04d}")
		)
		require_fiscal_permission(y_str, "view", check_open=False)
		if clean_fy and clean_fy != "all" and y_str != clean_fy:
			frappe.throw(
				_("العام المحدد ({0}) لا يتطابق مع فلتر السنة المالية ({1}).").format(
					y_str, clean_fy
				),
				frappe.ValidationError,
			)
		fy_bounds = frappe.db.get_value(
			"Archive Fiscal Year",
			y_str,
			["start_date", "end_date"],
			as_dict=True,
		)
		s_date = cstr(fy_bounds.start_date) if fy_bounds else f"{y_str}-01-01"
		e_date = cstr(fy_bounds.end_date) if fy_bounds else f"{y_str}-12-31"
		return {
			"period_mode": "year",
			"deposit_date": resolved_date,
			"start_date": s_date,
			"end_date": e_date,
			"period_month": f"{base_dt.month:02d}",
			"period_year": y_str,
			"date_from": s_date,
			"date_to": e_date,
			"fiscal_year": y_str,
		}

	# mode == "range"
	s_date = _resolve_valid_date(date_from or resolved_date)
	e_date = _resolve_valid_date(date_to or s_date)
	if getdate(s_date) > getdate(e_date):
		frappe.throw(
			_("تاريخ البداية ({0}) لا يمكن أن يكون بعد تاريخ النهاية ({1}).").format(
				s_date, e_date
			),
			frappe.ValidationError,
		)

	s_year = getdate(s_date).year
	e_year = getdate(e_date).year
	for yr in range(s_year, e_year + 1):
		yr_str = f"{yr:04d}"
		require_fiscal_permission(yr_str, "view", check_open=False)
		if clean_fy and clean_fy != "all" and yr_str != clean_fy:
			frappe.throw(
				_(
					"النطاق الزمني المحدد ({0} ← {1}) يتجاوز حدود السنة المالية المختارة ({2})."
				).format(s_date, e_date, clean_fy),
				frappe.ValidationError,
			)

	derived_fy = f"{e_year:04d}" if s_year == e_year else (clean_fy or f"{e_year:04d}")
	return {
		"period_mode": "range",
		"deposit_date": resolved_date,
		"start_date": s_date,
		"end_date": e_date,
		"period_month": f"{base_dt.month:02d}",
		"period_year": f"{e_year:04d}",
		"date_from": s_date,
		"date_to": e_date,
		"fiscal_year": derived_fy,
	}


@frappe.whitelist()
def get_deposits_context(
	deposit_date: str = "",
	status_filter: str = "",
	search: str = "",
	bank: str = "",
	representative: str = "",
	region: str = "",
	card_owner: str = "",
	page: int | str = 1,
	page_size: int | str = 50,
	sort_by: str = "serial_no",
	sort_order: str = "desc",
	fiscal_year: str = "",
	period_mode: str = "day",
	period_month: str | int = "",
	period_year: str | int = "",
	date_from: str = "",
	date_to: str = "",
) -> dict[str, Any]:
	require_deposit_view_permission()
	fiscal_ctx = get_screen_fiscal_context()
	allowed_view_years = fiscal_ctx.get("allowed_view_years") or []
	if not allowed_view_years:
		frappe.throw(
			_("ليست لديك صلاحية لعرض الإيداعات في أي سنة مالية."),
			frappe.PermissionError,
		)

	clean_fy = cstr(fiscal_year or "").strip()
	if clean_fy and clean_fy != "all":
		require_fiscal_permission(clean_fy, "view", check_open=False)

	bounds = _resolve_period_bounds(
		period_mode=period_mode,
		deposit_date=deposit_date,
		period_month=period_month,
		period_year=period_year,
		date_from=date_from,
		date_to=date_to,
		clean_fy=clean_fy,
		allowed_view_years=allowed_view_years,
		fiscal_ctx=fiscal_ctx,
	)

	resolved_mode = bounds["period_mode"]
	resolved_date = bounds["deposit_date"]
	start_date = bounds["start_date"]
	end_date = bounds["end_date"]
	derived_fy = bounds["fiscal_year"]

	all_period_items = _load_period_dataset(
		start_date=start_date,
		end_date=end_date,
		hydrate_all_audits=False,
		allowed_fiscal_years=set(allowed_view_years),
	)

	clean_bank = cstr(bank or "").strip()
	clean_rep = cstr(representative or "").strip()
	clean_region = cstr(region or "").strip()
	clean_card_owner = cstr(card_owner or "").strip()
	clean_status = cstr(status_filter or "").strip().lower()
	if clean_status not in VALID_DEPOSIT_FILTERS:
		clean_status = ""

	norm_search = normalize_search_text(search or "")
	search_tokens = [tok for tok in norm_search.split(" ") if tok] if norm_search else []

	# 1. Apply context filters (bank + representative + region + card_owner + search) to form base set `S`
	base_filtered: list[dict[str, Any]] = []
	for item in all_period_items:
		if clean_bank and item["bank"] != clean_bank:
			continue
		if clean_rep and item["representative"] != clean_rep:
			continue
		if clean_region and item["region"] != clean_region:
			continue
		if (
			clean_card_owner
			and item.get("card_owner") != clean_card_owner
			and item.get("card_owner_name") != clean_card_owner
		):
			continue
		if search_tokens:
			blob = item.get("_search_blob") or ""
			extra = item.get("_extra_search") or ""
			if not all((tok in blob or tok in extra) for tok in search_tokens):
				continue
		base_filtered.append(item)

	# 2. Apply clickable status card filter on `S`
	if clean_status in ("deposited", "not_deposited", "stopped_for_reason"):
		status_filtered = [item for item in base_filtered if item["status"] == clean_status]
	else:
		status_filtered = base_filtered

	# 3. Compute the 6 KPI statistics across all matching records (freezing target ONLY when rep or region filter is active)
	freeze_target = bool(clean_rep or clean_region)
	stats = _compute_day_stats(
		base_items=base_filtered,
		status_filtered_items=status_filtered,
		freeze_target=freeze_target,
	)

	sorted_items = _sort_items(status_filtered, sort_by=sort_by, sort_order=sort_order)
	total_count = len(sorted_items)

	is_all_pages = cstr(page_size).strip().lower() == "all"
	if is_all_pages:
		resolved_page_size: int | str = "all"
		total_pages = 1
		resolved_page = 1
		page_rows = sorted_items
	else:
		num_page_size = max(1, min(cint(page_size or 50), 1000))
		resolved_page_size = num_page_size
		total_pages = max(1, (total_count + num_page_size - 1) // num_page_size)
		resolved_page = max(1, min(cint(page or 1), total_pages))
		start_idx = (resolved_page - 1) * num_page_size
		page_rows = sorted_items[start_idx : start_idx + num_page_size]

	# Hydrate audit user names only for the rows returned on this page
	user_ids: set[str] = set()
	for r in page_rows:
		raw_dep = r.get("_raw_dep")
		if raw_dep:
			for k in ("recorded_by", "last_modified_by", "approved_by", "unapproved_by", "stopped_reason_by"):
				if raw_dep.get(k):
					user_ids.add(cstr(raw_dep.get(k)))
	user_names = _resolve_user_full_names(user_ids)

	clean_rows = []
	for r in page_rows:
		row_copy = dict(r)
		_hydrate_row_audit(row_copy, user_names)
		row_copy.pop("_raw_dep", None)
		row_copy.pop("_search_blob", None)
		row_copy.pop("_extra_search", None)
		clean_rows.append(row_copy)

	fy_is_closed = is_fiscal_year_closed(derived_fy) if derived_fy and derived_fy != "all" else False
	can_save_any = any(
		bool(
			r["row_permissions"]["can_edit_date"]
			or r["row_permissions"]["can_toggle_stopped_date"]
		)
		for r in all_period_items
	) or can_edit_deposits_for_date(resolved_date) or can_toggle_stopped_reason_for_date(resolved_date)

	return {
		"deposit_date": resolved_date,
		"period_mode": resolved_mode,
		"start_date": start_date,
		"end_date": end_date,
		"period_month": bounds["period_month"],
		"period_year": bounds["period_year"],
		"date_from": bounds["date_from"],
		"date_to": bounds["date_to"],
		"fiscal_year": derived_fy,
		"fiscal_year_is_closed": fy_is_closed,
		"fiscal_context": fiscal_ctx,
		"today": cstr(today()),
		"rows": clean_rows,
		"stats": stats,
		"pagination": {
			"page": resolved_page,
			"page_size": resolved_page_size,
			"total_count": total_count,
			"total_pages": total_pages,
		},
		"masters": _fetch_masters(),
		"permissions": {
			"can_view": True,
			"can_save": bool(can_save_any),
			"can_edit_amount": can_edit_deposits_for_date(resolved_date),
			"can_toggle_stopped_reason": can_toggle_stopped_reason_for_date(resolved_date),
			"can_approve": can_approve_deposits_for_date(resolved_date),
			"has_approve_role": has_deposit_approval_role(),
			"has_stopped_reason_role": has_deposit_stopped_reason_role(),
			"can_add_in_fiscal_year": has_fiscal_permission(derived_fy, "add", check_open=True)
			if derived_fy and derived_fy != "all"
			else True,
			"can_edit_in_fiscal_year": has_fiscal_permission(derived_fy, "edit", check_open=True)
			if derived_fy and derived_fy != "all"
			else True,
		},
	}


@frappe.whitelist()
def save_daily_deposits(
	deposit_date: str | None = None,
	items: list[dict[str, Any]] | str | None = None,
) -> dict[str, Any]:
	require_deposits_screen_access()
	default_date = _resolve_valid_date(deposit_date) if deposit_date else _resolve_valid_date(today())

	parsed_items = _parse_json_arg(items, None)
	if not isinstance(parsed_items, list) or len(parsed_items) == 0:
		frappe.throw(_("لا توجد إيداعات معدلة للحفظ."), frappe.ValidationError)

	if len(parsed_items) > 2000:
		frappe.throw(_("عدد السجلات المرسلة يتجاوز الحد المسموح به في عملية حفظ واحدة."), frappe.ValidationError)

	entries_by_date: dict[str, dict[str, dict[str, Any]]] = {}
	seen_keys: set[tuple[str, str]] = set()

	for entry in parsed_items:
		if not isinstance(entry, dict):
			frappe.throw(_("صيغة بيانات الإيداعات المرسلة غير صالحة."), frappe.ValidationError)
		card_id = cstr(entry.get("card") or "").strip()
		if not card_id:
			frappe.throw(_("مرجع البطاقة مفقود في أحد السجلات."), frappe.ValidationError)

		raw_entry_date = cstr(entry.get("deposit_date") or "").strip()
		entry_date = _resolve_valid_date(raw_entry_date) if raw_entry_date else default_date

		composite_key = (card_id, entry_date)
		if composite_key in seen_keys:
			frappe.throw(
				_("تم تكرار البطاقة ({0}) في نفس طلب الحفظ.").format(card_id),
				frappe.ValidationError,
			)
		seen_keys.add(composite_key)

		has_amount = "amount" in entry and entry.get("amount") is not None and cstr(entry.get("amount")).strip() != ""
		clean_amount = (
			_validate_and_clean_amount(entry.get("amount"), card_label=card_id)
			if has_amount
			else 0.0
		)

		has_stopped = "stopped_for_reason" in entry and entry.get("stopped_for_reason") is not None
		clean_stopped = bool(cint(entry.get("stopped_for_reason"))) if has_stopped else False

		entries_by_date.setdefault(entry_date, {})[card_id] = {
			"card": card_id,
			"deposit_date": entry_date,
			"has_amount": has_amount,
			"amount": clean_amount,
			"has_stopped": has_stopped,
			"stopped_for_reason": clean_stopped,
		}

	from archive.services.card_audit import ensure_card_state_spans_populated

	ensure_card_state_spans_populated()

	current_user = cstr(frappe.session.user or "Administrator")
	now_ts = now_datetime()
	today_str = cstr(today())

	saved_count = 0
	created_count = 0
	updated_count = 0
	skipped_zero_count = 0
	sorted_dates = sorted(entries_by_date.keys())

	savepoint_name = "archive_deposits_batch_save_sp"
	frappe.db.savepoint(savepoint_name)
	try:
		for d_str in sorted_dates:
			date_entries = entries_by_date[d_str]
			sorted_card_ids = sorted(date_entries.keys())
			is_past_date = d_str < today_str

			derived_fy = derive_fiscal_year_from_date(d_str)
			require_fiscal_year_open(derived_fy)

			# Step 1: Verify requested cards exist and discover their current & historical group keys
			initial_card_rows = frappe.db.sql(
				"""
				SELECT name, account_number, account_number_normalized
				FROM `tabArchive Card`
				WHERE name IN %(card_ids)s
				""",
				{"card_ids": tuple(sorted_card_ids)},
				as_dict=True,
			)
			initial_by_id = {cstr(r.name): r for r in initial_card_rows}
			for cid in sorted_card_ids:
				if cid not in initial_by_id:
					frappe.throw(
						_("البطاقة ({0}) غير موجودة أو غير مصرح بالوصول إليها.").format(cid),
						frappe.PermissionError,
					)

			req_spans = frappe.db.sql(
				"""
				SELECT card, account_number_normalized, group_key
				FROM `tabArchive Card State Span`
				WHERE card IN %(card_ids)s
					AND valid_from <= %(d_str)s
					AND valid_to >= %(d_str)s
				""",
				{"card_ids": tuple(sorted_card_ids), "d_str": d_str},
				as_dict=True,
			)

			target_norms = sorted(
				{
					cstr(r.get("account_number_normalized") or "").strip()
					or normalize_account_number(cstr(r.get("account_number") or ""))
					for r in initial_card_rows
					if (
						cstr(r.get("account_number_normalized") or "").strip()
						or normalize_account_number(cstr(r.get("account_number") or ""))
					)
				}
				| {
					cstr(s.get("account_number_normalized") or "").strip()
					for s in req_spans
					if cstr(s.get("account_number_normalized") or "").strip()
				}
			)
			target_group_keys = sorted(
				{
					cstr(s.get("group_key") or "").strip()
					for s in req_spans
					if cstr(s.get("group_key") or "").strip()
				}
			)

			extra_sibling_ids: set[str] = set(sorted_card_ids)
			if target_group_keys:
				sib_span_rows = frappe.db.sql(
					"""
					SELECT DISTINCT card
					FROM `tabArchive Card State Span`
					WHERE group_key IN %(g_keys)s
						AND valid_from <= %(d_str)s
						AND valid_to >= %(d_str)s
					""",
					{"g_keys": tuple(target_group_keys), "d_str": d_str},
					as_dict=True,
				)
				for sr in sib_span_rows:
					if sr.get("card"):
						extra_sibling_ids.add(cstr(sr.get("card")))

			# Step 2: Lock ALL cards sharing those account numbers or historical groups in deterministic order
			if target_norms:
				locked_cards = frappe.db.sql(
					"""
					SELECT
						c.name,
						c.card_name,
						c.base_card_name,
						c.copy_no,
						IFNULL(c.card_type, '') AS card_type,
						c.card_number,
						c.account_number,
						c.account_number_normalized,
						c.bank,
						b.bank_name,
						c.representative,
						rep.representative_name,
						c.region,
						reg.region_name,
						c.daily_limit,
						c.status,
						IFNULL(c.is_deleted, 0) AS is_deleted
					FROM `tabArchive Card` c
					LEFT JOIN `tabArchive Bank` b ON b.name = c.bank
					LEFT JOIN `tabArchive Representative` rep ON rep.name = c.representative
					LEFT JOIN `tabArchive Region` reg ON reg.name = c.region
					WHERE c.account_number_normalized IN %(norms)s
					   OR c.name IN %(card_ids)s
					ORDER BY c.name ASC
					FOR UPDATE
					""",
					{"norms": tuple(target_norms), "card_ids": tuple(sorted(extra_sibling_ids))},
					as_dict=True,
				)
			else:
				locked_cards = frappe.db.sql(
					"""
					SELECT
						c.name,
						c.card_name,
						c.base_card_name,
						c.copy_no,
						IFNULL(c.card_type, '') AS card_type,
						c.card_number,
						c.account_number,
						c.account_number_normalized,
						c.bank,
						b.bank_name,
						c.representative,
						rep.representative_name,
						c.region,
						reg.region_name,
						c.daily_limit,
						c.status,
						IFNULL(c.is_deleted, 0) AS is_deleted
					FROM `tabArchive Card` c
					LEFT JOIN `tabArchive Bank` b ON b.name = c.bank
					LEFT JOIN `tabArchive Representative` rep ON rep.name = c.representative
					LEFT JOIN `tabArchive Region` reg ON reg.name = c.region
					WHERE c.name IN %(card_ids)s
					ORDER BY c.name ASC
					FOR UPDATE
					""",
					{"card_ids": tuple(sorted(extra_sibling_ids))},
					as_dict=True,
				)

			cards_by_id = {cstr(row.name): row for row in locked_cards}
			for cid in sorted_card_ids:
				if cid not in cards_by_id:
					frappe.throw(
						_("البطاقة ({0}) غير موجودة أو غير مصرح بالوصول إليها.").format(cid),
						frappe.PermissionError,
					)

			all_locked_card_ids = sorted(cards_by_id.keys())

			# Step 3: Lock ALL deposit rows on d_str across all locked cards
			existing_deposits = frappe.db.sql(
				"""
				SELECT
					name,
					card,
					deposit_amount,
					IFNULL(stopped_for_reason, 0) AS stopped_for_reason,
					IFNULL(is_approved, 0) AS is_approved,
					approved_amount,
					daily_limit_snapshot,
					card_type_snapshot,
					card_name_snapshot,
					base_card_name_snapshot,
					copy_no_snapshot,
					card_number_snapshot,
					account_number_snapshot,
					bank_snapshot,
					bank_name_snapshot,
					representative_snapshot,
					representative_name_snapshot,
					region_snapshot,
					region_name_snapshot,
					recorded_by,
					recorded_at,
					last_modified_by,
					last_modified_at,
					previous_amount,
					audit_history_json
				FROM `tabArchive Card Deposit`
				WHERE deposit_date = %(deposit_date)s
					AND card IN %(card_ids)s
				ORDER BY card ASC
				FOR UPDATE
				""",
				{
					"deposit_date": d_str,
					"card_ids": tuple(all_locked_card_ids),
				},
				as_dict=True,
			)
			existing_by_card = {cstr(row.card): row for row in existing_deposits}

			# Load historical state spans on d_str for all locked cards
			locked_spans = frappe.db.sql(
				"""
				SELECT
					card,
					status,
					IFNULL(is_deleted, 0) AS is_deleted,
					daily_limit,
					IFNULL(card_type, '') AS card_type,
					base_card_name,
					copy_no,
					card_name,
					card_number,
					account_number,
					account_number_normalized,
					bank,
					bank_name,
					representative,
					representative_name,
					region,
					region_name,
					group_key
				FROM `tabArchive Card State Span`
				WHERE card IN %(card_ids)s
					AND valid_from <= %(d_str)s
					AND valid_to >= %(d_str)s
				""",
				{"card_ids": tuple(all_locked_card_ids), "d_str": d_str},
				as_dict=True,
			)
			spans_by_card = {cstr(s.card): s for s in locked_spans}

			# Build effective card view on d_str (using historical span on past dates, current card on today/future)
			effective_cards_by_id: dict[str, dict[str, Any]] = {}
			for c_row in locked_cards:
				cid = cstr(c_row.get("name"))
				span_row = spans_by_card.get(cid)
				if is_past_date and span_row:
					eff = dict(c_row)
					eff.update(
						{
							"status": span_row.get("status"),
							"is_deleted": cint(span_row.get("is_deleted")),
							"daily_limit": flt(span_row.get("daily_limit") or 0, 2),
							"card_type": cstr(span_row.get("card_type") or ""),
							"base_card_name": cstr(span_row.get("base_card_name") or ""),
							"copy_no": cint(span_row.get("copy_no") or 1),
							"card_name": cstr(span_row.get("card_name") or ""),
							"card_number": cstr(span_row.get("card_number") or ""),
							"account_number": cstr(span_row.get("account_number") or ""),
							"account_number_normalized": cstr(span_row.get("account_number_normalized") or ""),
							"bank": span_row.get("bank"),
							"bank_name": cstr(span_row.get("bank_name") or ""),
							"representative": span_row.get("representative"),
							"representative_name": cstr(span_row.get("representative_name") or ""),
							"region": span_row.get("region"),
							"region_name": cstr(span_row.get("region_name") or ""),
							"_existed_on_date": True,
						}
					)
					effective_cards_by_id[cid] = eff
				elif is_past_date and not span_row:
					eff = dict(c_row)
					eff["_existed_on_date"] = False
					effective_cards_by_id[cid] = eff
				else:
					eff = dict(c_row)
					eff["_existed_on_date"] = True
					effective_cards_by_id[cid] = eff

			# Step 4: Validate eligibility, approval lock, stopped_for_reason rules, and date permissions
			resolved_entries: dict[str, dict[str, Any]] = {}
			for cid in sorted_card_ids:
				eff_card = effective_cards_by_id[cid]
				cur_card = cards_by_id[cid]
				existing = existing_by_card.get(cid)
				entry_info = date_entries[cid]
				card_label = cstr(eff_card.get("card_name") or cur_card.get("card_name") or cid)

				if is_past_date:
					is_eligible = (
						bool(eff_card.get("_existed_on_date", True))
						and cint(eff_card.get("is_deleted")) == 0
						and cstr(eff_card.get("status")) == ACTIVE_CARD_STATUS
					) or (existing is not None)
				else:
					is_eligible = (
						cint(cur_card.get("is_deleted")) == 0
						and cstr(cur_card.get("status")) == ACTIVE_CARD_STATUS
					)

				if not is_eligible:
					frappe.throw(
						_("لا يمكن حفظ أو تعديل إيداع للبطاقة غير النشطة ({0}).").format(card_label),
						frappe.ValidationError,
					)

				if existing and cint(existing.get("is_approved")) == 1:
					frappe.throw(
						_(
							"الإيداع الخاص بالبطاقة ({0}) بتاريخ ({1}) معتمد ومقفول. يجب إلغاء الاعتماد أولاً قبل تعديل المبلغ أو حالة «موقف لسبب»."
						).format(card_label, d_str),
						frappe.ValidationError,
					)

				old_amount = max(0.0, flt(existing.get("deposit_amount") or 0, 2)) if existing else 0.0
				old_stopped = bool(cint(existing.get("stopped_for_reason"))) if existing else False

				new_amount = flt(entry_info["amount"], 2) if entry_info["has_amount"] else old_amount
				new_stopped = bool(entry_info["stopped_for_reason"]) if entry_info["has_stopped"] else old_stopped

				amount_changed = abs(new_amount - old_amount) >= 0.0001
				stopped_changed = new_stopped != old_stopped

				# Mandatory financial rule: stopped_for_reason cannot be enabled if amount > 0 (saved or entered)
				if new_stopped:
					if old_amount > 0:
						frappe.throw(
							_(
								"لا يمكن تفعيل «موقف لسبب» للبطاقة ({0}) لوجود مبلغ إيداع محفوظ مسبقاً. يجب تصفير المبلغ وحفظه أولاً ثم تفعيل «موقف لسبب»."
							).format(card_label),
							frappe.ValidationError,
						)
					if new_amount > 0:
						frappe.throw(
							_(
								"لا يمكن تفعيل «موقف لسبب» للبطاقة ({0}) مع وجود مبلغ إيداع أكبر من صفر."
							).format(card_label),
							frappe.ValidationError,
						)

				if stopped_changed:
					require_stopped_reason_permission(d_str)
				if amount_changed:
					require_deposit_save_permission(d_str)
				if not stopped_changed and not amount_changed:
					if entry_info["has_stopped"] and not entry_info["has_amount"]:
						require_stopped_reason_permission(d_str)
					else:
						require_deposit_save_permission(d_str)

				resolved_entries[cid] = {
					"new_amount": new_amount,
					"new_stopped": new_stopped,
					"old_amount": old_amount,
					"old_stopped": old_stopped,
					"amount_changed": amount_changed,
					"stopped_changed": stopped_changed,
				}

			# Step 5: Group eligible cards on d_str by shared 3-element deposit group (`base_card_name + account_number + bank`)
			# and enforce `أعمال` priority ceiling over `مدى`:
			#   - If `مدى` exists: D_M <= M
			#   - If `أعمال` exists: D_A + D_M <= A
			cards_by_group: dict[str, list[dict[str, Any]]] = {}
			for cid, eff_c in effective_cards_by_id.items():
				if is_past_date and not eff_c.get("_existed_on_date", True) and cid not in existing_by_card:
					continue
				g_key = _resolve_deposit_group_key(
					eff_c.get("base_card_name"),
					eff_c.get("account_number_normalized"),
					eff_c.get("account_number"),
					eff_c.get("bank"),
					cid,
				)
				cards_by_group.setdefault(g_key, []).append(eff_c)

			edited_group_keys = sorted(
				{
					_resolve_deposit_group_key(
						effective_cards_by_id[cid].get("base_card_name"),
						effective_cards_by_id[cid].get("account_number_normalized"),
						effective_cards_by_id[cid].get("account_number"),
						effective_cards_by_id[cid].get("bank"),
						cid,
					)
					for cid in sorted_card_ids
				}
			)

			resolved_limits_by_group: dict[str, dict[str, float]] = {}
			for g_key in edited_group_keys:
				grp_cards = cards_by_group.get(g_key, [])
				non_deleted_cards = [c for c in grp_cards if cint(c.get("is_deleted")) == 0]
				sample_card = non_deleted_cards[0] if non_deleted_cards else grp_cards[0]
				display_acc = cstr(sample_card.get("account_number") or g_key)
				display_base = cstr(sample_card.get("base_card_name") or sample_card.get("card_name") or "")

				b_cur_limits = sorted(
					{
						flt(c.get("daily_limit"), 2)
						for c in non_deleted_cards
						if clean_card_type(c.get("card_type")) == CARD_TYPE_BUSINESS
						and flt(c.get("daily_limit"), 2) > 0
					}
				)
				m_cur_limits = sorted(
					{
						flt(c.get("daily_limit"), 2)
						for c in non_deleted_cards
						if clean_card_type(c.get("card_type")) == CARD_TYPE_MADA
						and flt(c.get("daily_limit"), 2) > 0
					}
				)
				l_cur_limits = sorted(
					{
						flt(c.get("daily_limit"), 2)
						for c in non_deleted_cards
						if clean_card_type(c.get("card_type")) == ""
						and flt(c.get("daily_limit"), 2) > 0
					}
				)

				b_snaps = sorted(
					{
						flt(existing_by_card[cstr(c.get("name"))].get("daily_limit_snapshot"), 2)
						for c in grp_cards
						if cstr(c.get("name")) in existing_by_card
						and clean_card_type(
							existing_by_card[cstr(c.get("name"))].get("card_type_snapshot")
							or c.get("card_type")
						)
						== CARD_TYPE_BUSINESS
						and existing_by_card[cstr(c.get("name"))].get("daily_limit_snapshot") is not None
						and flt(existing_by_card[cstr(c.get("name"))].get("daily_limit_snapshot"), 2) > 0
					}
				)
				m_snaps = sorted(
					{
						flt(existing_by_card[cstr(c.get("name"))].get("daily_limit_snapshot"), 2)
						for c in grp_cards
						if cstr(c.get("name")) in existing_by_card
						and clean_card_type(
							existing_by_card[cstr(c.get("name"))].get("card_type_snapshot")
							or c.get("card_type")
						)
						== CARD_TYPE_MADA
						and existing_by_card[cstr(c.get("name"))].get("daily_limit_snapshot") is not None
						and flt(existing_by_card[cstr(c.get("name"))].get("daily_limit_snapshot"), 2) > 0
					}
				)
				l_snaps = sorted(
					{
						flt(existing_by_card[cstr(c.get("name"))].get("daily_limit_snapshot"), 2)
						for c in grp_cards
						if cstr(c.get("name")) in existing_by_card
						and clean_card_type(
							existing_by_card[cstr(c.get("name"))].get("card_type_snapshot")
							or c.get("card_type")
						)
						== ""
						and existing_by_card[cstr(c.get("name"))].get("daily_limit_snapshot") is not None
						and flt(existing_by_card[cstr(c.get("name"))].get("daily_limit_snapshot"), 2) > 0
					}
				)

				if is_past_date and b_snaps:
					effective_b_limit = b_snaps[0] if len(b_snaps) == 1 else min(b_snaps)
				else:
					if len(b_cur_limits) > 1:
						frappe.throw(
							_(
								"يوجد تعارض مسبق في الحد اليومي بين نسخ أعمال للحساب ({0}). يرجى توحيد الحد اليومي من شاشة البطاقات أولاً."
							).format(display_acc),
							frappe.ValidationError,
						)
					effective_b_limit = b_cur_limits[0] if b_cur_limits else 0.0

				if is_past_date and m_snaps:
					effective_m_limit = m_snaps[0] if len(m_snaps) == 1 else min(m_snaps)
				else:
					if len(m_cur_limits) > 1:
						frappe.throw(
							_(
								"يوجد تعارض مسبق في الحد اليومي بين نسخ مدى للحساب ({0}). يرجى توحيد الحد اليومي من شاشة البطاقات أولاً."
							).format(display_acc),
							frappe.ValidationError,
						)
					effective_m_limit = m_cur_limits[0] if m_cur_limits else 0.0

				if is_past_date and l_snaps:
					effective_l_limit = l_snaps[0] if len(l_snaps) == 1 else min(l_snaps)
				else:
					if len(l_cur_limits) > 1:
						frappe.throw(
							_(
								"يوجد تعارض مسبق في الحد اليومي بين نسخ الحساب ({0}). يرجى توحيد الحد اليومي من شاشة البطاقات أولاً."
							).format(display_acc),
							frappe.ValidationError,
						)
					effective_l_limit = l_cur_limits[0] if l_cur_limits else 0.0

				has_business = any(
					clean_card_type(c.get("card_type")) == CARD_TYPE_BUSINESS for c in non_deleted_cards
				) or (is_past_date and bool(b_snaps))
				has_mada = any(
					clean_card_type(c.get("card_type")) == CARD_TYPE_MADA for c in non_deleted_cards
				) or (is_past_date and bool(m_snaps))

				resolved_limits_by_group[g_key] = {
					CARD_TYPE_BUSINESS: effective_b_limit,
					CARD_TYPE_MADA: effective_m_limit,
					"": effective_l_limit,
				}

				untouched_b = 0.0
				untouched_m = 0.0
				untouched_l = 0.0
				edited_b = 0.0
				edited_m = 0.0
				edited_l = 0.0

				for c in grp_cards:
					m_cid = cstr(c.get("name"))
					c_type = clean_card_type(c.get("card_type"))
					if m_cid in resolved_entries:
						amt = flt(resolved_entries[m_cid]["new_amount"], 2)
						if c_type == CARD_TYPE_BUSINESS:
							edited_b = flt(edited_b + amt, 2)
						elif c_type == CARD_TYPE_MADA:
							edited_m = flt(edited_m + amt, 2)
						else:
							edited_l = flt(edited_l + amt, 2)
					elif m_cid in existing_by_card:
						amt = max(0.0, flt(existing_by_card[m_cid].get("deposit_amount") or 0, 2))
						snap_type = clean_card_type(
							existing_by_card[m_cid].get("card_type_snapshot") or c_type
						)
						if snap_type == CARD_TYPE_BUSINESS:
							untouched_b = flt(untouched_b + amt, 2)
						elif snap_type == CARD_TYPE_MADA:
							untouched_m = flt(untouched_m + amt, 2)
						else:
							untouched_l = flt(untouched_l + amt, 2)

				final_b = flt(untouched_b + edited_b, 2)
				final_m = flt(untouched_m + edited_m, 2)
				final_l = flt(untouched_l + edited_l, 2)
				final_total = flt(final_b + final_m + final_l, 2)

				# 1. Mada group limit check: D_M <= M
				if has_mada and round(final_m * 100) > round(effective_m_limit * 100):
					avail_m = (
						max(
							0.0,
							flt(
								min(
									flt(effective_m_limit - untouched_m, 2),
									flt(effective_b_limit - untouched_b - untouched_m, 2),
								),
								2,
							),
						)
						if has_business
						else max(0.0, flt(effective_m_limit - untouched_m, 2))
					)
					frappe.throw(
						_(
							"مبلغ الإيداع لبطاقات مدى في المجموعة ({0} — {1}) لا يمكن أن يتجاوز الحد اليومي لمدى ({2})، المتبقي المتاح لمدى: ({3})."
						).format(
							display_base,
							display_acc,
							format_financial_amount(effective_m_limit, zero_as_zero=True),
							format_financial_amount(avail_m, zero_as_zero=True),
						),
						frappe.ValidationError,
					)

				# 2. Business ceiling check: D_A + D_M <= A
				if has_business and round(final_total * 100) > round(effective_b_limit * 100):
					avail_b = max(0.0, flt(effective_b_limit - untouched_b - untouched_m - untouched_l, 2))
					frappe.throw(
						_(
							"مجموع إيداعات المجموعة ({0} — {1}) شاملاً أعمال ومدى ({2}) يتجاوز السقف اليومي لأعمال ({3})، المتبقي المتاح في السقف: ({4})."
						).format(
							display_base,
							display_acc,
							format_financial_amount(final_total, zero_as_zero=True),
							format_financial_amount(effective_b_limit, zero_as_zero=True),
							format_financial_amount(avail_b, zero_as_zero=True),
						),
						frappe.ValidationError,
					)

				# 3. Legacy fallback check when neither business nor mada exists
				if not has_business and not has_mada and round(final_l * 100) > round(effective_l_limit * 100):
					avail_l = max(0.0, flt(effective_l_limit - untouched_l, 2))
					frappe.throw(
						_(
							"مبلغ الإيداع لا يمكن أن يتجاوز الحد اليومي للبطاقة (الحد المشترك للحساب {0}: {1}، المتبقي المتاح: {2})."
						).format(
							display_acc,
							format_financial_amount(effective_l_limit, zero_as_zero=True),
							format_financial_amount(avail_l, zero_as_zero=True),
						),
						frappe.ValidationError,
					)

			# Step 6: Persist changes for d_str
			for cid in sorted_card_ids:
				eff_card = effective_cards_by_id[cid]
				cur_card = cards_by_id[cid]
				res = resolved_entries[cid]
				new_amount = res["new_amount"]
				new_stopped = res["new_stopped"]
				old_amount = res["old_amount"]
				old_stopped = res["old_stopped"]
				amount_changed = res["amount_changed"]
				stopped_changed = res["stopped_changed"]

				existing = existing_by_card.get(cid)
				c_type = clean_card_type(eff_card.get("card_type"))
				g_key = _resolve_deposit_group_key(
					eff_card.get("base_card_name"),
					eff_card.get("account_number_normalized"),
					eff_card.get("account_number"),
					eff_card.get("bank"),
					cid,
				)
				grp_limits = resolved_limits_by_group.get(g_key, {})
				snapshot_limit = flt(
					grp_limits.get(c_type, flt(eff_card.get("daily_limit") or 0, 2)),
					2,
				)

				if not existing:
					# Do not create dummy zero deposit records unless stopped_for_reason is enabled
					if new_amount <= 0 and not new_stopped:
						skipped_zero_count += 1
						continue

					require_fiscal_permission(derived_fy, "add", check_open=True)

					if new_stopped:
						initial_history = [
							{
								"action": "stopped_for_reason_enabled",
								"from_amount": 0.0,
								"to_amount": 0.0,
								"stopped_for_reason": 1,
								"by": current_user,
								"at": cstr(now_ts),
							}
						]
					else:
						initial_history = [
							{
								"action": "created",
								"from_amount": 0.0,
								"to_amount": new_amount,
								"stopped_for_reason": 0,
								"by": current_user,
								"at": cstr(now_ts),
							}
						]

					doc = frappe.get_doc(
						{
							"doctype": DEPOSIT_DOCTYPE,
							"fiscal_year": derived_fy,
							"card": cid,
							"deposit_date": d_str,
							"deposit_amount": new_amount,
							"stopped_for_reason": 1 if new_stopped else 0,
							"stopped_reason_by": current_user if new_stopped else None,
							"stopped_reason_at": now_ts if new_stopped else None,
							"is_approved": 0,
							"approved_amount": 0.0,
							"daily_limit_snapshot": snapshot_limit,
							"previous_amount": 0.0,
							"card_name_snapshot": cstr(eff_card.get("card_name") or ""),
							"base_card_name_snapshot": cstr(eff_card.get("base_card_name") or ""),
							"copy_no_snapshot": cint(eff_card.get("copy_no") or 1),
							"card_type_snapshot": c_type,
							"card_number_snapshot": cstr(eff_card.get("card_number") or ""),
							"account_number_snapshot": cstr(eff_card.get("account_number") or ""),
							"bank_snapshot": eff_card.get("bank") or None,
							"bank_name_snapshot": cstr(
								eff_card.get("bank_name") or eff_card.get("bank") or ""
							),
							"representative_snapshot": eff_card.get("representative") or None,
							"representative_name_snapshot": cstr(
								eff_card.get("representative_name")
								or eff_card.get("representative")
								or ""
							),
							"region_snapshot": eff_card.get("region") or None,
							"region_name_snapshot": cstr(
								eff_card.get("region_name") or eff_card.get("region") or ""
							),
							"recorded_by": current_user,
							"recorded_at": now_ts,
							"last_modified_by": current_user,
							"last_modified_at": now_ts,
							"audit_history_json": json.dumps(initial_history, ensure_ascii=False),
						}
					)
					doc.flags.from_deposits_batch_api = True
					doc.flags.allow_historical_active_card = True
					doc.insert(ignore_permissions=True)
					created_count += 1
					saved_count += 1
				else:
					if not amount_changed and not stopped_changed:
						continue

					require_fiscal_permission(derived_fy, "edit", check_open=True)

					doc = frappe.get_doc(DEPOSIT_DOCTYPE, existing.name)
					history = _parse_json_arg(doc.audit_history_json, [])
					if not isinstance(history, list):
						history = []

					if amount_changed:
						history.append(
							{
								"action": "updated",
								"from_amount": old_amount,
								"to_amount": new_amount,
								"stopped_for_reason": 1 if new_stopped else 0,
								"by": current_user,
								"at": cstr(now_ts),
							}
						)
					if stopped_changed:
						history.append(
							{
								"action": "stopped_for_reason_enabled"
								if new_stopped
								else "stopped_for_reason_disabled",
								"from_amount": old_amount,
								"to_amount": new_amount,
								"stopped_for_reason": 1 if new_stopped else 0,
								"by": current_user,
								"at": cstr(now_ts),
							}
						)

					if len(history) > 50:
						history = history[-50:]

					if amount_changed:
						doc.previous_amount = old_amount
					doc.deposit_amount = new_amount
					doc.stopped_for_reason = 1 if new_stopped else 0
					if stopped_changed:
						doc.stopped_reason_by = current_user
						doc.stopped_reason_at = now_ts

					if not doc.recorded_by:
						doc.recorded_by = current_user
					if not doc.recorded_at:
						doc.recorded_at = now_ts
					doc.last_modified_by = current_user
					doc.last_modified_at = now_ts
					doc.audit_history_json = json.dumps(history, ensure_ascii=False)

					is_cur_active = (
						cint(cur_card.get("is_deleted")) == 0
						and cstr(cur_card.get("status")) == ACTIVE_CARD_STATUS
					)
					if d_str >= today_str and is_cur_active:
						doc.daily_limit_snapshot = snapshot_limit
						doc.card_name_snapshot = cstr(cur_card.get("card_name") or "")
						doc.base_card_name_snapshot = cstr(cur_card.get("base_card_name") or "")
						doc.copy_no_snapshot = cint(cur_card.get("copy_no") or 1)
						doc.card_type_snapshot = clean_card_type(cur_card.get("card_type"))
						doc.card_number_snapshot = cstr(cur_card.get("card_number") or "")
						doc.account_number_snapshot = cstr(cur_card.get("account_number") or "")
						doc.bank_snapshot = cur_card.get("bank") or None
						doc.bank_name_snapshot = cstr(
							cur_card.get("bank_name") or cur_card.get("bank") or ""
						)
						doc.representative_snapshot = cur_card.get("representative") or None
						doc.representative_name_snapshot = cstr(
							cur_card.get("representative_name")
							or cur_card.get("representative")
							or ""
						)
						doc.region_snapshot = cur_card.get("region") or None
						doc.region_name_snapshot = cstr(
							cur_card.get("region_name") or cur_card.get("region") or ""
						)

					doc.flags.from_deposits_batch_api = True
					doc.flags.allow_historical_active_card = True
					doc.save(ignore_permissions=True)
					updated_count += 1
					saved_count += 1
	except Exception:
		frappe.db.rollback(save_point=savepoint_name)
		raise

	all_day_items = _load_day_dataset(default_date)
	stats = _compute_day_stats(all_day_items)

	return {
		"ok": True,
		"deposit_date": default_date,
		"saved_dates": sorted_dates,
		"saved_count": saved_count,
		"created_count": created_count,
		"updated_count": updated_count,
		"skipped_zero_count": skipped_zero_count,
		"stats": stats,
	}


@frappe.whitelist()
def approve_deposit(
	card: str,
	deposit_date: str,
	expected_amount: float | str | None = None,
) -> dict[str, Any]:
	require_deposits_screen_access()
	clean_card = cstr(card or "").strip()
	if not clean_card:
		frappe.throw(_("مرجع البطاقة مطلوب لاعتماد الإيداع."), frappe.ValidationError)

	resolved_date = _resolve_valid_date(deposit_date)
	require_deposit_approval_permission(resolved_date)

	derived_fy = derive_fiscal_year_from_date(resolved_date)
	require_fiscal_year_open(derived_fy)
	require_fiscal_permission(derived_fy, "edit", check_open=True)

	rows = frappe.db.sql(
		"""
		SELECT
			name,
			card,
			deposit_amount,
			IFNULL(stopped_for_reason, 0) AS stopped_for_reason,
			IFNULL(is_approved, 0) AS is_approved,
			approved_amount
		FROM `tabArchive Card Deposit`
		WHERE card = %(card)s
			AND deposit_date = %(deposit_date)s
		FOR UPDATE
		""",
		{"card": clean_card, "deposit_date": resolved_date},
		as_dict=True,
	)
	require_deposit_approval_permission(resolved_date)

	if not rows:
		frappe.throw(
			_("لا يمكن اعتماد هذا الصف قبل حفظ مبلغ إيداع أكبر من صفر."),
			frappe.ValidationError,
		)

	existing = rows[0]
	if cint(existing.get("stopped_for_reason")) == 1:
		frappe.throw(
			_("لا يمكن اعتماد سجل مفعّل عليه «موقف لسبب»."),
			frappe.ValidationError,
		)

	saved_amount = flt(existing.get("deposit_amount") or 0, 2)
	if saved_amount <= 0:
		frappe.throw(
			_("لا يمكن اعتماد إيداع بقيمة صفر. يجب حفظ مبلغ إيداع أكبر من صفر أولاً."),
			frappe.ValidationError,
		)

	if expected_amount is not None and cstr(expected_amount).strip() != "":
		exp_val = _validate_and_clean_amount(expected_amount, card_label=clean_card)
		if abs(exp_val - saved_amount) >= 0.0001:
			frappe.throw(
				_("يوجد تعديل غير محفوظ على مبلغ الإيداع. يرجى حفظ التعديلات أولاً قبل الاعتماد."),
				frappe.ValidationError,
			)

	if cint(existing.get("is_approved")) == 1:
		frappe.throw(_("هذا الإيداع معتمد بالفعل."), frappe.ValidationError)

	current_user = cstr(frappe.session.user or "Administrator")
	now_ts = now_datetime()

	doc = frappe.get_doc(DEPOSIT_DOCTYPE, existing.name)
	history = _parse_json_arg(doc.audit_history_json, [])
	if not isinstance(history, list):
		history = []
	history.append(
		{
			"action": "approved",
			"from_amount": saved_amount,
			"to_amount": saved_amount,
			"approved_amount": saved_amount,
			"by": current_user,
			"at": cstr(now_ts),
		}
	)
	if len(history) > 50:
		history = history[-50:]

	doc.is_approved = 1
	doc.approved_amount = saved_amount
	doc.approved_by = current_user
	doc.approved_at = now_ts
	doc.last_modified_by = current_user
	doc.last_modified_at = now_ts
	doc.audit_history_json = json.dumps(history, ensure_ascii=False)
	doc.flags.from_deposits_approval_api = True
	doc.flags.allow_historical_active_card = True
	doc.save(ignore_permissions=True)

	user_ids = {current_user}
	for k in ("recorded_by", "last_modified_by", "approved_by", "unapproved_by", "stopped_reason_by"):
		if doc.get(k):
			user_ids.add(cstr(doc.get(k)))
	user_names = _resolve_user_full_names(user_ids)

	row_stub: dict[str, Any] = {
		"has_saved_record": True,
		"_raw_dep": doc.as_dict(),
	}
	_hydrate_row_audit(row_stub, user_names)

	return {
		"ok": True,
		"card": clean_card,
		"deposit_date": resolved_date,
		"deposit_id": doc.name,
		"deposit_amount": saved_amount,
		"is_approved": True,
		"approved_amount": saved_amount,
		"approved_by": current_user,
		"approved_by_name": user_names.get(current_user) or current_user,
		"approved_at": cstr(now_ts),
		"audit": row_stub.get("audit"),
	}


@frappe.whitelist()
def unapprove_deposit(
	card: str,
	deposit_date: str,
) -> dict[str, Any]:
	require_deposits_screen_access()
	clean_card = cstr(card or "").strip()
	if not clean_card:
		frappe.throw(_("مرجع البطاقة مطلوب لإلغاء اعتماد الإيداع."), frappe.ValidationError)

	resolved_date = _resolve_valid_date(deposit_date)
	require_deposit_approval_permission(resolved_date)

	derived_fy = derive_fiscal_year_from_date(resolved_date)
	require_fiscal_year_open(derived_fy)
	require_fiscal_permission(derived_fy, "edit", check_open=True)

	rows = frappe.db.sql(
		"""
		SELECT
			name,
			card,
			deposit_amount,
			IFNULL(stopped_for_reason, 0) AS stopped_for_reason,
			IFNULL(is_approved, 0) AS is_approved,
			approved_amount
		FROM `tabArchive Card Deposit`
		WHERE card = %(card)s
			AND deposit_date = %(deposit_date)s
		FOR UPDATE
		""",
		{"card": clean_card, "deposit_date": resolved_date},
		as_dict=True,
	)
	require_deposit_approval_permission(resolved_date)

	if not rows or cint(rows[0].get("is_approved")) == 0:
		frappe.throw(_("هذا الإيداع غير معتمد حالياً."), frappe.ValidationError)

	existing = rows[0]
	current_user = cstr(frappe.session.user or "Administrator")
	now_ts = now_datetime()

	doc = frappe.get_doc(DEPOSIT_DOCTYPE, existing.name)
	saved_amount = flt(doc.deposit_amount or 0, 2)
	prev_approved_amount = flt(doc.approved_amount or saved_amount, 2)

	history = _parse_json_arg(doc.audit_history_json, [])
	if not isinstance(history, list):
		history = []
	history.append(
		{
			"action": "unapproved",
			"from_amount": saved_amount,
			"to_amount": saved_amount,
			"previous_approved_amount": prev_approved_amount,
			"by": current_user,
			"at": cstr(now_ts),
		}
	)
	if len(history) > 50:
		history = history[-50:]

	doc.is_approved = 0
	doc.unapproved_by = current_user
	doc.unapproved_at = now_ts
	doc.last_modified_by = current_user
	doc.last_modified_at = now_ts
	doc.audit_history_json = json.dumps(history, ensure_ascii=False)
	doc.flags.from_deposits_approval_api = True
	doc.flags.allow_historical_active_card = True
	doc.save(ignore_permissions=True)

	user_ids = {current_user}
	for k in ("recorded_by", "last_modified_by", "approved_by", "unapproved_by", "stopped_reason_by"):
		if doc.get(k):
			user_ids.add(cstr(doc.get(k)))
	user_names = _resolve_user_full_names(user_ids)

	row_stub: dict[str, Any] = {
		"has_saved_record": True,
		"_raw_dep": doc.as_dict(),
	}
	_hydrate_row_audit(row_stub, user_names)

	return {
		"ok": True,
		"card": clean_card,
		"deposit_date": resolved_date,
		"deposit_id": doc.name,
		"deposit_amount": saved_amount,
		"is_approved": False,
		"unapproved_by": current_user,
		"unapproved_by_name": user_names.get(current_user) or current_user,
		"unapproved_at": cstr(now_ts),
		"audit": row_stub.get("audit"),
	}
