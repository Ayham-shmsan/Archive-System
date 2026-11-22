from __future__ import annotations

import frappe
from frappe.utils import get_table_name


DOCTYPE = "Archive Card Deposit Stop Rule"
UNIQUE_CONSTRAINT = "unique_acd_stop_rule_card_fy_date"
UNIQUE_COLUMNS = ["card", "fiscal_year", "effective_date"]
INDEX_NAME = "idx_acd_stop_rule_fy_card_date"
INDEX_COLUMNS = ["fiscal_year", "card", "effective_date"]


def execute() -> None:
	"""Ensure unique constraint and composite lookup index exist on Archive Card Deposit Stop Rule."""
	if not frappe.db.table_exists(DOCTYPE):
		return

	if not all(frappe.db.has_column(DOCTYPE, col) for col in UNIQUE_COLUMNS):
		return

	table_name = get_table_name(DOCTYPE)

	if not frappe.db.has_index(table_name, UNIQUE_CONSTRAINT):
		frappe.db.add_unique(
			DOCTYPE,
			list(UNIQUE_COLUMNS),
			constraint_name=UNIQUE_CONSTRAINT,
		)

	if not frappe.db.has_index(table_name, INDEX_NAME):
		frappe.db.add_index(
			DOCTYPE,
			list(INDEX_COLUMNS),
			index_name=INDEX_NAME,
		)
