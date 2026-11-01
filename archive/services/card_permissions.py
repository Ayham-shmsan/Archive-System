from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.permissions import get_role_permissions
from frappe.utils import cint

CARD_DOCTYPE = "Archive Card"

CARD_PERMISSION_TYPES = (
	"view_cards",
	"create_card",
	"edit_card",
	"change_card_status",
	"transfer_card",
	"delete_card",
	"view_card_images",
	"edit_card_images",
	"view_card_pin",
	"view_card_activity_timeline",
	"view_card_transfer_timeline",
)

ROLE_CARD_MANAGER = "مدير البطاقات"
ROLE_CARD_OFFICER = "موظف البطاقات"
ROLE_CARD_READER = "قارئ البطاقات"


def _resolve_user(user: str | None = None) -> str:
	return user or frappe.session.user or "Guest"


def _is_privileged_user(user: str) -> bool:
	if not user or user == "Guest":
		return False
	if user == "Administrator":
		return True
	return "System Manager" in frappe.get_roles(user)


def get_role_permission_map(user: str | None = None) -> dict[str, int]:
	resolved_user = _resolve_user(user)
	if resolved_user == "Guest":
		return {}

	if _is_privileged_user(resolved_user):
		base = {"read": 1, "write": 1, "create": 1, "delete": 0}
		for perm in CARD_PERMISSION_TYPES:
			base[perm] = 1
		return base

	meta = frappe.get_meta(CARD_DOCTYPE)
	role_perms = get_role_permissions(meta, user=resolved_user) or {}
	return {key: cint(val) for key, val in role_perms.items()}


def has_card_permission(perm_type: str, user: str | None = None) -> bool:
	resolved_user = _resolve_user(user)
	if resolved_user == "Guest":
		return False
	if _is_privileged_user(resolved_user):
		return True

	perms = get_role_permission_map(resolved_user)
	if not cint(perms.get("view_cards")):
		return False

	if perm_type == "view_cards":
		return True

	if perm_type == "edit_card_images":
		return bool(cint(perms.get("edit_card_images")) and cint(perms.get("view_card_images")))

	return bool(cint(perms.get(perm_type)))


def require_card_permission(
	perm_type: str,
	message: str | None = None,
	user: str | None = None,
) -> None:
	if not has_card_permission(perm_type, user=user):
		frappe.throw(
			message or _("ليست لديك صلاحية لتنفيذ هذا الإجراء على البطاقات."),
			frappe.PermissionError,
		)


def get_card_permissions(user: str | None = None) -> dict[str, bool]:
	resolved_user = _resolve_user(user)
	can_view = has_card_permission("view_cards", user=resolved_user)
	if not can_view:
		return {
			"can_access_page": False,
			"can_view": False,
			"can_create": False,
			"can_edit": False,
			"can_change_status": False,
			"can_transfer": False,
			"can_delete": False,
			"can_view_images": False,
			"can_edit_images": False,
			"can_view_pin": False,
			"can_view_activity_timeline": False,
			"can_view_transfer_timeline": False,
			**{perm: False for perm in CARD_PERMISSION_TYPES},
		}

	flags = {perm: has_card_permission(perm, user=resolved_user) for perm in CARD_PERMISSION_TYPES}
	return {
		"can_access_page": flags["view_cards"],
		"can_view": flags["view_cards"],
		"can_create": flags["create_card"],
		"can_edit": flags["edit_card"],
		"can_change_status": flags["change_card_status"],
		"can_transfer": flags["transfer_card"],
		"can_delete": flags["delete_card"],
		"can_view_images": flags["view_card_images"],
		"can_edit_images": flags["edit_card_images"],
		"can_view_pin": flags["view_card_pin"],
		"can_view_activity_timeline": flags["view_card_activity_timeline"],
		"can_view_transfer_timeline": flags["view_card_transfer_timeline"],
		**flags,
	}


def get_permission_query_conditions(user: str | None = None) -> str:
	resolved_user = _resolve_user(user)
	if not has_card_permission("view_cards", user=resolved_user):
		return "1=0"
	return "ifnull(`tabArchive Card`.`is_deleted`, 0) = 0"


def has_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	perm = ptype or "read"

	if resolved_user == "Guest":
		return False

	if perm == "delete":
		return False

	if isinstance(doc, str):
		if not frappe.db.exists(CARD_DOCTYPE, doc):
			return False
		is_deleted = cint(frappe.db.get_value(CARD_DOCTYPE, doc, "is_deleted"))
	else:
		is_deleted = cint(getattr(doc, "is_deleted", 0)) if doc else 0

	if is_deleted and not (doc and not isinstance(doc, str) and getattr(doc.flags, "_allow_card_service_mutation", False)):
		return False

	if perm in ("read", "select", "report", "export", "print", "email"):
		return has_card_permission("view_cards", user=resolved_user)

	if perm == "create":
		return has_card_permission("create_card", user=resolved_user)

	if perm == "write":
		return any(
			has_card_permission(p, user=resolved_user)
			for p in (
				"edit_card",
				"edit_card_images",
				"change_card_status",
				"transfer_card",
				"delete_card",
			)
		)

	if perm in CARD_PERMISSION_TYPES:
		return has_card_permission(perm, user=resolved_user)

	return False


def has_family_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	perm = ptype or "read"
	if perm in ("read", "select"):
		return has_card_permission("view_cards", user=resolved_user)
	return False


def has_transfer_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	perm = ptype or "read"
	if perm in ("read", "select"):
		return has_card_permission("view_card_transfer_timeline", user=resolved_user)
	return False


def has_log_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	perm = ptype or "read"
	if perm in ("read", "select"):
		return has_card_permission("view_card_activity_timeline", user=resolved_user)
	return False
