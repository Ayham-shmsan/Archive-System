from __future__ import annotations

import os

import frappe
from frappe.modules.import_file import import_file_by_path

from archive.api.deposits import ROLE_DEPOSITS_SCREEN_ACCESS


def execute() -> None:
	if not frappe.db.exists("Role", ROLE_DEPOSITS_SCREEN_ACCESS):
		role_doc = frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": ROLE_DEPOSITS_SCREEN_ACCESS,
				"desk_access": 1,
				"is_custom": 1,
			}
		)
		role_doc.insert(ignore_permissions=True)
		# Frappe's Role.after_insert auto-adds every new role to Administrator;
		# remove that automatic grant so this standalone gate role is never auto-assigned.
		frappe.db.delete(
			"Has Role",
			{
				"parent": "Administrator",
				"parenttype": "User",
				"role": ROLE_DEPOSITS_SCREEN_ACCESS,
			},
		)
	else:
		frappe.db.set_value(
			"Role",
			ROLE_DEPOSITS_SCREEN_ACCESS,
			"desk_access",
			1,
			update_modified=False,
		)

	app_path = frappe.get_app_path("archive")
	deposits_page_json = os.path.join(
		app_path, "archive", "page", "archive_deposits", "archive_deposits.json"
	)
	if os.path.exists(deposits_page_json):
		import_file_by_path(deposits_page_json, force=True, ignore_version=True)

	frappe.cache.delete_key("roles")
	frappe.cache.delete_key("bootinfo")
