from __future__ import annotations

import frappe
from frappe.permissions import reset_perms as frappe_reset_perms, setup_custom_perms

from archive.api.deposits import ROLE_DEPOSITS_SCREEN_ACCESS
from archive.services.card_permissions import (
	CARD_DOCTYPE,
	CARD_PERMISSION_TYPES,
	ROLE_CARD_EVENT_HISTORY,
	ROLE_CARD_IMAGE_PREVIEW,
	ROLE_CARD_MANAGER,
	ROLE_CARD_OFFICER,
	ROLE_CARD_READER,
	ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD,
)
from archive.services.operation_permissions import (
	ROLE_ATTACH_INCOMPLETE_INVOICE,
)

ROLE_MATRIX: dict[str, dict[str, int]] = {
	"System Manager": {
		"read": 1,
		"write": 1,
		"create": 1,
		"delete": 0,
		"report": 1,
		"export": 1,
		"print": 1,
		"email": 1,
		"view_cards": 1,
		"create_card": 1,
		"edit_card": 1,
		"change_card_status": 1,
		"transfer_card": 1,
		"delete_card": 1,
		"view_card_images": 1,
		"edit_card_images": 1,
		"view_card_pin": 1,
		"view_card_activity_timeline": 1,
		"view_card_transfer_timeline": 1,
	},
	ROLE_CARD_MANAGER: {
		"read": 1,
		"write": 1,
		"create": 1,
		"delete": 0,
		"report": 1,
		"export": 1,
		"print": 1,
		"email": 0,
		"view_cards": 1,
		"create_card": 1,
		"edit_card": 1,
		"change_card_status": 1,
		"transfer_card": 1,
		"delete_card": 1,
		"view_card_images": 1,
		"edit_card_images": 1,
		"view_card_pin": 1,
		"view_card_activity_timeline": 1,
		"view_card_transfer_timeline": 1,
	},
	ROLE_CARD_OFFICER: {
		"read": 1,
		"write": 1,
		"create": 1,
		"delete": 0,
		"report": 1,
		"export": 0,
		"print": 0,
		"email": 0,
		"view_cards": 1,
		"create_card": 1,
		"edit_card": 1,
		"change_card_status": 1,
		"transfer_card": 1,
		"delete_card": 0,
		"view_card_images": 1,
		"edit_card_images": 1,
		"view_card_pin": 1,
		"view_card_activity_timeline": 0,
		"view_card_transfer_timeline": 1,
	},
	ROLE_CARD_READER: {
		"read": 1,
		"write": 0,
		"create": 0,
		"delete": 0,
		"report": 0,
		"export": 0,
		"print": 0,
		"email": 0,
		"view_cards": 1,
		"create_card": 0,
		"edit_card": 0,
		"change_card_status": 0,
		"transfer_card": 0,
		"delete_card": 0,
		"view_card_images": 0,
		"edit_card_images": 0,
		"view_card_pin": 0,
		"view_card_activity_timeline": 1,
		"view_card_transfer_timeline": 1,
	},
}


def execute() -> None:
	if not frappe.db.exists("DocType", CARD_DOCTYPE):
		return

	_ensure_permission_type_custom_fields()
	_ensure_roles()
	_sync_custom_docperms()
	_ensure_unique_indexes()
	_sync_sidebar_and_page()
	frappe.clear_cache(doctype=CARD_DOCTYPE)


def _sync_sidebar_and_page() -> None:
	import os
	from frappe.modules.import_file import import_file_by_path

	app_path = frappe.get_app_path("archive")
	page_json = os.path.join(app_path, "archive", "page", "archive_cards", "archive_cards.json")
	sidebar_json = os.path.join(
		app_path, "archive", "sidebar", "أرشفة_وتسهيل", "أرشفة_وتسهيل.json"
	)
	for path in (page_json, sidebar_json):
		if os.path.exists(path):
			import_file_by_path(path, force=True, ignore_version=True)
	frappe.cache.delete_key("bootinfo")


def _ensure_permission_type_custom_fields() -> None:
	for perm in CARD_PERMISSION_TYPES:
		pt_name = f"archive_card_{perm}"
		if frappe.db.exists("Permission Type", pt_name):
			pt_doc = frappe.get_doc("Permission Type", pt_name)
			for target in ("Custom DocPerm", "DocPerm", "DocShare"):
				pt_doc.create_custom_field(target)


def _ensure_roles() -> None:
	for role_name in (
		ROLE_CARD_MANAGER,
		ROLE_CARD_OFFICER,
		ROLE_CARD_READER,
		ROLE_CARD_IMAGE_PREVIEW,
		ROLE_CARD_EVENT_HISTORY,
		ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD,
		ROLE_ATTACH_INCOMPLETE_INVOICE,
		ROLE_DEPOSITS_SCREEN_ACCESS,
	):
		if not frappe.db.exists("Role", role_name):
			role_doc = frappe.get_doc(
				{
					"doctype": "Role",
					"role_name": role_name,
					"desk_access": 1,
					"is_custom": 1,
				}
			)
			role_doc.insert(ignore_permissions=True)
			if role_name == ROLE_DEPOSITS_SCREEN_ACCESS:
				frappe.db.delete(
					"Has Role",
					{
						"parent": "Administrator",
						"parenttype": "User",
						"role": ROLE_DEPOSITS_SCREEN_ACCESS,
					},
				)
		else:
			frappe.db.set_value("Role", role_name, "desk_access", 1, update_modified=False)
	frappe.cache.delete_key("roles")


def _sync_custom_docperms() -> None:
	frappe.clear_cache(doctype="Custom DocPerm")
	meta = frappe.get_meta("Custom DocPerm")
	missing = [f for f in CARD_PERMISSION_TYPES if not meta.get_field(f)]
	if missing:
		return

	if not frappe.db.exists("Custom DocPerm", {"parent": CARD_DOCTYPE}):
		frappe_reset_perms(CARD_DOCTYPE)
		setup_custom_perms(CARD_DOCTYPE)

	for role_name, perm_values in ROLE_MATRIX.items():
		existing_name = frappe.db.get_value(
			"Custom DocPerm",
			{"parent": CARD_DOCTYPE, "role": role_name, "permlevel": 0, "if_owner": 0},
			"name",
		)
		if existing_name:
			doc = frappe.get_doc("Custom DocPerm", existing_name)
		else:
			doc = frappe.get_doc(
				{
					"doctype": "Custom DocPerm",
					"parent": CARD_DOCTYPE,
					"parenttype": "DocType",
					"parentfield": "permissions",
					"role": role_name,
					"permlevel": 0,
					"if_owner": 0,
				}
			)

		for fieldname, value in perm_values.items():
			doc.set(fieldname, value)

		if doc.is_new():
			doc.insert(ignore_permissions=True)
		else:
			doc.save(ignore_permissions=True)


def _ensure_unique_indexes() -> None:
	if frappe.db.table_exists("Archive Card"):
		if frappe.db.has_index("tabArchive Card", "uq_card_family_copy"):
			frappe.db.sql_ddl(
				"ALTER TABLE `tabArchive Card` DROP INDEX `uq_card_family_copy`, ADD INDEX `idx_card_family_copy` (`card_family`, `copy_no`)"
			)
		elif not frappe.db.has_index("tabArchive Card", "idx_card_family_copy"):
			frappe.db.sql_ddl(
				"ALTER TABLE `tabArchive Card` ADD INDEX `idx_card_family_copy` (`card_family`, `copy_no`)"
			)

	if frappe.db.table_exists("Archive Card Transfer") and not frappe.db.has_index(
		"tabArchive Card Transfer", "uq_card_transfer_seq"
	):
		frappe.db.sql(
			"ALTER TABLE `tabArchive Card Transfer` ADD UNIQUE INDEX `uq_card_transfer_seq` (`card`, `sequence`)"
		)
