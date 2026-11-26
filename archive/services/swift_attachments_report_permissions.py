from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cstr


ROLE_SWIFT_ATTACHMENTS_VIEW = "صلاحية عرض تقرير مرفقات حوالات السويفت"
ROLE_SWIFT_ATTACHMENTS_PREVIEW = "صلاحية معاينة مرفقات تقرير السويفت"
ROLE_SWIFT_ATTACHMENTS_DOWNLOAD = "صلاحية تنزيل مرفقات تقرير السويفت"
ROLE_SWIFT_ATTACHMENTS_ZIP = "صلاحية تنزيل مرفقات تقرير السويفت كملف مضغوط"

SWIFT_ATTACHMENTS_ROLES = (
	ROLE_SWIFT_ATTACHMENTS_VIEW,
	ROLE_SWIFT_ATTACHMENTS_PREVIEW,
	ROLE_SWIFT_ATTACHMENTS_DOWNLOAD,
	ROLE_SWIFT_ATTACHMENTS_ZIP,
)


def _has_explicit_role(role_name: str, user: str | None = None) -> bool:
	"""
	Strict explicit DB check in `Has Role` with enabled user verification.
	No implicit Administrator or System Manager bypass.
	"""
	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	if not resolved_user or resolved_user == "Guest":
		return False
	if not int(frappe.db.get_value("User", resolved_user, "enabled") or 0):
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


def has_swift_attachments_screen_access(user: str | None = None) -> bool:
	return _has_explicit_role(ROLE_SWIFT_ATTACHMENTS_VIEW, user=user)


def require_swift_attachments_screen_access(user: str | None = None) -> None:
	if not has_swift_attachments_screen_access(user=user):
		frappe.throw(
			_("ليست لديك صلاحية عرض تقرير مرفقات حوالات السويفت."),
			frappe.PermissionError,
		)


def can_preview_swift_report_attachments(user: str | None = None) -> bool:
	return has_swift_attachments_screen_access(user=user) and _has_explicit_role(
		ROLE_SWIFT_ATTACHMENTS_PREVIEW, user=user
	)


def require_swift_report_preview_permission(user: str | None = None) -> None:
	require_swift_attachments_screen_access(user=user)
	if not _has_explicit_role(ROLE_SWIFT_ATTACHMENTS_PREVIEW, user=user):
		frappe.throw(
			_("ليست لديك صلاحية معاينة مرفقات تقرير السويفت."),
			frappe.PermissionError,
		)


def can_download_swift_report_attachments(user: str | None = None) -> bool:
	return has_swift_attachments_screen_access(user=user) and _has_explicit_role(
		ROLE_SWIFT_ATTACHMENTS_DOWNLOAD, user=user
	)


def require_swift_report_download_permission(user: str | None = None) -> None:
	require_swift_attachments_screen_access(user=user)
	if not _has_explicit_role(ROLE_SWIFT_ATTACHMENTS_DOWNLOAD, user=user):
		frappe.throw(
			_("ليست لديك صلاحية تنزيل مرفقات تقرير السويفت."),
			frappe.PermissionError,
		)


def can_zip_swift_report_attachments(user: str | None = None) -> bool:
	return has_swift_attachments_screen_access(user=user) and _has_explicit_role(
		ROLE_SWIFT_ATTACHMENTS_ZIP, user=user
	)


def require_swift_report_zip_permission(user: str | None = None) -> None:
	require_swift_attachments_screen_access(user=user)
	if not _has_explicit_role(ROLE_SWIFT_ATTACHMENTS_ZIP, user=user):
		frappe.throw(
			_("ليست لديك صلاحية تنزيل مرفقات تقرير السويفت كملف مضغوط."),
			frappe.PermissionError,
		)


def get_swift_attachments_permissions_snapshot(user: str | None = None) -> dict[str, bool]:
	from archive.services.operation_permissions import has_operations_screen_access_role

	resolved_user = cstr(user or frappe.session.user or "Guest").strip()
	can_view = has_swift_attachments_screen_access(user=resolved_user)
	return {
		"can_view": can_view,
		"can_preview": bool(can_view and _has_explicit_role(ROLE_SWIFT_ATTACHMENTS_PREVIEW, user=resolved_user)),
		"can_download": bool(can_view and _has_explicit_role(ROLE_SWIFT_ATTACHMENTS_DOWNLOAD, user=resolved_user)),
		"can_zip": bool(can_view and _has_explicit_role(ROLE_SWIFT_ATTACHMENTS_ZIP, user=resolved_user)),
		"can_open_operation": bool(
			can_view and has_operations_screen_access_role(user=resolved_user)
		),
	}
