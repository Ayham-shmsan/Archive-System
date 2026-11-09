from __future__ import annotations

import re
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt

from archive.api.operation_search import normalize_search_text

_DIGIT_TRANSLATION = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_ACCOUNT_SEP_PATTERN = re.compile(r"[\s\-_\u200b-\u200f\u202a-\u202e]+")

CARD_TYPE_MADA = "مدى"
CARD_TYPE_BUSINESS = "أعمال"
VALID_CARD_TYPES = (CARD_TYPE_MADA, CARD_TYPE_BUSINESS)

BUSINESS_MIN_DAILY_LIMIT = 100_000.0
BUSINESS_MAX_DAILY_LIMIT = 1_000_000.0
MADA_MAX_DAILY_LIMIT = 100_000.0


def clean_card_type(value: str | None) -> str:
	return re.sub(r"\s+", " ", cstr(value or "").strip())


def validate_card_type(value: str | None, required: bool = True) -> str:
	clean = clean_card_type(value)
	if not clean:
		if required:
			frappe.throw(
				_("يرجى اختيار نوع البطاقة (مدى أو أعمال)."),
				frappe.ValidationError,
			)
		return ""
	if clean not in VALID_CARD_TYPES:
		frappe.throw(
			_("نوع البطاقة غير صالح. الخيارات المسموحة هي: مدى، أعمال."),
			frappe.ValidationError,
		)
	return clean


def validate_daily_limit_for_card_type(daily_limit: Any, card_type: str | None) -> float:
	val = flt(daily_limit, 2)
	if val <= 0:
		frappe.throw(
			_("الحد اليومي مطلوب ويجب أن يكون أكبر من صفر."),
			frappe.ValidationError,
		)
	clean_type = clean_card_type(card_type)
	cents = round(val * 100)
	if clean_type == CARD_TYPE_BUSINESS:
		min_cents = round(BUSINESS_MIN_DAILY_LIMIT * 100)
		max_cents = round(BUSINESS_MAX_DAILY_LIMIT * 100)
		if cents < min_cents or cents > max_cents:
			frappe.throw(
				_("الحد اليومي لبطاقات «أعمال» يجب أن يكون بين 100,000 و 1,000,000 شاملاً الحدين."),
				frappe.ValidationError,
			)
	elif clean_type == CARD_TYPE_MADA:
		max_cents = round(MADA_MAX_DAILY_LIMIT * 100)
		if cents <= 0 or cents > max_cents:
			frappe.throw(
				_("الحد اليومي لبطاقات «مدى» يجب أن يكون أكبر من صفر ولا يتجاوز 100,000."),
				frappe.ValidationError,
			)
	return val


def format_copy_badge_label(card_type: str | None, copy_no: Any) -> str:
	num = max(1, cint(copy_no or 1))
	clean_type = clean_card_type(card_type)
	if clean_type in VALID_CARD_TYPES:
		return f"{clean_type} {num}"
	return f"نسخة {num}"


def make_deposit_group_key(
	base_card_name: str | None,
	account_number_normalized: str | None,
	bank: str | None,
) -> str:
	norm_base = clean_base_card_name(base_card_name).lower()
	norm_acc = normalize_account_number(account_number_normalized)
	norm_bank = cstr(bank or "").strip()
	if not norm_base or not norm_acc or not norm_bank:
		return ""
	return f"{norm_base}||{norm_acc}||{norm_bank}"


def make_copy_group_key(
	base_card_name: str | None,
	account_number_normalized: str | None,
	bank: str | None,
	card_type: str | None,
) -> str:
	dep_key = make_deposit_group_key(base_card_name, account_number_normalized, bank)
	if not dep_key:
		return ""
	clean_type = clean_card_type(card_type)
	return f"{dep_key}||{clean_type}"


def normalize_digits(value: str | None) -> str:
	return cstr(value or "").translate(_DIGIT_TRANSLATION)


def normalize_account_number(value: str | None) -> str:
	raw = normalize_digits(value).strip()
	if not raw:
		return ""
	cleaned = _ACCOUNT_SEP_PATTERN.sub("", raw)
	return cleaned.upper()


def clean_account_number_display(value: str | None) -> str:
	raw = normalize_digits(value).strip()
	return re.sub(r"\s+", " ", raw)


def clean_card_number(value: str | None) -> str:
	raw = normalize_digits(value).strip()
	return re.sub(r"\s+", " ", raw)


def clean_base_card_name(raw_name: str | None) -> str:
	return re.sub(r"\s+", " ", cstr(raw_name or "").strip())


def derive_card_display_name(base_card_name: str, copy_no: int) -> str:
	base = re.sub(r"\s+", " ", cstr(base_card_name or "").strip())
	num = cint(copy_no)
	if num <= 1:
		return base
	return f"{base} {num}"


def format_daily_limit(value: Any) -> str:
	num = flt(value)
	if num <= 0:
		return ""
	return f"{flt(num, 2):,.2f}"


def _get_link_label(doctype: str, name: str | None, fieldname: str) -> str:
	if not name:
		return ""
	return cstr(frappe.db.get_value(doctype, name, fieldname) or "")


def set_card_search_text(doc: Any) -> str:
	if cint(getattr(doc, "is_deleted", 0)):
		doc.search_text = ""
		return ""

	bank_name = _get_link_label("Archive Bank", doc.bank, "bank_name")
	rep_name = _get_link_label("Archive Representative", doc.representative, "representative_name")
	region_name = _get_link_label("Archive Region", doc.region, "region_name")
	owner_name = _get_link_label("Archive Account", doc.card_owner, "account_name")

	limit_val = flt(doc.daily_limit)
	limit_tokens = ""
	if limit_val > 0:
		limit_tokens = f"{flt(limit_val, 2):.2f} {format_daily_limit(limit_val)} {int(limit_val) if limit_val.is_integer() else ''}"

	parts = [
		cstr(doc.serial_no or ""),
		cstr(doc.name or ""),
		cstr(doc.card_name or ""),
		cstr(doc.base_card_name or ""),
		cstr(getattr(doc, "card_type", "") or ""),
		format_copy_badge_label(getattr(doc, "card_type", ""), getattr(doc, "copy_no", 1)),
		cstr(doc.account_number or ""),
		cstr(doc.account_number_normalized or ""),
		cstr(doc.card_number or ""),
		re.sub(r"[\s\-]+", "", cstr(doc.card_number or "")),
		cstr(doc.bank or ""),
		bank_name,
		cstr(doc.representative or ""),
		rep_name,
		cstr(doc.region or ""),
		region_name,
		cstr(doc.card_owner or ""),
		owner_name,
		limit_tokens,
		cstr(doc.received_date or ""),
		cstr(doc.status or ""),
	]

	raw_combined = " ".join(p for p in parts if p)
	doc.search_text = normalize_search_text(raw_combined)
	return doc.search_text
