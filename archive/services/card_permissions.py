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
ROLE_CARD_IMAGE_PREVIEW = "صلاحية معاينة البطائق"
ROLE_CARD_EVENT_HISTORY = "صلاحية عرض سجل أحداث البطاقة"
ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD = "صلاحية إعادة تفعيل البطاقة الموقفة نهائياً"
ROLE_ENFORCE_CARD_IMAGE_BLUR = "صلاحية فرض تمويه صور البطاقات"
ROLE_VIEW_CARD_ACTIVITY_TIMELINE = "صلاحية عرض سجل مستخدم العملية في البطاقات"

ROLE_VIEW_CARDS = "صلاحية عرض البطاقات"
ROLE_CREATE_CARD = "صلاحية إضافة البطاقات"
ROLE_EDIT_CARD = "صلاحية تعديل بيانات البطاقات"
ROLE_CHANGE_CARD_STATUS = "صلاحية تغيير حالة البطاقات"
ROLE_TRANSFER_CARD = "صلاحية نقل البطاقات"
ROLE_DELETE_CARD = "صلاحية حذف البطاقات"
ROLE_VIEW_CARD_IMAGES = "صلاحية عرض صور البطاقات"
ROLE_EDIT_CARD_IMAGES = "صلاحية تعديل صور البطاقات"
ROLE_VIEW_CARD_PIN = "صلاحية عرض الرقم السري للبطاقات"
ROLE_VIEW_CARD_TRANSFER_TIMELINE = "صلاحية عرض سجل انتقالات البطاقات"

NEW_SEPARATED_CARD_ROLES = (
	ROLE_VIEW_CARDS,
	ROLE_CREATE_CARD,
	ROLE_EDIT_CARD,
	ROLE_CHANGE_CARD_STATUS,
	ROLE_TRANSFER_CARD,
	ROLE_DELETE_CARD,
	ROLE_VIEW_CARD_IMAGES,
	ROLE_EDIT_CARD_IMAGES,
	ROLE_VIEW_CARD_PIN,
	ROLE_VIEW_CARD_TRANSFER_TIMELINE,
)

CARD_PERMISSION_ROLE_MAP: dict[str, str] = {
	"view_cards": ROLE_VIEW_CARDS,
	"create_card": ROLE_CREATE_CARD,
	"edit_card": ROLE_EDIT_CARD,
	"change_card_status": ROLE_CHANGE_CARD_STATUS,
	"transfer_card": ROLE_TRANSFER_CARD,
	"delete_card": ROLE_DELETE_CARD,
	"view_card_images": ROLE_VIEW_CARD_IMAGES,
	"edit_card_images": ROLE_EDIT_CARD_IMAGES,
	"view_card_pin": ROLE_VIEW_CARD_PIN,
	"view_card_activity_timeline": ROLE_VIEW_CARD_ACTIVITY_TIMELINE,
	"view_card_transfer_timeline": ROLE_VIEW_CARD_TRANSFER_TIMELINE,
}


def _has_explicit_card_role(role_name: str, user: str | None = None) -> bool:
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


def has_view_card_activity_timeline_role(user: str | None = None) -> bool:
	resolved_user = _resolve_user(user)
	if not resolved_user or resolved_user == "Guest":
		return False
	if not cint(frappe.db.get_value("User", resolved_user, "enabled")):
		return False
	return bool(
		frappe.db.exists(
			"Has Role",
			{
				"parent": resolved_user,
				"parenttype": "User",
				"role": ROLE_VIEW_CARD_ACTIVITY_TIMELINE,
			},
		)
	)


def require_view_card_activity_timeline_role(
	message: str | None = None,
	user: str | None = None,
) -> None:
	if not has_view_card_activity_timeline_role(user=user):
		frappe.throw(
			message or _("ليست لديك صلاحية عرض سجل مستخدم العملية في البطاقات."),
			frappe.PermissionError,
		)


def has_enforce_card_image_blur_role(user: str | None = None) -> bool:
	resolved_user = _resolve_user(user)
	if not resolved_user or resolved_user == "Guest":
		return False
	return bool(
		frappe.db.exists(
			"Has Role",
			{
				"parent": resolved_user,
				"parenttype": "User",
				"role": ROLE_ENFORCE_CARD_IMAGE_BLUR,
			},
		)
	)


def require_enforce_card_image_blur_role(
	message: str | None = None,
	user: str | None = None,
) -> None:
	if not has_enforce_card_image_blur_role(user=user):
		frappe.throw(
			message or _("المستخدم الحالي لا يخضع لصلاحية فرض تمويه صور البطاقات."),
			frappe.PermissionError,
		)


def has_reactivate_permanently_stopped_card_role(user: str | None = None) -> bool:
	resolved_user = _resolve_user(user)
	if not resolved_user or resolved_user == "Guest":
		return False
	return bool(
		frappe.db.exists(
			"Has Role",
			{
				"parent": resolved_user,
				"parenttype": "User",
				"role": ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD,
			},
		)
	)


def require_reactivate_permanently_stopped_card_role(
	message: str | None = None,
	user: str | None = None,
) -> None:
	if not has_reactivate_permanently_stopped_card_role(user=user):
		frappe.throw(
			message
			or _("ليست لديك صلاحية إعادة تفعيل أو نقل البطاقة الموقفة نهائياً (المتلفة)."),
			frappe.PermissionError,
		)


def has_card_event_history_role(user: str | None = None) -> bool:
	resolved_user = _resolve_user(user)
	if not resolved_user or resolved_user == "Guest":
		return False
	return bool(
		frappe.db.exists(
			"Has Role",
			{
				"parent": resolved_user,
				"parenttype": "User",
				"role": ROLE_CARD_EVENT_HISTORY,
			},
		)
	)


def require_card_event_history_role(
	message: str | None = None,
	user: str | None = None,
) -> None:
	if not has_card_event_history_role(user=user):
		frappe.throw(
			message or _("ليست لديك صلاحية عرض سجل أحداث البطاقة."),
			frappe.PermissionError,
		)


def has_card_image_preview_role(user: str | None = None) -> bool:
	resolved_user = _resolve_user(user)
	if not resolved_user or resolved_user == "Guest":
		return False
	if resolved_user == "Administrator":
		return True
	return ROLE_CARD_IMAGE_PREVIEW in frappe.get_roles(resolved_user)


def require_card_image_preview_role(
	message: str | None = None,
	user: str | None = None,
) -> None:
	if not has_card_image_preview_role(user=user):
		frappe.throw(
			message or _("ليست لديك صلاحية معاينة البطائق."),
			frappe.PermissionError,
		)


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

	mapped: dict[str, int] = {}
	for perm in CARD_PERMISSION_TYPES:
		mapped[perm] = int(has_card_permission(perm, user=resolved_user))

	mapped["read"] = mapped["view_cards"]
	mapped["create"] = mapped["create_card"]
	mapped["write"] = int(
		any(
			mapped.get(p)
			for p in (
				"edit_card",
				"edit_card_images",
				"change_card_status",
				"transfer_card",
				"delete_card",
			)
		)
	)
	mapped["delete"] = 0
	return mapped


def has_card_permission(perm_type: str, user: str | None = None) -> bool:
	resolved_user = _resolve_user(user)
	if resolved_user == "Guest" or perm_type not in CARD_PERMISSION_ROLE_MAP:
		return False

	can_view = _has_explicit_card_role(ROLE_VIEW_CARDS, user=resolved_user)
	if not can_view:
		return False

	if perm_type == "view_cards":
		return True

	if perm_type == "view_card_activity_timeline":
		return has_view_card_activity_timeline_role(user=resolved_user)

	return _has_explicit_card_role(CARD_PERMISSION_ROLE_MAP[perm_type], user=resolved_user)


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
			"can_preview_card_images": False,
			"can_view_pin": False,
			"can_view_activity_timeline": False,
			"can_view_transfer_timeline": False,
			"can_view_card_event_history": has_card_event_history_role(user=resolved_user),
			"can_reactivate_permanently_stopped_card": has_reactivate_permanently_stopped_card_role(
				user=resolved_user
			),
			"enforce_image_blur": False,
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
		"can_preview_card_images": has_card_image_preview_role(user=resolved_user),
		"can_view_pin": flags["view_card_pin"],
		"can_view_activity_timeline": flags["view_card_activity_timeline"],
		"can_view_transfer_timeline": flags["view_card_transfer_timeline"],
		"can_view_card_event_history": has_card_event_history_role(user=resolved_user),
		"can_reactivate_permanently_stopped_card": has_reactivate_permanently_stopped_card_role(
			user=resolved_user
		),
		"enforce_image_blur": has_enforce_card_image_blur_role(user=resolved_user),
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
		if not has_card_permission("view_card_activity_timeline", user=resolved_user):
			return False
		card_name = getattr(doc, "card", None) if doc and not isinstance(doc, str) else None
		if card_name:
			return has_permission(card_name, "read", user=resolved_user)
		return True
	return False


def has_card_event_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
) -> bool:
	resolved_user = _resolve_user(user)
	perm = ptype or "read"
	if perm in ("read", "select"):
		return has_card_event_history_role(user=resolved_user)
	return False
