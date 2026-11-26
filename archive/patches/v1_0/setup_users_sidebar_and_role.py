from __future__ import annotations

import os

import frappe
from frappe.modules.import_file import import_file_by_path
from frappe.permissions import add_permission, update_permission_property

from archive.services.user_management_permissions import ROLE_USER_MANAGEMENT


def _ensure_user_management_role() -> None:
	if not frappe.db.exists("Role", ROLE_USER_MANAGEMENT):
		role_doc = frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": ROLE_USER_MANAGEMENT,
				"desk_access": 1,
				"disabled": 0,
				"is_custom": 1,
			}
		)
		role_doc.insert(ignore_permissions=True)
	else:
		frappe.db.set_value(
			"Role",
			ROLE_USER_MANAGEMENT,
			{"desk_access": 1, "disabled": 0, "is_custom": 1},
			update_modified=False,
		)

	# Bootstrap initial access for Administrator only if no user holds the role yet.
	if not frappe.db.exists(
		"Has Role",
		{"parenttype": "User", "role": ROLE_USER_MANAGEMENT},
	) and frappe.db.exists("User", "Administrator"):
		admin_doc = frappe.get_doc("User", "Administrator")
		admin_doc.append("roles", {"role": ROLE_USER_MANAGEMENT})
		admin_doc.save(ignore_permissions=True)


def _ensure_user_doctype_permissions() -> None:
	# Grant User management capabilities (permlevel 0 & 1) to ROLE_USER_MANAGEMENT
	# via Custom DocPerm without altering existing System Manager / Desk User rows.
	add_permission("User", ROLE_USER_MANAGEMENT, permlevel=0, ptype="read")
	for ptype in ("read", "write", "create", "select"):
		update_permission_property("User", ROLE_USER_MANAGEMENT, 0, ptype, 1, validate=False)

	add_permission("User", ROLE_USER_MANAGEMENT, permlevel=1, ptype="read")
	for ptype in ("read", "write"):
		update_permission_property("User", ROLE_USER_MANAGEMENT, 1, ptype, 1, validate=False)

	# Allow reading/selecting Role records inside User Role Editor.
	add_permission("Role", ROLE_USER_MANAGEMENT, permlevel=0, ptype="read")
	for ptype in ("read", "select"):
		update_permission_property("Role", ROLE_USER_MANAGEMENT, 0, ptype, 1, validate=False)


def _sync_sidebar() -> None:
	app_path = frappe.get_app_path("archive")
	sidebar_path = os.path.join(
		app_path, "archive", "sidebar", "أرشفة_وتسهيل", "أرشفة_وتسهيل.json"
	)
	if os.path.exists(sidebar_path):
		import_file_by_path(sidebar_path, force=True, ignore_version=True)


def execute() -> None:
	"""Create explicit System Users management role, Custom DocPerms, and sync Archive Sidebar."""
	_ensure_user_management_role()
	_ensure_user_doctype_permissions()
	_sync_sidebar()
	frappe.clear_cache()
	frappe.db.commit()
