from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cstr


ROLE_USER_MANAGEMENT = "صلاحية إدارة مستخدمي النظام"


def has_user_management_role(user: str | None = None) -> bool:
	"""
	Strict explicit DB check for ROLE_USER_MANAGEMENT in `Has Role`.
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
				"role": ROLE_USER_MANAGEMENT,
			},
		)
	)


def require_user_management_role(user: str | None = None) -> None:
	if not has_user_management_role(user=user):
		frappe.throw(
			_("ليست لديك صلاحية إدارة مستخدمي النظام."),
			frappe.PermissionError,
		)
