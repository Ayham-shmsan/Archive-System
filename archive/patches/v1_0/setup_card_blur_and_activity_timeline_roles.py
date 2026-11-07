from __future__ import annotations

import frappe

from archive.services.card_permissions import (
	CARD_DOCTYPE,
	ROLE_ENFORCE_CARD_IMAGE_BLUR,
	ROLE_VIEW_CARD_ACTIVITY_TIMELINE,
)

LEGACY_ACTIVITY_TIMELINE_ROLE = "صلاحية عرض مسار العملية للبطاقات"


def execute() -> None:
	if (
		frappe.db.exists("Role", LEGACY_ACTIVITY_TIMELINE_ROLE)
		and not frappe.db.exists("Role", ROLE_VIEW_CARD_ACTIVITY_TIMELINE)
	):
		frappe.rename_doc(
			"Role",
			LEGACY_ACTIVITY_TIMELINE_ROLE,
			ROLE_VIEW_CARD_ACTIVITY_TIMELINE,
			force=True,
		)

	for role_name in (
		ROLE_ENFORCE_CARD_IMAGE_BLUR,
		ROLE_VIEW_CARD_ACTIVITY_TIMELINE,
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
			# Frappe's Role.after_insert auto-assigns any newly created role to Administrator;
			# remove that automatic grant on initial creation only so the role starts unassigned.
			frappe.db.delete(
				"Has Role",
				{
					"parent": "Administrator",
					"parenttype": "User",
					"role": role_name,
				},
			)

	if frappe.db.has_column("Custom DocPerm", "view_card_activity_timeline"):
		frappe.db.sql(
			"""
			UPDATE `tabCustom DocPerm`
			SET `view_card_activity_timeline` = 0
			WHERE `parent` = %(parent)s
				AND COALESCE(`view_card_activity_timeline`, 0) != 0
			""",
			{"parent": CARD_DOCTYPE},
		)
		frappe.clear_cache(doctype=CARD_DOCTYPE)

	frappe.cache.delete_key("roles")
	frappe.cache.delete_key("bootinfo")
