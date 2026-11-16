from __future__ import annotations

import frappe
from frappe.model.document import Document


class ArchiveCardStateSpan(Document):
	pass


def on_doctype_update() -> None:
	frappe.db.add_index(
		"Archive Card State Span",
		["is_active", "is_deleted", "valid_from", "valid_to"],
		index_name="idx_acss_active_dates",
	)
	frappe.db.add_index(
		"Archive Card State Span",
		["card", "valid_from", "valid_to"],
		index_name="idx_acss_card_dates",
	)
	frappe.db.add_index(
		"Archive Card State Span",
		["group_key", "valid_from", "valid_to"],
		index_name="idx_acss_group_dates",
	)
