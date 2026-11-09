from __future__ import annotations

import os
import frappe
from frappe.modules.import_file import import_file_by_path

from archive.services.commercial_registry_permissions import (
	COMMERCIAL_REGISTRY_DOCTYPE,
	COMMERCIAL_REGISTRY_ROLES,
)


def _ensure_role_without_auto_grant(role_name: str) -> None:
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
		# Frappe's Role.after_insert automatically adds a Has Role row for Administrator;
		# remove it on initial role creation so all 8 roles remain strictly opt-in.
		frappe.db.delete(
			"Has Role",
			{
				"parenttype": "User",
				"parent": "Administrator",
				"role": role_name,
			},
		)
	else:
		frappe.db.set_value(
			"Role",
			role_name,
			{
				"desk_access": 1,
				"is_custom": 1,
				"disabled": 0,
			},
			update_modified=False,
		)


def _ensure_unique_commercial_registry_no_index() -> None:
	table_name = f"tab{COMMERCIAL_REGISTRY_DOCTYPE}"
	if not frappe.db.table_exists(COMMERCIAL_REGISTRY_DOCTYPE):
		return

	existing_indexes = frappe.db.sql(
		f"SHOW INDEX FROM `{table_name}` WHERE Column_name = 'commercial_registry_no' AND Non_unique = 0",
		as_dict=True,
	)
	if not existing_indexes:
		frappe.db.commit()
		frappe.db.sql_ddl(
			f"ALTER TABLE `{table_name}` ADD UNIQUE INDEX `uq_commercial_registry_no` (`commercial_registry_no`)"
		)


def _sync_page_and_sidebar() -> None:
	app_path = frappe.get_app_path("archive")
	page_json = os.path.join(
		app_path,
		"archive",
		"page",
		"archive_commercial_registries",
		"archive_commercial_registries.json",
	)
	if os.path.exists(page_json):
		import_file_by_path(page_json, force=True, ignore_version=True)

	sidebar_json = os.path.join(
		app_path,
		"archive",
		"sidebar",
		"أرشفة_وتسهيل",
		"أرشفة_وتسهيل.json",
	)
	if os.path.exists(sidebar_json):
		import_file_by_path(sidebar_json, force=True, ignore_version=True)


def execute() -> None:
	for role_name in COMMERCIAL_REGISTRY_ROLES:
		_ensure_role_without_auto_grant(role_name)

	_ensure_unique_commercial_registry_no_index()
	_sync_page_and_sidebar()

	frappe.clear_cache()
	frappe.db.commit()
