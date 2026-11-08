from __future__ import annotations

import os

import frappe
from frappe.modules.import_file import import_file_by_path

from archive.api.deposits import ROLE_DEPOSITS_SCREEN_ACCESS
from archive.api.document_authenticity import ROLE_AUTHENTICITY_SCREEN_ACCESS
from archive.services.card_permissions import ROLE_VIEW_CARDS
from archive.services.operation_permissions import ROLE_OPERATIONS_SCREEN_ACCESS
from archive.services.pending_operation_permissions import ROLE_PENDING_SCREEN_ACCESS

FIVE_SCREEN_ACCESS_ROLES = (
	ROLE_VIEW_CARDS,
	ROLE_PENDING_SCREEN_ACCESS,
	ROLE_OPERATIONS_SCREEN_ACCESS,
	ROLE_DEPOSITS_SCREEN_ACCESS,
	ROLE_AUTHENTICITY_SCREEN_ACCESS,
)

PAGE_JSON_RELATIVE_PATHS = (
	("archive", "page", "archive_cards", "archive_cards.json"),
	("archive", "page", "archive_pending_operations", "archive_pending_operations.json"),
	("archive", "page", "archive_operations", "archive_operations.json"),
	("archive", "page", "archive_deposits", "archive_deposits.json"),
	("archive", "page", "document_authenticity", "document_authenticity.json"),
)


def execute() -> None:
	_ensure_screen_access_roles()
	_sync_screen_pages()
	frappe.cache.delete_key("roles")
	frappe.cache.delete_key("bootinfo")


def _ensure_screen_access_roles() -> None:
	for role_name in FIVE_SCREEN_ACCESS_ROLES:
		if not frappe.db.exists("Role", role_name):
			role_doc = frappe.get_doc(
				{
					"doctype": "Role",
					"role_name": role_name,
					"desk_access": 1,
					"is_custom": 1,
					"disabled": 0,
				}
			)
			role_doc.insert(ignore_permissions=True)
			# Remove Frappe's automatic Role.after_insert assignment to Administrator
			frappe.db.delete(
				"Has Role",
				{
					"parent": "Administrator",
					"parenttype": "User",
					"role": role_name,
				},
			)
		else:
			frappe.db.set_value(
				"Role",
				role_name,
				{"desk_access": 1, "disabled": 0},
				update_modified=False,
			)


def _sync_screen_pages() -> None:
	app_path = frappe.get_app_path("archive")
	for rel_parts in PAGE_JSON_RELATIVE_PATHS:
		path = os.path.join(app_path, *rel_parts)
		if os.path.exists(path):
			import_file_by_path(path, force=True, ignore_version=True)
