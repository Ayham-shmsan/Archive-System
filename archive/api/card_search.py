from __future__ import annotations

import re
from typing import Any

import frappe
from frappe.utils import cint, cstr, flt

from archive.api.operation_search import normalize_search_text

_DIGIT_TRANSLATION = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_ACCOUNT_SEP_PATTERN = re.compile(r"[\s\-_\u200b-\u200f\u202a-\u202e]+")


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
