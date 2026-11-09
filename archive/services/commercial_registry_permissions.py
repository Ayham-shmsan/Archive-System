from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr

COMMERCIAL_REGISTRY_DOCTYPE = "Archive Commercial Registry"
COMMERCIAL_REGISTRY_ATTACHMENT_DOCTYPE = "Archive Commercial Registry Attachment"
COMMERCIAL_REGISTRY_LOG_DOCTYPE = "Archive Commercial Registry Log"

ROLE_COMMERCIAL_REGISTRY_SCREEN_ACCESS = "صلاحية عرض شاشة السجلات التجارية"
ROLE_CREATE_COMMERCIAL_REGISTRY = "صلاحية إضافة سجل تجاري"
ROLE_EDIT_OWN_COMMERCIAL_REGISTRY = "صلاحية تعديل السجل للمستخدم"
ROLE_EDIT_OTHERS_COMMERCIAL_REGISTRY = "صلاحية تعديل سجلات الآخرين"
ROLE_VIEW_OWN_COMMERCIAL_REGISTRIES = "صلاحية عرض سجلات المستخدم فقط"
ROLE_VIEW_OTHERS_COMMERCIAL_REGISTRIES = "صلاحية عرض سجلات الآخرين"
ROLE_VIEW_COMMERCIAL_REGISTRY_TIMELINE = "صلاحية عرض سجل مستخدم العملية"
ROLE_DELETE_COMMERCIAL_REGISTRY = "صلاحية حذف سجل تجاري"

COMMERCIAL_REGISTRY_ROLES = (
	ROLE_COMMERCIAL_REGISTRY_SCREEN_ACCESS,
	ROLE_CREATE_COMMERCIAL_REGISTRY,
	ROLE_EDIT_OWN_COMMERCIAL_REGISTRY,
	ROLE_EDIT_OTHERS_COMMERCIAL_REGISTRY,
	ROLE_VIEW_OWN_COMMERCIAL_REGISTRIES,
	ROLE_VIEW_OTHERS_COMMERCIAL_REGISTRIES,
	ROLE_VIEW_COMMERCIAL_REGISTRY_TIMELINE,
	ROLE_DELETE_COMMERCIAL_REGISTRY,
)


def _resolve_user(user: str | None = None) -> str:
	return cstr(user or frappe.session.user or "Guest").strip() or "Guest"


def has_explicit_commercial_registry_role(
	role_name: str,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	if not resolved_user or resolved_user == "Guest" or not role_name:
		return False

	if not cint(frappe.db.get_value("User", resolved_user, "enabled")):
		return False

	return bool(
		frappe.db.exists(
			"Has Role",
			{
				"parent": resolved_user,
				"parenttype": "User",
				"role": role_name,
			},
		)
	)


def has_commercial_registries_screen_access_role(user: str | None = None) -> bool:
	return has_explicit_commercial_registry_role(
		ROLE_COMMERCIAL_REGISTRY_SCREEN_ACCESS,
		user=user,
	)


def require_commercial_registries_screen_access(user: str | None = None) -> None:
	if not has_commercial_registries_screen_access_role(user=user):
		frappe.throw(
			_("ليست لديك صلاحية عرض شاشة السجلات التجارية."),
			frappe.PermissionError,
		)


def can_create_commercial_registry(user: str | None = None) -> bool:
	return bool(
		has_commercial_registries_screen_access_role(user=user)
		and has_explicit_commercial_registry_role(
			ROLE_CREATE_COMMERCIAL_REGISTRY,
			user=user,
		)
	)


def require_create_commercial_registry(user: str | None = None) -> None:
	require_commercial_registries_screen_access(user=user)
	if not can_create_commercial_registry(user=user):
		frappe.throw(
			_("ليست لديك صلاحية إضافة سجل تجاري."),
			frappe.PermissionError,
		)


def can_view_own_commercial_registries(user: str | None = None) -> bool:
	return bool(
		has_commercial_registries_screen_access_role(user=user)
		and has_explicit_commercial_registry_role(
			ROLE_VIEW_OWN_COMMERCIAL_REGISTRIES,
			user=user,
		)
	)


def can_view_others_commercial_registries(user: str | None = None) -> bool:
	return bool(
		has_commercial_registries_screen_access_role(user=user)
		and has_explicit_commercial_registry_role(
			ROLE_VIEW_OTHERS_COMMERCIAL_REGISTRIES,
			user=user,
		)
	)


def has_any_commercial_registry_view_scope(user: str | None = None) -> bool:
	return bool(
		can_view_own_commercial_registries(user=user)
		or can_view_others_commercial_registries(user=user)
	)


def _extract_record_owner(doc_or_name: Any) -> str:
	if not doc_or_name:
		return ""
	if isinstance(doc_or_name, str):
		return cstr(
			frappe.db.get_value(COMMERCIAL_REGISTRY_DOCTYPE, doc_or_name, "owner") or ""
		).strip()
	if isinstance(doc_or_name, dict):
		return cstr(doc_or_name.get("owner") or "").strip()
	return cstr(getattr(doc_or_name, "owner", None) or "").strip()


def can_view_commercial_registry_by_owner(
	record_owner: str,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	if not has_commercial_registries_screen_access_role(user=resolved_user):
		return False
	clean_owner = cstr(record_owner).strip()
	if not clean_owner:
		return False
	if clean_owner == resolved_user:
		return can_view_own_commercial_registries(user=resolved_user)
	return can_view_others_commercial_registries(user=resolved_user)


def can_view_commercial_registry(
	doc_or_name: Any,
	user: str | None = None,
) -> bool:
	record_owner = _extract_record_owner(doc_or_name)
	return can_view_commercial_registry_by_owner(record_owner, user=user)


def require_view_commercial_registry(
	doc_or_name: Any,
	user: str | None = None,
) -> None:
	require_commercial_registries_screen_access(user=user)
	if not can_view_commercial_registry(doc_or_name, user=user):
		frappe.throw(
			_("ليست لديك صلاحية عرض هذا السجل التجاري."),
			frappe.PermissionError,
		)


def can_edit_commercial_registry(
	doc_or_name: Any,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	if not can_view_commercial_registry(doc_or_name, user=resolved_user):
		return False

	record_owner = _extract_record_owner(doc_or_name)
	if record_owner == resolved_user:
		return has_explicit_commercial_registry_role(
			ROLE_EDIT_OWN_COMMERCIAL_REGISTRY,
			user=resolved_user,
		)
	return has_explicit_commercial_registry_role(
		ROLE_EDIT_OTHERS_COMMERCIAL_REGISTRY,
		user=resolved_user,
	)


def require_edit_commercial_registry(
	doc_or_name: Any,
	user: str | None = None,
) -> None:
	require_view_commercial_registry(doc_or_name, user=user)
	if not can_edit_commercial_registry(doc_or_name, user=user):
		frappe.throw(
			_("ليست لديك صلاحية تعديل هذا السجل التجاري."),
			frappe.PermissionError,
		)


def can_delete_commercial_registry(
	doc_or_name: Any,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	if not can_view_commercial_registry(doc_or_name, user=resolved_user):
		return False
	return has_explicit_commercial_registry_role(
		ROLE_DELETE_COMMERCIAL_REGISTRY,
		user=resolved_user,
	)


def require_delete_commercial_registry(
	doc_or_name: Any,
	user: str | None = None,
) -> None:
	require_view_commercial_registry(doc_or_name, user=user)
	if not can_delete_commercial_registry(doc_or_name, user=user):
		frappe.throw(
			_("ليست لديك صلاحية حذف هذا السجل التجاري."),
			frappe.PermissionError,
		)


def can_view_commercial_registry_timeline_role(user: str | None = None) -> bool:
	return bool(
		has_commercial_registries_screen_access_role(user=user)
		and has_explicit_commercial_registry_role(
			ROLE_VIEW_COMMERCIAL_REGISTRY_TIMELINE,
			user=user,
		)
	)


def can_view_commercial_registry_timeline(
	doc_or_name: Any,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	if not can_view_commercial_registry_timeline_role(user=resolved_user):
		return False
	return can_view_commercial_registry(doc_or_name, user=resolved_user)


def require_view_commercial_registry_timeline(
	doc_or_name: Any,
	user: str | None = None,
) -> None:
	require_commercial_registries_screen_access(user=user)
	if not can_view_commercial_registry_timeline_role(user=user):
		frappe.throw(
			_("ليست لديك صلاحية عرض سجل مستخدم العملية."),
			frappe.PermissionError,
		)
	if not can_view_commercial_registry(doc_or_name, user=user):
		frappe.throw(
			_("ليست لديك صلاحية عرض هذا السجل التجاري."),
			frappe.PermissionError,
		)


def get_commercial_registry_permissions_summary(
	user: str | None = None,
) -> dict[str, bool]:
	resolved_user = _resolve_user(user)
	has_screen = has_commercial_registries_screen_access_role(user=resolved_user)
	view_own = can_view_own_commercial_registries(user=resolved_user)
	view_others = can_view_others_commercial_registries(user=resolved_user)
	edit_own = bool(
		has_screen
		and has_explicit_commercial_registry_role(
			ROLE_EDIT_OWN_COMMERCIAL_REGISTRY,
			user=resolved_user,
		)
	)
	edit_others = bool(
		has_screen
		and has_explicit_commercial_registry_role(
			ROLE_EDIT_OTHERS_COMMERCIAL_REGISTRY,
			user=resolved_user,
		)
	)
	return {
		"can_access_screen": has_screen,
		"can_create": can_create_commercial_registry(user=resolved_user),
		"can_view_own": view_own,
		"can_view_others": view_others,
		"can_view_any": bool(view_own or view_others),
		"can_edit_own": edit_own,
		"can_edit_others": edit_others,
		"can_view_timeline": can_view_commercial_registry_timeline_role(user=resolved_user),
		"can_delete": bool(
			has_screen
			and has_explicit_commercial_registry_role(
				ROLE_DELETE_COMMERCIAL_REGISTRY,
				user=resolved_user,
			)
		),
	}


def get_permission_query_conditions(user: str | None = None) -> str:
	resolved_user = _resolve_user(user)
	if not has_commercial_registries_screen_access_role(user=resolved_user):
		return "1=0"

	view_own = can_view_own_commercial_registries(user=resolved_user)
	view_others = can_view_others_commercial_registries(user=resolved_user)

	if view_own and view_others:
		return ""
	escaped_user = frappe.db.escape(resolved_user)
	if view_own:
		return f"`tabArchive Commercial Registry`.`owner` = {escaped_user}"
	if view_others:
		return f"`tabArchive Commercial Registry`.`owner` != {escaped_user}"
	return "1=0"


def has_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	if not has_commercial_registries_screen_access_role(user=resolved_user):
		return False

	perm = (ptype or "read").lower()
	if perm == "create":
		return can_create_commercial_registry(user=resolved_user)

	if perm in ("read", "select", "report", "export", "print", "email"):
		if doc is None:
			return has_any_commercial_registry_view_scope(user=resolved_user)
		return can_view_commercial_registry(doc, user=resolved_user)

	if perm == "write":
		if doc is None:
			return bool(
				has_explicit_commercial_registry_role(
					ROLE_EDIT_OWN_COMMERCIAL_REGISTRY,
					user=resolved_user,
				)
				or has_explicit_commercial_registry_role(
					ROLE_EDIT_OTHERS_COMMERCIAL_REGISTRY,
					user=resolved_user,
				)
			)
		return can_edit_commercial_registry(doc, user=resolved_user)

	if perm == "delete":
		if doc is None:
			return has_explicit_commercial_registry_role(
				ROLE_DELETE_COMMERCIAL_REGISTRY,
				user=resolved_user,
			)
		return can_delete_commercial_registry(doc, user=resolved_user)

	return False


def has_log_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	perm = (ptype or "read").lower()
	if perm not in ("read", "select", "report", "export", "print"):
		return False
	if not can_view_commercial_registry_timeline_role(user=resolved_user):
		return False
	if doc is None:
		return has_any_commercial_registry_view_scope(user=resolved_user)
	record_owner = cstr(getattr(doc, "record_owner", None) or "").strip()
	if record_owner:
		return can_view_commercial_registry_by_owner(record_owner, user=resolved_user)
	reg_name = cstr(getattr(doc, "commercial_registry", None) or "").strip()
	if reg_name and frappe.db.exists(COMMERCIAL_REGISTRY_DOCTYPE, reg_name):
		return can_view_commercial_registry(reg_name, user=resolved_user)
	return False
