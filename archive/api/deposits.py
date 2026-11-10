from __future__ import annotations

import json
import math
import re
from typing import Any

from urllib.parse import unquote

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, get_datetime, getdate, now_datetime, today


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

ALL_DEPOSITS_ROLES = (
	ROLE_DEPOSITS_VIEW,
	ROLE_DEPOSITS_EDIT_TODAY,
	ROLE_DEPOSITS_EDIT_PAST,
	ROLE_DEPOSITS_EDIT_FUTURE,
)

USER_PAST_DAYS_FIELD = "allowed_past_deposit_days"
USER_FUTURE_DAYS_FIELD = "allowed_future_deposit_days"
USER_DEPOSIT_DAY_FIELDS = (USER_PAST_DAYS_FIELD, USER_FUTURE_DAYS_FIELD)

VALID_DEPOSIT_FILTERS = ("", "all", "deposited", "not_deposited")

SORTABLE_COLUMNS = (
	"serial_no",
	"card_name",
	"card_type",
	"card_number",
	"bank",
	"representative",
	"region",
	"deposit_amount",
	"remaining_limit",
	"status",
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


def get_user_deposit_day_limits(user: str | None = None) -> dict[str, int]:
	"""
	Reads per-user day window limits directly from `tabUser` without cache so any
	permission/day-limit update takes effect immediately on the next API request.
	"""
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	if not resolved_user or resolved_user == "Guest":
		return {"past_days": 0, "future_days": 0}

	has_past = frappe.db.has_column("User", USER_PAST_DAYS_FIELD)
	has_future = frappe.db.has_column("User", USER_FUTURE_DAYS_FIELD)
	if not has_past and not has_future:
		return {"past_days": 0, "future_days": 0}

	select_cols = [
		f"IFNULL(`{USER_PAST_DAYS_FIELD}`, 0) AS past_days" if has_past else "0 AS past_days",
		f"IFNULL(`{USER_FUTURE_DAYS_FIELD}`, 0) AS future_days" if has_future else "0 AS future_days",
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
	Validates `allowed_past_deposit_days` and `allowed_future_deposit_days` on User:
	- Non-negative integers only (default 0).
	- Employees cannot modify their own day limits (even via API).
	- Only an authorized User/Permissions administrator can modify these fields.
	"""
	meta = doc.meta if hasattr(doc, "meta") else None
	has_past_field = bool(meta and meta.has_field(USER_PAST_DAYS_FIELD))
	has_future_field = bool(meta and meta.has_field(USER_FUTURE_DAYS_FIELD))
	if not has_past_field and not has_future_field:
		return

	new_past = (
		_coerce_non_negative_day_limit(
			doc.get(USER_PAST_DAYS_FIELD),
			_("عدد الأيام السابقة المسموح بتعديلها"),
		)
		if has_past_field
		else 0
	)
	new_future = (
		_coerce_non_negative_day_limit(
			doc.get(USER_FUTURE_DAYS_FIELD),
			_("عدد الأيام القادمة المسموح بتعديلها"),
		)
		if has_future_field
		else 0
	)

	if has_past_field:
		doc.set(USER_PAST_DAYS_FIELD, new_past)
	if has_future_field:
		doc.set(USER_FUTURE_DAYS_FIELD, new_future)

	if getattr(frappe.flags, "in_migrate", False) or getattr(frappe.flags, "in_patch", False):
		return

	if not doc.is_new() and frappe.db.exists("User", doc.name):
		prev = get_user_deposit_day_limits(user=doc.name)
		old_past = prev["past_days"]
		old_future = prev["future_days"]
	else:
		old_past = 0
		old_future = 0

	if new_past == old_past and new_future == old_future:
		return

	acting_user = cstr(frappe.session.user or "Guest").strip()
	if not is_user_deposit_settings_admin(user=acting_user) or (
		acting_user != "Administrator" and cstr(doc.name).strip() == acting_user
	):
		frappe.throw(
			_("لا يُسمح بتعديل حدود أيام تعديل الإيداعات إلا من قِبل المسؤول المخوّل بإدارة المستخدمين."),
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
	return {
		"banks": banks,
		"representatives": representatives,
		"regions": regions,
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


def _load_day_dataset(deposit_date: str) -> list[dict[str, Any]]:
	"""
	Loads all currently active non-deleted cards (`status = 'نشطة'`, `is_deleted = 0`)
	for `deposit_date`, joined with any saved deposit record for that date.
	Inactive/stopped cards are excluded from the screen and its statistics while keeping
	their saved historical deposit records untouched in `tabArchive Card Deposit` and
	counted toward their shared 3-element deposit group's daily limit consumption.
	"""
	raw_rows = frappe.db.sql(
		"""
		SELECT
			c.name AS card_id,
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
			c.daily_limit,
			c.status AS card_status,
			IFNULL(c.is_deleted, 0) AS is_deleted,
			d.name AS deposit_id,
			d.deposit_amount,
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
			d.audit_history_json
		FROM `tabArchive Card` c
		LEFT JOIN `tabArchive Card Deposit` d
			ON d.card = c.name AND d.deposit_date = %(deposit_date)s
		LEFT JOIN `tabArchive Bank` b ON b.name = c.bank
		LEFT JOIN `tabArchive Representative` rep ON rep.name = c.representative
		LEFT JOIN `tabArchive Region` reg ON reg.name = c.region
		WHERE IFNULL(c.is_deleted, 0) = 0
			AND c.status = %(active_status)s
		ORDER BY c.serial_no DESC, c.name ASC
		""",
		{
			"deposit_date": deposit_date,
			"active_status": ACTIVE_CARD_STATUS,
		},
		as_dict=True,
	)

	user_ids: set[str] = set()
	norm_accounts: set[str] = set()
	for r in raw_rows:
		if r.get("recorded_by"):
			user_ids.add(cstr(r.get("recorded_by")))
		if r.get("last_modified_by"):
			user_ids.add(cstr(r.get("last_modified_by")))
		n_acc = cstr(r.get("account_number_normalized") or "").strip() or normalize_account_number(
			cstr(r.get("account_number") or "")
		)
		if n_acc:
			norm_accounts.add(n_acc)
	user_names = _resolve_user_full_names(user_ids)

	today_str = cstr(today())
	is_past_date = deposit_date < today_str
	account_state_map = _resolve_account_limits_and_consumption(
		norm_accounts=norm_accounts,
		deposit_date=deposit_date,
		today_str=today_str,
	)

	items: list[dict[str, Any]] = []
	for r in raw_rows:
		card_id = cstr(r.get("card_id"))
		has_deposit_doc = bool(r.get("deposit_id"))
		saved_amount = flt(r.get("deposit_amount") or 0, 2) if has_deposit_doc else 0.0
		is_deposited = saved_amount > 0

		use_snapshot = has_deposit_doc and (
			is_past_date
			or r.get("card_status") != ACTIVE_CARD_STATUS
			or cint(r.get("is_deleted")) == 1
			or is_deposited
		)

		if use_snapshot:
			effective_card_name = cstr(r.get("card_name_snapshot") or r.get("card_name") or "")
			effective_base_name = cstr(
				r.get("base_card_name_snapshot") or r.get("base_card_name") or effective_card_name
			)
			effective_copy_no = cint(r.get("copy_no_snapshot") or r.get("copy_no") or 1)
			effective_card_type = clean_card_type(
				r.get("card_type_snapshot") or r.get("card_type")
			)
			effective_card_number = cstr(r.get("card_number_snapshot") or r.get("card_number") or "")
			effective_account_number = cstr(
				r.get("account_number_snapshot") or r.get("account_number") or ""
			)
			effective_bank = cstr(r.get("bank_snapshot") or r.get("bank") or "")
			effective_bank_name = cstr(
				r.get("bank_name_snapshot") or r.get("bank_name") or effective_bank
			)
			effective_rep = cstr(r.get("representative_snapshot") or r.get("representative") or "")
			effective_rep_name = cstr(
				r.get("representative_name_snapshot")
				or r.get("representative_name")
				or effective_rep
			)
			effective_region = cstr(r.get("region_snapshot") or r.get("region") or "")
			effective_region_name = cstr(
				r.get("region_name_snapshot") or r.get("region_name") or effective_region
			)
		else:
			effective_card_name = cstr(r.get("card_name") or "")
			effective_base_name = cstr(r.get("base_card_name") or effective_card_name)
			effective_copy_no = cint(r.get("copy_no") or 1)
			effective_card_type = clean_card_type(r.get("card_type"))
			effective_card_number = cstr(r.get("card_number") or "")
			effective_account_number = cstr(r.get("account_number") or "")
			effective_bank = cstr(r.get("bank") or "")
			effective_bank_name = cstr(r.get("bank_name") or effective_bank)
			effective_rep = cstr(r.get("representative") or "")
			effective_rep_name = cstr(r.get("representative_name") or effective_rep)
			effective_region = cstr(r.get("region") or "")
			effective_region_name = cstr(r.get("region_name") or effective_region)

		effective_copy_label = format_copy_badge_label(effective_card_type, effective_copy_no)
		account_key = _resolve_deposit_group_key(
			effective_base_name,
			r.get("account_number_normalized"),
			effective_account_number,
			effective_bank,
			card_id,
		)
		acc_state = account_state_map.get(account_key)
		if acc_state is not None:
			if effective_card_type == CARD_TYPE_BUSINESS:
				effective_daily_limit = flt(acc_state["business_limit"], 2)
				remaining_limit = flt(acc_state["remaining_business"], 2)
				has_limit_conflict = bool(acc_state["business_conflict"])
			elif effective_card_type == CARD_TYPE_MADA:
				effective_daily_limit = flt(acc_state["mada_limit"], 2)
				remaining_limit = flt(acc_state["remaining_mada"], 2)
				has_limit_conflict = bool(acc_state["mada_conflict"])
			else:
				effective_daily_limit = flt(acc_state["legacy_limit"], 2)
				remaining_limit = flt(acc_state["remaining_legacy"], 2)
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
		else:
			effective_daily_limit = (
				max(0.0, flt(r.get("daily_limit_snapshot"), 2))
				if has_deposit_doc and is_past_date and r.get("daily_limit_snapshot") is not None
				else max(0.0, flt(r.get("daily_limit") or 0, 2))
			)
			account_saved_total = saved_amount
			remaining_limit = max(0.0, flt(effective_daily_limit - saved_amount, 2))
			has_limit_conflict = False
			has_business = effective_card_type == CARD_TYPE_BUSINESS
			has_mada = effective_card_type == CARD_TYPE_MADA
			business_limit = effective_daily_limit if has_business else 0.0
			mada_limit = effective_daily_limit if has_mada else 0.0
			legacy_limit = effective_daily_limit if (not has_business and not has_mada) else 0.0
			business_saved_total = saved_amount if has_business else 0.0
			mada_saved_total = saved_amount if has_mada else 0.0
			legacy_saved_total = saved_amount if (not has_business and not has_mada) else 0.0
			group_daily_target = effective_daily_limit

		status_key = "deposited" if is_deposited else "not_deposited"
		status_label = "تم الإيداع" if is_deposited else "لم يتم الإيداع"

		recorded_by = cstr(r.get("recorded_by") or "")
		last_modified_by = cstr(r.get("last_modified_by") or "")
		audit_history = _parse_json_arg(r.get("audit_history_json"), [])

		search_blob = normalize_search_text(
			" ".join(
				[
					effective_card_name,
					effective_base_name,
					effective_card_type,
					effective_copy_label,
					effective_card_number,
					effective_account_number,
					effective_bank_name,
					effective_rep_name,
					effective_region_name,
					cstr(cint(r.get("serial_no"))),
				]
			)
		)

		items.append(
			{
				"card": card_id,
				"account_key": account_key,
				"group_key": account_key,
				"serial_no": cint(r.get("serial_no")),
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
				"card_status": cstr(r.get("card_status") or ACTIVE_CARD_STATUS),
				"is_historical_inactive": bool(
					r.get("card_status") != ACTIVE_CARD_STATUS or cint(r.get("is_deleted")) == 1
				),
				"daily_limit": effective_daily_limit,
				"daily_limit_formatted": format_financial_amount(effective_daily_limit, zero_as_zero=True),
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
				"has_limit_conflict": has_limit_conflict,
				"deposit_id": cstr(r.get("deposit_id") or ""),
				"has_saved_record": has_deposit_doc,
				"deposit_amount": saved_amount,
				"deposit_amount_formatted": (
					format_financial_amount(saved_amount, zero_as_zero=False)
					if is_deposited
					else ("0" if has_deposit_doc and saved_amount == 0 else "")
				),
				"remaining_limit": remaining_limit,
				"remaining_limit_formatted": format_financial_amount(remaining_limit, zero_as_zero=True),
				"status": status_key,
				"status_label": status_label,
				"audit": {
					"recorded_by": recorded_by,
					"recorded_by_name": user_names.get(recorded_by, recorded_by) if recorded_by else "",
					"recorded_at": _format_audit_datetime(r.get("recorded_at")),
					"last_modified_by": last_modified_by,
					"last_modified_by_name": (
						user_names.get(last_modified_by, last_modified_by) if last_modified_by else ""
					),
					"last_modified_at": _format_audit_datetime(r.get("last_modified_at")),
					"previous_amount": (
						flt(r.get("previous_amount"), 2)
						if r.get("previous_amount") is not None
						else None
					),
					"history_count": len(audit_history) if isinstance(audit_history, list) else 0,
				}
				if has_deposit_doc
				else None,
				"_search_blob": search_blob,
			}
		)

	return items


def _compute_day_stats(all_items: list[dict[str, Any]]) -> dict[str, Any]:
	total_cards = len(all_items)
	deposited_count = sum(1 for item in all_items if flt(item["deposit_amount"], 2) > 0)
	not_deposited_count = total_cards - deposited_count
	total_deposited_amount = flt(
		sum(flt(item["deposit_amount"], 2) for item in all_items if flt(item["deposit_amount"], 2) > 0),
		2,
	)
	# Daily Target (`الهدف اليومي`) per 3-element group (`base_card_name + account_number + bank`):
	# - If the group has `أعمال` (with or without `مدى`): count `أعمال` limit once only.
	# - If the group has `مدى` only: count `مدى` limit once only.
	# - Never multiply by copy count and never sum `مدى` + `أعمال` for the same 3-element group.
	groups_info: dict[str, dict[str, Any]] = {}
	for item in all_items:
		g_key = cstr(item.get("group_key") or item.get("account_key") or item.get("card"))
		g_entry = groups_info.setdefault(
			g_key,
			{
				"has_business": False,
				"has_mada": False,
				"business_limit": 0.0,
				"mada_limit": 0.0,
				"legacy_limit": 0.0,
			},
		)
		c_type = clean_card_type(item.get("card_type"))
		c_lim = flt(item.get("daily_limit"), 2)
		if c_type == CARD_TYPE_BUSINESS:
			g_entry["has_business"] = True
			if c_lim > g_entry["business_limit"]:
				g_entry["business_limit"] = c_lim
		elif c_type == CARD_TYPE_MADA:
			g_entry["has_mada"] = True
			if c_lim > g_entry["mada_limit"]:
				g_entry["mada_limit"] = c_lim
		else:
			if c_lim > g_entry["legacy_limit"]:
				g_entry["legacy_limit"] = c_lim

	total_daily_target = 0.0
	for g_entry in groups_info.values():
		if g_entry["has_business"]:
			total_daily_target = flt(total_daily_target + g_entry["business_limit"], 2)
		elif g_entry["has_mada"]:
			total_daily_target = flt(total_daily_target + g_entry["mada_limit"], 2)
		else:
			total_daily_target = flt(total_daily_target + g_entry["legacy_limit"], 2)

	return {
		"total_cards": total_cards,
		"deposited_count": deposited_count,
		"not_deposited_count": not_deposited_count,
		"total_deposited_amount": total_deposited_amount,
		"total_deposited_amount_formatted": format_financial_amount(
			total_deposited_amount, zero_as_zero=True
		),
		"total_daily_target": total_daily_target,
		"total_daily_target_formatted": format_financial_amount(
			total_daily_target, zero_as_zero=True
		),
	}


def _sort_items(
	items: list[dict[str, Any]],
	sort_by: str,
	sort_order: str,
) -> list[dict[str, Any]]:
	col = sort_by if sort_by in SORTABLE_COLUMNS else "serial_no"
	reverse = (sort_order or "").strip().lower() != "asc"

	def sort_key(row: dict[str, Any]) -> Any:
		if col == "serial_no":
			return (cint(row.get("serial_no")), cstr(row.get("card")))
		if col == "card_name":
			return (cstr(row.get("card_name")).lower(), cint(row.get("serial_no")))
		if col == "card_type":
			return (cstr(row.get("card_type")).lower(), cint(row.get("serial_no")))
		if col == "card_number":
			return (cstr(row.get("card_number")), cint(row.get("serial_no")))
		if col == "bank":
			return (cstr(row.get("bank_name")).lower(), cint(row.get("serial_no")))
		if col == "representative":
			return (cstr(row.get("representative_name")).lower(), cint(row.get("serial_no")))
		if col == "region":
			return (cstr(row.get("region_name")).lower(), cint(row.get("serial_no")))
		if col == "deposit_amount":
			return (flt(row.get("deposit_amount"), 2), cint(row.get("serial_no")))
		if col == "remaining_limit":
			return (flt(row.get("remaining_limit"), 2), cint(row.get("serial_no")))
		if col == "status":
			return (1 if row.get("status") == "deposited" else 0, cint(row.get("serial_no")))
		return (cint(row.get("serial_no")), cstr(row.get("card")))

	return sorted(items, key=sort_key, reverse=reverse)


@frappe.whitelist()
def get_deposits_context(
	deposit_date: str = "",
	status_filter: str = "",
	search: str = "",
	bank: str = "",
	representative: str = "",
	region: str = "",
	page: int | str = 1,
	page_size: int | str = 50,
	sort_by: str = "serial_no",
	sort_order: str = "desc",
	fiscal_year: str = "",
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

	if not deposit_date or not cstr(deposit_date).strip():
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
					deposit_date = cstr(fy_bounds.end_date)
				else:
					deposit_date = cstr(fy_bounds.start_date)

	resolved_date = _resolve_valid_date(deposit_date)
	derived_fy = derive_fiscal_year_from_date(resolved_date)
	require_fiscal_permission(derived_fy, "view", check_open=False)
	if clean_fy and clean_fy != "all" and derived_fy != clean_fy:
		frappe.throw(
			_("التاريخ المحدد ({0}) يقع في السنة المالية ({1}) ولا ينتمي إلى السنة المالية المحددة ({2}).").format(
				resolved_date, derived_fy, clean_fy
			),
			frappe.ValidationError,
		)

	all_day_items = _load_day_dataset(resolved_date)

	# Compute day summary statistics across the entire day dataset within user permissions
	# so search, status filter, sorting, and pagination never distort the day's totals.
	stats = _compute_day_stats(all_day_items)

	clean_bank = cstr(bank or "").strip()
	clean_rep = cstr(representative or "").strip()
	clean_region = cstr(region or "").strip()
	clean_status = cstr(status_filter or "").strip().lower()
	if clean_status not in VALID_DEPOSIT_FILTERS:
		clean_status = ""

	norm_search = normalize_search_text(search or "")
	search_tokens = [tok for tok in norm_search.split(" ") if tok] if norm_search else []

	filtered: list[dict[str, Any]] = []
	for item in all_day_items:
		if clean_bank and item["bank"] != clean_bank:
			continue
		if clean_rep and item["representative"] != clean_rep:
			continue
		if clean_region and item["region"] != clean_region:
			continue
		if clean_status == "deposited" and item["status"] != "deposited":
			continue
		if clean_status == "not_deposited" and item["status"] != "not_deposited":
			continue
		if search_tokens:
			blob = item.get("_search_blob") or ""
			if not all(tok in blob for tok in search_tokens):
				continue
		filtered.append(item)

	sorted_items = _sort_items(filtered, sort_by=sort_by, sort_order=sort_order)
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

	clean_rows = []
	for r in page_rows:
		row_copy = dict(r)
		row_copy.pop("_search_blob", None)
		clean_rows.append(row_copy)

	fy_is_closed = is_fiscal_year_closed(derived_fy)
	return {
		"deposit_date": resolved_date,
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
			"can_save": can_edit_deposits_for_date(resolved_date),
			"can_add_in_fiscal_year": has_fiscal_permission(derived_fy, "add", check_open=True),
			"can_edit_in_fiscal_year": has_fiscal_permission(derived_fy, "edit", check_open=True),
		},
	}


@frappe.whitelist()
def save_daily_deposits(
	deposit_date: str,
	items: list[dict[str, Any]] | str,
) -> dict[str, Any]:
	require_deposits_screen_access()
	resolved_date = _resolve_valid_date(deposit_date)
	require_deposit_save_permission(resolved_date)

	parsed_items = _parse_json_arg(items, None)
	if not isinstance(parsed_items, list) or len(parsed_items) == 0:
		frappe.throw(_("لا توجد إيداعات معدلة للحفظ."), frappe.ValidationError)

	if len(parsed_items) > 2000:
		frappe.throw(_("عدد السجلات المرسلة يتجاوز الحد المسموح به في عملية حفظ واحدة."), frappe.ValidationError)

	normalized_entries: dict[str, float] = {}
	for entry in parsed_items:
		if not isinstance(entry, dict):
			frappe.throw(_("صيغة بيانات الإيداعات المرسلة غير صالحة."), frappe.ValidationError)
		card_id = cstr(entry.get("card") or "").strip()
		if not card_id:
			frappe.throw(_("مرجع البطاقة مفقود في أحد السجلات."), frappe.ValidationError)
		if card_id in normalized_entries:
			frappe.throw(
				_("تم تكرار البطاقة ({0}) في نفس طلب الحفظ.").format(card_id),
				frappe.ValidationError,
			)
		amount = _validate_and_clean_amount(entry.get("amount"), card_label=card_id)
		normalized_entries[card_id] = amount

	sorted_card_ids = sorted(normalized_entries.keys())

	# Step 1: Discover normalized account numbers for requested cards
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
	)

	# Step 2: Lock ALL cards sharing those account numbers (active + stopped) in deterministic
	# `c.name ASC` order to strictly serialize concurrent saves on different copies of the same deposit group.
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
			{"norms": tuple(target_norms), "card_ids": tuple(sorted_card_ids)},
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
			{"card_ids": tuple(sorted_card_ids)},
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

	# Step 3: Lock ALL deposit rows on resolved_date across all copies of those accounts
	existing_deposits = frappe.db.sql(
		"""
		SELECT
			name,
			card,
			deposit_amount,
			daily_limit_snapshot,
			card_type_snapshot,
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
			"deposit_date": resolved_date,
			"card_ids": tuple(all_locked_card_ids),
		},
		as_dict=True,
	)
	existing_by_card = {cstr(row.card): row for row in existing_deposits}

	# Re-verify date edit permission after acquiring row locks so concurrent role/limit changes
	# or midnight date rollover cannot bypass date-window restrictions.
	require_deposit_save_permission(resolved_date)
	derived_fy = derive_fiscal_year_from_date(resolved_date)
	require_fiscal_year_open(derived_fy)

	current_user = cstr(frappe.session.user or "Administrator")
	now_ts = now_datetime()
	today_str = cstr(today())
	is_past_date = resolved_date < today_str

	saved_count = 0
	created_count = 0
	updated_count = 0
	skipped_zero_count = 0

	# Step 4: Validate active status on all edited cards upfront
	for cid in sorted_card_ids:
		card_row = cards_by_id[cid]
		is_card_active = (
			cint(card_row.get("is_deleted")) == 0
			and cstr(card_row.get("status")) == ACTIVE_CARD_STATUS
		)
		if not is_card_active:
			frappe.throw(
				_("لا يمكن حفظ أو تعديل إيداع للبطاقة غير النشطة ({0}).").format(
					cstr(card_row.get("card_name") or cid)
				),
				frappe.ValidationError,
			)

	# Step 5: Group all locked cards by shared 3-element deposit group (`base_card_name + account_number + bank`)
	# and enforce `أعمال` priority ceiling over `مدى`:
	#   - If `مدى` exists: D_M <= M
	#   - If `أعمال` exists: D_A + D_M <= A
	cards_by_group: dict[str, list[dict[str, Any]]] = {}
	for c_row in locked_cards:
		g_key = _resolve_deposit_group_key(
			c_row.get("base_card_name"),
			c_row.get("account_number_normalized"),
			c_row.get("account_number"),
			c_row.get("bank"),
			cstr(c_row.get("name")),
		)
		cards_by_group.setdefault(g_key, []).append(c_row)

	edited_group_keys = sorted(
		{
			_resolve_deposit_group_key(
				cards_by_id[cid].get("base_card_name"),
				cards_by_id[cid].get("account_number_normalized"),
				cards_by_id[cid].get("account_number"),
				cards_by_id[cid].get("bank"),
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
			if m_cid in normalized_entries:
				amt = flt(normalized_entries[m_cid], 2)
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

	savepoint_name = "archive_deposits_batch_save_sp"
	frappe.db.savepoint(savepoint_name)
	try:
		for cid in sorted_card_ids:
			card_row = cards_by_id[cid]
			new_amount = normalized_entries[cid]
			existing = existing_by_card.get(cid)
			is_card_active = True
			c_type = clean_card_type(card_row.get("card_type"))
			g_key = _resolve_deposit_group_key(
				card_row.get("base_card_name"),
				card_row.get("account_number_normalized"),
				card_row.get("account_number"),
				card_row.get("bank"),
				cid,
			)
			grp_limits = resolved_limits_by_group.get(g_key, {})
			snapshot_limit = flt(
				grp_limits.get(c_type, flt(card_row.get("daily_limit") or 0, 2)),
				2,
			)

			if not existing:
				# Do not create dummy zero deposit records for cards with no deposit
				if new_amount <= 0:
					skipped_zero_count += 1
					continue

				require_fiscal_permission(derived_fy, "add", check_open=True)

				initial_history = [
					{
						"action": "created",
						"from_amount": 0.0,
						"to_amount": new_amount,
						"by": current_user,
						"at": cstr(now_ts),
					}
				]

				doc = frappe.get_doc(
					{
						"doctype": DEPOSIT_DOCTYPE,
						"fiscal_year": derived_fy,
						"card": cid,
						"deposit_date": resolved_date,
						"deposit_amount": new_amount,
						"daily_limit_snapshot": snapshot_limit,
						"previous_amount": 0.0,
						"card_name_snapshot": cstr(card_row.get("card_name") or ""),
						"base_card_name_snapshot": cstr(card_row.get("base_card_name") or ""),
						"copy_no_snapshot": cint(card_row.get("copy_no") or 1),
						"card_type_snapshot": c_type,
						"card_number_snapshot": cstr(card_row.get("card_number") or ""),
						"account_number_snapshot": cstr(card_row.get("account_number") or ""),
						"bank_snapshot": card_row.get("bank") or None,
						"bank_name_snapshot": cstr(
							card_row.get("bank_name") or card_row.get("bank") or ""
						),
						"representative_snapshot": card_row.get("representative") or None,
						"representative_name_snapshot": cstr(
							card_row.get("representative_name")
							or card_row.get("representative")
							or ""
						),
						"region_snapshot": card_row.get("region") or None,
						"region_name_snapshot": cstr(
							card_row.get("region_name") or card_row.get("region") or ""
						),
						"recorded_by": current_user,
						"recorded_at": now_ts,
						"last_modified_by": current_user,
						"last_modified_at": now_ts,
						"audit_history_json": json.dumps(initial_history, ensure_ascii=False),
					}
				)
				doc.flags.from_deposits_batch_api = True
				doc.insert(ignore_permissions=True)
				created_count += 1
				saved_count += 1
			else:
				old_amount = flt(existing.get("deposit_amount") or 0, 2)
				if abs(old_amount - new_amount) < 0.0001:
					# Idempotent: identical retry does not create duplicate or fake modification entry
					continue

				require_fiscal_permission(derived_fy, "edit", check_open=True)

				doc = frappe.get_doc(DEPOSIT_DOCTYPE, existing.name)
				history = _parse_json_arg(doc.audit_history_json, [])
				if not isinstance(history, list):
					history = []
				history.append(
					{
						"action": "updated",
						"from_amount": old_amount,
						"to_amount": new_amount,
						"by": current_user,
						"at": cstr(now_ts),
					}
				)
				# Keep history compact (last 50 entries)
				if len(history) > 50:
					history = history[-50:]

				doc.previous_amount = old_amount
				doc.deposit_amount = new_amount
				if not doc.recorded_by:
					doc.recorded_by = current_user
				if not doc.recorded_at:
					doc.recorded_at = now_ts
				doc.last_modified_by = current_user
				doc.last_modified_at = now_ts
				doc.audit_history_json = json.dumps(history, ensure_ascii=False)

				# Only refresh reference snapshots when editing today/future on a currently active card;
				# never overwrite historical snapshots of past dates or stopped cards!
				if resolved_date >= today_str and is_card_active:
					doc.daily_limit_snapshot = snapshot_limit
					doc.card_name_snapshot = cstr(card_row.get("card_name") or "")
					doc.base_card_name_snapshot = cstr(card_row.get("base_card_name") or "")
					doc.copy_no_snapshot = cint(card_row.get("copy_no") or 1)
					doc.card_type_snapshot = c_type
					doc.card_number_snapshot = cstr(card_row.get("card_number") or "")
					doc.account_number_snapshot = cstr(card_row.get("account_number") or "")
					doc.bank_snapshot = card_row.get("bank") or None
					doc.bank_name_snapshot = cstr(
						card_row.get("bank_name") or card_row.get("bank") or ""
					)
					doc.representative_snapshot = card_row.get("representative") or None
					doc.representative_name_snapshot = cstr(
						card_row.get("representative_name")
						or card_row.get("representative")
						or ""
					)
					doc.region_snapshot = card_row.get("region") or None
					doc.region_name_snapshot = cstr(
						card_row.get("region_name") or card_row.get("region") or ""
					)

				doc.flags.from_deposits_batch_api = True
				doc.save(ignore_permissions=True)
				updated_count += 1
				saved_count += 1
	except Exception:
		frappe.db.rollback(save_point=savepoint_name)
		raise

	all_day_items = _load_day_dataset(resolved_date)
	stats = _compute_day_stats(all_day_items)

	return {
		"ok": True,
		"deposit_date": resolved_date,
		"saved_count": saved_count,
		"created_count": created_count,
		"updated_count": updated_count,
		"skipped_zero_count": skipped_zero_count,
		"stats": stats,
	}
