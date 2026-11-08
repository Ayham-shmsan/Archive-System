from __future__ import annotations

import os

import frappe
from frappe.modules.import_file import import_file_by_path

from archive.patches.v1_0.setup_card_roles_and_permissions import (
	_sync_custom_docperms as _sync_card_custom_docperms,
)
from archive.patches.v1_0.setup_pending_operation_roles import (
	CUSTOM_PERMISSION_FIELDS as PENDING_CUSTOM_PERMISSION_FIELDS,
	PENDING_DOCTYPE,
	ROLE_MATRIX as PENDING_BUNDLED_ROLE_MATRIX,
	_replace_role_permission as _replace_pending_role_permission,
)
from archive.services.card_permissions import (
	CARD_DOCTYPE,
	NEW_SEPARATED_CARD_ROLES,
)
from archive.services.pending_operation_permissions import (
	NEW_SEPARATED_PENDING_ROLES,
)


def execute() -> None:
	_ensure_granular_roles()
	_neutralize_bundled_card_docperms()
	_neutralize_bundled_pending_docperms()
	_sync_pages()
	frappe.clear_cache(doctype=CARD_DOCTYPE)
	frappe.clear_cache(doctype=PENDING_DOCTYPE)
	frappe.cache.delete_key("roles")
	frappe.cache.delete_key("bootinfo")


def _ensure_granular_roles() -> None:
	for role_name in (*NEW_SEPARATED_CARD_ROLES, *NEW_SEPARATED_PENDING_ROLES):
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
			# Frappe adds newly created roles to Administrator in Role.after_insert;
			# remove that automatic assignment so no user receives new permissions automatically.
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


def _neutralize_bundled_card_docperms() -> None:
	if frappe.db.exists("DocType", CARD_DOCTYPE):
		_sync_card_custom_docperms()


def _neutralize_bundled_pending_docperms() -> None:
	if not frappe.db.exists("DocType", PENDING_DOCTYPE):
		return

	frappe.clear_cache(doctype="Custom DocPerm")
	meta = frappe.get_meta("Custom DocPerm")
	if any(not meta.get_field(fieldname) for fieldname in PENDING_CUSTOM_PERMISSION_FIELDS):
		return

	for role_name, permissions in PENDING_BUNDLED_ROLE_MATRIX.items():
		_replace_pending_role_permission(role_name, permissions)

	sys_mgr_rows = frappe.get_all(
		"Custom DocPerm",
		filters={"parent": PENDING_DOCTYPE, "role": "System Manager"},
		pluck="name",
	)
	for row_name in sys_mgr_rows:
		doc = frappe.get_doc("Custom DocPerm", row_name)
		for fieldname in PENDING_CUSTOM_PERMISSION_FIELDS:
			doc.set(fieldname, 0)
		doc.save(ignore_permissions=True)


def _sync_pages() -> None:
	app_path = frappe.get_app_path("archive")
	page_paths = (
		os.path.join(app_path, "archive", "page", "archive_cards", "archive_cards.json"),
		os.path.join(
			app_path,
			"archive",
			"page",
			"archive_pending_operations",
			"archive_pending_operations.json",
		),
	)
	for path in page_paths:
		if os.path.exists(path):
			import_file_by_path(path, force=True, ignore_version=True)
