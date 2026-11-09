from __future__ import annotations

import frappe

from archive.services.operation_permissions import ROLE_VIEW_OPERATION_TIMELINE
from archive.services.pending_operation_permissions import (
	PENDING_DOCTYPE,
	ROLE_VIEW_PENDING_OPERATION_TIMELINE,
)

OPERATION_DOCTYPE = "Archive Operation"
LEGACY_OPERATION_TIMELINE_ROLE = "Archive Timeline Viewer"
LEGACY_PENDING_TIMELINE_ROLE = "صلاحية عرض مسار العملية في المعلقات"


def _rename_or_ensure_role(old_role: str, new_role: str) -> None:
	old_exists = bool(frappe.db.exists("Role", old_role))
	new_exists = bool(frappe.db.exists("Role", new_role))

	if old_exists and not new_exists:
		frappe.rename_doc("Role", old_role, new_role, force=True)
	elif old_exists and new_exists:
		existing_new_parents = set(
			frappe.get_all(
				"Has Role",
				filters={"role": new_role},
				pluck="parent",
			)
		)
		if existing_new_parents:
			frappe.db.sql(
				"""
				DELETE FROM `tabHas Role`
				WHERE `role` = %(old_role)s
					AND `parent` IN %(parents)s
				""",
				{"old_role": old_role, "parents": tuple(existing_new_parents)},
			)
		frappe.rename_doc("Role", old_role, new_role, force=True, merge=True)
	elif not new_exists:
		role_doc = frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": new_role,
				"desk_access": 1,
				"is_custom": 1,
				"disabled": 0,
			}
		)
		role_doc.insert(ignore_permissions=True)
		frappe.db.delete(
			"Has Role",
			{
				"parent": "Administrator",
				"parenttype": "User",
				"role": new_role,
			},
		)

	if frappe.db.exists("Role", new_role):
		frappe.db.set_value(
			"Role",
			new_role,
			{"desk_access": 1, "disabled": 0},
			update_modified=False,
		)


def execute() -> None:
	_rename_or_ensure_role(
		LEGACY_OPERATION_TIMELINE_ROLE,
		ROLE_VIEW_OPERATION_TIMELINE,
	)
	_rename_or_ensure_role(
		LEGACY_PENDING_TIMELINE_ROLE,
		ROLE_VIEW_PENDING_OPERATION_TIMELINE,
	)

	for table in ("DocPerm", "Custom DocPerm"):
		if frappe.db.exists("DocType", table):
			frappe.db.sql(
				f"""
				UPDATE `tab{table}`
				SET `role` = %(new_role)s
				WHERE `parent` = %(parent)s
					AND `role` = %(old_role)s
				""",
				{
					"new_role": ROLE_VIEW_OPERATION_TIMELINE,
					"old_role": LEGACY_OPERATION_TIMELINE_ROLE,
					"parent": OPERATION_DOCTYPE,
				},
			)

	frappe.clear_cache(doctype=OPERATION_DOCTYPE)
	frappe.clear_cache(doctype=PENDING_DOCTYPE)
	frappe.cache.delete_key("roles")
	frappe.cache.delete_key("bootinfo")
