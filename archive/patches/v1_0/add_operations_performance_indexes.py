from __future__ import annotations

import frappe
from frappe.utils import get_table_name


PERFORMANCE_INDEX_SPECS: tuple[tuple[str, str, list[str]], ...] = (
    (
        "Archive Operation",
        "idx_archive_op_fy_serial",
        ["fiscal_year", "serial_no"],
    ),
    (
        "Archive Operation Attachment",
        "idx_archive_op_att_swift",
        ["parenttype", "parentfield", "is_final_swift", "parent"],
    ),
    (
        "Archive Pending Operation",
        "idx_archive_pend_fy_dt",
        ["fiscal_year", "operation_datetime", "creation", "serial_no"],
    ),
    (
        "Archive Pending Operation",
        "idx_archive_pend_owner_fy",
        ["owner", "fiscal_year"],
    ),
)


def execute() -> None:
    """Create non-unique composite performance indexes safely via Frappe's add_index API."""
    for doctype, index_name, columns in PERFORMANCE_INDEX_SPECS:
        if not frappe.db.table_exists(doctype):
            continue
        if not all(frappe.db.has_column(doctype, column) for column in columns):
            continue
        table_name = get_table_name(doctype)
        if frappe.db.has_index(table_name, index_name):
            continue
        frappe.db.add_index(doctype, list(columns), index_name=index_name)
