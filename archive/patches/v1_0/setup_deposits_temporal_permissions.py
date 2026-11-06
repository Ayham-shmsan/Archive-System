from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from archive.api.deposits import (
	ALL_DEPOSITS_ROLES,
	USER_FUTURE_DAYS_FIELD,
	USER_PAST_DAYS_FIELD,
)


def execute() -> None:
	for role_name in ALL_DEPOSITS_ROLES:
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
			# Frappe's Role.after_insert auto-grants new roles to Administrator;
			# remove that automatic grant so no role is ever assigned implicitly.
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
				"desk_access",
				1,
				update_modified=False,
			)

	custom_fields = {
		"User": [
			{
				"fieldname": "archive_deposit_permissions_section",
				"label": "صلاحيات شاشة الإيداعات اليومية",
				"fieldtype": "Section Break",
				"insert_after": "roles",
				"permlevel": 1,
				"collapsible": 0,
			},
			{
				"fieldname": USER_PAST_DAYS_FIELD,
				"label": "عدد الأيام السابقة المسموح بتعديلها",
				"fieldtype": "Int",
				"insert_after": "archive_deposit_permissions_section",
				"default": "0",
				"reqd": 0,
				"non_negative": 1,
				"permlevel": 1,
				"description": "يتطلب منح (صلاحية تعديل إيداعات الأيام السابقة). القيمة 0 لا تسمح بتعديل أي يوم سابق.",
			},
			{
				"fieldname": "archive_deposit_days_col_break",
				"fieldtype": "Column Break",
				"insert_after": USER_PAST_DAYS_FIELD,
				"permlevel": 1,
			},
			{
				"fieldname": USER_FUTURE_DAYS_FIELD,
				"label": "عدد الأيام القادمة المسموح بتعديلها",
				"fieldtype": "Int",
				"insert_after": "archive_deposit_days_col_break",
				"default": "0",
				"reqd": 0,
				"non_negative": 1,
				"permlevel": 1,
				"description": "يتطلب منح (صلاحية تعديل إيداعات الأيام القادمة). القيمة 0 لا تسمح بتعديل أي يوم قادم.",
			},
		]
	}
	create_custom_fields(custom_fields, update=True)

	frappe.db.sql(
		f"""
		UPDATE `tabUser`
		SET `{USER_PAST_DAYS_FIELD}` = IFNULL(`{USER_PAST_DAYS_FIELD}`, 0),
		    `{USER_FUTURE_DAYS_FIELD}` = IFNULL(`{USER_FUTURE_DAYS_FIELD}`, 0)
		"""
	)

	frappe.clear_cache(doctype="User")
	frappe.cache.delete_key("roles")
	frappe.cache.delete_key("bootinfo")
