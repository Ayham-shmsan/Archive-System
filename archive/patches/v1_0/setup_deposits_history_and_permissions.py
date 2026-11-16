from __future__ import annotations

import frappe

from archive.patches.v1_0.setup_deposits_temporal_permissions import execute as setup_permissions
from archive.services.card_audit import rebuild_all_cards_state_spans


def execute() -> None:
	setup_permissions()
	frappe.reload_doc("archive", "doctype", "archive_card_state_span")
	frappe.reload_doc("archive", "doctype", "archive_card_deposit")
	frappe.db.commit()

	# Ensure composite indexes exist on tabArchive Card State Span for fast temporal range queries
	if frappe.db.table_exists("Archive Card State Span"):
		frappe.db.add_index(
			"Archive Card State Span",
			["valid_from", "valid_to", "status", "is_deleted"],
			index_name="idx_span_dates",
		)
		frappe.db.add_index(
			"Archive Card State Span",
			["card", "valid_from", "valid_to"],
			index_name="idx_span_card_dates",
		)

	rebuild_all_cards_state_spans()
	frappe.clear_cache(doctype="User")
	frappe.cache.delete_key("roles")
	frappe.cache.delete_key("bootinfo")
