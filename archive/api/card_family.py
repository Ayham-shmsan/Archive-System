from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, now_datetime, today

from archive.api.card_search import (
	CARD_TYPE_BUSINESS,
	CARD_TYPE_MADA,
	VALID_CARD_TYPES,
	clean_account_number_display,
	clean_base_card_name,
	clean_card_type,
	derive_card_display_name,
	format_copy_badge_label,
	make_copy_group_key,
	make_deposit_group_key,
	normalize_account_number,
	set_card_search_text,
	validate_card_type,
	validate_daily_limit_for_card_type,
)
from archive.services.card_audit import log_card_event
from archive.services.card_permissions import CARD_DOCTYPE, require_card_permission

FAMILY_DOCTYPE = "Archive Card Family"


def _format_limit_display(val: Any) -> str:
	num = flt(val, 2)
	if abs(num - round(num)) < 0.0001:
		return f"{int(round(num)):,}"
	return f"{num:,.2f}"


def get_type_group_shared_daily_limit_state(
	norm_account: str,
	base_card_name: str | None = None,
	bank: str | None = None,
	card_type: str | None = None,
	exclude_card: str | None = None,
	lock: bool = False,
) -> dict[str, Any]:
	"""
	Inspects the 4-element copy group:
	(LOWER(base_card_name), account_number_normalized, bank, card_type)
	to determine whether copies of that exact type group already exist and what
	their unified daily limit is.
	"""
	clean_norm = cstr(norm_account or "").strip()
	clean_base = clean_base_card_name(base_card_name)
	clean_bank = cstr(bank or "").strip()
	clean_type = clean_card_type(card_type)

	if not clean_norm or not clean_base or not clean_bank:
		return {
			"exists": False,
			"has_conflict": False,
			"daily_limit": None,
			"distinct_limits": [],
			"cards": [],
		}

	for_update = "FOR UPDATE" if lock else ""
	rows = frappe.db.sql(
		f"""
		SELECT
			name,
			card_name,
			base_card_name,
			copy_no,
			account_number,
			account_number_normalized,
			bank,
			IFNULL(card_type, '') AS card_type,
			status,
			daily_limit,
			IFNULL(is_deleted, 0) AS is_deleted
		FROM `tabArchive Card`
		WHERE account_number_normalized = %(norm)s
		  AND bank = %(bank)s
		  AND LOWER(TRIM(base_card_name)) = LOWER(%(base_name)s)
		  AND IFNULL(card_type, '') = %(card_type)s
		ORDER BY name ASC
		{for_update}
		""",
		{
			"norm": clean_norm,
			"bank": clean_bank,
			"base_name": clean_base,
			"card_type": clean_type,
		},
		as_dict=True,
	)

	non_deleted = [
		r
		for r in rows
		if cint(r.get("is_deleted")) == 0 and (not exclude_card or r.get("name") != exclude_card)
	]
	if not non_deleted:
		return {
			"exists": False,
			"has_conflict": False,
			"daily_limit": None,
			"distinct_limits": [],
			"cards": [],
		}

	distinct_limits = sorted(
		{flt(r.get("daily_limit"), 2) for r in non_deleted if flt(r.get("daily_limit"), 2) > 0}
	)
	if len(distinct_limits) > 1:
		return {
			"exists": True,
			"has_conflict": True,
			"daily_limit": None,
			"distinct_limits": distinct_limits,
			"cards": non_deleted,
		}

	shared_limit = distinct_limits[0] if len(distinct_limits) == 1 else None
	return {
		"exists": True,
		"has_conflict": False,
		"daily_limit": shared_limit,
		"distinct_limits": distinct_limits,
		"cards": non_deleted,
	}


def get_account_shared_daily_limit_state(
	norm_account: str,
	exclude_card: str | None = None,
	lock: bool = False,
	base_card_name: str | None = None,
	bank: str | None = None,
	card_type: str | None = None,
) -> dict[str, Any]:
	"""
	Backward-compatible wrapper. When base_card_name and bank are provided, scopes
	strictly to the 4-element copy group (base_card_name + account_number_normalized + bank + card_type).
	"""
	if base_card_name and bank:
		return get_type_group_shared_daily_limit_state(
			norm_account=norm_account,
			base_card_name=base_card_name,
			bank=bank,
			card_type=card_type,
			exclude_card=exclude_card,
			lock=lock,
		)

	clean_norm = cstr(norm_account or "").strip()
	if not clean_norm:
		return {
			"exists": False,
			"has_conflict": False,
			"daily_limit": None,
			"distinct_limits": [],
			"cards": [],
		}

	for_update = "FOR UPDATE" if lock else ""
	type_filter = ""
	params: dict[str, Any] = {"norm": clean_norm}
	if card_type is not None:
		type_filter = "AND IFNULL(card_type, '') = %(card_type)s"
		params["card_type"] = clean_card_type(card_type)

	rows = frappe.db.sql(
		f"""
		SELECT
			name,
			card_name,
			base_card_name,
			copy_no,
			account_number,
			account_number_normalized,
			bank,
			IFNULL(card_type, '') AS card_type,
			status,
			daily_limit,
			IFNULL(is_deleted, 0) AS is_deleted
		FROM `tabArchive Card`
		WHERE account_number_normalized = %(norm)s
		  {type_filter}
		ORDER BY name ASC
		{for_update}
		""",
		params,
		as_dict=True,
	)

	non_deleted = [
		r
		for r in rows
		if cint(r.get("is_deleted")) == 0 and (not exclude_card or r.get("name") != exclude_card)
	]
	if not non_deleted:
		return {
			"exists": False,
			"has_conflict": False,
			"daily_limit": None,
			"distinct_limits": [],
			"cards": [],
		}

	distinct_limits = sorted(
		{flt(r.get("daily_limit"), 2) for r in non_deleted if flt(r.get("daily_limit"), 2) > 0}
	)
	if len(distinct_limits) > 1:
		return {
			"exists": True,
			"has_conflict": True,
			"daily_limit": None,
			"distinct_limits": distinct_limits,
			"cards": non_deleted,
		}

	shared_limit = distinct_limits[0] if len(distinct_limits) == 1 else None
	return {
		"exists": True,
		"has_conflict": False,
		"daily_limit": shared_limit,
		"distinct_limits": distinct_limits,
		"cards": non_deleted,
	}


def get_deposit_group_state_for_date(
	norm_account: str,
	base_card_name: str,
	bank: str,
	target_date: str,
	lock: bool = False,
	override_card_type: dict[str, str] | None = None,
	override_type_limits: dict[str, float] | None = None,
	override_deposits: dict[str, float] | None = None,
	extra_cards: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
	"""
	Calculates the 3-element deposit group state:
	Group key = (LOWER(TRIM(base_card_name)), account_number_normalized, bank)

	Implements the mandatory priority equations:
	- Let A = daily limit of 'أعمال' group (0 if no 'أعمال' exists in the 3-element group)
	- Let M = daily limit of 'مدى' group (0 if no 'مدى' exists in the 3-element group)
	- Let D_A = sum of deposits on target_date across all 'أعمال' cards in the group
	- Let D_M = sum of deposits on target_date across all 'مدى' cards in the group
	- Remaining for 'أعمال': max(0, A - D_A - D_M)
	- Remaining for 'مدى':
	    if 'أعمال' exists (A > 0): max(0, min(M - D_M, A - D_A - D_M))
	    else: max(0, M - D_M)
	- Daily target for this 3-element group:
	    if 'أعمال' exists (A > 0): A
	    elif 'مدى' exists (M > 0): M
	    else: legacy limit L
	"""
	clean_norm = normalize_account_number(norm_account)
	clean_base = clean_base_card_name(base_card_name)
	clean_bank = cstr(bank or "").strip()

	if not clean_norm or not clean_base or not clean_bank:
		return {
			"has_business": False,
			"has_mada": False,
			"business_limit": 0.0,
			"mada_limit": 0.0,
			"legacy_limit": 0.0,
			"business_deposited": 0.0,
			"mada_deposited": 0.0,
			"legacy_deposited": 0.0,
			"total_deposited": 0.0,
			"business_remaining": 0.0,
			"mada_remaining": 0.0,
			"legacy_remaining": 0.0,
			"group_daily_target": 0.0,
			"has_business_conflict": False,
			"has_mada_conflict": False,
			"has_legacy_conflict": False,
			"business_distinct_limits": [],
			"mada_distinct_limits": [],
			"legacy_distinct_limits": [],
		}

	for_update = "FOR UPDATE" if lock else ""
	card_rows = frappe.db.sql(
		f"""
		SELECT
			name,
			card_name,
			base_card_name,
			copy_no,
			account_number,
			account_number_normalized,
			bank,
			IFNULL(card_type, '') AS card_type,
			daily_limit,
			status,
			IFNULL(is_deleted, 0) AS is_deleted
		FROM `tabArchive Card`
		WHERE account_number_normalized = %(norm)s
		  AND bank = %(bank)s
		  AND LOWER(TRIM(base_card_name)) = LOWER(%(base_name)s)
		ORDER BY name ASC
		{for_update}
		""",
		{"norm": clean_norm, "bank": clean_bank, "base_name": clean_base},
		as_dict=True,
	)

	cards_by_name = {cstr(r.name): dict(r) for r in card_rows}
	if extra_cards:
		for ec in extra_cards:
			cid = cstr(ec.get("name") or "")
			if cid:
				cards_by_name[cid] = dict(ec)

	all_card_ids = sorted(cards_by_name.keys())
	deposits_by_card: dict[str, float] = {}
	if all_card_ids and target_date:
		dep_rows = frappe.db.sql(
			f"""
			SELECT card, deposit_amount
			FROM `tabArchive Card Deposit`
			WHERE deposit_date = %(target_date)s
			  AND card IN %(card_ids)s
			ORDER BY card ASC
			{for_update}
			""",
			{"target_date": cstr(target_date), "card_ids": tuple(all_card_ids)},
			as_dict=True,
		)
		for dr in dep_rows:
			deposits_by_card[cstr(dr.card)] = max(0.0, flt(dr.deposit_amount, 2))

	if override_deposits:
		for cid, amt in override_deposits.items():
			deposits_by_card[cstr(cid)] = max(0.0, flt(amt, 2))

	business_limits: set[float] = set()
	mada_limits: set[float] = set()
	legacy_limits: set[float] = set()

	business_deposited = 0.0
	mada_deposited = 0.0
	legacy_deposited = 0.0

	for cid, crow in cards_by_name.items():
		ctype = clean_card_type(
			override_card_type[cid]
			if override_card_type and cid in override_card_type
			else crow.get("card_type")
		)
		is_del = cint(crow.get("is_deleted")) == 1
		lim = flt(crow.get("daily_limit"), 2)
		if override_type_limits and ctype in override_type_limits:
			lim = flt(override_type_limits[ctype], 2)

		if not is_del and lim > 0:
			if ctype == CARD_TYPE_BUSINESS:
				business_limits.add(lim)
			elif ctype == CARD_TYPE_MADA:
				mada_limits.add(lim)
			else:
				legacy_limits.add(lim)

		dep_amt = flt(deposits_by_card.get(cid, 0.0), 2)
		if dep_amt > 0:
			if ctype == CARD_TYPE_BUSINESS:
				business_deposited = flt(business_deposited + dep_amt, 2)
			elif ctype == CARD_TYPE_MADA:
				mada_deposited = flt(mada_deposited + dep_amt, 2)
			else:
				legacy_deposited = flt(legacy_deposited + dep_amt, 2)

	if override_type_limits:
		if CARD_TYPE_BUSINESS in override_type_limits and flt(override_type_limits[CARD_TYPE_BUSINESS], 2) > 0:
			business_limits = {flt(override_type_limits[CARD_TYPE_BUSINESS], 2)}
		if CARD_TYPE_MADA in override_type_limits and flt(override_type_limits[CARD_TYPE_MADA], 2) > 0:
			mada_limits = {flt(override_type_limits[CARD_TYPE_MADA], 2)}

	b_sorted = sorted(business_limits)
	m_sorted = sorted(mada_limits)
	l_sorted = sorted(legacy_limits)

	has_business = len(b_sorted) > 0
	has_mada = len(m_sorted) > 0

	business_limit = b_sorted[0] if len(b_sorted) == 1 else (min(b_sorted) if b_sorted else 0.0)
	mada_limit = m_sorted[0] if len(m_sorted) == 1 else (min(m_sorted) if m_sorted else 0.0)
	legacy_limit = l_sorted[0] if len(l_sorted) == 1 else (min(l_sorted) if l_sorted else 0.0)

	total_deposited = flt(business_deposited + mada_deposited + legacy_deposited, 2)

	business_remaining = (
		max(0.0, flt(business_limit - total_deposited, 2)) if has_business else 0.0
	)
	if has_mada:
		if has_business:
			mada_remaining = max(
				0.0,
				min(
					flt(mada_limit - mada_deposited, 2),
					flt(business_limit - total_deposited, 2),
				),
			)
		else:
			mada_remaining = max(0.0, flt(mada_limit - mada_deposited, 2))
	else:
		mada_remaining = 0.0

	if l_sorted:
		if has_business:
			legacy_remaining = max(
				0.0,
				min(
					flt(legacy_limit - legacy_deposited, 2),
					flt(business_limit - total_deposited, 2),
				),
			)
		else:
			legacy_remaining = max(0.0, flt(legacy_limit - legacy_deposited, 2))
	else:
		legacy_remaining = 0.0

	if has_business:
		group_daily_target = business_limit
	elif has_mada:
		group_daily_target = mada_limit
	else:
		group_daily_target = legacy_limit

	return {
		"has_business": has_business,
		"has_mada": has_mada,
		"business_limit": business_limit,
		"mada_limit": mada_limit,
		"legacy_limit": legacy_limit,
		"business_deposited": business_deposited,
		"mada_deposited": mada_deposited,
		"legacy_deposited": legacy_deposited,
		"total_deposited": total_deposited,
		"business_remaining": business_remaining,
		"mada_remaining": mada_remaining,
		"legacy_remaining": legacy_remaining,
		"group_daily_target": group_daily_target,
		"has_business_conflict": len(b_sorted) > 1,
		"has_mada_conflict": len(m_sorted) > 1,
		"has_legacy_conflict": len(l_sorted) > 1,
		"business_distinct_limits": b_sorted,
		"mada_distinct_limits": m_sorted,
		"legacy_distinct_limits": l_sorted,
	}


def validate_type_group_daily_limit_against_today_deposits(
	norm_account: str,
	base_card_name: str,
	bank: str,
	card_type: str | None,
	new_limit: float,
	extra_card_to_include: str | None = None,
) -> None:
	"""
	Validates updating the daily limit of a 4-element copy group against today's deposits
	on the 3-element deposit group:
	- If card_type == 'أعمال':
	  1) 100,000 <= new_limit <= 1,000,000
	  2) If 'مدى' exists in the 3-element group, new_limit >= mada_limit
	  3) new_limit >= D_A + D_M (total deposits of the 3-element group today)
	- If card_type == 'مدى':
	  1) 0 < new_limit <= 100,000
	  2) If 'أعمال' exists in the 3-element group, new_limit <= business_limit and D_A + D_M <= business_limit
	  3) new_limit >= D_M (today's deposits on 'مدى' in the 3-element group)
	"""
	clean_norm = normalize_account_number(norm_account)
	clean_base = clean_base_card_name(base_card_name)
	clean_bank = cstr(bank or "").strip()
	clean_type = clean_card_type(card_type)
	resolved_limit = flt(new_limit, 2)

	if clean_type:
		validate_daily_limit_for_card_type(resolved_limit, clean_type)

	if not clean_norm or not clean_base or not clean_bank:
		return

	today_str = cstr(today())
	extra_cards: list[dict[str, Any]] = []
	if extra_card_to_include:
		ec_row = frappe.db.get_value(
			CARD_DOCTYPE,
			extra_card_to_include,
			[
				"name",
				"card_name",
				"base_card_name",
				"copy_no",
				"account_number",
				"account_number_normalized",
				"bank",
				"card_type",
				"daily_limit",
				"status",
				"is_deleted",
			],
			as_dict=True,
		)
		if ec_row:
			ec_copy = dict(ec_row)
			ec_copy["card_type"] = clean_type or clean_card_type(ec_row.get("card_type"))
			ec_copy["daily_limit"] = resolved_limit
			extra_cards.append(ec_copy)

	state = get_deposit_group_state_for_date(
		norm_account=clean_norm,
		base_card_name=clean_base,
		bank=clean_bank,
		target_date=today_str,
		lock=False,
		override_type_limits={clean_type: resolved_limit} if clean_type else None,
		extra_cards=extra_cards,
	)

	if clean_type == CARD_TYPE_BUSINESS:
		if state["has_mada"] and round(resolved_limit * 100) < round(state["mada_limit"] * 100):
			frappe.throw(
				_(
					"الحد اليومي لمجموعة «أعمال» ({0}) لا يمكن أن يكون أقل من الحد اليومي لمجموعة «مدى» ({1}) لنفس البطاقة والحساب والبنك."
				).format(
					_format_limit_display(resolved_limit),
					_format_limit_display(state["mada_limit"]),
				),
				frappe.ValidationError,
			)
		if round(state["total_deposited"] * 100) > round(resolved_limit * 100):
			frappe.throw(
				_(
					"لا يمكن خفض الحد اليومي لبطاقات «أعمال» إلى ({0}) لأن مجموع إيداعات اليوم المحفوظة على المجموعة (أعمال + مدى) يبلغ ({1})."
				).format(
					_format_limit_display(resolved_limit),
					_format_limit_display(state["total_deposited"]),
				),
				frappe.ValidationError,
			)
	elif clean_type == CARD_TYPE_MADA:
		if state["has_business"] and round(resolved_limit * 100) > round(state["business_limit"] * 100):
			frappe.throw(
				_(
					"الحد اليومي لبطاقات «مدى» ({0}) لا يمكن أن يتجاوز الحد اليومي لبطاقات «أعمال» ({1})."
				).format(
					_format_limit_display(resolved_limit),
					_format_limit_display(state["business_limit"]),
				),
				frappe.ValidationError,
			)
		if round(state["mada_deposited"] * 100) > round(resolved_limit * 100):
			frappe.throw(
				_(
					"لا يمكن خفض الحد اليومي لبطاقات «مدى» إلى ({0}) لأن مجموع إيداعات اليوم المحفوظة على بطاقات «مدى» يبلغ ({1})."
				).format(
					_format_limit_display(resolved_limit),
					_format_limit_display(state["mada_deposited"]),
				),
				frappe.ValidationError,
			)
		if state["has_business"] and round(state["total_deposited"] * 100) > round(state["business_limit"] * 100):
			frappe.throw(
				_(
					"مجموع إيداعات اليوم على المجموعة ({0}) يتجاوز السقف الأعلى لبطاقات «أعمال» ({1})."
				).format(
					_format_limit_display(state["total_deposited"]),
					_format_limit_display(state["business_limit"]),
				),
				frappe.ValidationError,
			)
	else:
		if round(state["legacy_deposited"] * 100) > round(resolved_limit * 100):
			frappe.throw(
				_(
					"لا يمكن خفض الحد اليومي للحساب إلى ({0}) لأن مجموع إيداعات اليوم المحفوظة على بطاقات هذا الحساب يبلغ ({1})."
				).format(
					_format_limit_display(resolved_limit),
					_format_limit_display(state["legacy_deposited"]),
				),
				frappe.ValidationError,
			)


def sync_type_group_daily_limit(
	norm_account: str,
	base_card_name: str,
	bank: str,
	card_type: str | None,
	new_limit: float,
	exclude_card: str | None = None,
	triggered_by_card: str | None = None,
	now_ts: Any = None,
) -> list[str]:
	"""
	Synchronizes `daily_limit` across all non-deleted copies of the same 4-element copy group
	(base_card_name + account_number_normalized + bank + card_type) ONLY.
	Updating 'أعمال' never overwrites 'مدى' limit, and updating 'مدى' never overwrites 'أعمال' limit.
	"""
	clean_norm = normalize_account_number(norm_account)
	clean_base = clean_base_card_name(base_card_name)
	clean_bank = cstr(bank or "").strip()
	clean_type = clean_card_type(card_type)

	if not clean_norm or not clean_base or not clean_bank:
		return []

	resolved_limit = flt(new_limit, 2)
	if resolved_limit <= 0:
		frappe.throw(_("الحد اليومي مطلوب ويجب أن يكون أكبر من صفر."), frappe.ValidationError)
	if clean_type:
		validate_daily_limit_for_card_type(resolved_limit, clean_type)

	state = get_type_group_shared_daily_limit_state(
		norm_account=clean_norm,
		base_card_name=clean_base,
		bank=clean_bank,
		card_type=clean_type,
		lock=True,
	)
	validate_type_group_daily_limit_against_today_deposits(
		norm_account=clean_norm,
		base_card_name=clean_base,
		bank=clean_bank,
		card_type=clean_type,
		new_limit=resolved_limit,
	)

	event_ts = now_ts or now_datetime()
	updated_cards: list[str] = []
	for row in state["cards"]:
		card_id = cstr(row.get("name"))
		if exclude_card and card_id == exclude_card:
			continue
		old_member_limit = flt(row.get("daily_limit"), 2) if flt(row.get("daily_limit")) > 0 else None
		if old_member_limit is not None and round(old_member_limit * 100) == round(resolved_limit * 100):
			continue

		member_doc = frappe.get_doc(CARD_DOCTYPE, card_id)
		member_doc.daily_limit = resolved_limit
		set_card_search_text(member_doc)
		member_doc.flags._allow_card_service_mutation = True
		member_doc.save(ignore_permissions=True)
		updated_cards.append(member_doc.name)

		log_card_event(
			card_name=member_doc.name,
			event_type="daily_limit_changed",
			event_title=_("تحديث الحد اليومي الموحد لنسخ المجموعة"),
			details={
				"old_daily_limit": old_member_limit,
				"new_daily_limit": resolved_limit,
				"card_type": clean_type,
				"account_number_normalized": clean_norm,
				"triggered_by_card": triggered_by_card or "",
			},
			event_source="system",
			event_datetime=event_ts,
		)

	return updated_cards


def sync_account_daily_limit(
	norm_account: str,
	new_limit: float,
	exclude_card: str | None = None,
	triggered_by_card: str | None = None,
	now_ts: Any = None,
	base_card_name: str | None = None,
	bank: str | None = None,
	card_type: str | None = None,
) -> list[str]:
	if base_card_name and bank:
		return sync_type_group_daily_limit(
			norm_account=norm_account,
			base_card_name=base_card_name,
			bank=bank,
			card_type=card_type,
			new_limit=new_limit,
			exclude_card=exclude_card,
			triggered_by_card=triggered_by_card,
			now_ts=now_ts,
		)
	# Fallback if called without triplet: resolve from triggered_by_card or exclude_card
	ref_card = triggered_by_card or exclude_card
	if ref_card:
		ref_row = frappe.db.get_value(
			CARD_DOCTYPE,
			ref_card,
			["base_card_name", "bank", "card_type"],
			as_dict=True,
		)
		if ref_row:
			return sync_type_group_daily_limit(
				norm_account=norm_account,
				base_card_name=ref_row.base_card_name,
				bank=ref_row.bank,
				card_type=ref_row.card_type,
				new_limit=new_limit,
				exclude_card=exclude_card,
				triggered_by_card=triggered_by_card,
				now_ts=now_ts,
			)
	return []


def _next_available_copy_no(family_name: str, exclude_card: str | None = None) -> int:
	params: dict[str, Any] = {"family": family_name}
	exclude_sql = ""
	if exclude_card:
		exclude_sql = "AND name != %(exclude_card)s"
		params["exclude_card"] = exclude_card

	rows = frappe.db.sql(
		f"""
		SELECT copy_no
		FROM `tabArchive Card`
		WHERE card_family = %(family)s
		  AND IFNULL(is_deleted, 0) = 0
		  {exclude_sql}
		""",
		params,
		as_dict=True,
	)
	used = {cint(r.copy_no) for r in rows if cint(r.copy_no) > 0}
	candidate = 1
	while candidate in used:
		candidate += 1
	return candidate


def inspect_account_family(
	account_number: str,
	base_card_name: str | None = None,
	bank: str | None = None,
	card_type: str | None = None,
	exclude_card: str | None = None,
) -> dict[str, Any]:
	clean_display = clean_account_number_display(account_number)
	norm = normalize_account_number(account_number)
	clean_base = clean_base_card_name(base_card_name)
	clean_bank = cstr(bank or "").strip()
	clean_type = clean_card_type(card_type)

	limit_state = get_type_group_shared_daily_limit_state(
		norm_account=norm,
		base_card_name=clean_base,
		bank=clean_bank,
		card_type=clean_type,
		exclude_card=exclude_card,
		lock=False,
	)
	limit_fields = {
		"account_exists": bool(limit_state["exists"]),
		"shared_daily_limit": limit_state["daily_limit"],
		"has_limit_conflict": bool(limit_state["has_conflict"]),
		"conflict_limits": limit_state["distinct_limits"],
	}
	if not norm or not clean_base or not clean_bank:
		return {
			"account_number": clean_display,
			"account_number_normalized": norm,
			"card_type": clean_type,
			"family_exists": False,
			"family_name": None,
			"base_card_name": clean_base,
			"bank": clean_bank,
			"bank_name": "",
			"highest_copy_no": 0,
			"expected_copy_no": 1,
			"expected_copy_label": format_copy_badge_label(clean_type, 1),
			"expected_card_name": "",
			"active_count": 0,
			"deleted_count": 0,
			"requires_duplicate_confirmation": False,
			"existing_cards": [],
			**limit_fields,
		}

	family_rows = frappe.db.sql(
		"""
		SELECT
			f.name,
			f.account_number,
			f.account_number_normalized,
			f.base_card_name,
			f.bank,
			IFNULL(f.card_type, '') AS card_type,
			b.bank_name,
			f.highest_copy_no
		FROM `tabArchive Card Family` f
		LEFT JOIN `tabArchive Bank` b ON b.name = f.bank
		WHERE f.account_number_normalized = %(norm)s
		  AND f.bank = %(bank)s
		  AND LOWER(TRIM(f.base_card_name)) = LOWER(%(base_name)s)
		  AND IFNULL(f.card_type, '') = %(card_type)s
		LIMIT 1
		""",
		{
			"norm": norm,
			"bank": clean_bank,
			"base_name": clean_base,
			"card_type": clean_type,
		},
		as_dict=True,
	)

	if not family_rows:
		return {
			"account_number": clean_display,
			"account_number_normalized": norm,
			"card_type": clean_type,
			"family_exists": False,
			"family_name": None,
			"base_card_name": clean_base,
			"bank": clean_bank,
			"bank_name": "",
			"highest_copy_no": 0,
			"expected_copy_no": 1,
			"expected_copy_label": format_copy_badge_label(clean_type, 1),
			"expected_card_name": "",
			"active_count": 0,
			"deleted_count": 0,
			"requires_duplicate_confirmation": False,
			"existing_cards": [],
			**limit_fields,
		}

	family_row = family_rows[0]

	cards_rows = frappe.db.sql(
		"""
		SELECT
			c.name,
			c.serial_no,
			c.copy_no,
			c.card_name,
			c.base_card_name,
			IFNULL(c.card_type, '') AS card_type,
			c.card_number,
			c.bank,
			b.bank_name,
			c.representative,
			rep.representative_name,
			c.region,
			reg.region_name,
			c.card_owner,
			acc.account_name AS card_owner_name,
			c.daily_limit,
			c.received_date,
			c.status,
			c.is_deleted
		FROM `tabArchive Card` c
		LEFT JOIN `tabArchive Bank` b ON b.name = c.bank
		LEFT JOIN `tabArchive Representative` rep ON rep.name = c.representative
		LEFT JOIN `tabArchive Region` reg ON reg.name = c.region
		LEFT JOIN `tabArchive Account` acc ON acc.name = c.card_owner
		WHERE c.card_family = %(family)s
		ORDER BY c.copy_no ASC, c.serial_no ASC
		""",
		{"family": family_row.name},
		as_dict=True,
	)

	active_cards: list[dict[str, Any]] = []
	deleted_count = 0
	for row in cards_rows:
		if exclude_card and row.name == exclude_card:
			continue
		if cint(row.is_deleted):
			deleted_count += 1
		else:
			row_ctype = clean_card_type(row.card_type or clean_type)
			active_cards.append(
				{
					"name": row.name,
					"serial_no": cint(row.serial_no),
					"copy_no": cint(row.copy_no),
					"copy_label": format_copy_badge_label(row_ctype, row.copy_no),
					"card_type": row_ctype,
					"card_name": row.card_name,
					"base_card_name": row.base_card_name,
					"card_number": row.card_number,
					"bank": row.bank,
					"bank_name": row.bank_name or row.bank,
					"representative": row.representative,
					"representative_name": row.representative_name or row.representative,
					"region": row.region,
					"region_name": row.region_name or row.region,
					"card_owner": row.card_owner,
					"card_owner_name": row.card_owner_name or row.card_owner,
					"daily_limit": flt(row.daily_limit, 2),
					"received_date": cstr(row.received_date or ""),
					"status": row.status,
				}
			)

	highest_copy_no = cint(family_row.highest_copy_no)
	used_copies = {cint(c["copy_no"]) for c in active_cards if cint(c["copy_no"]) > 0}
	if exclude_card:
		expected_copy_no = len(active_cards) + 1
	else:
		expected_copy_no = 1
		while expected_copy_no in used_copies:
			expected_copy_no += 1
	base_name = cstr(family_row.base_card_name or "").strip()
	expected_card_name = derive_card_display_name(base_name, expected_copy_no)
	has_active = len(active_cards) > 0
	resolved_ctype = clean_card_type(family_row.card_type or clean_type)

	return {
		"account_number": family_row.account_number,
		"account_number_normalized": family_row.account_number_normalized,
		"card_type": resolved_ctype,
		"family_exists": has_active,
		"family_name": family_row.name,
		"base_card_name": base_name,
		"bank": cstr(family_row.bank or clean_bank).strip(),
		"bank_name": cstr(family_row.bank_name or family_row.bank or clean_bank).strip(),
		"highest_copy_no": highest_copy_no,
		"expected_copy_no": expected_copy_no,
		"expected_copy_label": format_copy_badge_label(resolved_ctype, expected_copy_no),
		"expected_card_name": expected_card_name,
		"active_count": len(active_cards),
		"deleted_count": deleted_count,
		"requires_duplicate_confirmation": has_active,
		"existing_cards": active_cards,
		**limit_fields,
	}


def acquire_or_create_family_for_new_card(
	account_number: str,
	raw_base_card_name: str,
	bank: str,
	card_type: str,
	allow_duplicate_account: bool = False,
) -> tuple[Any, int, str, bool]:
	clean_acc = clean_account_number_display(account_number)
	norm_acc = normalize_account_number(account_number)
	if not clean_acc or not norm_acc:
		frappe.throw(_("رقم الحساب مطلوب."), frappe.ValidationError)

	clean_base = clean_base_card_name(raw_base_card_name)
	if not clean_base:
		frappe.throw(_("اسم البطاقة الأساسي مطلوب."), frappe.ValidationError)

	clean_bank = cstr(bank or "").strip()
	if not clean_bank:
		frappe.throw(_("البنك مطلوب."), frappe.ValidationError)

	clean_type = validate_card_type(card_type, required=True)

	locked_rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabArchive Card Family`
		WHERE account_number_normalized = %(norm)s
		  AND bank = %(bank)s
		  AND LOWER(TRIM(base_card_name)) = LOWER(%(base_name)s)
		  AND IFNULL(card_type, '') = %(card_type)s
		FOR UPDATE
		""",
		{
			"norm": norm_acc,
			"bank": clean_bank,
			"base_name": clean_base,
			"card_type": clean_type,
		},
		as_dict=True,
	)

	if locked_rows:
		info = inspect_account_family(
			clean_acc,
			base_card_name=clean_base,
			bank=clean_bank,
			card_type=clean_type,
		)
		if info.get("active_count", 0) > 0 and not allow_duplicate_account:
			copy_lbl = format_copy_badge_label(clean_type, info.get("expected_copy_no") or 2)
			frappe.throw(
				_(
					"مجموعة البطاقات ({0} / {1} / {2} / {3}) مسجلة مسبقاً. يجب تأكيد إنشاء نسخة جديدة ({4})."
				).format(
					info.get("base_card_name") or clean_base,
					clean_acc,
					info.get("bank_name") or clean_bank,
					clean_type,
					copy_lbl,
				),
				frappe.DuplicateEntryError,
			)

		family_doc = frappe.get_doc(FAMILY_DOCTYPE, locked_rows[0].name)
		next_copy = _next_available_copy_no(family_doc.name)
		if next_copy > cint(family_doc.highest_copy_no):
			family_doc.highest_copy_no = next_copy
			family_doc.flags._allow_card_family_mutation = True
			family_doc.save(ignore_permissions=True)

		derived_name = derive_card_display_name(family_doc.base_card_name, next_copy)
		return family_doc, next_copy, derived_name, bool(info.get("active_count", 0) > 0)

	try:
		family_doc = frappe.new_doc(FAMILY_DOCTYPE)
		family_doc.account_number = clean_acc
		family_doc.account_number_normalized = norm_acc
		family_doc.base_card_name = clean_base
		family_doc.bank = clean_bank
		family_doc.card_type = clean_type
		family_doc.highest_copy_no = 1
		family_doc.flags._allow_card_family_mutation = True
		family_doc.insert(ignore_permissions=True)
		return family_doc, 1, derive_card_display_name(clean_base, 1), False
	except frappe.DuplicateEntryError:
		return acquire_or_create_family_for_new_card(
			account_number=account_number,
			raw_base_card_name=raw_base_card_name,
			bank=bank,
			card_type=clean_type,
			allow_duplicate_account=allow_duplicate_account,
		)


@frappe.whitelist()
def build_account_change_plan(
	card: str,
	new_account_number: str | None = None,
	new_base_card_name: str | None = None,
	new_bank: str | None = None,
	new_card_type: str | None = None,
) -> dict[str, Any]:
	require_card_permission("edit_card", _("ليست لديك صلاحية لتعديل بيانات البطاقة."))

	card_row = frappe.db.get_value(
		CARD_DOCTYPE,
		card,
		[
			"name",
			"serial_no",
			"card_family",
			"copy_no",
			"card_name",
			"base_card_name",
			"card_type",
			"account_number",
			"account_number_normalized",
			"bank",
			"is_deleted",
		],
		as_dict=True,
	)
	if not card_row or cint(card_row.is_deleted):
		frappe.throw(_("البطاقة المطلوبة غير موجودة."), frappe.DoesNotExistError)

	raw_acc_input = new_account_number if new_account_number is not None else card_row.account_number
	clean_new_acc = clean_account_number_display(raw_acc_input)
	norm_new_acc = normalize_account_number(raw_acc_input)
	if not clean_new_acc or not norm_new_acc:
		frappe.throw(_("رقم الحساب الجديد مطلوب."), frappe.ValidationError)

	source_family = frappe.get_doc(FAMILY_DOCTYPE, card_row.card_family)
	source_bank = cstr(getattr(source_family, "bank", None) or card_row.bank or "").strip()
	source_type = clean_card_type(getattr(card_row, "card_type", None) or getattr(source_family, "card_type", None))
	proposed_base = clean_base_card_name(new_base_card_name) or source_family.base_card_name
	proposed_bank = cstr(new_bank or "").strip() or source_bank
	proposed_type = (
		clean_card_type(new_card_type)
		if new_card_type is not None and clean_card_type(new_card_type)
		else source_type
	)

	source_cards = frappe.get_all(
		CARD_DOCTYPE,
		filters={"card_family": source_family.name},
		fields=["name", "copy_no", "card_name", "is_deleted"],
		order_by="copy_no asc",
	)
	active_source_cards = [c for c in source_cards if not cint(c.is_deleted)]
	deleted_source_cards = [c for c in source_cards if cint(c.is_deleted)]

	same_quad = (
		norm_new_acc == source_family.account_number_normalized
		and proposed_base.casefold() == cstr(source_family.base_card_name or "").strip().casefold()
		and proposed_bank == source_bank
		and proposed_type == source_type
	)

	if same_quad:
		if clean_new_acc == source_family.account_number:
			return {
				"no_change": True,
				"card": card_row.name,
				"current_account_number": source_family.account_number,
				"new_account_number": clean_new_acc,
				"card_type": proposed_type,
				"case": "NO_CHANGE",
				"allowed_modes": [],
			}
		return {
			"no_change": False,
			"card": card_row.name,
			"current_account_number": source_family.account_number,
			"current_card_name": card_row.card_name,
			"current_copy_no": cint(card_row.copy_no),
			"current_copy_label": format_copy_badge_label(source_type, card_row.copy_no),
			"new_account_number": clean_new_acc,
			"new_account_number_normalized": norm_new_acc,
			"new_bank": proposed_bank,
			"new_card_type": proposed_type,
			"case": "SAME_NORMALIZED",
			"allowed_modes": ["sync_family_raw_account"],
			"recommended_mode": "sync_family_raw_account",
			"expected_copy_no": cint(card_row.copy_no),
			"expected_copy_label": format_copy_badge_label(proposed_type, card_row.copy_no),
			"expected_base_card_name": source_family.base_card_name,
			"expected_card_name": card_row.card_name,
			"source_active_count": len(active_source_cards),
			"source_deleted_count": len(deleted_source_cards),
		}

	target_info = inspect_account_family(
		clean_new_acc,
		base_card_name=proposed_base,
		bank=proposed_bank,
		card_type=proposed_type,
		exclude_card=card_row.name,
	)

	if target_info["family_exists"]:
		return {
			"no_change": False,
			"card": card_row.name,
			"current_account_number": source_family.account_number,
			"current_card_name": card_row.card_name,
			"current_copy_no": cint(card_row.copy_no),
			"current_copy_label": format_copy_badge_label(source_type, card_row.copy_no),
			"new_account_number": target_info["account_number"],
			"new_account_number_normalized": norm_new_acc,
			"new_bank": proposed_bank,
			"new_card_type": proposed_type,
			"case": "TARGET_FAMILY_EXISTS",
			"allowed_modes": ["move_card_to_target_family"],
			"recommended_mode": "move_card_to_target_family",
			"target_family": target_info,
			"expected_copy_no": target_info["expected_copy_no"],
			"expected_copy_label": format_copy_badge_label(proposed_type, target_info["expected_copy_no"]),
			"expected_base_card_name": target_info["base_card_name"],
			"expected_card_name": target_info["expected_card_name"],
			"source_active_count": len(active_source_cards),
			"source_deleted_count": len(deleted_source_cards),
		}

	return {
		"no_change": False,
		"card": card_row.name,
		"current_account_number": source_family.account_number,
		"current_card_name": card_row.card_name,
		"current_copy_no": cint(card_row.copy_no),
		"current_copy_label": format_copy_badge_label(source_type, card_row.copy_no),
		"new_account_number": clean_new_acc,
		"new_account_number_normalized": norm_new_acc,
		"new_bank": proposed_bank,
		"new_card_type": proposed_type,
		"case": "NEW_TARGET_FAMILY",
		"allowed_modes": ["move_card_to_new_family"],
		"recommended_mode": "move_card_to_new_family",
		"expected_copy_no": 1,
		"expected_copy_label": format_copy_badge_label(proposed_type, 1),
		"expected_base_card_name": proposed_base,
		"expected_card_name": derive_card_display_name(proposed_base, 1),
		"source_active_count": len(active_source_cards),
		"source_deleted_count": len(deleted_source_cards),
	}


def _lock_family_by_name(family_name: str) -> Any | None:
	if not family_name:
		return None
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabArchive Card Family`
		WHERE name = %(name)s
		FOR UPDATE
		""",
		{"name": family_name},
		as_dict=True,
	)
	return frappe.get_doc(FAMILY_DOCTYPE, rows[0].name) if rows else None


def _lock_family_by_quad(norm_acc: str, base_name: str, bank: str, card_type: str = "") -> Any | None:
	if not norm_acc or not base_name or not bank:
		return None
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabArchive Card Family`
		WHERE account_number_normalized = %(norm)s
		  AND bank = %(bank)s
		  AND LOWER(TRIM(base_card_name)) = LOWER(%(base_name)s)
		  AND IFNULL(card_type, '') = %(card_type)s
		FOR UPDATE
		""",
		{
			"norm": norm_acc,
			"bank": bank,
			"base_name": base_name,
			"card_type": clean_card_type(card_type),
		},
		as_dict=True,
	)
	return frappe.get_doc(FAMILY_DOCTYPE, rows[0].name) if rows else None


def _resequence_family_active_cards(
	family_doc: Any,
	exclude_card: str | None = None,
) -> list[dict[str, Any]]:
	"""
	Resequences all active (non-deleted) cards in `family_doc` from 1..N without gaps or duplicates,
	preserving their relative order (copy_no ASC, serial_no ASC, name ASC), and updates `card_name`
	and `search_text` only when a card's `copy_no` or `card_name` changes.
	Never alters internal document IDs (`name`), images, transfer logs, or existing event logs.
	"""
	from archive.api.cards import set_card_search_text

	excl_clause = "AND name != %(exclude_card)s" if exclude_card else ""
	params: dict[str, Any] = {"family": family_doc.name}
	if exclude_card:
		params["exclude_card"] = exclude_card

	active_rows = frappe.db.sql(
		f"""
		SELECT name, copy_no, card_name, serial_no
		FROM `tabArchive Card`
		WHERE card_family = %(family)s
		  AND IFNULL(is_deleted, 0) = 0
		  {excl_clause}
		ORDER BY copy_no ASC, serial_no ASC, name ASC
		FOR UPDATE
		""",
		params,
		as_dict=True,
	)

	resequenced: list[dict[str, Any]] = []
	base_name = cstr(family_doc.base_card_name or "").strip()

	for idx, row in enumerate(active_rows, start=1):
		old_copy = cint(row.copy_no)
		old_name = cstr(row.card_name or "")
		desired_copy = idx
		desired_name = derive_card_display_name(base_name, desired_copy)
		if old_copy != desired_copy or old_name != desired_name:
			member_doc = frappe.get_doc(CARD_DOCTYPE, row.name)
			member_doc.copy_no = desired_copy
			member_doc.card_name = desired_name
			set_card_search_text(member_doc)
			member_doc.flags._allow_card_service_mutation = True
			member_doc.save(ignore_permissions=True)
			resequenced.append(
				{
					"card": member_doc.name,
					"old_copy_no": old_copy,
					"new_copy_no": desired_copy,
					"old_card_name": old_name,
					"new_card_name": desired_name,
				}
			)

	desired_highest = max(len(active_rows), 1)
	if not exclude_card and cint(family_doc.highest_copy_no) != desired_highest:
		family_doc.highest_copy_no = desired_highest
		family_doc.flags._allow_card_family_mutation = True
		family_doc.save(ignore_permissions=True)

	return resequenced


def _validate_group_transition_deposit_safety(
	card_doc: Any,
	old_family_doc: Any,
	old_bank: str,
	old_type: str,
	norm_new_acc: str,
	proposed_base: str,
	proposed_bank: str,
	proposed_type: str,
	effective_post_move_limit: float,
) -> None:
	"""
	Protects both today's deposits and historical deposits when a card changes its 4-element group:
	1. If the 3-element deposit group (base_card_name + account_number_normalized + bank) changes:
	   - Reject if the card has any positive deposit today or on any historical date.
	2. If the card stays in the same 3-element deposit group and `card_type` changes:
	   - If the card already had an assigned type (`old_type` in ('مدى', 'أعمال')) and has positive
	     historical deposits (deposit_date != today()), reject to prevent reclassifying historical
	     deposits across types.
	   - If the card was a legacy unclassified card (`old_type == ''`) and has positive historical
	     deposits, allow classifying it only if its historical deposits and the 3-element group's
	     historical deposits on those dates satisfy the new type's limit and ceiling.
	   - For today's deposits, ensure both the card's own today deposit and the source/target
	     3-element group ceilings remain valid after the transition.
	"""
	old_norm = cstr(old_family_doc.account_number_normalized or "").strip()
	old_base = cstr(old_family_doc.base_card_name or card_doc.base_card_name or "").strip()
	same_triplet = (
		norm_new_acc == old_norm
		and proposed_base.casefold() == old_base.casefold()
		and proposed_bank == old_bank
	)

	today_str = cstr(today())
	dep_rows = frappe.db.sql(
		"""
		SELECT deposit_date, COALESCE(SUM(deposit_amount), 0) AS amt
		FROM `tabArchive Card Deposit`
		WHERE card = %(card)s AND deposit_amount > 0
		GROUP BY deposit_date
		ORDER BY deposit_date ASC
		""",
		{"card": card_doc.name},
		as_dict=True,
	)

	today_dep_amt = 0.0
	historical_deps: list[dict[str, Any]] = []
	for drow in dep_rows:
		amt = flt(drow.get("amt"), 2)
		if amt <= 0:
			continue
		dt_str = cstr(drow.get("deposit_date") or "")
		if dt_str == today_str:
			today_dep_amt = flt(today_dep_amt + amt, 2)
		else:
			historical_deps.append({"deposit_date": dt_str, "amount": amt})

	if not same_triplet:
		if today_dep_amt > 0:
			frappe.throw(
				_(
					"لا يمكن نقل البطاقة إلى مجموعة إيداع أخرى (اسم بطاقة / رقم حساب / بنك مختلف) لوجود إيداع مسجل عليها اليوم بقيمة ({0})."
				).format(_format_limit_display(today_dep_amt)),
				frappe.ValidationError,
			)
		if historical_deps:
			frappe.throw(
				_(
					"لا يمكن تغيير مجموعة الإيداع للبطاقة (اسم البطاقة / رقم الحساب / البنك) لوجود إيداعات تاريخية سابقة مرتبطة بها، حفاظاً على سلامة السجلات المالية والتقارير التاريخية."
				),
				frappe.ValidationError,
			)
		return

	# Same 3-element deposit group, `card_type` is changing
	if proposed_type != old_type:
		if today_dep_amt > 0 and effective_post_move_limit > 0:
			if round(today_dep_amt * 100) > round(effective_post_move_limit * 100):
				frappe.throw(
					_(
						"لا يمكن تحويل نوع البطاقة إلى «{0}» بحد ({1}) لأن عليها إيداعاً مسجلاً اليوم بقيمة ({2})."
					).format(
						proposed_type or _("غير محدد"),
						_format_limit_display(effective_post_move_limit),
						_format_limit_display(today_dep_amt),
					),
					frappe.ValidationError,
				)

		if historical_deps:
			if old_type:
				frappe.throw(
					_(
						"لا يمكن تغيير نوع البطاقة من «{0}» إلى «{1}» لوجود إيداعات تاريخية سابقة مسجلة عليها، مما يؤدي إلى إعادة تصنيف الإيداعات التاريخية ضمن نوع مختلف."
					).format(old_type, proposed_type or _("غير محدد")),
					frappe.ValidationError,
				)
			else:
				# Legacy unclassified card (`old_type == ""`) being classified for the first time
				for hrow in historical_deps:
					h_date = hrow["deposit_date"]
					h_amt = flt(hrow["amount"], 2)
					if effective_post_move_limit > 0 and round(h_amt * 100) > round(effective_post_move_limit * 100):
						frappe.throw(
							_(
								"لا يمكن تصنيف البطاقة القديمة إلى «{0}» بحد يومي ({1}) لوجود إيداع تاريخي بتاريخ ({2}) بقيمة ({3}) يتجاوز هذا الحد."
							).format(
								proposed_type,
								_format_limit_display(effective_post_move_limit),
								h_date,
								_format_limit_display(h_amt),
							),
							frappe.ValidationError,
						)
					hist_state = get_deposit_group_state_for_date(
						norm_account=norm_new_acc,
						base_card_name=proposed_base,
						bank=proposed_bank,
						target_date=h_date,
						lock=False,
						override_type_limits={proposed_type: effective_post_move_limit} if proposed_type else None,
						extra_cards=[
							{
								"name": card_doc.name,
								"card_type": proposed_type,
								"daily_limit": effective_post_move_limit,
								"is_deleted": 0,
							}
						],
					)
					if (
						proposed_type == CARD_TYPE_MADA
						and effective_post_move_limit > 0
						and round(hist_state["mada_deposited"] * 100) > round(effective_post_move_limit * 100)
					):
						frappe.throw(
							_(
								"لا يمكن تصنيف البطاقة القديمة إلى «مدى» بحد ({0}) لأن مجموع إيداعات «مدى» بتاريخ ({1}) سيبلغ ({2})."
							).format(
								_format_limit_display(effective_post_move_limit),
								h_date,
								_format_limit_display(hist_state["mada_deposited"]),
							),
							frappe.ValidationError,
						)
					if (
						proposed_type == CARD_TYPE_BUSINESS
						and effective_post_move_limit > 0
						and round(hist_state["total_deposited"] * 100) > round(effective_post_move_limit * 100)
					):
						frappe.throw(
							_(
								"لا يمكن تصنيف البطاقة القديمة إلى «أعمال» بحد ({0}) لأن إجمالي إيداعات المجموعة بتاريخ ({1}) يبلغ ({2})."
							).format(
								_format_limit_display(effective_post_move_limit),
								h_date,
								_format_limit_display(hist_state["total_deposited"]),
							),
							frappe.ValidationError,
						)

		if old_type == CARD_TYPE_BUSINESS and proposed_type == CARD_TYPE_MADA and effective_post_move_limit > 0:
			post_move_today = get_deposit_group_state_for_date(
				norm_account=norm_new_acc,
				base_card_name=proposed_base,
				bank=proposed_bank,
				target_date=today_str,
				lock=False,
				override_type_limits={CARD_TYPE_MADA: effective_post_move_limit},
				extra_cards=[
					{
						"name": card_doc.name,
						"card_type": CARD_TYPE_MADA,
						"daily_limit": effective_post_move_limit,
						"is_deleted": 0,
					}
				],
			)
			if not post_move_today["has_business"] and round(post_move_today["total_deposited"] * 100) > round(effective_post_move_limit * 100):
				frappe.throw(
					_(
						"لا يمكن تحويل آخر بطاقة «أعمال» في المجموعة إلى «مدى» بحد ({0}) لأن إجمالي إيداعات المجموعة المسجلة اليوم يبلغ ({1})."
					).format(
						_format_limit_display(effective_post_move_limit),
						_format_limit_display(post_move_today["total_deposited"]),
					),
					frappe.ValidationError,
				)


@frappe.whitelist()
def change_card_account_number(
	card: str,
	new_account_number: str | None = None,
	transition_mode: str = "auto",
	new_base_card_name: str | None = None,
	new_bank: str | None = None,
	new_card_type: str | None = None,
	remarks: str | None = None,
) -> dict[str, Any]:
	return _execute_change_card_account_number(
		card=card,
		new_account_number=new_account_number,
		transition_mode=transition_mode,
		new_base_card_name=new_base_card_name,
		new_bank=new_bank,
		new_card_type=new_card_type,
		remarks=remarks,
		override_target_limit=None,
	)


def _execute_change_card_account_number(
	card: str,
	new_account_number: str | None = None,
	transition_mode: str = "auto",
	new_base_card_name: str | None = None,
	new_bank: str | None = None,
	new_card_type: str | None = None,
	remarks: str | None = None,
	override_target_limit: float | None = None,
) -> dict[str, Any]:
	require_card_permission("edit_card", _("ليست لديك صلاحية لتعديل رقم حساب البطاقة."))

	card_doc = frappe.get_doc(CARD_DOCTYPE, card)
	if cint(card_doc.is_deleted):
		frappe.throw(_("لا يمكن تعديل بطاقة محذوفة."), frappe.ValidationError)

	raw_acc_input = new_account_number if new_account_number is not None else card_doc.account_number
	clean_new_acc = clean_account_number_display(raw_acc_input)
	norm_new_acc = normalize_account_number(raw_acc_input)
	if not clean_new_acc or not norm_new_acc:
		frappe.throw(_("رقم الحساب الجديد مطلوب."), frappe.ValidationError)

	old_family_doc = frappe.get_doc(FAMILY_DOCTYPE, card_doc.card_family)
	old_norm = old_family_doc.account_number_normalized
	old_bank = cstr(getattr(old_family_doc, "bank", None) or card_doc.bank or "").strip()
	old_type = clean_card_type(getattr(card_doc, "card_type", None) or getattr(old_family_doc, "card_type", None))
	explicit_base = clean_base_card_name(new_base_card_name)
	proposed_base = explicit_base if explicit_base else old_family_doc.base_card_name
	proposed_bank = cstr(new_bank or "").strip() or old_bank
	if new_card_type is not None and clean_card_type(new_card_type):
		proposed_type = validate_card_type(new_card_type, required=True)
	else:
		proposed_type = old_type

	now_ts = now_datetime()

	same_quad = (
		norm_new_acc == old_norm
		and proposed_base.casefold() == cstr(old_family_doc.base_card_name or "").strip().casefold()
		and proposed_bank == old_bank
		and proposed_type == old_type
	)

	if same_quad:
		if clean_new_acc == old_family_doc.account_number:
			return {
				"changed": False,
				"card": card_doc.name,
				"card_family": card_doc.card_family,
				"account_number": card_doc.account_number,
				"bank": card_doc.bank,
				"card_type": proposed_type,
				"copy_no": cint(card_doc.copy_no),
				"card_name": card_doc.card_name,
			}

		source_family = _lock_family_by_name(old_family_doc.name) or old_family_doc
		old_raw_acc = source_family.account_number

		source_family.account_number = clean_new_acc
		source_family.flags._allow_card_family_mutation = True
		source_family.save(ignore_permissions=True)

		active_rows = frappe.db.sql(
			"""
			SELECT name
			FROM `tabArchive Card`
			WHERE card_family = %(family)s AND IFNULL(is_deleted, 0) = 0
			ORDER BY copy_no ASC
			FOR UPDATE
			""",
			{"family": source_family.name},
			as_dict=True,
		)

		affected_names: list[str] = []
		for row in active_rows:
			member_doc = (
				card_doc if row.name == card_doc.name else frappe.get_doc(CARD_DOCTYPE, row.name)
			)
			member_doc.account_number = clean_new_acc
			set_card_search_text(member_doc)
			member_doc.flags._allow_card_service_mutation = True
			member_doc.save(ignore_permissions=True)
			affected_names.append(member_doc.name)

			is_primary = member_doc.name == card_doc.name
			log_card_event(
				card_name=member_doc.name,
				event_type="account_family_changed",
				event_title=(
					_("تحديث صياغة رقم الحساب للعائلة")
					if is_primary
					else _("تحديث صياغة رقم الحساب تبعاً لعائلة البطاقات")
				),
				remarks=remarks if is_primary else None,
				details={
					"old_card_family": source_family.name,
					"new_card_family": source_family.name,
					"old_account_number": old_raw_acc,
					"new_account_number": clean_new_acc,
					"account_number_normalized": old_norm,
					"transition_mode": "sync_family_raw_account",
					"copy_no": cint(member_doc.copy_no),
					"card_type": proposed_type,
					"card_name": member_doc.card_name,
					"base_card_name": source_family.base_card_name,
				},
				event_source="user" if is_primary else "system",
				event_datetime=now_ts,
			)

		return {
			"changed": True,
			"transition_mode": "sync_family_raw_account",
			"card": card_doc.name,
			"card_family": source_family.name,
			"account_number": clean_new_acc,
			"base_card_name": source_family.base_card_name,
			"bank": card_doc.bank,
			"card_type": proposed_type,
			"copy_no": cint(card_doc.copy_no),
			"card_name": card_doc.card_name,
			"affected_cards": affected_names,
		}

	# 4-element group changed -> move card to target 4-element family
	source_family = _lock_family_by_name(old_family_doc.name) or old_family_doc
	target_family = _lock_family_by_quad(norm_new_acc, proposed_base, proposed_bank, proposed_type)

	target_limit_state = get_type_group_shared_daily_limit_state(
		norm_account=norm_new_acc,
		base_card_name=proposed_base,
		bank=proposed_bank,
		card_type=proposed_type,
		exclude_card=card_doc.name,
		lock=True,
	)
	adopted_target_limit: float | None = None
	if target_limit_state["exists"]:
		if target_limit_state["has_conflict"]:
			conflicts_str = " / ".join(
				_format_limit_display(v) for v in target_limit_state["distinct_limits"]
			)
			frappe.throw(
				_(
					"يوجد تعارض مسبق في الحد اليومي بين بطاقات المجموعة المستهدفة ({0}): [{1}]. يرجى توحيد الحد اليومي للمجموعة أولاً."
				).format(clean_new_acc, conflicts_str),
				frappe.ValidationError,
			)
		elif target_limit_state["daily_limit"] is not None:
			adopted_target_limit = flt(target_limit_state["daily_limit"], 2)

	effective_post_move_limit = (
		adopted_target_limit
		if adopted_target_limit is not None
		else flt(override_target_limit if override_target_limit is not None else card_doc.daily_limit, 2)
	)
	if proposed_type:
		validate_daily_limit_for_card_type(effective_post_move_limit, proposed_type)

	_validate_group_transition_deposit_safety(
		card_doc=card_doc,
		old_family_doc=old_family_doc,
		old_bank=old_bank,
		old_type=old_type,
		norm_new_acc=norm_new_acc,
		proposed_base=proposed_base,
		proposed_bank=proposed_bank,
		proposed_type=proposed_type,
		effective_post_move_limit=effective_post_move_limit,
	)

	if effective_post_move_limit > 0:
		validate_type_group_daily_limit_against_today_deposits(
			norm_account=norm_new_acc,
			base_card_name=proposed_base,
			bank=proposed_bank,
			card_type=proposed_type,
			new_limit=effective_post_move_limit,
			extra_card_to_include=card_doc.name,
		)

	old_snapshot = {
		"old_card_family": source_family.name,
		"old_account_number": source_family.account_number,
		"old_base_card_name": source_family.base_card_name,
		"old_bank": card_doc.bank,
		"old_card_type": old_type,
		"old_copy_no": cint(card_doc.copy_no),
		"old_card_name": card_doc.card_name,
	}

	if target_family is not None:
		# Ensure existing active cards in target_family are contiguous 1..K before appending
		_resequence_family_active_cards(target_family, exclude_card=card_doc.name)
		target_active_count = cint(
			frappe.db.sql(
				"""
				SELECT COUNT(*)
				FROM `tabArchive Card`
				WHERE card_family = %(family)s
				  AND IFNULL(is_deleted, 0) = 0
				  AND name != %(card)s
				""",
				{"family": target_family.name, "card": card_doc.name},
			)[0][0]
		)
		allowed_target_modes = (
			("auto", "move_card_to_target_family", "move_card_to_new_family", "move_this_card_only")
			if target_active_count == 0
			else ("auto", "move_card_to_target_family")
		)
		if transition_mode not in allowed_target_modes:
			frappe.throw(
				_("الوضع المطلوب لنقل رقم الحساب غير مدعوم."),
				frappe.ValidationError,
			)

		next_copy = target_active_count + 1
		if next_copy > cint(target_family.highest_copy_no) or target_active_count == 0:
			target_family.highest_copy_no = next_copy
			target_family.flags._allow_card_family_mutation = True
			target_family.save(ignore_permissions=True)

		derived_name = derive_card_display_name(target_family.base_card_name, next_copy)
		resolved_target_bank = cstr(getattr(target_family, "bank", None) or proposed_bank).strip()
		resolved_target_type = clean_card_type(getattr(target_family, "card_type", None) or proposed_type)

		card_doc.card_family = target_family.name
		card_doc.copy_no = next_copy
		card_doc.base_card_name = target_family.base_card_name
		card_doc.card_name = derived_name
		card_doc.account_number = target_family.account_number
		card_doc.account_number_normalized = target_family.account_number_normalized
		card_doc.bank = resolved_target_bank
		card_doc.card_type = resolved_target_type
		card_doc.daily_limit = effective_post_move_limit
		set_card_search_text(card_doc)
		card_doc.flags._allow_card_service_mutation = True
		card_doc.save(ignore_permissions=True)

		# Resequence remaining active cards in source_family from 1..M without gaps
		source_resequenced = _resequence_family_active_cards(source_family)

		log_card_event(
			card_name=card_doc.name,
			event_type="account_family_changed",
			event_title=_("تغيير مجموعة البطاقة والانضمام لمجموعة موجودة"),
			remarks=remarks,
			details={
				**old_snapshot,
				"transition_mode": "move_card_to_target_family",
				"new_card_family": target_family.name,
				"new_account_number": target_family.account_number,
				"new_base_card_name": target_family.base_card_name,
				"new_bank": resolved_target_bank,
				"new_card_type": resolved_target_type,
				"new_copy_no": next_copy,
				"new_card_name": derived_name,
			},
			event_source="user",
			event_datetime=now_ts,
		)

		affected_card_ids = [card_doc.name] + [r["card"] for r in source_resequenced]
		return {
			"changed": True,
			"transition_mode": "move_card_to_target_family",
			"card": card_doc.name,
			"card_family": target_family.name,
			"account_number": target_family.account_number,
			"base_card_name": target_family.base_card_name,
			"bank": resolved_target_bank,
			"card_type": resolved_target_type,
			"copy_no": next_copy,
			"card_name": derived_name,
			"affected_cards": affected_card_ids,
			"source_resequenced": source_resequenced,
		}

	if transition_mode not in ("auto", "move_card_to_new_family", "move_this_card_only"):
		frappe.throw(
			_("الوضع المطلوب لنقل رقم الحساب غير مدعوم."),
			frappe.ValidationError,
		)

	new_family = frappe.new_doc(FAMILY_DOCTYPE)
	new_family.account_number = clean_new_acc
	new_family.account_number_normalized = norm_new_acc
	new_family.base_card_name = proposed_base
	new_family.bank = proposed_bank
	new_family.card_type = proposed_type
	new_family.highest_copy_no = 1
	new_family.flags._allow_card_family_mutation = True
	new_family.insert(ignore_permissions=True)

	derived_name = derive_card_display_name(proposed_base, 1)
	card_doc.card_family = new_family.name
	card_doc.copy_no = 1
	card_doc.base_card_name = proposed_base
	card_doc.card_name = derived_name
	card_doc.account_number = clean_new_acc
	card_doc.account_number_normalized = norm_new_acc
	card_doc.bank = proposed_bank
	card_doc.card_type = proposed_type
	card_doc.daily_limit = effective_post_move_limit
	set_card_search_text(card_doc)
	card_doc.flags._allow_card_service_mutation = True
	card_doc.save(ignore_permissions=True)

	# Resequence remaining active cards in source_family from 1..M without gaps
	source_resequenced = _resequence_family_active_cards(source_family)

	log_card_event(
		card_name=card_doc.name,
		event_type="account_family_changed",
		event_title=_("نقل البطاقة إلى مجموعة جديدة"),
		remarks=remarks,
		details={
			**old_snapshot,
			"transition_mode": "move_card_to_new_family",
			"new_card_family": new_family.name,
			"new_account_number": clean_new_acc,
			"new_base_card_name": proposed_base,
			"new_bank": proposed_bank,
			"new_card_type": proposed_type,
			"new_copy_no": 1,
			"new_card_name": derived_name,
		},
		event_source="user",
		event_datetime=now_ts,
	)

	affected_card_ids = [card_doc.name] + [r["card"] for r in source_resequenced]
	return {
		"changed": True,
		"transition_mode": "move_card_to_new_family",
		"card": card_doc.name,
		"card_family": new_family.name,
		"account_number": clean_new_acc,
		"base_card_name": proposed_base,
		"bank": proposed_bank,
		"card_type": proposed_type,
		"copy_no": 1,
		"card_name": derived_name,
		"affected_cards": affected_card_ids,
		"source_resequenced": source_resequenced,
	}


@frappe.whitelist()
def rename_card_family_base_name(
	card: str,
	new_base_card_name: str,
	remarks: str | None = None,
) -> dict[str, Any]:
	require_card_permission("edit_card", _("ليست لديك صلاحية لتعديل اسم البطاقة."))

	card_doc = frappe.get_doc(CARD_DOCTYPE, card)
	if cint(card_doc.is_deleted):
		frappe.throw(_("لا يمكن تعديل بطاقة محذوفة."), frappe.ValidationError)

	clean_base = clean_base_card_name(new_base_card_name)
	if not clean_base:
		frappe.throw(_("الاسم الأساسي للبطاقة مطلوب."), frappe.ValidationError)

	frappe.db.sql(
		"""
		SELECT name
		FROM `tabArchive Card Family`
		WHERE name = %(family)s
		FOR UPDATE
		""",
		{"family": card_doc.card_family},
	)
	family_doc = frappe.get_doc(FAMILY_DOCTYPE, card_doc.card_family)
	old_base_name = family_doc.base_card_name

	if clean_base == old_base_name:
		return {
			"changed": False,
			"card_family": family_doc.name,
			"base_card_name": old_base_name,
			"card_name": card_doc.card_name,
			"affected_cards": [],
		}

	family_doc.base_card_name = clean_base
	family_doc.flags._allow_card_family_mutation = True
	family_doc.save(ignore_permissions=True)

	active_members = frappe.db.sql(
		"""
		SELECT name, copy_no, card_name
		FROM `tabArchive Card`
		WHERE card_family = %(family)s AND IFNULL(is_deleted, 0) = 0
		ORDER BY copy_no ASC
		FOR UPDATE
		""",
		{"family": family_doc.name},
		as_dict=True,
	)

	now_ts = now_datetime()
	affected_cards: list[dict[str, Any]] = []
	updated_primary_name = card_doc.card_name

	for row in active_members:
		member_doc = (
			card_doc if row.name == card_doc.name else frappe.get_doc(CARD_DOCTYPE, row.name)
		)
		old_card_name = member_doc.card_name
		new_card_name = derive_card_display_name(clean_base, cint(member_doc.copy_no))

		member_doc.base_card_name = clean_base
		member_doc.card_name = new_card_name
		set_card_search_text(member_doc)
		member_doc.flags._allow_card_service_mutation = True
		member_doc.save(ignore_permissions=True)

		if member_doc.name == card_doc.name:
			updated_primary_name = new_card_name

		is_primary = member_doc.name == card_doc.name
		log_card_event(
			card_name=member_doc.name,
			event_type="family_base_name_changed",
			event_title=(
				_("تعديل الاسم الأساسي لعائلة البطاقات")
				if is_primary
				else _("تحديث اسم البطاقة تبعاً لتعديل الاسم الأساسي للعائلة")
			),
			remarks=remarks if is_primary else None,
			details={
				"card_family": family_doc.name,
				"account_number": family_doc.account_number,
				"old_base_card_name": old_base_name,
				"new_base_card_name": clean_base,
				"copy_no": cint(member_doc.copy_no),
				"old_card_name": old_card_name,
				"new_card_name": new_card_name,
				"triggered_by_card": card_doc.name,
			},
			event_source="user" if is_primary else "system",
			event_datetime=now_ts,
		)

		affected_cards.append(
			{
				"name": member_doc.name,
				"copy_no": cint(member_doc.copy_no),
				"old_card_name": old_card_name,
				"new_card_name": new_card_name,
			}
		)

	return {
		"changed": True,
		"card_family": family_doc.name,
		"old_base_card_name": old_base_name,
		"base_card_name": clean_base,
		"card_name": updated_primary_name,
		"affected_cards": affected_cards,
	}
