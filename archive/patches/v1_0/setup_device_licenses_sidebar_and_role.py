from __future__ import annotations

import os

import frappe
from frappe.modules.import_file import import_file_by_path

from archive.api.device_license import ROLE_DEVICE_LICENSE_MANAGEMENT


def _ensure_device_license_role() -> None:
	if not frappe.db.exists("Role", ROLE_DEVICE_LICENSE_MANAGEMENT):
		role_doc = frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": ROLE_DEVICE_LICENSE_MANAGEMENT,
				"desk_access": 1,
				"disabled": 0,
				"is_custom": 1,
			}
		)
		role_doc.insert(ignore_permissions=True)
	else:
		frappe.db.set_value(
			"Role",
			ROLE_DEVICE_LICENSE_MANAGEMENT,
			{"desk_access": 1, "disabled": 0, "is_custom": 1},
			update_modified=False,
		)

	# Ensure Administrator holds the role on initial bootstrap if nobody has it yet
	# (DocType model sync may create the Role with in_migrate=True without assigning Administrator).
	if not frappe.db.exists(
		"Has Role",
		{"parenttype": "User", "role": ROLE_DEVICE_LICENSE_MANAGEMENT},
	) and frappe.db.exists("User", "Administrator"):
		admin_doc = frappe.get_doc("User", "Administrator")
		admin_doc.append("roles", {"role": ROLE_DEVICE_LICENSE_MANAGEMENT})
		admin_doc.save(ignore_permissions=True)


def _sync_sidebar_and_doctypes() -> None:
	app_path = frappe.get_app_path("archive")
	relative_paths = (
		("archive", "doctype", "archive_device_license", "archive_device_license.json"),
		("archive", "doctype", "archive_device_license_event", "archive_device_license_event.json"),
		("archive", "sidebar", "أرشفة_وتسهيل", "أرشفة_وتسهيل.json"),
	)
	for rel_parts in relative_paths:
		full_path = os.path.join(app_path, *rel_parts)
		if os.path.exists(full_path):
			import_file_by_path(full_path, force=True, ignore_version=True)


def execute() -> None:
	"""Create explicit device-license management role and sync DocType permissions + Archive Sidebar."""
	_ensure_device_license_role()
	_sync_sidebar_and_doctypes()
	frappe.clear_cache()
	frappe.db.commit()
