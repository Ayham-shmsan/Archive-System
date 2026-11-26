from __future__ import annotations

import os

import frappe
from frappe.modules.import_file import import_file_by_path

from archive.services.swift_attachments_report_permissions import (
	ROLE_SWIFT_ATTACHMENTS_VIEW,
	SWIFT_ATTACHMENTS_ROLES,
)


def _ensure_roles() -> None:
	for role_name in SWIFT_ATTACHMENTS_ROLES:
		if not frappe.db.exists("Role", role_name):
			role_doc = frappe.get_doc(
				{
					"doctype": "Role",
					"role_name": role_name,
					"desk_access": 1,
					"disabled": 0,
					"is_custom": 1,
				}
			)
			role_doc.insert(ignore_permissions=True)
		else:
			frappe.db.set_value(
				"Role",
				role_name,
				{"desk_access": 1, "disabled": 0, "is_custom": 1},
				update_modified=False,
			)

	# Initial bootstrap for Administrator ONLY if nobody holds the entry role yet.
	if not frappe.db.exists(
		"Has Role",
		{"parenttype": "User", "role": ROLE_SWIFT_ATTACHMENTS_VIEW},
	) and frappe.db.exists("User", "Administrator"):
		admin_doc = frappe.get_doc("User", "Administrator")
		existing = {r.role for r in admin_doc.roles}
		changed = False
		for role_name in SWIFT_ATTACHMENTS_ROLES:
			if role_name not in existing:
				admin_doc.append("roles", {"role": role_name})
				changed = True
		if changed:
			admin_doc.save(ignore_permissions=True)


def _sync_page_and_sidebar() -> None:
	app_path = frappe.get_app_path("archive")
	relative_paths = (
		("archive", "page", "archive_swift_attachments", "archive_swift_attachments.json"),
		("archive", "sidebar", "أرشفة_وتسهيل", "أرشفة_وتسهيل.json"),
	)
	for rel_parts in relative_paths:
		full_path = os.path.join(app_path, *rel_parts)
		if os.path.exists(full_path):
			import_file_by_path(full_path, force=True, ignore_version=True)


def execute() -> None:
	"""Create explicit Swift Attachments Report roles and sync Page + Sidebar."""
	_ensure_roles()
	_sync_page_and_sidebar()
	frappe.clear_cache()
	frappe.db.commit()
