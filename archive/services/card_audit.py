from __future__ import annotations

import json
from typing import Any

import frappe
from frappe.utils import cint, cstr, getdate, now_datetime

CARD_LOG_DOCTYPE = "Archive Card Log"
CARD_TRANSFER_DOCTYPE = "Archive Card Transfer"
CARD_EVENT_DOCTYPE = "Archive Card Event"


def record_card_status_event(
	card_doc: Any,
	event_type: str,
	previous_status: str,
	new_status: str,
	event_date: Any,
	reason: str | None = None,
	recorded_by: str | None = None,
	recorded_at: Any | None = None,
) -> Any:
	owner_id = cstr(getattr(card_doc, "card_owner", "") or "").strip()
	owner_name = (
		cstr(frappe.db.get_value("Archive Account", owner_id, "account_name") or "").strip()
		if owner_id
		else ""
	) or owner_id

	rep_id = cstr(getattr(card_doc, "representative", "") or "").strip()
	rep_name = (
		cstr(
			frappe.db.get_value(
				"Archive Representative", rep_id, "representative_name"
			)
			or ""
		).strip()
		if rep_id
		else ""
	) or rep_id

	reg_id = cstr(getattr(card_doc, "region", "") or "").strip()
	reg_name = (
		cstr(frappe.db.get_value("Archive Region", reg_id, "region_name") or "").strip()
		if reg_id
		else ""
	) or reg_id

	user_id = cstr(recorded_by or frappe.session.user or "Administrator").strip()
	user_name = (
		cstr(frappe.db.get_value("User", user_id, "full_name") or "").strip()
		if user_id
		else ""
	) or user_id

	doc = frappe.new_doc(CARD_EVENT_DOCTYPE)
	doc.card = card_doc.name
	doc.event_type = event_type
	doc.previous_status = cstr(previous_status or "").strip()
	doc.new_status = cstr(new_status or "").strip()
	doc.event_date = cstr(getdate(event_date))
	doc.reason = cstr(reason or "").strip() or None
	doc.card_owner = owner_id or None
	doc.card_owner_name = owner_name or None
	doc.representative = rep_id or None
	doc.representative_name = rep_name or None
	doc.region = reg_id or None
	doc.region_name = reg_name or None
	doc.recorded_by = user_id
	doc.recorded_by_name = user_name
	doc.recorded_at = recorded_at or now_datetime()
	doc.flags._allow_card_event_insert = True
	doc.insert(ignore_permissions=True)
	return doc


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
