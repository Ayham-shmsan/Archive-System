from __future__ import annotations

import frappe
from frappe.utils import get_table_name


ROLE_BACKUP_MANAGEMENT = "صلاحية إدارة النسخ الاحتياطي"
LOG_DOCTYPE = "Archive Backup Log"
INDEX_NAME = "idx_archive_backup_log_status_started"
INDEX_COLUMNS = ["status", "started_at"]
BACKUP_SETTINGS_DEFAULTS = {
	"backup_enabled": 0,
	"backup_destination_path": "",
	"backup_require_mount": 0,
	"backup_mode": "حزمة كاملة سريعة (.tar ذكي)",
	"backup_interval_value": 6,
	"backup_interval_unit": "ساعات",
	"backup_enable_retention": 1,
	"backup_max_keep": 10,
	"backup_pigz_threads": 4,
	"backup_min_free_space_gb": 2.0,
}


def execute() -> None:
	"""Create explicit backup management role, seed default backup settings, and ensure Archive Backup Log index exists."""
	if not frappe.db.exists("Role", ROLE_BACKUP_MANAGEMENT):
		role_doc = frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": ROLE_BACKUP_MANAGEMENT,
				"desk_access": 1,
				"disabled": 0,
				"is_custom": 1,
			}
		)
		role_doc.insert(ignore_permissions=True)
	else:
		frappe.db.set_value(
			"Role",
			ROLE_BACKUP_MANAGEMENT,
			{"desk_access": 1, "disabled": 0},
			update_modified=False,
		)

	if frappe.db.exists("DocType", "Archive Settings"):
		existing_map = {
			row[0]: row[1]
			for row in frappe.db.sql(
				"SELECT field, value FROM `tabSingles` WHERE doctype = 'Archive Settings'"
			)
		}
		non_empty_defaults = {
			"backup_mode",
			"backup_interval_value",
			"backup_interval_unit",
			"backup_max_keep",
			"backup_pigz_threads",
			"backup_min_free_space_gb",
		}
		for fieldname, default_val in BACKUP_SETTINGS_DEFAULTS.items():
			cur_raw = existing_map.get(fieldname)
			is_missing = fieldname not in existing_map
			is_unset_nonzero = fieldname in non_empty_defaults and str(cur_raw or "").strip() in ("", "0", "0.0")
			if is_missing or is_unset_nonzero:
				frappe.db.set_single_value(
					"Archive Settings",
					fieldname,
					default_val,
					update_modified=False,
				)

	if frappe.db.table_exists(LOG_DOCTYPE) and all(
		frappe.db.has_column(LOG_DOCTYPE, col) for col in INDEX_COLUMNS
	):
		table_name = get_table_name(LOG_DOCTYPE)
		if not frappe.db.has_index(table_name, INDEX_NAME):
			frappe.db.add_index(LOG_DOCTYPE, list(INDEX_COLUMNS), index_name=INDEX_NAME)
