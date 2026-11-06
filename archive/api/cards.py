from __future__ import annotations

import json
import re
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, now_datetime

from archive.api.card_family import (
	FAMILY_DOCTYPE,
	_execute_change_card_account_number,
	acquire_or_create_family_for_new_card,
	change_card_account_number,
	get_account_shared_daily_limit_state,
	inspect_account_family,
	rename_card_family_base_name,
	sync_account_daily_limit,
	validate_account_daily_limit_against_today_deposits,
)
from archive.api.card_search import (
	clean_account_number_display,
	clean_base_card_name,
	clean_card_number,
	format_daily_limit,
	normalize_account_number,
	set_card_search_text,
)
from archive.api.operation_search import normalize_search_text
from archive.services.card_audit import (
	log_card_event,
	record_card_status_event,
	record_card_transfer_entry,
)
from archive.services.card_images import (
	adopt_card_image,
	cleanup_staged_card_files,
	get_card_image_endpoint,
	resolve_and_validate_card_image_file,
	schedule_unreferenced_card_file_cleanup,
	stage_uploaded_card_image,
	stream_card_image,
)
from archive.services.card_permissions import (
	CARD_DOCTYPE,
	get_card_permissions,
	has_card_image_preview_role,
	has_card_permission,
	require_card_image_preview_role,
	require_card_permission,
	require_reactivate_permanently_stopped_card_role,
)
from archive.services.card_security import (
	get_card_pin,
	normalize_and_validate_pin,
	save_card_pin,
)

VALID_STATUSES = ("نشطة", "موقفة مؤقتاً", "موقفة نهائياً")

CARD_STATUS_DISPLAY_LABELS: dict[str, str] = {
	"نشطة": "نشطة",
	"موقفة مؤقتاً": "موقفة مؤقتاً",
	"موقفة نهائياً": "موقفة نهائياً (متلفة)",
}


def get_card_status_display_label(status: str | None) -> str:
	clean = cstr(status or "").strip()
	return CARD_STATUS_DISPLAY_LABELS.get(clean, clean)

SORTABLE_COLUMNS = {
	"serial_no": "c.serial_no",
	"card_name": "c.card_name",
	"account_number": "c.account_number",
	"card_number": "c.card_number",
	"bank": "b.bank_name",
	"representative": "rep.representative_name",
	"region": "reg.region_name",
	"card_owner": "acc.account_name",
	"daily_limit": "c.daily_limit",
	"received_date": "c.received_date",
	"status": "c.status",
	"modified": "c.modified",
}


def _parse_payload(payload: dict[str, Any] | str | None) -> dict[str, Any]:
	if not payload:
		return {}
	if isinstance(payload, str):
		try:
			parsed = json.loads(payload)
			return parsed if isinstance(parsed, dict) else {}
		except Exception:
			frappe.throw(_("بيانات الطلب غير صالحة (JSON)."), frappe.ValidationError)
	if isinstance(payload, dict):
		return dict(payload)
	return {}


def _parse_daily_limit_input(raw_value: Any) -> float:
	if raw_value is None:
		frappe.throw(_("حقل الحد اليومي مطلوب."), frappe.ValidationError)
	text = cstr(raw_value).strip().replace(",", "")
	if text == "":
		frappe.throw(_("حقل الحد اليومي مطلوب."), frappe.ValidationError)
	try:
		num = float(text)
	except ValueError:
		frappe.throw(_("قيمة الحد اليومي غير صالحة."), frappe.ValidationError)
		return 0.0

	if num <= 0:
		frappe.throw(
			_("الحد اليومي يجب أن يكون أكبر من صفر."),
			frappe.ValidationError,
		)
	return round(num, 2)


def _validate_link_exists(doctype: str, name: str | None, label: str) -> str:
	val = cstr(name or "").strip()
	if not val:
		frappe.throw(_("حقل {0} مطلوب.").format(label), frappe.ValidationError)
	if not frappe.db.exists(doctype, val):
		frappe.throw(_("قيمة {0} ({1}) غير موجودة.").format(label, val), frappe.ValidationError)
	return val


def _validate_date_input(raw_date: Any, label: str) -> str:
	val = cstr(raw_date or "").strip()
	if not val:
		frappe.throw(_("حقل {0} مطلوب.").format(label), frappe.ValidationError)
	try:
		return cstr(getdate(val))
	except Exception:
		frappe.throw(_("تاريخ {0} غير صالح.").format(label), frappe.ValidationError)
		return ""


def _validate_unique_card_number(card_number: str, exclude_card: str | None = None) -> None:
	clean_num = clean_card_number(card_number)
	norm_num = re.sub(r"[\s\-_]+", "", clean_num).upper()
	if not clean_num or not norm_num:
		return

	params: dict[str, Any] = {
		"card_number": clean_num,
		"norm_num": norm_num,
	}
	exclude_sql = ""
	if exclude_card:
		exclude_sql = "AND name != %(exclude_card)s"
		params["exclude_card"] = exclude_card

	dup_rows = frappe.db.sql(
		f"""
		SELECT name
		FROM `tabArchive Card`
		WHERE 1=1
		  {exclude_sql}
		  AND (
		      card_number = %(card_number)s
		      OR UPPER(REPLACE(REPLACE(REPLACE(card_number, ' ', ''), '-', ''), '_', '')) = %(norm_num)s
		  )
		LIMIT 1
		""",
		params,
		as_dict=True,
	)
	if dup_rows:
		frappe.throw(
			_("رقم البطاقة ({0}) مستخدم مسبقاً في بطاقة أخرى ولا يمكن تكراره.").format(clean_num),
			frappe.ValidationError,
		)


def _normalize_edit_meta_json(raw_meta: Any) -> str | None:
	if raw_meta is None or raw_meta == "":
		return None
	if isinstance(raw_meta, dict):
		return json.dumps(raw_meta, ensure_ascii=False) if raw_meta else None
	if isinstance(raw_meta, str):
		clean_str = raw_meta.strip()
		if not clean_str:
			return None
		try:
			parsed = json.loads(clean_str)
			return json.dumps(parsed, ensure_ascii=False) if isinstance(parsed, dict) and parsed else None
		except Exception:
			return None
	return None


def _parse_edit_meta_dict(raw_meta: Any) -> dict[str, Any] | None:
	if not raw_meta:
		return None
	if isinstance(raw_meta, dict):
		return raw_meta or None
	if isinstance(raw_meta, str):
		try:
			parsed = json.loads(raw_meta)
			return parsed if isinstance(parsed, dict) and parsed else None
		except Exception:
			return None
	return None


def _serialize_card_row(
	row: dict[str, Any],
	can_view_images: bool,
	family_counts: dict[str, int] | None = None,
) -> dict[str, Any]:
	limit_num = flt(row.get("daily_limit"))
	clean_limit = flt(limit_num, 2) if limit_num > 0 else None
	version_token = cstr(row.get("modified") or "1")
	card_name = row["name"]

	is_perm_stopped = cstr(row.get("status") or "").strip() == "موقفة نهائياً"
	front_url = (
		get_card_image_endpoint(card_name, "front", version_token=version_token)
		if can_view_images and row.get("front_image")
		else None
	)
	back_url = (
		get_card_image_endpoint(card_name, "back", version_token=version_token)
		if can_view_images and row.get("back_image")
		else None
	)
	front_orig_url = (
		get_card_image_endpoint(card_name, "front", version_token=version_token, original=True)
		if not is_perm_stopped and (row.get("front_original_image") or row.get("front_image"))
		else None
	)
	back_orig_url = (
		get_card_image_endpoint(card_name, "back", version_token=version_token, original=True)
		if not is_perm_stopped and (row.get("back_original_image") or row.get("back_image"))
		else None
	)

	fam_id = row.get("card_family") or ""
	fam_count = (family_counts or {}).get(fam_id, 1)

	return {
		"name": card_name,
		"serial_no": cint(row.get("serial_no")),
		"card_family": fam_id,
		"copy_no": cint(row.get("copy_no") or 1),
		"card_name": row.get("card_name") or "",
		"base_card_name": row.get("base_card_name") or "",
		"account_number": row.get("account_number") or "",
		"account_number_normalized": row.get("account_number_normalized") or "",
		"card_number": row.get("card_number") or "",
		"bank": row.get("bank") or "",
		"bank_name": row.get("bank_name") or row.get("bank") or "",
		"representative": row.get("representative") or "",
		"representative_name": row.get("representative_name") or row.get("representative") or "",
		"region": row.get("region") or "",
		"region_name": row.get("region_name") or row.get("region") or "",
		"card_owner": row.get("card_owner") or "",
		"card_owner_name": row.get("card_owner_name") or row.get("card_owner") or "",
		"daily_limit": clean_limit,
		"daily_limit_formatted": format_daily_limit(clean_limit) if clean_limit else "",
		"received_date": cstr(row.get("received_date") or ""),
		"status": row.get("status") or "نشطة",
		"status_display": get_card_status_display_label(row.get("status") or "نشطة"),
		"status_reason": row.get("status_reason") or "",
		"status_changed_at": cstr(row.get("status_changed_at") or ""),
		"status_changed_by": row.get("status_changed_by") or "",
		"has_pin": bool(cint(row.get("has_pin"))),
		"has_front_image": bool(row.get("front_image")),
		"has_back_image": bool(row.get("back_image")),
		"front_image_url": front_url,
		"back_image_url": back_url,
		"front_original_image_url": front_orig_url,
		"back_original_image_url": back_orig_url,
		"front_edit_meta": _parse_edit_meta_dict(row.get("front_edit_meta")),
		"back_edit_meta": _parse_edit_meta_dict(row.get("back_edit_meta")),
		"family_cards_count": cint(fam_count or 1),
		"creation": cstr(row.get("creation") or ""),
		"modified": cstr(row.get("modified") or ""),
	}


def _fetch_masters() -> dict[str, list[dict[str, Any]]]:
	banks = frappe.get_all(
		"Archive Bank",
		fields=["name", "bank_name"],
		order_by="bank_name asc",
	)
	representatives = frappe.get_all(
		"Archive Representative",
		fields=["name", "representative_name"],
		order_by="representative_name asc",
	)
	regions = frappe.get_all(
		"Archive Region",
		fields=["name", "region_name"],
		order_by="region_name asc",
	)
	card_owners = frappe.get_all(
		"Archive Account",
		fields=["name", "account_name"],
		order_by="account_name asc",
	)
	return {
		"banks": banks,
		"representatives": representatives,
		"regions": regions,
		"card_owners": card_owners,
	}


@frappe.whitelist()
def get_cards_context(
	page: int | str = 1,
	page_size: int | str = 50,
	search: str = "",
	status: str = "",
	bank: str = "",
	representative: str = "",
	region: str = "",
	card_owner: str = "",
	received_date_from: str = "",
	received_date_to: str = "",
	sort_by: str = "serial_no",
	sort_order: str = "desc",
) -> dict[str, Any]:
	require_card_permission("view_cards", _("ليست لديك صلاحية لعرض شاشة البطاقات."))
	perms = get_card_permissions()
	can_view_images = bool(perms.get("can_view_images"))

	base_conditions = ["IFNULL(c.is_deleted, 0) = 0"]
	params: dict[str, Any] = {}

	if bank:
		base_conditions.append("c.bank = %(bank)s")
		params["bank"] = bank.strip()

	if representative:
		base_conditions.append("c.representative = %(representative)s")
		params["representative"] = representative.strip()

	if region:
		base_conditions.append("c.region = %(region)s")
		params["region"] = region.strip()

	if card_owner:
		base_conditions.append("c.card_owner = %(card_owner)s")
		params["card_owner"] = card_owner.strip()

	if received_date_from:
		base_conditions.append("c.received_date >= %(received_date_from)s")
		params["received_date_from"] = cstr(getdate(received_date_from))

	if received_date_to:
		base_conditions.append("c.received_date <= %(received_date_to)s")
		params["received_date_to"] = cstr(getdate(received_date_to))

	norm_search = normalize_search_text(search or "")
	if norm_search:
		tokens = [tok for tok in norm_search.split(" ") if tok]
		for idx, tok in enumerate(tokens):
			key = f"search_tok_{idx}"
			base_conditions.append(f"c.search_text LIKE %({key})s")
			params[key] = f"%{tok}%"

	base_where_sql = " AND ".join(base_conditions)

	# Compute status stats across the current non-status filters
	stat_rows = frappe.db.sql(
		f"""
		SELECT c.status, COUNT(*) AS cnt
		FROM `tabArchive Card` c
		WHERE {base_where_sql}
		GROUP BY c.status
		""",
		params,
		as_dict=True,
	)
	counts_by_status = {r.status: cint(r.cnt) for r in stat_rows}
	active_cnt = counts_by_status.get("نشطة", 0)
	paused_cnt = counts_by_status.get("موقفة مؤقتاً", 0)
	stopped_cnt = counts_by_status.get("موقفة نهائياً", 0)
	total_cnt = active_cnt + paused_cnt + stopped_cnt

	list_conditions = list(base_conditions)
	list_params = dict(params)
	if status and status in VALID_STATUSES:
		list_conditions.append("c.status = %(status)s")
		list_params["status"] = status

	list_where_sql = " AND ".join(list_conditions)

	total_filtered_rows = frappe.db.sql(
		f"SELECT COUNT(*) AS cnt FROM `tabArchive Card` c WHERE {list_where_sql}",
		list_params,
		as_dict=True,
	)
	total_count = cint(total_filtered_rows[0].cnt if total_filtered_rows else 0)

	is_all_pages = cstr(page_size).strip().lower() == "all"
	if is_all_pages:
		resolved_page_size: int | str = "all"
		total_pages = 1
		resolved_page = 1
		limit_clause = ""
	else:
		num_page_size = max(1, min(cint(page_size or 50), 1000))
		resolved_page_size = num_page_size
		total_pages = max(1, (total_count + num_page_size - 1) // num_page_size)
		resolved_page = max(1, min(cint(page or 1), total_pages))
		offset = (resolved_page - 1) * num_page_size
		limit_clause = f"LIMIT {num_page_size} OFFSET {offset}"

	order_col = SORTABLE_COLUMNS.get(sort_by or "serial_no", "c.serial_no")
	order_dir = "ASC" if (sort_order or "").strip().lower() == "asc" else "DESC"

	raw_rows = frappe.db.sql(
		f"""
		SELECT
			c.name,
			c.serial_no,
			c.card_family,
			c.copy_no,
			c.card_name,
			c.base_card_name,
			c.account_number,
			c.account_number_normalized,
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
			c.status_reason,
			c.status_changed_at,
			c.status_changed_by,
			c.has_pin,
			c.front_image,
			c.back_image,
			c.front_original_image,
			c.back_original_image,
			c.front_edit_meta,
			c.back_edit_meta,
			c.creation,
			c.modified
		FROM `tabArchive Card` c
		LEFT JOIN `tabArchive Bank` b ON b.name = c.bank
		LEFT JOIN `tabArchive Representative` rep ON rep.name = c.representative
		LEFT JOIN `tabArchive Region` reg ON reg.name = c.region
		LEFT JOIN `tabArchive Account` acc ON acc.name = c.card_owner
		WHERE {list_where_sql}
		ORDER BY {order_col} {order_dir}, c.serial_no DESC
		{limit_clause}
		""",
		list_params,
		as_dict=True,
	)

	family_ids = list({r.card_family for r in raw_rows if r.card_family})
	family_counts: dict[str, int] = {}
	if family_ids:
		fam_rows = frappe.db.sql(
			"""
			SELECT card_family, COUNT(*) AS cnt
			FROM `tabArchive Card`
			WHERE card_family IN %(families)s AND IFNULL(is_deleted, 0) = 0
			GROUP BY card_family
			""",
			{"families": tuple(family_ids)},
			as_dict=True,
		)
		family_counts = {r.card_family: cint(r.cnt) for r in fam_rows}

	rows = [_serialize_card_row(r, can_view_images, family_counts) for r in raw_rows]

	return {
		"permissions": perms,
		"stats": {
			"total": total_cnt,
			"active": active_cnt,
			"paused": paused_cnt,
			"stopped": stopped_cnt,
		},
		"rows": rows,
		"pagination": {
			"page": resolved_page,
			"page_size": resolved_page_size,
			"total_count": total_count,
			"total_pages": total_pages,
		},
		"masters": _fetch_masters(),
	}


def _fetch_single_card_row(card_name: str) -> dict[str, Any]:
	rows = frappe.db.sql(
		"""
		SELECT
			c.name,
			c.serial_no,
			c.card_family,
			c.copy_no,
			c.card_name,
			c.base_card_name,
			c.account_number,
			c.account_number_normalized,
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
			c.status_reason,
			c.status_changed_at,
			c.status_changed_by,
			c.has_pin,
			c.front_image,
			c.back_image,
			c.front_original_image,
			c.back_original_image,
			c.front_edit_meta,
			c.back_edit_meta,
			c.is_deleted,
			c.creation,
			c.modified
		FROM `tabArchive Card` c
		LEFT JOIN `tabArchive Bank` b ON b.name = c.bank
		LEFT JOIN `tabArchive Representative` rep ON rep.name = c.representative
		LEFT JOIN `tabArchive Region` reg ON reg.name = c.region
		LEFT JOIN `tabArchive Account` acc ON acc.name = c.card_owner
		WHERE c.name = %(name)s
		LIMIT 1
		""",
		{"name": card_name},
		as_dict=True,
	)
	if not rows or cint(rows[0].get("is_deleted")):
		frappe.throw(_("البطاقة المطلوبة غير موجودة."), frappe.DoesNotExistError)
	return rows[0]


@frappe.whitelist()
def get_card_preview(card: str) -> dict[str, Any]:
	require_card_permission("view_cards", _("ليست لديك صلاحية لعرض البطاقة."))
	perms = get_card_permissions()
	row = _fetch_single_card_row(card)

	fam_count_rows = frappe.db.sql(
		"""
		SELECT COUNT(*) AS cnt
		FROM `tabArchive Card`
		WHERE card_family = %(fam)s AND IFNULL(is_deleted, 0) = 0
		""",
		{"fam": row.card_family},
		as_dict=True,
	)
	fam_count = cint(fam_count_rows[0].cnt if fam_count_rows else 1)

	return {
		"card": _serialize_card_row(
			row,
			can_view_images=bool(perms.get("can_view_images")),
			family_counts={row.card_family: fam_count},
		),
		"permissions": perms,
	}


@frappe.whitelist()
def get_card_details(card: str) -> dict[str, Any]:
	require_card_permission("view_cards", _("ليست لديك صلاحية لعرض تفاصيل البطاقة."))
	perms = get_card_permissions()
	row = _fetch_single_card_row(card)

	family_doc = frappe.db.get_value(
		FAMILY_DOCTYPE,
		row.card_family,
		["name", "account_number", "account_number_normalized", "base_card_name", "highest_copy_no"],
		as_dict=True,
	)

	sibling_rows = frappe.db.sql(
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
			c.received_date,
			c.status,
			c.is_deleted
		FROM `tabArchive Card` c
		LEFT JOIN `tabArchive Bank` b ON b.name = c.bank
		LEFT JOIN `tabArchive Representative` rep ON rep.name = c.representative
		LEFT JOIN `tabArchive Region` reg ON reg.name = c.region
		WHERE c.card_family = %(family)s
		ORDER BY c.copy_no ASC
		""",
		{"family": row.card_family},
		as_dict=True,
	)

	active_siblings = [
		{
			"name": s.name,
			"serial_no": cint(s.serial_no),
			"copy_no": cint(s.copy_no),
			"card_name": s.card_name,
			"base_card_name": s.base_card_name,
			"card_number": s.card_number,
			"bank": s.bank,
			"bank_name": s.bank_name or s.bank,
			"representative": s.representative,
			"representative_name": s.representative_name or s.representative,
			"region": s.region,
			"region_name": s.region_name or s.region,
			"received_date": cstr(s.received_date or ""),
			"status": s.status,
		}
		for s in sibling_rows
		if not cint(s.is_deleted)
	]
	deleted_siblings_count = sum(1 for s in sibling_rows if cint(s.is_deleted))

	serialized = _serialize_card_row(
		row,
		can_view_images=bool(perms.get("can_view_images")),
		family_counts={row.card_family: len(active_siblings)},
	)

	return {
		"card": serialized,
		"family": {
			"name": family_doc.name if family_doc else row.card_family,
			"account_number": family_doc.account_number if family_doc else row.account_number,
			"base_card_name": family_doc.base_card_name if family_doc else row.base_card_name,
			"highest_copy_no": cint(family_doc.highest_copy_no if family_doc else row.copy_no),
			"active_cards_count": len(active_siblings),
			"deleted_cards_count": deleted_siblings_count,
			"active_cards": active_siblings,
		},
		"permissions": perms,
	}


@frappe.whitelist()
def get_card_family_lookups() -> dict[str, list[dict[str, Any]]]:
	require_card_permission("view_cards", _("ليست لديك صلاحية لعرض عائلات البطاقات."))
	rows = frappe.db.sql(
		"""
		SELECT
			f.name,
			f.base_card_name,
			f.account_number,
			f.account_number_normalized,
			COALESCE(NULLIF(f.bank, ''), MAX(c.bank)) AS bank,
			COALESCE(NULLIF(b.bank_name, ''), MAX(cb.bank_name), NULLIF(f.bank, ''), MAX(c.bank)) AS bank_name,
			f.highest_copy_no,
			COUNT(CASE WHEN IFNULL(c.is_deleted, 0) = 0 THEN 1 END) AS active_count
		FROM `tabArchive Card Family` f
		LEFT JOIN `tabArchive Bank` b ON b.name = f.bank
		LEFT JOIN `tabArchive Card` c ON c.card_family = f.name
		LEFT JOIN `tabArchive Bank` cb ON cb.name = c.bank
		GROUP BY
			f.name,
			f.base_card_name,
			f.account_number,
			f.account_number_normalized,
			f.bank,
			b.bank_name,
			f.highest_copy_no,
			f.modified
		ORDER BY
			(COUNT(CASE WHEN IFNULL(c.is_deleted, 0) = 0 THEN 1 END) > 0) DESC,
			f.modified DESC
		""",
		as_dict=True,
	)

	limit_rows = frappe.db.sql(
		"""
		SELECT account_number_normalized, daily_limit
		FROM `tabArchive Card`
		WHERE IFNULL(is_deleted, 0) = 0
		  AND IFNULL(account_number_normalized, '') != ''
		""",
		as_dict=True,
	)
	limits_by_norm: dict[str, set[float]] = {}
	cards_exist_by_norm: set[str] = set()
	for lr in limit_rows:
		n_acc = cstr(lr.get("account_number_normalized") or "").strip()
		if not n_acc:
			continue
		cards_exist_by_norm.add(n_acc)
		l_val = flt(lr.get("daily_limit"), 2)
		if l_val > 0:
			limits_by_norm.setdefault(n_acc, set()).add(l_val)

	families: list[dict[str, Any]] = []
	for r in rows:
		base_name = clean_base_card_name(r.base_card_name)
		acc_num = clean_account_number_display(r.account_number)
		norm_acc = cstr(r.account_number_normalized or "").strip() or normalize_account_number(acc_num)
		bank_id = cstr(r.bank or "").strip()
		bank_label = cstr(r.bank_name or bank_id).strip()
		if not base_name or not acc_num or not norm_acc or not bank_id:
			continue
		distinct_limits = sorted(limits_by_norm.get(norm_acc, set()))
		has_conflict = len(distinct_limits) > 1
		shared_limit = distinct_limits[0] if len(distinct_limits) == 1 else None
		families.append(
			{
				"family_name": r.name,
				"base_card_name": base_name,
				"account_number": acc_num,
				"account_number_normalized": norm_acc,
				"bank": bank_id,
				"bank_name": bank_label,
				"highest_copy_no": cint(r.highest_copy_no),
				"active_count": cint(r.active_count),
				"account_exists": norm_acc in cards_exist_by_norm,
				"shared_daily_limit": shared_limit,
				"has_limit_conflict": has_conflict,
				"conflict_limits": distinct_limits,
			}
		)

	return {"families": families}


@frappe.whitelist()
def check_duplicate_account(
	account_number: str,
	base_card_name: str | None = None,
	bank: str | None = None,
	exclude_card: str | None = None,
) -> dict[str, Any]:
	require_card_permission("view_cards", _("ليست لديك صلاحية للتحقق من رقم الحساب."))
	return inspect_account_family(
		account_number=account_number,
		base_card_name=base_card_name,
		bank=bank,
		exclude_card=exclude_card,
	)


@frappe.whitelist()
def create_card(payload: dict[str, Any] | str) -> dict[str, Any]:
	require_card_permission("create_card", _("ليست لديك صلاحية لإضافة بطاقة جديدة."))
	data = _parse_payload(payload)

	region = _validate_link_exists("Archive Region", data.get("region"), _("المنطقة"))
	received_date = _validate_date_input(data.get("received_date"), _("تاريخ الاستلام"))
	bank = _validate_link_exists("Archive Bank", data.get("bank"), _("البنك"))
	card_owner = _validate_link_exists("Archive Account", data.get("card_owner"), _("مالك البطاقة"))
	representative = _validate_link_exists(
		"Archive Representative", data.get("representative"), _("المندوب")
	)

	account_number = clean_account_number_display(data.get("account_number"))
	norm_account = normalize_account_number(account_number)
	if not account_number or not norm_account:
		frappe.throw(_("حقل رقم الحساب مطلوب."), frappe.ValidationError)

	raw_base_name = cstr(data.get("base_card_name") or data.get("card_name") or "").strip()
	clean_base_name = clean_base_card_name(raw_base_name)
	if not clean_base_name:
		frappe.throw(_("حقل اسم البطاقة مطلوب."), frappe.ValidationError)

	card_number = clean_card_number(data.get("card_number"))
	if not card_number:
		frappe.throw(_("حقل رقم البطاقة مطلوب."), frappe.ValidationError)
	_validate_unique_card_number(card_number)

	status = cstr(data.get("status") or "نشطة").strip()
	if status not in VALID_STATUSES:
		frappe.throw(_("حالة البطاقة غير صالحة."), frappe.ValidationError)

	raw_status_reason = cstr(data.get("status_reason") or "").strip()
	if status == "موقفة نهائياً" and not raw_status_reason:
		frappe.throw(_("سبب الإيقاف النهائي للبطاقة مطلوب."), frappe.ValidationError)
	resolved_status_reason = raw_status_reason if status == "موقفة نهائياً" else None

	account_limit_state = get_account_shared_daily_limit_state(norm_account, lock=True)
	if account_limit_state["exists"]:
		if account_limit_state["has_conflict"]:
			conflicts_str = " / ".join(
				format_daily_limit(v) for v in account_limit_state["distinct_limits"]
			)
			frappe.throw(
				_(
					"يوجد تعارض مسبق في الحد اليومي بين نسخ الحساب ({0}): [{1}]. يرجى توحيد الحد اليومي للحساب أولاً قبل إنشاء نسخة جديدة."
				).format(account_number, conflicts_str),
				frappe.ValidationError,
			)
		if account_limit_state["daily_limit"] is not None and account_limit_state["daily_limit"] > 0:
			daily_limit = flt(account_limit_state["daily_limit"], 2)
		else:
			daily_limit = _parse_daily_limit_input(data.get("daily_limit"))
			sync_account_daily_limit(norm_account, daily_limit)
	else:
		daily_limit = _parse_daily_limit_input(data.get("daily_limit"))
	clean_pin = normalize_and_validate_pin(data.get("pin"), required=True)

	front_file_doc = resolve_and_validate_card_image_file(
		data.get("front_image"),
		_("الوجه الأمامي"),
	)
	raw_front_orig = cstr(data.get("front_original_image") or "").strip()
	front_orig_doc = (
		resolve_and_validate_card_image_file(raw_front_orig, _("الوجه الأمامي (الأصل)"))
		if raw_front_orig and raw_front_orig not in (front_file_doc.name, front_file_doc.file_url)
		else front_file_doc
	)
	raw_back = cstr(data.get("back_image") or "").strip()
	back_file_doc = (
		resolve_and_validate_card_image_file(
			raw_back,
			_("الوجه الخلفي"),
		)
		if raw_back
		else None
	)
	raw_back_orig = cstr(data.get("back_original_image") or "").strip()
	back_orig_doc = (
		resolve_and_validate_card_image_file(raw_back_orig, _("الوجه الخلفي (الأصل)"))
		if back_file_doc
		and raw_back_orig
		and raw_back_orig not in (back_file_doc.name, back_file_doc.file_url)
		else back_file_doc
	)
	if (
		data.get("front_edit_meta") is not None
		or data.get("back_edit_meta") is not None
		or (front_orig_doc and front_orig_doc.name != front_file_doc.name)
		or (back_file_doc and back_orig_doc and back_orig_doc.name != back_file_doc.name)
	):
		require_card_image_preview_role(_("ليست لديك صلاحية معاينة البطائق."))

	if back_file_doc and front_file_doc.name == back_file_doc.name:
		frappe.throw(
			_("لا يمكن استخدام نفس ملف الصورة للوجهين الأمامي والخلفي."),
			frappe.ValidationError,
		)

	allow_dup = bool(cint(data.get("allow_duplicate_account")))
	family_doc, copy_no, derived_card_name, was_duplicate = acquire_or_create_family_for_new_card(
		account_number=account_number,
		raw_base_card_name=clean_base_name,
		bank=bank,
		allow_duplicate_account=allow_dup,
	)

	now_ts = now_datetime()

	card_doc = frappe.new_doc(CARD_DOCTYPE)
	card_doc.card_family = family_doc.name
	card_doc.copy_no = copy_no
	card_doc.base_card_name = family_doc.base_card_name
	card_doc.card_name = derived_card_name
	card_doc.account_number = family_doc.account_number
	card_doc.account_number_normalized = family_doc.account_number_normalized
	card_doc.card_number = card_number
	card_doc.bank = bank
	card_doc.card_owner = card_owner
	card_doc.region = region
	card_doc.representative = representative
	card_doc.received_date = received_date
	card_doc.daily_limit = daily_limit if daily_limit is not None else 0.0
	card_doc.has_pin = 1
	card_doc.front_image = front_file_doc.file_url
	card_doc.front_original_image = front_orig_doc.file_url if front_orig_doc else front_file_doc.file_url
	card_doc.front_edit_meta = _normalize_edit_meta_json(data.get("front_edit_meta"))
	card_doc.back_image = back_file_doc.file_url if back_file_doc else None
	card_doc.back_original_image = (
		back_orig_doc.file_url
		if back_orig_doc
		else (back_file_doc.file_url if back_file_doc else None)
	)
	card_doc.back_edit_meta = (
		_normalize_edit_meta_json(data.get("back_edit_meta")) if back_file_doc else None
	)
	card_doc.status = status
	card_doc.status_reason = resolved_status_reason
	card_doc.status_changed_at = now_ts
	card_doc.status_changed_by = frappe.session.user
	card_doc.is_deleted = 0

	card_doc.flags._allow_card_service_mutation = True
	card_doc.insert(ignore_permissions=True)

	save_card_pin(card_doc.name, clean_pin)
	adopt_card_image(front_file_doc, card_doc.name, "front_image")
	if front_orig_doc and front_orig_doc.name != front_file_doc.name:
		adopt_card_image(front_orig_doc, card_doc.name, "front_original_image")
	if back_file_doc:
		adopt_card_image(back_file_doc, card_doc.name, "back_image")
		if back_orig_doc and back_orig_doc.name != back_file_doc.name:
			adopt_card_image(back_orig_doc, card_doc.name, "back_original_image")

	record_card_transfer_entry(
		card_name=card_doc.name,
		event_type="initial_assignment",
		to_region=region,
		to_representative=representative,
		new_received_date=received_date,
		transfer_note=_("استلام أولي عند إنشاء البطاقة"),
		performed_by=frappe.session.user,
		system_datetime=now_ts,
	)

	log_card_event(
		card_name=card_doc.name,
		event_type="created",
		event_title=_("إنشاء بطاقة جديدة"),
		remarks=cstr(data.get("status_reason") or "").strip() or None,
		details={
			"card_family": family_doc.name,
			"copy_no": copy_no,
			"card_name": derived_card_name,
			"base_card_name": family_doc.base_card_name,
			"account_number": family_doc.account_number,
			"card_number": card_number,
			"bank": bank,
			"card_owner": card_owner,
			"region": region,
			"representative": representative,
			"received_date": received_date,
			"daily_limit": daily_limit,
			"status": status,
			"was_duplicate_account": was_duplicate,
		},
		event_source="user",
		event_datetime=now_ts,
	)

	return get_card_details(card_doc.name)


@frappe.whitelist()
def update_card(card: str, payload: dict[str, Any] | str) -> dict[str, Any]:
	data = _parse_payload(payload)
	if not frappe.db.exists(CARD_DOCTYPE, card):
		frappe.throw(_("البطاقة المطلوبة غير موجودة."), frappe.DoesNotExistError)

	card_doc = frappe.get_doc(CARD_DOCTYPE, card)
	if cint(card_doc.is_deleted):
		frappe.throw(_("لا يمكن تعديل بطاقة محذوفة."), frappe.ValidationError)

	if cstr(card_doc.status).strip() == "موقفة نهائياً":
		frappe.throw(
			_("لا يمكن تعديل بيانات أو صور البطاقة وهي في حالة (موقفة نهائياً)."),
			frappe.ValidationError,
		)

	has_edit_data_perm = has_card_permission("edit_card")
	has_edit_images_perm = has_card_permission("edit_card_images")
	has_preview_perm = has_card_image_preview_role()
	if not has_edit_data_perm and not has_edit_images_perm and not has_preview_perm:
		require_card_permission("edit_card", _("ليست لديك صلاحية لتعديل البطاقة."))

	now_ts = now_datetime()

	# Pre-validate PIN change permission and format before any mutation
	raw_new_pin = data.get("new_pin") if "new_pin" in data else data.get("pin")
	validated_new_pin: str | None = None
	if raw_new_pin is not None and cstr(raw_new_pin) != "":
		require_card_permission("edit_card", _("ليست لديك صلاحية لتعديل بيانات البطاقة."))
		require_card_permission(
			"view_card_pin",
			_("تغيير الرقم السري (PIN) المحفوظ يتطلب صلاحية عرض الرقم السري إلى جانب صلاحية التعديل."),
		)
		validated_new_pin = normalize_and_validate_pin(cstr(raw_new_pin), required=True)

	savepoint_name = "archive_card_update_sp"
	frappe.db.savepoint(savepoint_name)
	old_urls_to_cleanup: list[str] = []

	try:
		if "card_number" in data and data.get("card_number") is not None:
			pre_card_number = clean_card_number(data.get("card_number"))
			if not pre_card_number:
				frappe.throw(_("حقل رقم البطاقة مطلوب."), frappe.ValidationError)
			if pre_card_number != card_doc.card_number:
				require_card_permission("edit_card", _("ليست لديك صلاحية لتعديل بيانات البطاقة."))
				_validate_unique_card_number(pre_card_number, exclude_card=card_doc.name)

		# 1. Family Identity Transition (if any of account_number, base_card_name, or bank changed)
		pre_move_norm = cstr(card_doc.account_number_normalized or "").strip()
		pre_move_limit = flt(card_doc.daily_limit, 2) if flt(card_doc.daily_limit) > 0 else None
		parsed_incoming_limit = (
			_parse_daily_limit_input(data.get("daily_limit")) if "daily_limit" in data else None
		)
		explicit_limit_edit = parsed_incoming_limit is not None and (
			pre_move_limit is None or round(parsed_incoming_limit * 100) != round(pre_move_limit * 100)
		)

		incoming_acc = card_doc.account_number
		incoming_norm = card_doc.account_number_normalized
		if "account_number" in data and data.get("account_number") is not None:
			incoming_acc = clean_account_number_display(data.get("account_number"))
			incoming_norm = normalize_account_number(incoming_acc)
			if not incoming_acc or not incoming_norm:
				frappe.throw(_("حقل رقم الحساب مطلوب."), frappe.ValidationError)

		incoming_base = card_doc.base_card_name
		if "base_card_name" in data or "card_name" in data:
			raw_base = cstr(data.get("base_card_name") or data.get("card_name") or "").strip()
			incoming_base = clean_base_card_name(raw_base)
			if not incoming_base:
				frappe.throw(_("حقل اسم البطاقة مطلوب."), frappe.ValidationError)

		incoming_bank = card_doc.bank
		if "bank" in data and data.get("bank") is not None:
			incoming_bank = _validate_link_exists("Archive Bank", data.get("bank"), _("البنك"))

		if (
			incoming_norm != card_doc.account_number_normalized
			or incoming_acc != card_doc.account_number
			or incoming_base != card_doc.base_card_name
			or incoming_bank != card_doc.bank
		):
			require_card_permission("edit_card", _("ليست لديك صلاحية لتعديل بيانات البطاقة."))
			transition_mode = cstr(data.get("account_transition_mode") or "auto").strip()
			_execute_change_card_account_number(
				card=card_doc.name,
				new_account_number=incoming_acc,
				transition_mode=transition_mode,
				new_base_card_name=incoming_base,
				new_bank=incoming_bank,
				remarks=cstr(data.get("remarks") or "").strip() or None,
				override_target_limit=parsed_incoming_limit if explicit_limit_edit else None,
			)
			card_doc.reload()

		# 2. Direct Card Data Fields (card_number, card_owner, region, representative, received_date)
		manual_changes: dict[str, dict[str, Any]] = {}
		data_fields_present = any(
			k in data
			for k in (
				"card_number",
				"bank",
				"card_owner",
				"region",
				"representative",
				"received_date",
				"daily_limit",
				"pin",
				"new_pin",
			)
		)
		if data_fields_present:
			require_card_permission("edit_card", _("ليست لديك صلاحية لتعديل بيانات البطاقة."))

		if "card_number" in data and data.get("card_number") is not None:
			new_card_number = clean_card_number(data.get("card_number"))
			if not new_card_number:
				frappe.throw(_("حقل رقم البطاقة مطلوب."), frappe.ValidationError)
			if new_card_number != card_doc.card_number:
				manual_changes["card_number"] = {"old": card_doc.card_number, "new": new_card_number}
				card_doc.card_number = new_card_number

		if "bank" in data and data.get("bank") is not None:
			new_bank = _validate_link_exists("Archive Bank", data.get("bank"), _("البنك"))
			if new_bank != card_doc.bank:
				manual_changes["bank"] = {"old": card_doc.bank, "new": new_bank}
				card_doc.bank = new_bank

		if "card_owner" in data and data.get("card_owner") is not None:
			new_owner = _validate_link_exists(
				"Archive Account", data.get("card_owner"), _("مالك البطاقة")
			)
			if new_owner != card_doc.card_owner:
				manual_changes["card_owner"] = {"old": card_doc.card_owner, "new": new_owner}
				card_doc.card_owner = new_owner

		if "region" in data and data.get("region") is not None:
			new_region = _validate_link_exists("Archive Region", data.get("region"), _("المنطقة"))
			if new_region != card_doc.region:
				manual_changes["region"] = {"old": card_doc.region, "new": new_region}
				card_doc.region = new_region

		if "representative" in data and data.get("representative") is not None:
			new_rep = _validate_link_exists(
				"Archive Representative", data.get("representative"), _("المندوب")
			)
			if new_rep != card_doc.representative:
				manual_changes["representative"] = {
					"old": card_doc.representative,
					"new": new_rep,
				}
				card_doc.representative = new_rep

		if "received_date" in data and data.get("received_date") is not None:
			new_rec_date = _validate_date_input(data.get("received_date"), _("تاريخ الاستلام"))
			if new_rec_date != cstr(card_doc.received_date):
				manual_changes["received_date"] = {
					"old": cstr(card_doc.received_date),
					"new": new_rec_date,
				}
				card_doc.received_date = new_rec_date

		# 4. Daily limit (unified across all non-deleted cards sharing account_number_normalized)
		daily_limit_changed = False
		old_limit = flt(card_doc.daily_limit, 2) if flt(card_doc.daily_limit) > 0 else None
		new_limit = old_limit
		moved_account = cstr(card_doc.account_number_normalized or "").strip() != pre_move_norm
		acct_state = get_account_shared_daily_limit_state(
			card_doc.account_number_normalized, lock=True
		)

		if not moved_account:
			if parsed_incoming_limit is not None:
				if parsed_incoming_limit != old_limit or acct_state["has_conflict"]:
					validate_account_daily_limit_against_today_deposits(
						card_doc.account_number_normalized, parsed_incoming_limit
					)
					sync_account_daily_limit(
						card_doc.account_number_normalized,
						parsed_incoming_limit,
						exclude_card=card_doc.name,
						triggered_by_card=card_doc.name,
						now_ts=now_ts,
					)
					if parsed_incoming_limit != old_limit:
						daily_limit_changed = True
						new_limit = parsed_incoming_limit
						card_doc.daily_limit = parsed_incoming_limit
			elif (
				data_fields_present
				or "account_number" in data
				or "base_card_name" in data
				or "card_name" in data
			) and flt(card_doc.daily_limit) <= 0:
				frappe.throw(_("حقل الحد اليومي مطلوب."), frappe.ValidationError)
		else:
			if explicit_limit_edit and parsed_incoming_limit is not None:
				validate_account_daily_limit_against_today_deposits(
					card_doc.account_number_normalized, parsed_incoming_limit
				)
				sync_account_daily_limit(
					card_doc.account_number_normalized,
					parsed_incoming_limit,
					exclude_card=card_doc.name,
					triggered_by_card=card_doc.name,
					now_ts=now_ts,
				)
				if parsed_incoming_limit != old_limit:
					daily_limit_changed = True
					new_limit = parsed_incoming_limit
					card_doc.daily_limit = parsed_incoming_limit
			elif flt(card_doc.daily_limit) <= 0:
				if parsed_incoming_limit is not None:
					card_doc.daily_limit = parsed_incoming_limit
					daily_limit_changed = True
					new_limit = parsed_incoming_limit
				else:
					frappe.throw(_("حقل الحد اليومي مطلوب."), frappe.ValidationError)

		# 5. Front & Back Images
		front_image_changed = False
		back_image_changed = False
		old_front_url = card_doc.front_image
		old_front_orig_url = card_doc.front_original_image
		old_back_url = card_doc.back_image
		old_back_orig_url = card_doc.back_original_image
		front_file_doc = None
		front_orig_doc = None
		back_file_doc = None
		back_orig_doc = None

		if "front_original_image" in data and data.get("front_original_image"):
			require_card_permission(
				"edit_card_images",
				_("ليست لديك صلاحية لتعديل صور البطاقة."),
			)
			front_orig_doc = resolve_and_validate_card_image_file(
				cstr(data.get("front_original_image")).strip(),
				_("الوجه الأمامي (الأصل)"),
				card_name=card_doc.name,
			)
			if front_orig_doc.file_url != old_front_orig_url:
				front_image_changed = True
				card_doc.front_original_image = front_orig_doc.file_url

		if "front_image" in data and data.get("front_image"):
			incoming_front = cstr(data.get("front_image")).strip()
			if incoming_front != old_front_url:
				if "front_edit_meta" in data and "front_original_image" not in data:
					require_card_image_preview_role(_("ليست لديك صلاحية معاينة البطائق."))
				else:
					require_card_permission(
						"edit_card_images",
						_("ليست لديك صلاحية لتعديل صور البطاقة."),
					)
				front_file_doc = resolve_and_validate_card_image_file(
					incoming_front,
					_("الوجه الأمامي"),
					card_name=card_doc.name,
				)
				if front_file_doc.file_url != old_front_url:
					front_image_changed = True
					card_doc.front_image = front_file_doc.file_url
					if "front_original_image" not in data:
						if "front_edit_meta" in data:
							card_doc.front_original_image = old_front_orig_url or old_front_url
						else:
							card_doc.front_original_image = front_file_doc.file_url
							card_doc.front_edit_meta = None

		if "front_edit_meta" in data:
			require_card_image_preview_role(_("ليست لديك صلاحية معاينة البطائق."))
			new_front_meta = _normalize_edit_meta_json(data.get("front_edit_meta"))
			if new_front_meta != (card_doc.front_edit_meta or None):
				card_doc.front_edit_meta = new_front_meta
				front_image_changed = True

		if "back_original_image" in data and data.get("back_original_image"):
			require_card_permission(
				"edit_card_images",
				_("ليست لديك صلاحية لتعديل صور البطاقة."),
			)
			back_orig_doc = resolve_and_validate_card_image_file(
				cstr(data.get("back_original_image")).strip(),
				_("الوجه الخلفي (الأصل)"),
				card_name=card_doc.name,
			)
			if back_orig_doc.file_url != old_back_orig_url:
				back_image_changed = True
				card_doc.back_original_image = back_orig_doc.file_url

		if "back_image" in data and data.get("back_image"):
			incoming_back = cstr(data.get("back_image")).strip()
			if incoming_back != old_back_url:
				if "back_edit_meta" in data and "back_original_image" not in data:
					require_card_image_preview_role(_("ليست لديك صلاحية معاينة البطائق."))
				else:
					require_card_permission(
						"edit_card_images",
						_("ليست لديك صلاحية لتعديل صور البطاقة."),
					)
				back_file_doc = resolve_and_validate_card_image_file(
					incoming_back,
					_("الوجه الخلفي"),
					card_name=card_doc.name,
				)
				if back_file_doc.file_url != old_back_url:
					back_image_changed = True
					card_doc.back_image = back_file_doc.file_url
					if "back_original_image" not in data:
						if "back_edit_meta" in data:
							card_doc.back_original_image = old_back_orig_url or old_back_url
						else:
							card_doc.back_original_image = back_file_doc.file_url
							card_doc.back_edit_meta = None

		if "back_edit_meta" in data:
			require_card_image_preview_role(_("ليست لديك صلاحية معاينة البطائق."))
			new_back_meta = _normalize_edit_meta_json(data.get("back_edit_meta"))
			if new_back_meta != (card_doc.back_edit_meta or None):
				card_doc.back_edit_meta = new_back_meta
				back_image_changed = True

		if (
			(front_orig_doc and front_file_doc and front_orig_doc.name != front_file_doc.name)
			or (back_orig_doc and back_file_doc and back_orig_doc.name != back_file_doc.name)
		):
			require_card_image_preview_role(_("ليست لديك صلاحية معاينة البطائق."))

		if card_doc.front_image and card_doc.back_image and card_doc.front_image == card_doc.back_image:
			frappe.throw(
				_("لا يمكن استخدام نفس ملف الصورة للوجهين الأمامي والخلفي."),
				frappe.ValidationError,
			)

		# Save card_doc if any field changed
		if manual_changes or daily_limit_changed or front_image_changed or back_image_changed:
			set_card_search_text(card_doc)
			card_doc.flags._allow_card_service_mutation = True
			card_doc.save(ignore_permissions=True)

		active_card_urls = {
			u
			for u in (
				card_doc.front_image,
				card_doc.front_original_image,
				card_doc.back_image,
				card_doc.back_original_image,
			)
			if u
		}

		if front_image_changed:
			if front_file_doc:
				adopt_card_image(front_file_doc, card_doc.name, "front_image")
			if front_orig_doc and (not front_file_doc or front_orig_doc.name != front_file_doc.name):
				adopt_card_image(front_orig_doc, card_doc.name, "front_original_image")
			for cand_url in (old_front_url, old_front_orig_url):
				if cand_url and cand_url not in active_card_urls:
					old_urls_to_cleanup.append(cand_url)
			log_card_event(
				card_name=card_doc.name,
				event_type="front_image_updated",
				event_title=_("تحديث صورة الوجه الأمامي للبطاقة"),
				details={"side": "front"},
				event_source="user",
				event_datetime=now_ts,
			)

		if back_image_changed:
			if back_file_doc:
				adopt_card_image(back_file_doc, card_doc.name, "back_image")
			if back_orig_doc and (not back_file_doc or back_orig_doc.name != back_file_doc.name):
				adopt_card_image(back_orig_doc, card_doc.name, "back_original_image")
			for cand_url in (old_back_url, old_back_orig_url):
				if cand_url and cand_url not in active_card_urls:
					old_urls_to_cleanup.append(cand_url)
			log_card_event(
				card_name=card_doc.name,
				event_type="back_image_updated",
				event_title=_("تحديث صورة الوجه الخلفي للبطاقة"),
				details={"side": "back"},
				event_source="user",
				event_datetime=now_ts,
			)

		if daily_limit_changed:
			log_card_event(
				card_name=card_doc.name,
				event_type="daily_limit_changed",
				event_title=_("تعديل الحد اليومي للبطاقة"),
				details={
					"old_daily_limit": old_limit,
					"new_daily_limit": new_limit,
				},
				event_source="user",
				event_datetime=now_ts,
			)

		if manual_changes:
			log_card_event(
				card_name=card_doc.name,
				event_type="manual_edit",
				event_title=_("تعديل يدوي لبيانات البطاقة"),
				remarks=cstr(data.get("remarks") or "").strip() or None,
				details={"changed_fields": manual_changes},
				event_source="user",
				event_datetime=now_ts,
			)

		# 6. PIN change (if provided)
		if validated_new_pin is not None:
			current_pin = get_card_pin(card_doc.name, check_permission=False)
			if validated_new_pin != current_pin:
				save_card_pin(card_doc.name, validated_new_pin)
				log_card_event(
					card_name=card_doc.name,
					event_type="pin_changed",
					event_title=_("تغيير الرقم السري (PIN) للبطاقة"),
					details={"pin_updated": True},
					event_source="user",
					event_datetime=now_ts,
				)
	except Exception:
		frappe.db.rollback(save_point=savepoint_name)
		raise

	for old_url in old_urls_to_cleanup:
		schedule_unreferenced_card_file_cleanup(old_url, exclude_card_name=card_doc.name)

	return get_card_details(card_doc.name)


@frappe.whitelist()
def change_card_status(
	card: str,
	new_status: str,
	reason: str | None = None,
	event_date: str | None = None,
	stop_date: str | None = None,
) -> dict[str, Any]:
	require_card_permission(
		"change_card_status",
		_("ليست لديك صلاحية لتغيير حالة البطاقة."),
	)

	target_status = cstr(new_status or "").strip()
	if target_status not in VALID_STATUSES:
		frappe.throw(_("الحالة الجديدة غير صالحة."), frappe.ValidationError)

	card_doc = frappe.get_doc(CARD_DOCTYPE, card)
	if cint(card_doc.is_deleted):
		frappe.throw(_("لا يمكن تغيير حالة بطاقة محذوفة."), frappe.ValidationError)

	old_status = cstr(
		frappe.db.get_value(CARD_DOCTYPE, card_doc.name, "status") or card_doc.status or "نشطة"
	).strip()
	if old_status == "موقفة نهائياً":
		require_reactivate_permanently_stopped_card_role(
			_(
				"لا يمكن تغيير حالة البطاقة الموقفة نهائياً (المتلفة) إلا لمن يمتلك صلاحية إعادة تفعيل البطاقة الموقفة نهائياً."
			)
		)
	clean_reason = cstr(reason or "").strip()
	raw_date = cstr(event_date if event_date is not None else (stop_date or "")).strip()
	now_ts = now_datetime()

	if target_status == "موقفة مؤقتاً":
		if not raw_date:
			frappe.throw(
				_("تاريخ التوقيف المؤقت للبطاقة مطلوب."),
				frappe.ValidationError,
			)
		resolved_event_date = _validate_date_input(raw_date, _("تاريخ التوقيف المؤقت"))
		if not clean_reason:
			frappe.throw(
				_("سبب التوقيف المؤقت للبطاقة مطلوب."),
				frappe.ValidationError,
			)
		event_type = "temporary_stop"
		resolved_reason = None
	elif target_status == "موقفة نهائياً":
		if not raw_date:
			frappe.throw(
				_("تاريخ التوقيف النهائي للبطاقة مطلوب."),
				frappe.ValidationError,
			)
		resolved_event_date = _validate_date_input(raw_date, _("تاريخ التوقيف النهائي"))
		if not clean_reason:
			frappe.throw(
				_("سبب التوقيف النهائي / الإتلاف للبطاقة مطلوب."),
				frappe.ValidationError,
			)
		event_type = "permanent_stop"
		resolved_reason = clean_reason
	else:
		resolved_event_date = (
			_validate_date_input(raw_date, _("تاريخ إعادة التنشيط"))
			if raw_date
			else cstr(getdate(now_ts))
		)
		event_type = "reactivated"
		resolved_reason = None

	if old_status == target_status:
		return get_card_details(card_doc.name)

	savepoint_name = "archive_card_status_change_sp"
	frappe.db.savepoint(savepoint_name)
	try:
		card_doc.status = target_status
		card_doc.status_reason = resolved_reason
		card_doc.status_changed_at = now_ts
		card_doc.status_changed_by = frappe.session.user
		set_card_search_text(card_doc)
		card_doc.flags._allow_card_service_mutation = True
		card_doc.save(ignore_permissions=True)

		record_card_status_event(
			card_doc=card_doc,
			event_type=event_type,
			previous_status=old_status,
			new_status=target_status,
			event_date=resolved_event_date,
			reason=clean_reason or None,
			recorded_by=frappe.session.user,
			recorded_at=now_ts,
		)

		log_card_event(
			card_name=card_doc.name,
			event_type="status_change",
			event_title=_("تغيير حالة البطاقة من ({0}) إلى ({1})").format(old_status, target_status),
			remarks=clean_reason or None,
			details={
				"old_status": old_status,
				"new_status": target_status,
				"event_date": resolved_event_date,
				"reason": clean_reason or "",
			},
			event_source="user",
			event_datetime=now_ts,
		)
	except Exception:
		frappe.db.rollback(save_point=savepoint_name)
		raise

	return get_card_details(card_doc.name)


@frappe.whitelist()
def transfer_card(
	card: str,
	to_region: str,
	to_representative: str,
	new_received_date: str,
	transfer_note: str | None = None,
) -> dict[str, Any]:
	require_card_permission(
		"transfer_card",
		_("ليست لديك صلاحية لنقل عهدة البطاقة."),
	)

	card_doc = frappe.get_doc(CARD_DOCTYPE, card)
	if cint(card_doc.is_deleted):
		frappe.throw(_("لا يمكن نقل عهدة بطاقة محذوفة."), frappe.ValidationError)

	current_db_status = cstr(
		frappe.db.get_value(CARD_DOCTYPE, card_doc.name, "status") or card_doc.status or "نشطة"
	).strip()
	if current_db_status == "موقفة نهائياً":
		require_reactivate_permanently_stopped_card_role(
			_(
				"لا يمكن نقل عهدة البطاقة الموقفة نهائياً (المتلفة) إلا لمن يمتلك صلاحية إعادة تفعيل البطاقة الموقفة نهائياً."
			)
		)

	clean_to_region = _validate_link_exists("Archive Region", to_region, _("المنطقة الجديدة"))
	clean_to_rep = _validate_link_exists(
		"Archive Representative", to_representative, _("المندوب الجديد")
	)
	clean_rec_date = _validate_date_input(new_received_date, _("تاريخ الاستلام الجديد"))
	clean_note = cstr(transfer_note or "").strip()

	from_region = card_doc.region
	from_rep = card_doc.representative
	from_rec_date = cstr(card_doc.received_date or "")

	if clean_to_rep == from_rep:
		frappe.throw(
			_("لا يمكن نقل البطاقة إلى نفس المندوب الحالي."),
			frappe.ValidationError,
		)

	now_ts = now_datetime()

	card_doc.region = clean_to_region
	card_doc.representative = clean_to_rep
	card_doc.received_date = clean_rec_date
	set_card_search_text(card_doc)
	card_doc.flags._allow_card_service_mutation = True
	card_doc.save(ignore_permissions=True)

	transfer_doc = record_card_transfer_entry(
		card_name=card_doc.name,
		event_type="formal_transfer",
		from_region=from_region,
		from_representative=from_rep,
		from_received_date=from_rec_date,
		to_region=clean_to_region,
		to_representative=clean_to_rep,
		new_received_date=clean_rec_date,
		transfer_note=clean_note or None,
		performed_by=frappe.session.user,
		system_datetime=now_ts,
	)

	log_card_event(
		card_name=card_doc.name,
		event_type="formal_transfer",
		event_title=_("نقل عهدة البطاقة"),
		remarks=clean_note or None,
		details={
			"transfer_record": transfer_doc.name,
			"sequence": cint(transfer_doc.sequence),
			"from_region": from_region,
			"from_representative": from_rep,
			"from_received_date": from_rec_date,
			"to_region": clean_to_region,
			"to_representative": clean_to_rep,
			"new_received_date": clean_rec_date,
		},
		event_source="user",
		event_datetime=now_ts,
	)

	return get_card_details(card_doc.name)


@frappe.whitelist()
def delete_card(
	card: str,
	reason: str | None = None,
) -> dict[str, Any]:
	require_card_permission(
		"delete_card",
		_("ليست لديك صلاحية لحذف البطاقة."),
	)

	card_doc = frappe.get_doc(CARD_DOCTYPE, card)
	if cint(card_doc.is_deleted):
		return {"deleted": True, "card": card_doc.name}

	clean_reason = cstr(reason or "").strip()
	if not clean_reason:
		frappe.throw(
			_("سبب حذف البطاقة مطلوب."),
			frappe.ValidationError,
		)

	now_ts = now_datetime()

	card_doc.is_deleted = 1
	card_doc.deleted_at = now_ts
	card_doc.deleted_by = frappe.session.user
	card_doc.delete_reason = clean_reason
	card_doc.search_text = ""
	card_doc.flags._allow_card_service_mutation = True
	card_doc.save(ignore_permissions=True)

	log_card_event(
		card_name=card_doc.name,
		event_type="deleted",
		event_title=_("حذف البطاقة (إخفاء تشغيلي)"),
		remarks=clean_reason or None,
		details={
			"card_family": card_doc.card_family,
			"copy_no": cint(card_doc.copy_no),
			"card_name": card_doc.card_name,
			"base_card_name": card_doc.base_card_name,
			"account_number": card_doc.account_number,
			"reason": clean_reason,
		},
		event_source="user",
		event_datetime=now_ts,
	)

	return {
		"deleted": True,
		"card": card_doc.name,
		"card_family": card_doc.card_family,
		"copy_no": cint(card_doc.copy_no),
	}


@frappe.whitelist()
def reveal_card_pin(card: str) -> dict[str, Any]:
	require_card_permission(
		"view_card_pin",
		_("ليست لديك صلاحية لإظهار الرقم السري (PIN) للبطاقة."),
	)
	card_row = frappe.db.get_value(
		CARD_DOCTYPE,
		card,
		["name", "is_deleted", "has_pin"],
		as_dict=True,
	)
	if not card_row or cint(card_row.get("is_deleted")):
		frappe.throw(_("البطاقة المطلوبة غير موجودة."), frappe.DoesNotExistError)

	pin_val = get_card_pin(card_row.name, check_permission=True)
	return {
		"card": card_row.name,
		"has_pin": bool(pin_val),
		"pin": pin_val,
	}


@frappe.whitelist()
def get_card_image(
	card: str,
	side: str = "front",
	v: str | None = None,
	original: int | str | None = None,
) -> None:
	_ = v
	stream_card_image(card_name=card, side=side, original=bool(cint(original)))


@frappe.whitelist()
def stage_card_image(side: str | None = None) -> dict[str, Any]:
	files = getattr(frappe.request, "files", None)
	if not files or "file" not in files:
		frappe.throw(_("لم يتم إرفاق ملف الصورة في الطلب."), frappe.ValidationError)

	upload = files["file"]
	filename = upload.filename or "card_image.jpg"
	content = upload.stream.read()
	content_type = getattr(upload, "content_type", None) or getattr(upload, "mimetype", None)

	side_val = side or frappe.form_dict.get("side")
	return stage_uploaded_card_image(
		filename=filename,
		content=content,
		content_type=content_type,
		side=cstr(side_val).strip() or None,
	)


@frappe.whitelist()
def cleanup_staged_card_images(
	file_ids: list[str] | str | None = None,
) -> dict[str, Any]:
	parsed_ids: list[str] = []
	if isinstance(file_ids, str):
		try:
			loaded = json.loads(file_ids)
			if isinstance(loaded, list):
				parsed_ids = [cstr(x) for x in loaded if x]
		except Exception:
			parsed_ids = [file_ids]
	elif isinstance(file_ids, list):
		parsed_ids = [cstr(x) for x in file_ids if x]

	return cleanup_staged_card_files(parsed_ids)


@frappe.whitelist()
def get_card_events(card: str) -> dict[str, Any]:
	from archive.api.card_timeline import get_card_events as _get_card_events

	return _get_card_events(card=card)
