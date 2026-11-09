from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_datetime

from archive.api.cards import get_card_status_display_label
from archive.services.card_permissions import (
	CARD_DOCTYPE,
	has_permission,
	require_card_event_history_role,
	require_card_permission,
	require_view_card_activity_timeline_role,
)


def _format_event_datetime(value: Any) -> str:
	if not value:
		return ""
	try:
		return get_datetime(value).strftime("%Y-%m-%d %H:%M:%S")
	except Exception:
		return cstr(value).split(".")[0].strip()

CARD_EVENT_TYPE_LABELS: dict[str, str] = {
	"temporary_stop": "توقيف مؤقت",
	"reactivated": "إعادة تنشيط",
	"permanent_stop": "توقيف نهائي (متلفة)",
}


@frappe.whitelist()
def get_card_events(card: str) -> dict[str, Any]:
	require_card_event_history_role(
		_("ليست لديك صلاحية عرض سجل أحداث البطاقة."),
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
			"bank",
			"status",
			"is_deleted",
		],
		as_dict=True,
	)
	if not card_row or cint(card_row.is_deleted):
		frappe.throw(_("البطاقة المطلوبة غير موجودة."), frappe.DoesNotExistError)

	bank_name = (
		cstr(frappe.db.get_value("Archive Bank", card_row.bank, "bank_name") or "").strip()
		if card_row.bank
		else ""
	) or (card_row.bank or "")

	rows = frappe.db.sql(
		"""
		SELECT
			e.name,
			e.card,
			e.event_type,
			e.previous_status,
			e.new_status,
			e.event_date,
			e.reason,
			e.card_owner,
			e.card_owner_name,
			e.representative,
			e.representative_name,
			e.region,
			e.region_name,
			e.recorded_by,
			e.recorded_by_name,
			e.recorded_at
		FROM `tabArchive Card Event` e
		WHERE e.card = %(card)s
		ORDER BY e.recorded_at DESC, e.event_date DESC, e.name DESC
		""",
		{"card": card_row.name},
		as_dict=True,
	)

	events: list[dict[str, Any]] = []
	for row in rows:
		ev_type = cstr(row.event_type or "").strip()
		prev_st = cstr(row.previous_status or "").strip()
		new_st = cstr(row.new_status or "").strip()
		events.append(
			{
				"name": row.name,
				"card": row.card,
				"event_date": cstr(row.event_date or ""),
				"event_type": ev_type,
				"event_type_label": CARD_EVENT_TYPE_LABELS.get(ev_type, ev_type),
				"previous_status": prev_st,
				"previous_status_display": get_card_status_display_label(prev_st),
				"new_status": new_st,
				"new_status_display": get_card_status_display_label(new_st),
				"card_owner": row.card_owner or "",
				"card_owner_name": row.card_owner_name or row.card_owner or "",
				"representative": row.representative or "",
				"representative_name": row.representative_name or row.representative or "",
				"region": row.region or "",
				"region_name": row.region_name or row.region or "",
				"reason": row.reason or "",
				"recorded_by": row.recorded_by or "",
				"recorded_by_name": row.recorded_by_name or row.recorded_by or "",
				"recorded_at": _format_event_datetime(row.recorded_at),
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
			"bank": card_row.bank or "",
			"bank_name": bank_name,
			"status": card_row.status,
			"status_display": get_card_status_display_label(card_row.status),
		},
		"events": events,
		"total_events": len(events),
	}


@frappe.whitelist()
def get_card_activity_timeline(card: str, limit: int | str = 150) -> dict[str, Any]:
	require_view_card_activity_timeline_role(
		_("ليست لديك صلاحية عرض سجل مستخدم العملية في البطاقات."),
	)
	require_card_permission(
		"view_cards",
		_("ليست لديك صلاحية لعرض البطاقات."),
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
			"creation",
			"modified",
		],
		as_dict=True,
	)
	if not card_row or cint(card_row.is_deleted):
		frappe.throw(_("البطاقة المطلوبة غير موجودة."), frappe.DoesNotExistError)
	if not has_permission(card_row.name, "read"):
		frappe.throw(_("ليست لديك صلاحية للوصول إلى هذه البطاقة."), frappe.PermissionError)

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
				"event_datetime": _format_event_datetime(row.event_datetime),
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
			"creation": _format_event_datetime(card_row.creation),
			"modified": _format_event_datetime(card_row.modified),
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
			badge_label = f"حالة #{cint(row.sequence)}"

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
				"system_datetime": _format_event_datetime(row.system_datetime),
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
