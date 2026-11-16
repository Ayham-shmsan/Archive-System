from __future__ import annotations

import json
from typing import Any

import frappe
from frappe.utils import add_days, cint, cstr, flt, getdate, now_datetime, today

CARD_LOG_DOCTYPE = "Archive Card Log"
CARD_TRANSFER_DOCTYPE = "Archive Card Transfer"
CARD_EVENT_DOCTYPE = "Archive Card Event"
CARD_STATE_SPAN_DOCTYPE = "Archive Card State Span"
ACTIVE_STATUS_VALUE = "نشطة"
OPEN_ENDED_DATE = "9999-12-31"


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
	rebuild_card_state_spans(card_doc.name)
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
	if event_type in (
		"created",
		"daily_limit_changed",
		"account_family_changed",
		"family_base_name_changed",
		"formal_transfer",
		"manual_edit",
		"status_change",
		"deleted",
	):
		rebuild_card_state_spans(card_name)
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


def _safe_parse_json(raw: Any, default: Any = None) -> Any:
	if raw is None:
		return default
	if isinstance(raw, (dict, list)):
		return raw
	if isinstance(raw, str):
		text = raw.strip()
		if not text:
			return default
		try:
			return json.loads(text)
		except Exception:
			return default
	return default


def _coerce_optional_date(val: Any) -> str:
	if not val:
		return ""
	s = cstr(val).strip()
	if not s:
		return ""
	try:
		return cstr(getdate(s))
	except Exception:
		# Handle DD-MM-YYYY from Frappe Version diffs
		parts = s.split(" ")[0].split("-")
		if len(parts) == 3 and len(parts[0]) == 2 and len(parts[2]) == 4:
			try:
				return cstr(getdate(f"{parts[2]}-{parts[1]}-{parts[0]}"))
			except Exception:
				return ""
		return ""


def _resolve_master_names_maps() -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
	banks = {
		cstr(r.name): cstr(r.bank_name or r.name)
		for r in frappe.db.sql("SELECT name, bank_name FROM `tabArchive Bank`", as_dict=True)
	}
	reps = {
		cstr(r.name): cstr(r.representative_name or r.name)
		for r in frappe.db.sql(
			"SELECT name, representative_name FROM `tabArchive Representative`",
			as_dict=True,
		)
	}
	regs = {
		cstr(r.name): cstr(r.region_name or r.name)
		for r in frappe.db.sql("SELECT name, region_name FROM `tabArchive Region`", as_dict=True)
	}
	return banks, reps, regs


def rebuild_card_state_spans(
	card_name: str,
	master_maps: tuple[dict[str, str], dict[str, str], dict[str, str]] | None = None,
) -> int:
	"""
	Reconstructs and persists contiguous historical state intervals (`tabArchive Card State Span`)
	for `card_name` starting from `DATE(creation)` using:
	  - `tabArchive Card`
	  - `tabArchive Card Log`
	  - `tabArchive Card Event`
	  - `tabArchive Card Transfer`
	  - `tabVersion`
	"""
	clean_card = cstr(card_name or "").strip()
	if not clean_card:
		return 0
	if not frappe.db.table_exists(CARD_STATE_SPAN_DOCTYPE):
		return 0

	from archive.api.card_search import (
		clean_card_type,
		format_copy_badge_label,
		make_deposit_group_key,
		normalize_account_number,
	)
	from archive.api.operation_search import normalize_search_text

	card_rows = frappe.db.sql(
		"""
		SELECT
			name,
			creation,
			modified,
			serial_no,
			card_family,
			copy_no,
			card_name,
			base_card_name,
			IFNULL(card_type, '') AS card_type,
			card_number,
			account_number,
			account_number_normalized,
			bank,
			card_owner,
			region,
			representative,
			daily_limit,
			received_date,
			status,
			IFNULL(is_deleted, 0) AS is_deleted,
			deleted_at
		FROM `tabArchive Card`
		WHERE name = %(card)s
		LIMIT 1
		""",
		{"card": clean_card},
		as_dict=True,
	)
	if not card_rows:
		frappe.db.delete(CARD_STATE_SPAN_DOCTYPE, {"card": clean_card})
		return 0

	card_row = card_rows[0]
	creation_date = cstr(getdate(card_row.get("creation") or today()))

	if master_maps is None:
		banks_map, reps_map, regs_map = _resolve_master_names_maps()
	else:
		banks_map, reps_map, regs_map = master_maps

	# Reverse name-to-ID lookup maps for Link fields in `tabVersion` if ever needed
	bank_name_to_id = {v: k for k, v in banks_map.items()}
	rep_name_to_id = {v: k for k, v in reps_map.items()}
	reg_name_to_id = {v: k for k, v in regs_map.items()}

	def _resolve_link_id(field: str, val: Any) -> str:
		s = cstr(val or "").strip()
		if not s:
			return ""
		if field == "bank":
			if s in banks_map:
				return s
			return bank_name_to_id.get(s, s)
		if field == "representative":
			if s in reps_map:
				return s
			return rep_name_to_id.get(s, s)
		if field == "region":
			if s in regs_map:
				return s
			return reg_name_to_id.get(s, s)
		return s

	current_state: dict[str, Any] = {
		"status": cstr(card_row.get("status") or ACTIVE_STATUS_VALUE).strip(),
		"is_deleted": 1 if cint(card_row.get("is_deleted")) else 0,
		"daily_limit": flt(card_row.get("daily_limit") or 0, 2),
		"card_type": clean_card_type(card_row.get("card_type")),
		"base_card_name": cstr(card_row.get("base_card_name") or card_row.get("card_name") or "").strip(),
		"copy_no": max(1, cint(card_row.get("copy_no") or 1)),
		"card_name": cstr(card_row.get("card_name") or "").strip(),
		"card_number": cstr(card_row.get("card_number") or "").strip(),
		"account_number": cstr(card_row.get("account_number") or "").strip(),
		"bank": cstr(card_row.get("bank") or "").strip(),
		"representative": cstr(card_row.get("representative") or "").strip(),
		"region": cstr(card_row.get("region") or "").strip(),
		"received_date": _coerce_optional_date(card_row.get("received_date")) or creation_date,
		"card_family": cstr(card_row.get("card_family") or "").strip(),
	}

	log_rows = frappe.db.sql(
		"""
		SELECT name, event_type, event_datetime, creation, details_json
		FROM `tabArchive Card Log`
		WHERE card = %(card)s
		ORDER BY event_datetime ASC, creation ASC
		""",
		{"card": clean_card},
		as_dict=True,
	)

	event_rows = frappe.db.sql(
		"""
		SELECT name, event_type, previous_status, new_status, event_date, recorded_at, creation
		FROM `tabArchive Card Event`
		WHERE card = %(card)s
		ORDER BY event_date ASC, recorded_at ASC, creation ASC
		""",
		{"card": clean_card},
		as_dict=True,
	)

	transfer_rows = frappe.db.sql(
		"""
		SELECT name, sequence, event_type, from_region, from_representative, from_received_date,
		       to_region, to_representative, new_received_date, system_datetime, creation
		FROM `tabArchive Card Transfer`
		WHERE card = %(card)s
		ORDER BY sequence ASC, system_datetime ASC, creation ASC
		""",
		{"card": clean_card},
		as_dict=True,
	)

	version_rows = frappe.db.sql(
		"""
		SELECT name, creation, data
		FROM `tabVersion`
		WHERE ref_doctype = 'Archive Card' AND docname = %(card)s
		ORDER BY creation ASC
		""",
		{"card": clean_card},
		as_dict=True,
	)

	initial_state = dict(current_state)
	has_created_log = False

	# 1. Roll back Version diffs in reverse order
	version_scalar_fields = {
		"copy_no",
		"card_type",
		"card_name",
		"base_card_name",
		"card_number",
		"account_number",
		"daily_limit",
		"status",
		"is_deleted",
		"card_family",
		"bank",
		"representative",
		"region",
		"received_date",
	}
	for v_row in reversed(version_rows):
		v_data = _safe_parse_json(v_row.get("data"), {})
		if not isinstance(v_data, dict):
			continue
		changed_list = v_data.get("changed") or []
		for item in changed_list:
			if not isinstance(item, (list, tuple)) or len(item) < 3:
				continue
			f_name = cstr(item[0]).strip()
			old_val = item[1]
			if f_name not in version_scalar_fields:
				continue
			if f_name == "daily_limit":
				initial_state["daily_limit"] = flt(old_val or 0, 2) if old_val is not None else 0.0
			elif f_name == "copy_no":
				initial_state["copy_no"] = max(1, cint(old_val or 1))
			elif f_name == "is_deleted":
				initial_state["is_deleted"] = 1 if cint(old_val) else 0
			elif f_name == "card_type":
				initial_state["card_type"] = clean_card_type(old_val)
			elif f_name in ("bank", "representative", "region"):
				resolved_old = _resolve_link_id(f_name, old_val)
				if resolved_old:
					initial_state[f_name] = resolved_old
			elif f_name == "received_date":
				coerced_d = _coerce_optional_date(old_val)
				if coerced_d:
					initial_state["received_date"] = coerced_d
			else:
				if old_val is not None:
					initial_state[f_name] = cstr(old_val).strip()

	# 2. Roll back Archive Card Log events in reverse order
	for l_row in reversed(log_rows):
		ev_type = cstr(l_row.get("event_type") or "").strip()
		details = _safe_parse_json(l_row.get("details_json"), {})
		if not isinstance(details, dict):
			details = {}

		if ev_type == "daily_limit_changed":
			if "old_daily_limit" in details and details.get("old_daily_limit") is not None:
				initial_state["daily_limit"] = flt(details.get("old_daily_limit") or 0, 2)
		elif ev_type == "account_family_changed":
			if details.get("old_card_family"):
				initial_state["card_family"] = cstr(details.get("old_card_family")).strip()
			if details.get("old_account_number"):
				initial_state["account_number"] = cstr(details.get("old_account_number")).strip()
			if details.get("old_base_card_name"):
				initial_state["base_card_name"] = cstr(details.get("old_base_card_name")).strip()
			if details.get("old_bank"):
				initial_state["bank"] = _resolve_link_id("bank", details.get("old_bank"))
			if "old_card_type" in details:
				initial_state["card_type"] = clean_card_type(details.get("old_card_type"))
			if details.get("old_copy_no"):
				initial_state["copy_no"] = max(1, cint(details.get("old_copy_no") or 1))
			if details.get("old_card_name"):
				initial_state["card_name"] = cstr(details.get("old_card_name")).strip()
		elif ev_type == "family_base_name_changed":
			if details.get("old_base_card_name"):
				initial_state["base_card_name"] = cstr(details.get("old_base_card_name")).strip()
			if details.get("old_card_name"):
				initial_state["card_name"] = cstr(details.get("old_card_name")).strip()
		elif ev_type == "formal_transfer":
			if details.get("from_region"):
				initial_state["region"] = _resolve_link_id("region", details.get("from_region"))
			if details.get("from_representative"):
				initial_state["representative"] = _resolve_link_id(
					"representative", details.get("from_representative")
				)
			if details.get("from_received_date"):
				coerced_d = _coerce_optional_date(details.get("from_received_date"))
				if coerced_d:
					initial_state["received_date"] = coerced_d
		elif ev_type == "manual_edit":
			ch_fields = details.get("changed_fields")
			if isinstance(ch_fields, dict):
				for f_name, diff_obj in ch_fields.items():
					if not isinstance(diff_obj, dict) or "old" not in diff_obj:
						continue
					old_v = diff_obj.get("old")
					if f_name in ("bank", "representative", "region"):
						resolved_old = _resolve_link_id(f_name, old_v)
						if resolved_old:
							initial_state[f_name] = resolved_old
					elif f_name == "daily_limit":
						initial_state["daily_limit"] = flt(old_v or 0, 2)
					elif f_name == "copy_no":
						initial_state["copy_no"] = max(1, cint(old_v or 1))
					elif f_name == "card_type":
						initial_state["card_type"] = clean_card_type(old_v)
					elif f_name == "received_date":
						coerced_d = _coerce_optional_date(old_v)
						if coerced_d:
							initial_state["received_date"] = coerced_d
					elif f_name in initial_state and f_name != "status" and old_v is not None:
						initial_state[f_name] = cstr(old_v).strip()
		elif ev_type == "deleted":
			initial_state["is_deleted"] = 0

	# 3. Build unified chronological status history across Archive Card Event, Archive Card Log, and Version
	def _ts_Close(ts_a: str, ts_b: str, max_sec: float = 15.0) -> bool:
		if not ts_a or not ts_b:
			return False
		try:
			return abs((get_datetime(ts_a) - get_datetime(ts_b)).total_seconds()) <= max_sec
		except Exception:
			return _coerce_optional_date(ts_a) == _coerce_optional_date(ts_b)

	status_events: list[tuple[str, int, str, str, str]] = []
	for idx_e, ev_row in enumerate(event_rows):
		ev_ts = cstr(ev_row.get("recorded_at") or ev_row.get("creation") or "")
		ev_d = max(
			creation_date,
			_coerce_optional_date(ev_row.get("event_date"))
			or _coerce_optional_date(ev_ts)
			or creation_date,
		)
		old_st = cstr(ev_row.get("previous_status") or "").strip()
		new_st = cstr(ev_row.get("new_status") or "").strip()
		if new_st:
			status_events.append((ev_ts, 3000 + idx_e, ev_d, old_st, new_st))

	for idx_l, l_row in enumerate(log_rows):
		ev_type = cstr(l_row.get("event_type") or "").strip()
		l_ts = cstr(l_row.get("event_datetime") or l_row.get("creation") or "")
		details = _safe_parse_json(l_row.get("details_json"), {})
		if not isinstance(details, dict):
			details = {}
		old_st = ""
		new_st = ""
		ev_d = max(creation_date, _coerce_optional_date(l_ts) or creation_date)
		if ev_type == "status_change":
			old_st = cstr(details.get("old_status") or "").strip()
			new_st = cstr(details.get("new_status") or "").strip()
			ev_d = max(
				creation_date,
				_coerce_optional_date(details.get("event_date")) or ev_d,
			)
		elif ev_type == "manual_edit":
			ch_fields = details.get("changed_fields")
			if isinstance(ch_fields, dict) and isinstance(ch_fields.get("status"), dict):
				st_diff = ch_fields["status"]
				old_st = cstr(st_diff.get("old") or "").strip()
				new_st = cstr(st_diff.get("new") or "").strip()
		if new_st:
			already_covered = any(
				ev_new == new_st and _ts_Close(l_ts, ev_ts)
				for ev_ts, _p, _d, _o, ev_new in status_events
			)
			if not already_covered:
				status_events.append((l_ts, 2000 + idx_l, ev_d, old_st, new_st))

	for idx_v, v_row in enumerate(version_rows):
		v_ts = cstr(v_row.get("creation") or "")
		v_data = _safe_parse_json(v_row.get("data"), {})
		if not isinstance(v_data, dict):
			continue
		for item in v_data.get("changed") or []:
			if not isinstance(item, (list, tuple)) or len(item) < 3:
				continue
			if cstr(item[0]).strip() != "status":
				continue
			old_st = cstr(item[1] or "").strip()
			new_st = cstr(item[2] or "").strip()
			if not new_st:
				continue
			ev_d = max(creation_date, _coerce_optional_date(v_ts) or creation_date)
			already_covered = any(
				ev_new == new_st and _ts_Close(v_ts, ev_ts)
				for ev_ts, _p, _d, _o, ev_new in status_events
			)
			if not already_covered:
				status_events.append((v_ts, 10 + idx_v, ev_d, old_st, new_st))

	status_events.sort(key=lambda item: (item[0], item[1]))
	for _ts, _prio, _eff_d, old_st, _new_st in reversed(status_events):
		if old_st:
			initial_state["status"] = old_st

	# 4. Anchor initial assignment and `created` log
	for t_row in transfer_rows:
		if cstr(t_row.get("event_type")).strip() == "initial_assignment":
			if t_row.get("to_region"):
				initial_state["region"] = _resolve_link_id("region", t_row.get("to_region"))
			if t_row.get("to_representative"):
				initial_state["representative"] = _resolve_link_id(
					"representative", t_row.get("to_representative")
				)
			if t_row.get("new_received_date"):
				coerced_d = _coerce_optional_date(t_row.get("new_received_date"))
				if coerced_d:
					initial_state["received_date"] = coerced_d
			break

	for l_row in log_rows:
		if cstr(l_row.get("event_type")).strip() == "created":
			has_created_log = True
			details = _safe_parse_json(l_row.get("details_json"), {})
			if isinstance(details, dict):
				if details.get("card_family"):
					initial_state["card_family"] = cstr(details.get("card_family")).strip()
				if details.get("copy_no"):
					initial_state["copy_no"] = max(1, cint(details.get("copy_no") or 1))
				if details.get("card_name"):
					initial_state["card_name"] = cstr(details.get("card_name")).strip()
				if details.get("base_card_name"):
					initial_state["base_card_name"] = cstr(details.get("base_card_name")).strip()
				if details.get("account_number"):
					initial_state["account_number"] = cstr(details.get("account_number")).strip()
				if details.get("card_number"):
					initial_state["card_number"] = cstr(details.get("card_number")).strip()
				if details.get("bank"):
					initial_state["bank"] = _resolve_link_id("bank", details.get("bank"))
				if details.get("region"):
					initial_state["region"] = _resolve_link_id("region", details.get("region"))
				if details.get("representative"):
					initial_state["representative"] = _resolve_link_id(
						"representative", details.get("representative")
					)
				if details.get("received_date"):
					coerced_d = _coerce_optional_date(details.get("received_date"))
					if coerced_d:
						initial_state["received_date"] = coerced_d
				if "daily_limit" in details and details.get("daily_limit") is not None:
					initial_state["daily_limit"] = flt(details.get("daily_limit") or 0, 2)
				if details.get("status"):
					initial_state["status"] = cstr(details.get("status")).strip()
				if "card_type" in details and details.get("card_type") is not None:
					initial_state["card_type"] = clean_card_type(details.get("card_type"))
				initial_state["is_deleted"] = 0
			break

	# 5. Build chronological forward transitions grouped by effective date
	# Each entry: (effective_date, sort_ts, priority_order, updates_dict)
	transitions: list[tuple[str, str, int, dict[str, Any]]] = []

	for idx_v, v_row in enumerate(version_rows):
		v_ts = cstr(v_row.get("creation") or "")
		eff_d = max(creation_date, _coerce_optional_date(v_ts) or creation_date)
		v_data = _safe_parse_json(v_row.get("data"), {})
		if not isinstance(v_data, dict):
			continue
		changed_list = v_data.get("changed") or []
		updates: dict[str, Any] = {}
		for item in changed_list:
			if not isinstance(item, (list, tuple)) or len(item) < 3:
				continue
			f_name = cstr(item[0]).strip()
			new_val = item[2]
			if f_name not in version_scalar_fields or f_name == "status":
				continue
			if f_name == "daily_limit":
				updates["daily_limit"] = flt(new_val or 0, 2) if new_val is not None else 0.0
			elif f_name == "copy_no":
				updates["copy_no"] = max(1, cint(new_val or 1))
			elif f_name == "is_deleted":
				updates["is_deleted"] = 1 if cint(new_val) else 0
			elif f_name == "card_type":
				updates["card_type"] = clean_card_type(new_val)
			elif f_name in ("bank", "representative", "region"):
				resolved_new = _resolve_link_id(f_name, new_val)
				if resolved_new:
					updates[f_name] = resolved_new
			elif f_name == "received_date":
				coerced_d = _coerce_optional_date(new_val)
				if coerced_d:
					updates["received_date"] = coerced_d
			else:
				if new_val is not None:
					updates[f_name] = cstr(new_val).strip()
		if updates:
			transitions.append((eff_d, v_ts, 10 + idx_v, updates))

	for idx_t, t_row in enumerate(transfer_rows):
		if cstr(t_row.get("event_type")).strip() == "formal_transfer":
			t_ts = cstr(t_row.get("system_datetime") or t_row.get("creation") or "")
			eff_d = max(creation_date, _coerce_optional_date(t_ts) or creation_date)
			updates = {}
			if t_row.get("to_region"):
				updates["region"] = _resolve_link_id("region", t_row.get("to_region"))
			if t_row.get("to_representative"):
				updates["representative"] = _resolve_link_id(
					"representative", t_row.get("to_representative")
				)
			if t_row.get("new_received_date"):
				coerced_d = _coerce_optional_date(t_row.get("new_received_date"))
				if coerced_d:
					updates["received_date"] = coerced_d
			if updates:
				transitions.append((eff_d, t_ts, 1000 + idx_t, updates))

	for idx_l, l_row in enumerate(log_rows):
		ev_type = cstr(l_row.get("event_type") or "").strip()
		if ev_type in ("created", "status_change"):
			continue
		l_ts = cstr(l_row.get("event_datetime") or l_row.get("creation") or "")
		eff_d = max(creation_date, _coerce_optional_date(l_ts) or creation_date)
		details = _safe_parse_json(l_row.get("details_json"), {})
		if not isinstance(details, dict):
			details = {}
		updates = {}
		if ev_type == "daily_limit_changed":
			if "new_daily_limit" in details and details.get("new_daily_limit") is not None:
				updates["daily_limit"] = flt(details.get("new_daily_limit") or 0, 2)
		elif ev_type == "account_family_changed":
			if details.get("new_card_family"):
				updates["card_family"] = cstr(details.get("new_card_family")).strip()
			if details.get("new_account_number"):
				updates["account_number"] = cstr(details.get("new_account_number")).strip()
			if details.get("new_base_card_name"):
				updates["base_card_name"] = cstr(details.get("new_base_card_name")).strip()
			if details.get("new_bank"):
				updates["bank"] = _resolve_link_id("bank", details.get("new_bank"))
			if "new_card_type" in details:
				updates["card_type"] = clean_card_type(details.get("new_card_type"))
			if details.get("new_copy_no"):
				updates["copy_no"] = max(1, cint(details.get("new_copy_no") or 1))
			if details.get("new_card_name"):
				updates["card_name"] = cstr(details.get("new_card_name")).strip()
		elif ev_type == "family_base_name_changed":
			if details.get("new_base_card_name"):
				updates["base_card_name"] = cstr(details.get("new_base_card_name")).strip()
			if details.get("new_card_name"):
				updates["card_name"] = cstr(details.get("new_card_name")).strip()
		elif ev_type == "formal_transfer":
			if details.get("to_region"):
				updates["region"] = _resolve_link_id("region", details.get("to_region"))
			if details.get("to_representative"):
				updates["representative"] = _resolve_link_id(
					"representative", details.get("to_representative")
				)
			if details.get("new_received_date"):
				coerced_d = _coerce_optional_date(details.get("new_received_date"))
				if coerced_d:
					updates["received_date"] = coerced_d
		elif ev_type == "manual_edit":
			ch_fields = details.get("changed_fields")
			if isinstance(ch_fields, dict):
				for f_name, diff_obj in ch_fields.items():
					if f_name == "status":
						continue
					if not isinstance(diff_obj, dict) or "new" not in diff_obj:
						continue
					new_v = diff_obj.get("new")
					if f_name in ("bank", "representative", "region"):
						resolved_new = _resolve_link_id(f_name, new_v)
						if resolved_new:
							updates[f_name] = resolved_new
					elif f_name == "daily_limit":
						updates["daily_limit"] = flt(new_v or 0, 2)
					elif f_name == "copy_no":
						updates["copy_no"] = max(1, cint(new_v or 1))
					elif f_name == "card_type":
						updates["card_type"] = clean_card_type(new_v)
					elif f_name == "received_date":
						coerced_d = _coerce_optional_date(new_v)
						if coerced_d:
							updates["received_date"] = coerced_d
					elif f_name in initial_state and new_v is not None:
						updates[f_name] = cstr(new_v).strip()
		elif ev_type == "deleted":
			updates["is_deleted"] = 1

		if updates:
			transitions.append((eff_d, l_ts, 2000 + idx_l, updates))

	# Resolve status transitions in recording order so a later-recorded backdated status event
	# supersedes any earlier-recorded status event whose effective_date was >= the backdated date
	resolved_status_events: list[tuple[str, str, int, str]] = []
	for rec_ts, s_prio, eff_d, _old_st, new_st in status_events:
		resolved_status_events = [
			prev for prev in resolved_status_events if prev[0] < eff_d
		]
		resolved_status_events.append((eff_d, rec_ts, s_prio, new_st))

	for eff_d, rec_ts, s_prio, new_st in resolved_status_events:
		transitions.append((eff_d, rec_ts, s_prio, {"status": new_st}))

	if cint(card_row.get("is_deleted")) == 1:
		del_d = max(
			creation_date,
			_coerce_optional_date(card_row.get("deleted_at"))
			or _coerce_optional_date(card_row.get("modified"))
			or creation_date,
		)
		transitions.append((del_d, "9999-99-99", 9000, {"is_deleted": 1}))

	transitions.sort(key=lambda item: (item[0], item[1], item[2]))

	transitions_by_date: dict[str, list[dict[str, Any]]] = {}
	for eff_d, _ts, _prio, upd in transitions:
		transitions_by_date.setdefault(eff_d, []).append(upd)

	all_change_dates = sorted(set([creation_date] + list(transitions_by_date.keys())))

	raw_spans: list[dict[str, Any]] = []
	running_state = dict(initial_state)

	for idx_d, d_str in enumerate(all_change_dates):
		for upd in transitions_by_date.get(d_str, []):
			running_state.update(upd)
		next_d = all_change_dates[idx_d + 1] if idx_d + 1 < len(all_change_dates) else None
		valid_to = cstr(add_days(next_d, -1)) if next_d else OPEN_ENDED_DATE
		if getdate(valid_to) < getdate(d_str):
			continue
		raw_spans.append(
			{
				"valid_from": d_str,
				"valid_to": valid_to,
				"state": dict(running_state),
			}
		)

	# Ensure the final open-ended span reflects the live `tabArchive Card` state
	if raw_spans:
		last_span = raw_spans[-1]
		diff_keys = [
			k
			for k in (
				"status",
				"is_deleted",
				"daily_limit",
				"card_type",
				"base_card_name",
				"copy_no",
				"card_name",
				"card_number",
				"account_number",
				"bank",
				"representative",
				"region",
			)
			if last_span["state"].get(k) != current_state.get(k)
		]
		if diff_keys:
			if diff_keys == ["status"]:
				fallback_live_d = (
					_coerce_optional_date(card_row.get("status_changed_at"))
					or _coerce_optional_date(card_row.get("modified"))
					or cstr(today())
				)
			else:
				fallback_live_d = _coerce_optional_date(card_row.get("modified")) or cstr(today())
			mod_date = max(last_span["valid_from"], fallback_live_d)
			if mod_date <= last_span["valid_from"]:
				last_span["state"] = dict(current_state)
			else:
				last_span["valid_to"] = cstr(add_days(mod_date, -1))
				raw_spans.append(
					{
						"valid_from": mod_date,
						"valid_to": OPEN_ENDED_DATE,
						"state": dict(current_state),
					}
				)
	else:
		raw_spans.append(
			{
				"valid_from": creation_date,
				"valid_to": OPEN_ENDED_DATE,
				"state": dict(current_state),
			}
		)

	def _state_signature(st: dict[str, Any]) -> tuple[Any, ...]:
		return (
			cstr(st.get("status")),
			cint(st.get("is_deleted")),
			flt(st.get("daily_limit"), 2),
			cstr(st.get("card_type")),
			cstr(st.get("base_card_name")),
			cint(st.get("copy_no")),
			cstr(st.get("card_name")),
			cstr(st.get("card_number")),
			cstr(st.get("account_number")),
			cstr(st.get("bank")),
			cstr(st.get("representative")),
			cstr(st.get("region")),
			cstr(st.get("received_date")),
			cstr(st.get("card_family")),
		)

	merged_spans: list[dict[str, Any]] = []
	for sp in raw_spans:
		if merged_spans and _state_signature(merged_spans[-1]["state"]) == _state_signature(
			sp["state"]
		):
			merged_spans[-1]["valid_to"] = sp["valid_to"]
		else:
			merged_spans.append(sp)

	frappe.db.delete(CARD_STATE_SPAN_DOCTYPE, {"card": clean_card})

	serial_no = cint(card_row.get("serial_no") or 0)
	confidence = "verified" if has_created_log else "current_only"
	now_ts = now_datetime()
	user_id = cstr(frappe.session.user or "Administrator")

	for idx_sp, sp in enumerate(merged_spans, start=1):
		st = sp["state"]
		status_val = cstr(st.get("status") or ACTIVE_STATUS_VALUE).strip()
		is_del = 1 if cint(st.get("is_deleted")) else 0
		is_act = 1 if (is_del == 0 and status_val == ACTIVE_STATUS_VALUE) else 0
		acc_num = cstr(st.get("account_number") or "").strip()
		norm_acc = normalize_account_number(acc_num) or cstr(
			card_row.get("account_number_normalized") or ""
		).strip()
		base_name = cstr(st.get("base_card_name") or st.get("card_name") or "").strip()
		c_name = cstr(st.get("card_name") or base_name).strip()
		c_type = clean_card_type(st.get("card_type"))
		c_copy = max(1, cint(st.get("copy_no") or 1))
		c_num = cstr(st.get("card_number") or "").strip()
		bank_id = cstr(st.get("bank") or "").strip()
		bank_name = cstr(banks_map.get(bank_id) or bank_id).strip()
		rep_id = cstr(st.get("representative") or "").strip()
		rep_name = cstr(reps_map.get(rep_id) or rep_id).strip()
		reg_id = cstr(st.get("region") or "").strip()
		reg_name = cstr(regs_map.get(reg_id) or reg_id).strip()
		d_limit = max(0.0, flt(st.get("daily_limit") or 0, 2))
		rec_date = _coerce_optional_date(st.get("received_date")) or creation_date
		grp_key = make_deposit_group_key(base_name, norm_acc or acc_num, bank_id) or clean_card
		copy_label = format_copy_badge_label(c_type, c_copy)

		search_norm = normalize_search_text(
			" ".join(
				[
					clean_card,
					c_name,
					base_name,
					c_type,
					copy_label,
					c_num,
					acc_num,
					norm_acc,
					bank_id,
					bank_name,
					rep_id,
					rep_name,
					reg_id,
					reg_name,
					cstr(serial_no),
					cstr(int(d_limit)) if d_limit == int(d_limit) else f"{d_limit:.2f}",
					f"{d_limit:,.0f}" if d_limit == int(d_limit) else f"{d_limit:,.2f}",
				]
			)
		)

		span_doc = frappe.get_doc(
			{
				"doctype": CARD_STATE_SPAN_DOCTYPE,
				"card": clean_card,
				"valid_from": sp["valid_from"],
				"valid_to": sp["valid_to"],
				"status": status_val,
				"is_active": is_act,
				"is_deleted": is_del,
				"serial_no": serial_no,
				"card_family": cstr(st.get("card_family") or card_row.get("card_family") or ""),
				"copy_no": c_copy,
				"card_type": c_type,
				"card_name": c_name,
				"base_card_name": base_name,
				"card_number": c_num,
				"account_number": acc_num,
				"account_number_normalized": norm_acc,
				"group_key": grp_key,
				"bank": bank_id or None,
				"bank_name": bank_name,
				"representative": rep_id or None,
				"representative_name": rep_name,
				"region": reg_id or None,
				"region_name": reg_name,
				"daily_limit": d_limit,
				"received_date": rec_date,
				"history_confidence": confidence,
				"search_norm": search_norm,
				"idx": idx_sp,
				"owner": user_id,
				"modified_by": user_id,
				"creation": now_ts,
				"modified": now_ts,
			}
		)
		span_doc.db_insert()

	return len(merged_spans)


def rebuild_all_cards_state_spans() -> dict[str, int]:
	if not frappe.db.table_exists(CARD_STATE_SPAN_DOCTYPE):
		return {"cards_processed": 0, "spans_created": 0}

	master_maps = _resolve_master_names_maps()
	card_names = frappe.get_all("Archive Card", pluck="name", order_by="creation asc, name asc")
	total_spans = 0
	for c_name in card_names:
		total_spans += rebuild_card_state_spans(c_name, master_maps=master_maps)
	return {
		"cards_processed": len(card_names),
		"spans_created": total_spans,
	}


def ensure_card_state_spans_populated() -> None:
	if not frappe.db.table_exists(CARD_STATE_SPAN_DOCTYPE):
		return
	span_count = cint(frappe.db.count(CARD_STATE_SPAN_DOCTYPE))
	card_count = cint(frappe.db.count("Archive Card"))
	if card_count > 0 and span_count == 0:
		rebuild_all_cards_state_spans()


def sync_card_state_spans_on_doc_event(doc: Any, method: str | None = None) -> None:
	del method
	card_name = cstr(getattr(doc, "name", "") or "").strip()
	if card_name:
		rebuild_card_state_spans(card_name)


def sync_card_state_spans_on_trash(doc: Any, method: str | None = None) -> None:
	del method
	card_name = cstr(getattr(doc, "name", "") or "").strip()
	if card_name and frappe.db.table_exists(CARD_STATE_SPAN_DOCTYPE):
		frappe.db.delete(CARD_STATE_SPAN_DOCTYPE, {"card": card_name})


def sync_card_state_spans_for_master(doc: Any, method: str | None = None) -> None:
	del method
	if not frappe.db.table_exists(CARD_STATE_SPAN_DOCTYPE):
		return
	dt = cstr(getattr(doc, "doctype", "") or "").strip()
	doc_name = cstr(getattr(doc, "name", "") or "").strip()
	if not dt or not doc_name:
		return
	field_map = {
		"Archive Bank": "bank",
		"Archive Representative": "representative",
		"Archive Region": "region",
	}
	col = field_map.get(dt)
	if not col:
		return
	affected_cards = frappe.db.sql(
		f"SELECT DISTINCT card FROM `tabArchive Card State Span` WHERE `{col}` = %(val)s",
		{"val": doc_name},
		pluck="card",
	)
	if affected_cards:
		master_maps = _resolve_master_names_maps()
		for c_name in affected_cards:
			rebuild_card_state_spans(c_name, master_maps=master_maps)
