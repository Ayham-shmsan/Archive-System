from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr

from archive.services.card_permissions import CARD_DOCTYPE, require_card_permission


@frappe.whitelist()
def get_card_activity_timeline(card: str, limit: int | str = 150) -> dict[str, Any]:
	require_card_permission(
		"view_card_activity_timeline",
		_("ليست لديك صلاحية لعرض سجل أحداث البطاقة."),
	)

	card_row = frappe.db.get_value(
		CARD_DOCTYPE,
		card,
		[
			"name",
			"serial_no",
			"copy_no",
			"card_name",
			"base_card_name",
			"account_number",
			"card_number",
			"status",
			"is_deleted",
		],
		as_dict=True,
	)
	if not card_row or cint(card_row.is_deleted):
		frappe.throw(_("البطاقة المطلوبة غير موجودة."), frappe.DoesNotExistError)

	max_rows = max(1, min(cint(limit or 150), 500))
	rows = frappe.db.sql(
		f"""
		SELECT
			l.name,
			l.card,
			l.event_type,
			l.event_title,
			l.event_datetime,
			l.event_user,
			u.full_name AS event_user_full_name,
			l.event_source,
			l.remarks,
			l.details_json
		FROM `tabArchive Card Log` l
		LEFT JOIN `tabUser` u ON u.name = l.event_user
		WHERE l.card = %(card)s
		ORDER BY l.event_datetime DESC, l.creation DESC
		LIMIT {max_rows}
		""",
		{"card": card_row.name},
		as_dict=True,
	)

	events: list[dict[str, Any]] = []
	for row in rows:
		parsed_details: dict[str, Any] = {}
		if row.details_json:
			try:
				parsed_details = json.loads(row.details_json)
			except Exception:
				parsed_details = {}

		events.append(
			{
				"name": row.name,
				"card": row.card,
				"event_type": row.event_type,
				"event_title": row.event_title,
				"event_datetime": cstr(row.event_datetime or ""),
				"event_user": row.event_user,
				"event_user_full_name": row.event_user_full_name or row.event_user,
				"event_source": row.event_source or "user",
				"remarks": row.remarks or "",
				"details": parsed_details,
			}
		)

	_enrich_activity_events_with_labels(events)

	return {
		"card": {
			"name": card_row.name,
			"serial_no": cint(card_row.serial_no),
			"copy_no": cint(card_row.copy_no or 1),
			"card_name": card_row.card_name,
			"base_card_name": card_row.base_card_name,
			"account_number": card_row.account_number,
			"card_number": card_row.card_number,
			"status": card_row.status,
		},
		"events": events,
		"total_events": len(events),
	}


def _enrich_activity_events_with_labels(events: list[dict[str, Any]]) -> None:
	if not events:
		return

	region_ids: set[str] = set()
	rep_ids: set[str] = set()
	bank_ids: set[str] = set()
	owner_ids: set[str] = set()

	def _collect(field: str, val: Any) -> None:
		s = cstr(val or "").strip()
		if not s:
			return
		if field in ("region", "from_region", "to_region"):
			region_ids.add(s)
		elif field in ("representative", "from_representative", "to_representative"):
			rep_ids.add(s)
		elif field == "bank":
			bank_ids.add(s)
		elif field == "card_owner":
			owner_ids.add(s)

	for ev in events:
		d = ev.get("details")
		if not isinstance(d, dict):
			continue
		for k in (
			"region",
			"from_region",
			"to_region",
			"representative",
			"from_representative",
			"to_representative",
			"bank",
			"card_owner",
		):
			if k in d:
				_collect(k, d.get(k))

		changed = d.get("changed_fields")
		if isinstance(changed, dict):
			for field, diff in changed.items():
				if isinstance(diff, dict):
					_collect(field, diff.get("old"))
					_collect(field, diff.get("new"))

	region_map = (
		{
			r.name: r.region_name
			for r in frappe.get_all(
				"Archive Region",
				filters={"name": ["in", list(region_ids)]},
				fields=["name", "region_name"],
			)
		}
		if region_ids
		else {}
	)
	rep_map = (
		{
			r.name: r.representative_name
			for r in frappe.get_all(
				"Archive Representative",
				filters={"name": ["in", list(rep_ids)]},
				fields=["name", "representative_name"],
			)
		}
		if rep_ids
		else {}
	)
	bank_map = (
		{
			r.name: r.bank_name
			for r in frappe.get_all(
				"Archive Bank",
				filters={"name": ["in", list(bank_ids)]},
				fields=["name", "bank_name"],
			)
		}
		if bank_ids
		else {}
	)
	owner_map = (
		{
			r.name: r.account_name
			for r in frappe.get_all(
				"Archive Account",
				filters={"name": ["in", list(owner_ids)]},
				fields=["name", "account_name"],
			)
		}
		if owner_ids
		else {}
	)

	def _resolve(field: str, val: Any) -> str:
		s = cstr(val or "").strip()
		if not s:
			return ""
		if field in ("region", "from_region", "to_region"):
			return region_map.get(s) or s
		if field in ("representative", "from_representative", "to_representative"):
			return rep_map.get(s) or s
		if field == "bank":
			return bank_map.get(s) or s
		if field == "card_owner":
			return owner_map.get(s) or s
		return s

	for ev in events:
		d = ev.get("details")
		if not isinstance(d, dict):
			continue
		for k in (
			"region",
			"from_region",
			"to_region",
			"representative",
			"from_representative",
			"to_representative",
			"bank",
			"card_owner",
		):
			if d.get(k):
				d[f"{k}_name"] = _resolve(k, d.get(k))

		changed = d.get("changed_fields")
		if isinstance(changed, dict):
			for field, diff in changed.items():
				if isinstance(diff, dict):
					old_v = diff.get("old")
					new_v = diff.get("new")
					diff["old_label"] = _resolve(field, old_v) if old_v is not None else "—"
					diff["new_label"] = _resolve(field, new_v) if new_v is not None else "—"


@frappe.whitelist()
def get_card_transfer_timeline(card: str) -> dict[str, Any]:
	require_card_permission(
		"view_card_transfer_timeline",
		_("ليست لديك صلاحية لعرض سجل تنقلات عهدة البطاقة."),
	)

	card_row = frappe.db.get_value(
		CARD_DOCTYPE,
		card,
		[
			"name",
			"serial_no",
			"copy_no",
			"card_name",
			"base_card_name",
			"account_number",
			"card_number",
			"region",
			"representative",
			"received_date",
			"status",
			"is_deleted",
		],
		as_dict=True,
	)
	if not card_row or cint(card_row.is_deleted):
		frappe.throw(_("البطاقة المطلوبة غير موجودة."), frappe.DoesNotExistError)

	current_region_name = (
		frappe.db.get_value("Archive Region", card_row.region, "region_name")
		if card_row.region
		else ""
	) or (card_row.region or "")
	current_representative_name = (
		frappe.db.get_value(
			"Archive Representative", card_row.representative, "representative_name"
		)
		if card_row.representative
		else ""
	) or (card_row.representative or "")

	rows = frappe.db.sql(
		"""
		SELECT
			t.name,
			t.card,
			t.sequence,
			t.event_type,
			t.from_region,
			r_from.region_name AS from_region_name,
			t.from_representative,
			rep_from.representative_name AS from_representative_name,
			t.from_received_date,
			t.to_region,
			r_to.region_name AS to_region_name,
			t.to_representative,
			rep_to.representative_name AS to_representative_name,
			t.new_received_date,
			t.transfer_note,
			t.performed_by,
			u.full_name AS performed_by_full_name,
			t.system_datetime
		FROM `tabArchive Card Transfer` t
		LEFT JOIN `tabArchive Region` r_from ON r_from.name = t.from_region
		LEFT JOIN `tabArchive Representative` rep_from ON rep_from.name = t.from_representative
		LEFT JOIN `tabArchive Region` r_to ON r_to.name = t.to_region
		LEFT JOIN `tabArchive Representative` rep_to ON rep_to.name = t.to_representative
		LEFT JOIN `tabUser` u ON u.name = t.performed_by
		WHERE t.card = %(card)s
		ORDER BY t.sequence ASC
		""",
		{"card": card_row.name},
		as_dict=True,
	)

	total = len(rows)
	custody_matches_last_station = True
	if total > 0:
		last_row = rows[-1]
		custody_matches_last_station = (
			cstr(card_row.region or "") == cstr(last_row.to_region or "")
			and cstr(card_row.representative or "") == cstr(last_row.to_representative or "")
			and cstr(card_row.received_date or "") == cstr(last_row.new_received_date or "")
		)

	stations: list[dict[str, Any]] = []
	for idx, row in enumerate(rows):
		is_last_formal = idx == (total - 1)
		is_current = bool(is_last_formal and custody_matches_last_station)
		is_initial = row.event_type == "initial_assignment" or idx == 0
		if is_last_formal:
			badge_label = "العهدة الحالية" if custody_matches_last_station else "آخر عهدة رسمية مسجلة"
		elif is_initial:
			badge_label = "استلام أولي"
		else:
			badge_label = f"محطة #{cint(row.sequence)}"

		stations.append(
			{
				"name": row.name,
				"card": row.card,
				"sequence": cint(row.sequence),
				"event_type": row.event_type,
				"from_region": row.from_region or "",
				"from_region_name": row.from_region_name or row.from_region or "",
				"from_representative": row.from_representative or "",
				"from_representative_name": row.from_representative_name or row.from_representative or "",
				"from_received_date": cstr(row.from_received_date or ""),
				"to_region": row.to_region or "",
				"to_region_name": row.to_region_name or row.to_region or "",
				"to_representative": row.to_representative or "",
				"to_representative_name": row.to_representative_name or row.to_representative or "",
				"new_received_date": cstr(row.new_received_date or ""),
				"transfer_note": row.transfer_note or "",
				"performed_by": row.performed_by or "",
				"performed_by_full_name": row.performed_by_full_name or row.performed_by or "",
				"system_datetime": cstr(row.system_datetime or ""),
				"is_initial": is_initial,
				"is_last_formal": is_last_formal,
				"is_current": is_current,
				"badge_label": badge_label,
			}
		)

	return {
		"card": {
			"name": card_row.name,
			"serial_no": cint(card_row.serial_no),
			"copy_no": cint(card_row.copy_no or 1),
			"card_name": card_row.card_name,
			"base_card_name": card_row.base_card_name,
			"account_number": card_row.account_number,
			"card_number": card_row.card_number,
			"status": card_row.status,
			"current_region": card_row.region,
			"current_region_name": current_region_name,
			"current_representative": card_row.representative,
			"current_representative_name": current_representative_name,
			"current_received_date": cstr(card_row.received_date or ""),
		},
		"custody_matches_last_station": custody_matches_last_station,
		"formal_transfer_note": "مسار النقل يوثق عمليات النقل الرسمية فقط.",
		"stations": stations,
		"total_stations": total,
	}
