from __future__ import annotations

import frappe

from archive.services.operation_permissions import (
	ROLE_PREVIEW_OPERATION_ATTACHMENTS,
)


def execute() -> None:
	if not frappe.db.exists("Role", ROLE_PREVIEW_OPERATION_ATTACHMENTS):
		role_doc = frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": ROLE_PREVIEW_OPERATION_ATTACHMENTS,
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
				"role": ROLE_PREVIEW_OPERATION_ATTACHMENTS,
			},
		)
	else:
		frappe.db.set_value(
			"Role",
			ROLE_PREVIEW_OPERATION_ATTACHMENTS,
			{"desk_access": 1, "disabled": 0},
			update_modified=False,
		)

	frappe.cache.delete_key("roles")
	frappe.db.commit()
