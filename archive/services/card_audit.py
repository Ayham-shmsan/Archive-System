from __future__ import annotations

import json
from typing import Any

import frappe
from frappe.utils import cint, now_datetime

CARD_LOG_DOCTYPE = "Archive Card Log"
CARD_TRANSFER_DOCTYPE = "Archive Card Transfer"


def log_card_event(
	card_name: str,
	event_type: str,
	event_title: str,
	remarks: str | None = None,
	details: dict[str, Any] | None = None,
	event_source: str = "user",
	event_user: str | None = None,
	event_datetime: Any | None = None,
) -> Any:
	doc = frappe.new_doc(CARD_LOG_DOCTYPE)
	doc.card = card_name
	doc.event_type = event_type
	doc.event_title = event_title
	doc.event_datetime = event_datetime or now_datetime()
	doc.event_user = event_user or frappe.session.user or "Administrator"
	doc.event_source = event_source if event_source in ("user", "system") else "user"
	doc.remarks = (remarks or "").strip() or None
	doc.details_json = (
		json.dumps(details, ensure_ascii=False, default=str) if details is not None else None
	)
	doc.flags._allow_card_log_insert = True
	doc.insert(ignore_permissions=True)
	return doc


def record_card_transfer_entry(
	card_name: str,
	event_type: str,
	to_region: str,
	to_representative: str,
	new_received_date: str,
	from_region: str | None = None,
	from_representative: str | None = None,
	from_received_date: str | None = None,
	transfer_note: str | None = None,
	performed_by: str | None = None,
	system_datetime: Any | None = None,
) -> Any:
	max_seq_rows = frappe.db.sql(
		"""
		SELECT COALESCE(MAX(sequence), 0) AS max_seq
		FROM `tabArchive Card Transfer`
		WHERE card = %(card)s
		FOR UPDATE
		""",
		{"card": card_name},
		as_dict=True,
	)
	next_seq = cint(max_seq_rows[0].get("max_seq") if max_seq_rows else 0) + 1

	doc = frappe.new_doc(CARD_TRANSFER_DOCTYPE)
	doc.card = card_name
	doc.sequence = next_seq
	doc.event_type = event_type
	doc.from_region = from_region or None
	doc.from_representative = from_representative or None
	doc.from_received_date = from_received_date or None
	doc.to_region = to_region
	doc.to_representative = to_representative
	doc.new_received_date = new_received_date
	doc.transfer_note = (transfer_note or "").strip() or None
	doc.performed_by = performed_by or frappe.session.user or "Administrator"
	doc.system_datetime = system_datetime or now_datetime()
	doc.flags._allow_card_transfer_insert = True
	doc.insert(ignore_permissions=True)
	return doc
