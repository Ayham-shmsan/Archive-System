from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, now_datetime

from archive.api.card_search import (
	clean_account_number_display,
	clean_base_card_name,
	derive_card_display_name,
	normalize_account_number,
	set_card_search_text,
)
from archive.services.card_audit import log_card_event
from archive.services.card_permissions import CARD_DOCTYPE, require_card_permission

FAMILY_DOCTYPE = "Archive Card Family"


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
	exclude_card: str | None = None,
) -> dict[str, Any]:
	clean_display = clean_account_number_display(account_number)
	norm = normalize_account_number(account_number)
	clean_base = clean_base_card_name(base_card_name)
	clean_bank = cstr(bank or "").strip()
	if not norm or not clean_base or not clean_bank:
		return {
			"account_number": clean_display,
			"account_number_normalized": norm,
			"family_exists": False,
			"family_name": None,
			"base_card_name": clean_base,
			"bank": clean_bank,
			"bank_name": "",
			"highest_copy_no": 0,
			"expected_copy_no": 1,
			"expected_card_name": "",
			"active_count": 0,
			"deleted_count": 0,
			"requires_duplicate_confirmation": False,
			"existing_cards": [],
		}

	family_rows = frappe.db.sql(
		"""
		SELECT
			f.name,
			f.account_number,
			f.account_number_normalized,
			f.base_card_name,
			f.bank,
			b.bank_name,
			f.highest_copy_no
		FROM `tabArchive Card Family` f
		LEFT JOIN `tabArchive Bank` b ON b.name = f.bank
		WHERE f.account_number_normalized = %(norm)s
		  AND f.bank = %(bank)s
		  AND LOWER(f.base_card_name) = LOWER(%(base_name)s)
		LIMIT 1
		""",
		{"norm": norm, "bank": clean_bank, "base_name": clean_base},
		as_dict=True,
	)

	if not family_rows:
		return {
			"account_number": clean_display,
			"account_number_normalized": norm,
			"family_exists": False,
			"family_name": None,
			"base_card_name": clean_base,
			"bank": clean_bank,
			"bank_name": "",
			"highest_copy_no": 0,
			"expected_copy_no": 1,
			"expected_card_name": "",
			"active_count": 0,
			"deleted_count": 0,
			"requires_duplicate_confirmation": False,
			"existing_cards": [],
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
			c.card_number,
			c.bank,
			b.bank_name,
			c.representative,
			rep.representative_name,
			c.region,
			reg.region_name,
			c.card_owner,
			acc.account_name AS card_owner_name,
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
			active_cards.append(
				{
					"name": row.name,
					"serial_no": cint(row.serial_no),
					"copy_no": cint(row.copy_no),
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
					"received_date": cstr(row.received_date or ""),
					"status": row.status,
				}
			)

	highest_copy_no = cint(family_row.highest_copy_no)
	used_copies = {cint(c["copy_no"]) for c in active_cards if cint(c["copy_no"]) > 0}
	expected_copy_no = 1
	while expected_copy_no in used_copies:
		expected_copy_no += 1
	base_name = cstr(family_row.base_card_name or "").strip()
	expected_card_name = derive_card_display_name(base_name, expected_copy_no)
	has_active = len(active_cards) > 0

	return {
		"account_number": family_row.account_number,
		"account_number_normalized": family_row.account_number_normalized,
		"family_exists": has_active,
		"family_name": family_row.name,
		"base_card_name": base_name,
		"bank": cstr(family_row.bank or clean_bank).strip(),
		"bank_name": cstr(family_row.bank_name or family_row.bank or clean_bank).strip(),
		"highest_copy_no": highest_copy_no,
		"expected_copy_no": expected_copy_no,
		"expected_card_name": expected_card_name,
		"active_count": len(active_cards),
		"deleted_count": deleted_count,
		"requires_duplicate_confirmation": has_active,
		"existing_cards": active_cards,
	}


def acquire_or_create_family_for_new_card(
	account_number: str,
	raw_base_card_name: str,
	bank: str,
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

	locked_rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabArchive Card Family`
		WHERE account_number_normalized = %(norm)s
		  AND bank = %(bank)s
		  AND LOWER(base_card_name) = LOWER(%(base_name)s)
		FOR UPDATE
		""",
		{"norm": norm_acc, "bank": clean_bank, "base_name": clean_base},
		as_dict=True,
	)

	if locked_rows:
		info = inspect_account_family(
			clean_acc, base_card_name=clean_base, bank=clean_bank
		)
		if info.get("active_count", 0) > 0 and not allow_duplicate_account:
			frappe.throw(
				_(
					"عائلة البطاقات ({0} / {1} / {2}) مسجلة مسبقاً. يجب تأكيد إنشاء نسخة جديدة برقم النسخة ({3})."
				).format(
					info.get("base_card_name") or clean_base,
					clean_acc,
					info.get("bank_name") or clean_bank,
					info.get("expected_copy_no") or 2,
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
		family_doc.highest_copy_no = 1
		family_doc.flags._allow_card_family_mutation = True
		family_doc.insert(ignore_permissions=True)
		return family_doc, 1, derive_card_display_name(clean_base, 1), False
	except frappe.DuplicateEntryError:
		return acquire_or_create_family_for_new_card(
			account_number=account_number,
			raw_base_card_name=raw_base_card_name,
			bank=bank,
			allow_duplicate_account=allow_duplicate_account,
		)


@frappe.whitelist()
def build_account_change_plan(
	card: str,
	new_account_number: str | None = None,
	new_base_card_name: str | None = None,
	new_bank: str | None = None,
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
	proposed_base = clean_base_card_name(new_base_card_name) or source_family.base_card_name
	proposed_bank = cstr(new_bank or "").strip() or source_bank

	source_cards = frappe.get_all(
		CARD_DOCTYPE,
		filters={"card_family": source_family.name},
		fields=["name", "copy_no", "card_name", "is_deleted"],
		order_by="copy_no asc",
	)
	active_source_cards = [c for c in source_cards if not cint(c.is_deleted)]
	deleted_source_cards = [c for c in source_cards if cint(c.is_deleted)]

	same_triplet = (
		norm_new_acc == source_family.account_number_normalized
		and proposed_base.casefold() == cstr(source_family.base_card_name or "").strip().casefold()
		and proposed_bank == source_bank
	)

	if same_triplet:
		if clean_new_acc == source_family.account_number:
			return {
				"no_change": True,
				"card": card_row.name,
				"current_account_number": source_family.account_number,
				"new_account_number": clean_new_acc,
				"case": "NO_CHANGE",
				"allowed_modes": [],
			}
		return {
			"no_change": False,
			"card": card_row.name,
			"current_account_number": source_family.account_number,
			"current_card_name": card_row.card_name,
			"current_copy_no": cint(card_row.copy_no),
			"new_account_number": clean_new_acc,
			"new_account_number_normalized": norm_new_acc,
			"new_bank": proposed_bank,
			"case": "SAME_NORMALIZED",
			"allowed_modes": ["sync_family_raw_account"],
			"recommended_mode": "sync_family_raw_account",
			"expected_copy_no": cint(card_row.copy_no),
			"expected_base_card_name": source_family.base_card_name,
			"expected_card_name": card_row.card_name,
			"source_active_count": len(active_source_cards),
			"source_deleted_count": len(deleted_source_cards),
		}

	target_info = inspect_account_family(
		clean_new_acc,
		base_card_name=proposed_base,
		bank=proposed_bank,
		exclude_card=card_row.name,
	)

	if target_info["family_exists"]:
		return {
			"no_change": False,
			"card": card_row.name,
			"current_account_number": source_family.account_number,
			"current_card_name": card_row.card_name,
			"current_copy_no": cint(card_row.copy_no),
			"new_account_number": target_info["account_number"],
			"new_account_number_normalized": norm_new_acc,
			"new_bank": proposed_bank,
			"case": "TARGET_FAMILY_EXISTS",
			"allowed_modes": ["move_card_to_target_family"],
			"recommended_mode": "move_card_to_target_family",
			"target_family": target_info,
			"expected_copy_no": target_info["expected_copy_no"],
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
		"new_account_number": clean_new_acc,
		"new_account_number_normalized": norm_new_acc,
		"new_bank": proposed_bank,
		"case": "NEW_TARGET_FAMILY",
		"allowed_modes": ["move_card_to_new_family"],
		"recommended_mode": "move_card_to_new_family",
		"expected_copy_no": 1,
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


def _lock_family_by_triplet(norm_acc: str, base_name: str, bank: str) -> Any | None:
	if not norm_acc or not base_name or not bank:
		return None
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabArchive Card Family`
		WHERE account_number_normalized = %(norm)s
		  AND bank = %(bank)s
		  AND LOWER(base_card_name) = LOWER(%(base_name)s)
		FOR UPDATE
		""",
		{"norm": norm_acc, "bank": bank, "base_name": base_name},
		as_dict=True,
	)
	return frappe.get_doc(FAMILY_DOCTYPE, rows[0].name) if rows else None


@frappe.whitelist()
def change_card_account_number(
	card: str,
	new_account_number: str | None = None,
	transition_mode: str = "auto",
	new_base_card_name: str | None = None,
	new_bank: str | None = None,
	remarks: str | None = None,
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
	explicit_base = clean_base_card_name(new_base_card_name)
	proposed_base = explicit_base if explicit_base else old_family_doc.base_card_name
	proposed_bank = cstr(new_bank or "").strip() or old_bank
	now_ts = now_datetime()

	same_triplet = (
		norm_new_acc == old_norm
		and proposed_base.casefold() == cstr(old_family_doc.base_card_name or "").strip().casefold()
		and proposed_bank == old_bank
	)

	# SAME_NORMALIZED: raw display changed, triplet identity unchanged
	if same_triplet:
		if clean_new_acc == old_family_doc.account_number:
			return {
				"changed": False,
				"card": card_doc.name,
				"card_family": card_doc.card_family,
				"account_number": card_doc.account_number,
				"bank": card_doc.bank,
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
			"copy_no": cint(card_doc.copy_no),
			"card_name": card_doc.card_name,
			"affected_cards": affected_names,
		}

	# Triplet changed -> ALWAYS a Card Move
	source_family = _lock_family_by_name(old_family_doc.name) or old_family_doc
	target_family = _lock_family_by_triplet(norm_new_acc, proposed_base, proposed_bank)

	old_snapshot = {
		"old_card_family": source_family.name,
		"old_account_number": source_family.account_number,
		"old_base_card_name": source_family.base_card_name,
		"old_bank": card_doc.bank,
		"old_copy_no": cint(card_doc.copy_no),
		"old_card_name": card_doc.card_name,
	}

	# Target Family exists -> join Target Family with highest_copy_no + 1
	if target_family is not None:
		if transition_mode not in ("auto", "move_card_to_target_family"):
			frappe.throw(
				_("الوضع المطلوب لنقل رقم الحساب غير مدعوم."),
				frappe.ValidationError,
			)

		next_copy = _next_available_copy_no(target_family.name, exclude_card=card_doc.name)
		if next_copy > cint(target_family.highest_copy_no):
			target_family.highest_copy_no = next_copy
			target_family.flags._allow_card_family_mutation = True
			target_family.save(ignore_permissions=True)

		derived_name = derive_card_display_name(target_family.base_card_name, next_copy)
		resolved_target_bank = cstr(getattr(target_family, "bank", None) or proposed_bank).strip()

		card_doc.card_family = target_family.name
		card_doc.copy_no = next_copy
		card_doc.base_card_name = target_family.base_card_name
		card_doc.card_name = derived_name
		card_doc.account_number = target_family.account_number
		card_doc.account_number_normalized = target_family.account_number_normalized
		card_doc.bank = resolved_target_bank
		set_card_search_text(card_doc)
		card_doc.flags._allow_card_service_mutation = True
		card_doc.save(ignore_permissions=True)

		log_card_event(
			card_name=card_doc.name,
			event_type="account_family_changed",
			event_title=_("تغيير رقم الحساب والانضمام لعائلة موجودة"),
			remarks=remarks,
			details={
				**old_snapshot,
				"transition_mode": "move_card_to_target_family",
				"new_card_family": target_family.name,
				"new_account_number": target_family.account_number,
				"new_base_card_name": target_family.base_card_name,
				"new_bank": resolved_target_bank,
				"new_copy_no": next_copy,
				"new_card_name": derived_name,
			},
			event_source="user",
			event_datetime=now_ts,
		)

		return {
			"changed": True,
			"transition_mode": "move_card_to_target_family",
			"card": card_doc.name,
			"card_family": target_family.name,
			"account_number": target_family.account_number,
			"base_card_name": target_family.base_card_name,
			"bank": resolved_target_bank,
			"copy_no": next_copy,
			"card_name": derived_name,
			"affected_cards": [card_doc.name],
		}

	# Target Family does not exist -> create new Target Family (copy_no = 1) and move card
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
	set_card_search_text(card_doc)
	card_doc.flags._allow_card_service_mutation = True
	card_doc.save(ignore_permissions=True)

	log_card_event(
		card_name=card_doc.name,
		event_type="account_family_changed",
		event_title=_("نقل البطاقة إلى عائلة حساب جديدة"),
		remarks=remarks,
		details={
			**old_snapshot,
			"transition_mode": "move_card_to_new_family",
			"new_card_family": new_family.name,
			"new_account_number": clean_new_acc,
			"new_base_card_name": proposed_base,
			"new_bank": proposed_bank,
			"new_copy_no": 1,
			"new_card_name": derived_name,
		},
		event_source="user",
		event_datetime=now_ts,
	)

	return {
		"changed": True,
		"transition_mode": "move_card_to_new_family",
		"card": card_doc.name,
		"card_family": new_family.name,
		"account_number": clean_new_acc,
		"base_card_name": proposed_base,
		"bank": proposed_bank,
		"copy_no": 1,
		"card_name": derived_name,
		"affected_cards": [card_doc.name],
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
