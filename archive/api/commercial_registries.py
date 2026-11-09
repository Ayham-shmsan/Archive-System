from __future__ import annotations

import json
import mimetypes
import os
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_datetime, now_datetime

from archive.archive.doctype.archive_commercial_registry.archive_commercial_registry import (
	validate_commercial_registry_no_format,
)
from archive.services.commercial_registry_permissions import (
	COMMERCIAL_REGISTRY_ATTACHMENT_DOCTYPE,
	COMMERCIAL_REGISTRY_DOCTYPE,
	COMMERCIAL_REGISTRY_LOG_DOCTYPE,
	can_create_commercial_registry,
	can_delete_commercial_registry,
	can_edit_commercial_registry,
	can_view_commercial_registry,
	can_view_commercial_registry_by_owner,
	can_view_commercial_registry_timeline,
	can_view_commercial_registry_timeline_role,
	get_commercial_registry_permissions_summary,
	get_permission_query_conditions,
	has_any_commercial_registry_view_scope,
	has_explicit_commercial_registry_role,
	ROLE_EDIT_OTHERS_COMMERCIAL_REGISTRY,
	ROLE_EDIT_OWN_COMMERCIAL_REGISTRY,
	require_commercial_registries_screen_access,
	require_create_commercial_registry,
	require_delete_commercial_registry,
	require_edit_commercial_registry,
	require_view_commercial_registry,
	require_view_commercial_registry_timeline,
)

ALLOWED_EXTENSIONS = {
	".pdf",
	".jpg",
	".jpeg",
	".png",
	".webp",
	".doc",
	".docx",
	".xls",
	".xlsx",
}
ALLOWED_IMAGE_EXTENSIONS = {
	".jpg",
	".jpeg",
	".png",
	".webp",
	".gif",
	".bmp",
	".svg",
}
MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_ATTACHMENTS_PER_REGISTRY = 20

EVENT_TYPE_LABELS = {
	"created": "إنشاء السجل التجاري",
	"manual_edit": "تعديل بيانات السجل التجاري",
	"attachment_added": "إضافة مرفق",
	"attachment_deleted": "حذف مرفق",
	"attachment_viewed": "عرض مرفق",
	"attachment_downloaded": "تنزيل مرفق",
	"deleted": "حذف السجل التجاري",
}

FIELD_LABELS = {
	"commercial_registry_no": "رقم السجل التجاري",
	"registry_name": "اسم السجل",
	"account_owner": "صاحب السجل",
}


def _parse_json_value(value: Any, default: Any) -> Any:
	if value is None:
		return default
	if isinstance(value, str):
		raw = value.strip()
		if not raw:
			return default
		try:
			return frappe.parse_json(raw)
		except Exception:
			return default
	return value


def _format_arabic_12h_datetime(value: Any) -> str:
	if not value:
		return "—"
	try:
		dt = get_datetime(value)
		date_part = dt.strftime("%Y-%m-%d")
		hour24 = dt.hour
		minute = f"{dt.minute:02d}"
		period = "م" if hour24 >= 12 else "ص"
		hour12 = f"{(hour24 % 12 or 12):02d}"
		return f"{date_part}، {hour12}:{minute} {period}"
	except Exception:
		return cstr(value).split(".")[0].strip() or "—"


def _format_event_raw_datetime(value: Any) -> str:
	if not value:
		return ""
	try:
		return get_datetime(value).strftime("%Y-%m-%d %H:%M:%S")
	except Exception:
		return cstr(value).split(".")[0].strip()


def _build_attachment_url(registry_name: str, file_id: str, inline: bool = False) -> str:
	from urllib.parse import urlencode

	params = urlencode(
		{
			"registry_name": registry_name,
			"file_id": file_id,
			"inline": 1 if inline else 0,
		}
	)
	return f"/api/method/archive.api.commercial_registries.download_commercial_registry_attachment?{params}"


def _serialize_attachment_row(row: Any, registry_name: str = "") -> dict[str, Any]:
	file_id = cstr(getattr(row, "file_id", None) or (row.get("file_id") if isinstance(row, dict) else "")).strip()
	file_name = cstr(
		getattr(row, "file_name", None) or (row.get("file_name") if isinstance(row, dict) else "")
	).strip()
	file_url = cstr(getattr(row, "file", None) or (row.get("file") if isinstance(row, dict) else "")).strip()
	ext = cstr(
		getattr(row, "file_extension", None)
		or (row.get("file_extension") if isinstance(row, dict) else "")
	).strip().lower()
	if not ext and file_name and "." in file_name:
		ext = "." + file_name.rsplit(".", 1)[-1].lower()
	file_size = cint(
		getattr(row, "file_size", None) or (row.get("file_size") if isinstance(row, dict) else 0)
	)
	parent_name = cstr(
		registry_name
		or getattr(row, "parent", None)
		or (row.get("parent") if isinstance(row, dict) else "")
	).strip()

	ext_clean = ext.lstrip(".").lower()
	file_kind = "pdf" if ext_clean == "pdf" else ("image" if f".{ext_clean}" in ALLOWED_IMAGE_EXTENSIONS else "file")

	return {
		"file_id": file_id,
		"file_docname": file_id,
		"file_name": file_name or file_id,
		"file_url": file_url,
		"file_extension": ext_clean,
		"file_kind": file_kind,
		"file_size": file_size,
		"open_url": _build_attachment_url(parent_name, file_id, inline=True) if (parent_name and file_id) else file_url,
		"download_url": _build_attachment_url(parent_name, file_id, inline=False)
		if (parent_name and file_id)
		else file_url,
	}


def log_commercial_registry_event(
	registry_doc_or_dict: Any,
	event_type: str,
	event_title: str | None = None,
	*,
	details: Any = None,
	remarks: str | None = None,
	event_source: str = "user",
) -> str:
	if isinstance(registry_doc_or_dict, dict):
		reg_name = cstr(registry_doc_or_dict.get("name")).strip()
		reg_no = cstr(registry_doc_or_dict.get("commercial_registry_no")).strip()
		title_name = cstr(registry_doc_or_dict.get("registry_name")).strip()
		acc_owner = cstr(registry_doc_or_dict.get("account_owner")).strip()
		rec_owner = cstr(registry_doc_or_dict.get("owner")).strip()
	else:
		reg_name = cstr(getattr(registry_doc_or_dict, "name", "")).strip()
		reg_no = cstr(getattr(registry_doc_or_dict, "commercial_registry_no", "")).strip()
		title_name = cstr(getattr(registry_doc_or_dict, "registry_name", "")).strip()
		acc_owner = cstr(getattr(registry_doc_or_dict, "account_owner", "")).strip()
		rec_owner = cstr(getattr(registry_doc_or_dict, "owner", "")).strip()

	resolved_title = cstr(event_title or EVENT_TYPE_LABELS.get(event_type) or event_type).strip()
	details_str = (
		json.dumps(details, ensure_ascii=False, default=str) if details is not None else "{}"
	)

	log_doc = frappe.get_doc(
		{
			"doctype": COMMERCIAL_REGISTRY_LOG_DOCTYPE,
			"commercial_registry": reg_name,
			"commercial_registry_no": reg_no,
			"registry_name": title_name,
			"account_owner": acc_owner,
			"record_owner": rec_owner or cstr(frappe.session.user),
			"event_type": event_type,
			"event_title": resolved_title,
			"event_datetime": now_datetime(),
			"event_user": cstr(frappe.session.user or "Administrator"),
			"event_source": event_source if event_source in ("user", "system") else "user",
			"remarks": cstr(remarks or "").strip() or None,
			"details_json": details_str,
		}
	)
	log_doc.flags.ignore_validate = True
	log_doc.insert(ignore_permissions=True)
	return cstr(log_doc.name)


def _get_account_owners_master() -> list[dict[str, str]]:
	meta = frappe.get_meta("Archive Account")
	filters: dict[str, Any] = {}
	if meta.has_field("disabled"):
		filters["disabled"] = 0
	elif meta.has_field("is_active"):
		filters["is_active"] = 1
	rows = frappe.get_all(
		"Archive Account",
		filters=filters,
		fields=["name", "account_name"],
		order_by="account_name asc",
		ignore_permissions=True,
	)
	return [
		{
			"name": cstr(r.get("name")).strip(),
			"value": cstr(r.get("name")).strip(),
			"account_name": cstr(r.get("account_name") or r.get("name")).strip(),
			"label": cstr(r.get("account_name") or r.get("name")).strip(),
		}
		for r in rows
		if cstr(r.get("name")).strip()
	]


@frappe.whitelist()
def get_commercial_registries_context(
	page: int | str = 1,
	page_size: int | str = 50,
	search: str | None = None,
	search_query: str | None = None,
	account_owner: str | None = None,
	has_attachments: str | None = None,
	sort_by: str | None = "serial_no",
	sort_order: str | None = "asc",
	limit_start: int | str | None = None,
	limit_page_length: int | str | None = None,
) -> dict[str, Any]:
	require_commercial_registries_screen_access()
	user = cstr(frappe.session.user or "Guest").strip()
	permissions = get_commercial_registry_permissions_summary(user=user)
	owners_master = _get_account_owners_master()
	masters = {"account_owners": owners_master}
	filter_options = {"account_owners": owners_master}

	if limit_page_length is not None:
		page_size = limit_page_length
	if limit_start is not None and str(page_size).strip().lower() != "all" and cint(page_size) > 0:
		page = (max(0, cint(limit_start)) // cint(page_size)) + 1

	resolved_search = search if search is not None else search_query

	if not permissions["can_view_any"]:
		return {
			"rows": [],
			"total_count": 0,
			"pagination": {
				"page": 1,
				"page_size": 50 if page_size != "all" else "all",
				"total_count": 0,
				"total_pages": 1,
			},
			"permissions": permissions,
			"masters": masters,
			"filter_options": filter_options,
		}

	where_clauses: list[str] = ["1=1"]
	params: dict[str, Any] = {}

	scope_cond = get_permission_query_conditions(user=user)
	if scope_cond:
		where_clauses.append(f"({scope_cond})")

	clean_owner_filter = cstr(account_owner or "").strip()
	if clean_owner_filter:
		where_clauses.append("`tabArchive Commercial Registry`.`account_owner` = %(account_owner)s")
		params["account_owner"] = clean_owner_filter

	clean_att_filter = cstr(has_attachments or "").strip()
	if clean_att_filter == "with":
		where_clauses.append("COALESCE(att_counts.attachments_count, 0) > 0")
	elif clean_att_filter == "without":
		where_clauses.append("COALESCE(att_counts.attachments_count, 0) = 0")

	clean_search = cstr(resolved_search or "").strip()
	if clean_search:
		params["search_like"] = f"%{clean_search}%"
		where_clauses.append(
			"""(
				`tabArchive Commercial Registry`.`commercial_registry_no` LIKE %(search_like)s
				OR `tabArchive Commercial Registry`.`registry_name` LIKE %(search_like)s
				OR `tabArchive Commercial Registry`.`account_owner` LIKE %(search_like)s
				OR COALESCE(acc.`account_name`, '') LIKE %(search_like)s
				OR `tabArchive Commercial Registry`.`owner` LIKE %(search_like)s
				OR COALESCE(usr.`full_name`, '') LIKE %(search_like)s
			)"""
		)

	where_sql = " AND ".join(where_clauses)

	count_rows = frappe.db.sql(
		f"""
		SELECT COUNT(*) AS total
		FROM `tabArchive Commercial Registry`
		LEFT JOIN `tabArchive Account` acc
			ON acc.`name` = `tabArchive Commercial Registry`.`account_owner`
		LEFT JOIN `tabUser` usr
			ON usr.`name` = `tabArchive Commercial Registry`.`owner`
		LEFT JOIN (
			SELECT `parent`, COUNT(*) AS attachments_count
			FROM `tabArchive Commercial Registry Attachment`
			WHERE `parenttype` = 'Archive Commercial Registry'
			GROUP BY `parent`
		) att_counts
			ON att_counts.`parent` = `tabArchive Commercial Registry`.`name`
		WHERE {where_sql}
		""",
		params,
		as_dict=True,
	)
	total_count = cint(count_rows[0].get("total") if count_rows else 0)

	is_all = str(page_size).strip().lower() == "all" or cint(page_size) <= 0
	resolved_page_size = total_count if is_all else max(1, min(cint(page_size) or 50, 1000))
	if resolved_page_size <= 0:
		resolved_page_size = 50

	total_pages = (
		1
		if (is_all or total_count == 0)
		else max(1, (total_count + resolved_page_size - 1) // resolved_page_size)
	)
	resolved_page = 1 if is_all else max(1, min(cint(page) or 1, total_pages))
	offset = 0 if is_all else (resolved_page - 1) * resolved_page_size

	direction = "DESC" if cstr(sort_order).strip().lower() == "desc" else "ASC"
	clean_sort_by = cstr(sort_by or "serial_no").strip()

	sort_sql_map = {
		"serial_no": f"`tabArchive Commercial Registry`.`creation` {direction}, `tabArchive Commercial Registry`.`name` {direction}",
		"commercial_registry_no": f"`tabArchive Commercial Registry`.`commercial_registry_no` {direction}, `tabArchive Commercial Registry`.`creation` DESC",
		"registry_name": f"`tabArchive Commercial Registry`.`registry_name` {direction}, `tabArchive Commercial Registry`.`creation` DESC",
		"account_owner": f"COALESCE(acc.`account_name`, `tabArchive Commercial Registry`.`account_owner`) {direction}, `tabArchive Commercial Registry`.`creation` DESC",
		"attachments_count": f"COALESCE(att_counts.attachments_count, 0) {direction}, `tabArchive Commercial Registry`.`creation` DESC",
		"owner_full_name": f"COALESCE(usr.`full_name`, `tabArchive Commercial Registry`.`owner`) {direction}, `tabArchive Commercial Registry`.`creation` DESC",
		"owner": f"COALESCE(usr.`full_name`, `tabArchive Commercial Registry`.`owner`) {direction}, `tabArchive Commercial Registry`.`creation` DESC",
		"creation": f"`tabArchive Commercial Registry`.`creation` {direction}, `tabArchive Commercial Registry`.`name` {direction}",
	}
	order_by_sql = sort_sql_map.get(clean_sort_by, sort_sql_map["serial_no"])

	limit_sql = "" if is_all else "LIMIT %(limit)s OFFSET %(offset)s"
	if not is_all:
		params["limit"] = resolved_page_size
		params["offset"] = offset

	raw_rows = frappe.db.sql(
		f"""
		SELECT
			`tabArchive Commercial Registry`.`name`,
			`tabArchive Commercial Registry`.`commercial_registry_no`,
			`tabArchive Commercial Registry`.`registry_name`,
			`tabArchive Commercial Registry`.`account_owner`,
			COALESCE(acc.`account_name`, `tabArchive Commercial Registry`.`account_owner`) AS account_owner_name,
			`tabArchive Commercial Registry`.`owner`,
			COALESCE(NULLIF(TRIM(usr.`full_name`), ''), `tabArchive Commercial Registry`.`owner`) AS owner_full_name,
			`tabArchive Commercial Registry`.`creation`,
			`tabArchive Commercial Registry`.`modified`,
			COALESCE(att_counts.attachments_count, 0) AS attachments_count
		FROM `tabArchive Commercial Registry`
		LEFT JOIN `tabArchive Account` acc
			ON acc.`name` = `tabArchive Commercial Registry`.`account_owner`
		LEFT JOIN `tabUser` usr
			ON usr.`name` = `tabArchive Commercial Registry`.`owner`
		LEFT JOIN (
			SELECT `parent`, COUNT(*) AS attachments_count
			FROM `tabArchive Commercial Registry Attachment`
			WHERE `parenttype` = 'Archive Commercial Registry'
			GROUP BY `parent`
		) att_counts
			ON att_counts.`parent` = `tabArchive Commercial Registry`.`name`
		WHERE {where_sql}
		ORDER BY {order_by_sql}
		{limit_sql}
		""",
		params,
		as_dict=True,
	)

	row_names = [cstr(r.get("name")).strip() for r in raw_rows if cstr(r.get("name")).strip()]
	attachments_by_parent: dict[str, list[dict[str, Any]]] = {n: [] for n in row_names}
	if row_names:
		att_rows = frappe.db.sql(
			"""
			SELECT
				`parent`,
				`file_id`,
				`file`,
				`file_name`,
				`file_extension`,
				`file_size`,
				`idx`
			FROM `tabArchive Commercial Registry Attachment`
			WHERE `parenttype` = 'Archive Commercial Registry'
				AND `parent` IN %(parents)s
			ORDER BY `parent` ASC, `idx` ASC
			""",
			{"parents": tuple(row_names)},
			as_dict=True,
		)
		for att in att_rows:
			p_name = cstr(att.get("parent")).strip()
			if p_name in attachments_by_parent:
				attachments_by_parent[p_name].append(_serialize_attachment_row(att, p_name))

	rows: list[dict[str, Any]] = []
	for idx, r in enumerate(raw_rows):
		reg_name = cstr(r.get("name")).strip()
		if clean_sort_by == "serial_no" and direction == "DESC":
			row_number = max(1, total_count - (offset + idx))
		else:
			row_number = offset + idx + 1

		row_atts = attachments_by_parent.get(reg_name, [])
		rows.append(
			{
				"name": reg_name,
				"serial_no": row_number,
				"commercial_registry_no": cstr(r.get("commercial_registry_no")).strip(),
				"registry_name": cstr(r.get("registry_name")).strip(),
				"account_owner": cstr(r.get("account_owner")).strip(),
				"account_owner_name": cstr(
					r.get("account_owner_name") or r.get("account_owner")
				).strip(),
				"owner": cstr(r.get("owner")).strip(),
				"owner_full_name": cstr(r.get("owner_full_name") or r.get("owner")).strip(),
				"creation": _format_event_raw_datetime(r.get("creation")),
				"creation_formatted": _format_arabic_12h_datetime(r.get("creation")),
				"modified": _format_event_raw_datetime(r.get("modified")),
				"attachments_count": len(row_atts) if row_names else cint(r.get("attachments_count")),
				"attachments": row_atts,
				"can_edit": can_edit_commercial_registry(r, user=user),
				"can_edit_record": can_edit_commercial_registry(r, user=user),
				"can_delete": can_delete_commercial_registry(r, user=user),
				"can_delete_record": can_delete_commercial_registry(r, user=user),
				"can_view_timeline": can_view_commercial_registry_timeline(r, user=user),
			}
		)

	return {
		"rows": rows,
		"total_count": total_count,
		"pagination": {
			"page": resolved_page,
			"page_size": "all" if is_all else resolved_page_size,
			"total_count": total_count,
			"total_pages": total_pages,
		},
		"permissions": permissions,
		"masters": masters,
		"filter_options": filter_options,
	}


def _build_registry_details_response(doc: Any, user: str) -> dict[str, Any]:
	account_owner_name = (
		cstr(frappe.db.get_value("Archive Account", doc.account_owner, "account_name") or doc.account_owner).strip()
		if doc.account_owner
		else ""
	)
	attachments = [_serialize_attachment_row(row, doc.name) for row in (doc.attachments or [])]
	can_edit_val = can_edit_commercial_registry(doc, user=user)
	can_delete_val = can_delete_commercial_registry(doc, user=user)
	can_tl_val = can_view_commercial_registry_timeline(doc, user=user)

	owner_full_name = (
		cstr(frappe.db.get_value("User", doc.owner, "full_name") or doc.owner).strip()
		if doc.owner
		else ""
	)
	reg_dict = {
		"name": doc.name,
		"commercial_registry_no": cstr(doc.commercial_registry_no).strip(),
		"registry_name": cstr(doc.registry_name).strip(),
		"account_owner": cstr(doc.account_owner).strip(),
		"account_owner_name": account_owner_name,
		"owner": cstr(doc.owner).strip(),
		"owner_full_name": owner_full_name,
		"creation": _format_event_raw_datetime(doc.creation),
		"creation_formatted": _format_arabic_12h_datetime(doc.creation),
		"modified": _format_event_raw_datetime(doc.modified),
		"attachments": attachments,
		"attachments_count": len(attachments),
		"can_edit": can_edit_val,
		"can_edit_record": can_edit_val,
		"can_delete": can_delete_val,
		"can_delete_record": can_delete_val,
		"can_view_timeline": can_tl_val,
	}

	return {
		"registry": reg_dict,
		"row": reg_dict,
		"permissions": {
			"can_edit": can_edit_val,
			"can_delete": can_delete_val,
			"can_view_timeline": can_tl_val,
		},
	}


@frappe.whitelist()
def get_commercial_registry_details(
	name: str | None = None,
	registry_name: str | None = None,
) -> dict[str, Any]:
	require_commercial_registries_screen_access()
	clean_name = cstr(name or registry_name).strip()
	if not clean_name or not frappe.db.exists(COMMERCIAL_REGISTRY_DOCTYPE, clean_name):
		frappe.throw(
			_("السجل التجاري غير موجود."),
			frappe.DoesNotExistError,
		)

	doc = frappe.get_doc(COMMERCIAL_REGISTRY_DOCTYPE, clean_name)
	require_view_commercial_registry(doc)

	user = cstr(frappe.session.user or "Guest").strip()
	return _build_registry_details_response(doc, user)


def _require_can_stage_attachment(user: str | None = None) -> None:
	require_commercial_registries_screen_access(user=user)
	if (
		can_create_commercial_registry(user=user)
		or has_explicit_commercial_registry_role(ROLE_EDIT_OWN_COMMERCIAL_REGISTRY, user=user)
		or has_explicit_commercial_registry_role(ROLE_EDIT_OTHERS_COMMERCIAL_REGISTRY, user=user)
	):
		return
	frappe.throw(
		_("ليست لديك صلاحية رفع مرفقات للسجلات التجارية."),
		frappe.PermissionError,
	)


@frappe.whitelist(methods=["POST"])
def stage_commercial_registry_attachment(
	file_name: str | None = None,
	content_base64: str | None = None,
	registry_name: str | None = None,
) -> dict[str, Any]:
	import base64 as _b64

	_require_can_stage_attachment()

	req = getattr(frappe.local, "request", None)
	files = getattr(req, "files", None) if req else None
	if files and "file" in files:
		upload = files["file"]
		filename = os.path.basename(cstr(upload.filename or "").strip())
		content = upload.stream.read()
	elif file_name and content_base64:
		filename = os.path.basename(cstr(file_name).strip())
		raw_b64 = cstr(content_base64).strip()
		if "," in raw_b64:
			raw_b64 = raw_b64.split(",", 1)[1]
		content = _b64.b64decode(raw_b64)
	else:
		frappe.throw(_("لم يتم إرسال أي ملف."), frappe.ValidationError)

	if not filename:
		frappe.throw(_("اسم الملف غير صالح."), frappe.ValidationError)

	ext = os.path.splitext(filename)[1].lower()
	if ext not in ALLOWED_EXTENSIONS:
		frappe.throw(
			_("نوع الملف غير مسموح به ({0}).").format(ext or "غير معروف"),
			frappe.ValidationError,
		)

	if not content:
		frappe.throw(_("محتوى الملف فارغ."), frappe.ValidationError)

	if len(content) > MAX_ATTACHMENT_SIZE_BYTES:
		frappe.throw(
			_("حجم الملف يتجاوز الحد الأقصى المسموح به (25 ميجابايت)."),
			frappe.ValidationError,
		)

	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"is_private": 1,
			"content": content,
		}
	)
	file_doc.insert(ignore_permissions=True)

	ext_clean = ext.lstrip(".").lower()
	file_kind = "pdf" if ext_clean == "pdf" else ("image" if ext in ALLOWED_IMAGE_EXTENSIONS else "file")
	att_payload = {
		"file_id": cstr(file_doc.name),
		"file_docname": cstr(file_doc.name),
		"file_name": cstr(file_doc.file_name or filename),
		"file_url": cstr(file_doc.file_url),
		"file_extension": ext_clean,
		"file_kind": file_kind,
		"file_size": cint(file_doc.file_size or len(content)),
		"open_url": cstr(file_doc.file_url),
		"download_url": cstr(file_doc.file_url),
	}
	return {
		**att_payload,
		"attachment": att_payload,
	}


@frappe.whitelist(methods=["POST"])
def cleanup_staged_commercial_registry_attachments(
	file_ids: str | list[str] | None = None,
	file_docnames: str | list[str] | None = None,
) -> dict[str, Any]:
	require_commercial_registries_screen_access()
	parsed_ids = _parse_json_value(file_ids if file_ids is not None else file_docnames, [])
	if not isinstance(parsed_ids, list):
		return {"deleted": []}

	user = cstr(frappe.session.user or "Guest").strip()
	deleted: list[str] = []
	for fid in parsed_ids:
		clean_fid = cstr(fid).strip()
		if not clean_fid or not frappe.db.exists("File", clean_fid):
			continue
		row = frappe.db.get_value(
			"File",
			clean_fid,
			["name", "owner", "attached_to_doctype", "attached_to_name"],
			as_dict=True,
		)
		if (
			row
			and row.get("owner") == user
			and not row.get("attached_to_doctype")
			and not row.get("attached_to_name")
		):
			frappe.delete_doc("File", clean_fid, ignore_permissions=True)
			deleted.append(clean_fid)

	return {"deleted": deleted}


def _resolve_and_bind_staged_files(
	doc: Any,
	staged_file_ids: list[str],
	user: str,
) -> list[dict[str, Any]]:
	added_meta: list[dict[str, Any]] = []
	existing_file_ids = {cstr(r.file_id).strip() for r in (doc.attachments or []) if cstr(r.file_id).strip()}

	for raw_fid in staged_file_ids:
		clean_fid = cstr(raw_fid).strip()
		if not clean_fid or clean_fid in existing_file_ids:
			continue
		if not frappe.db.exists("File", clean_fid):
			frappe.throw(
				_("أحد المرفقات المرفوعة غير موجود أو انتهت صلاحيته."),
				frappe.ValidationError,
			)
		file_doc = frappe.get_doc("File", clean_fid)
		if (
			file_doc.attached_to_doctype
			and (
				file_doc.attached_to_doctype != COMMERCIAL_REGISTRY_DOCTYPE
				or file_doc.attached_to_name != doc.name
			)
		):
			frappe.throw(
				_("لا يمكن ربط ملف مرتبط بمستند آخر."),
				frappe.PermissionError,
			)
		if file_doc.owner != user and not file_doc.attached_to_name:
			frappe.throw(
				_("لا يمكنك ربط ملف تم رفعه بواسطة مستخدم آخر."),
				frappe.PermissionError,
			)

		ext = os.path.splitext(cstr(file_doc.file_name or ""))[1].lower().lstrip(".")
		doc.append(
			"attachments",
			{
				"file_id": file_doc.name,
				"file": file_doc.file_url,
				"file_name": file_doc.file_name or file_doc.name,
				"file_extension": ext,
				"file_size": cint(file_doc.file_size),
			},
		)
		existing_file_ids.add(file_doc.name)
		added_meta.append(
			{
				"file_id": cstr(file_doc.name),
				"file_name": cstr(file_doc.file_name or file_doc.name),
			}
		)

	return added_meta


def _finalize_bound_files(doc: Any, file_ids: list[str]) -> None:
	for fid in file_ids:
		if frappe.db.exists("File", fid):
			frappe.db.set_value(
				"File",
				fid,
				{
					"attached_to_doctype": COMMERCIAL_REGISTRY_DOCTYPE,
					"attached_to_name": doc.name,
					"is_private": 1,
				},
				update_modified=False,
			)


def _extract_file_ids_from_attachments_arg(
	staged_file_ids: Any = None,
	attachments: Any = None,
) -> list[str]:
	raw = staged_file_ids if staged_file_ids is not None else attachments
	parsed = _parse_json_value(raw, [])
	if not isinstance(parsed, list):
		return []
	result: list[str] = []
	for item in parsed:
		if isinstance(item, dict):
			fid = cstr(item.get("file_id") or item.get("file_docname") or item.get("name")).strip()
		else:
			fid = cstr(item).strip()
		if fid and fid not in result:
			result.append(fid)
	return result


@frappe.whitelist(methods=["POST"])
def create_commercial_registry(
	commercial_registry_no: str,
	registry_name: str,
	account_owner: str | None = None,
	staged_file_ids: str | list[str] | None = None,
	attachments: str | list[Any] | None = None,
) -> dict[str, Any]:
	require_create_commercial_registry()
	user = cstr(frappe.session.user or "Guest").strip()

	clean_no = validate_commercial_registry_no_format(commercial_registry_no)
	clean_name = cstr(registry_name).strip()
	clean_account = cstr(account_owner or "").strip()

	parsed_staged = _extract_file_ids_from_attachments_arg(staged_file_ids, attachments)

	if not parsed_staged:
		frappe.throw(
			_("مرفق السجل التجاري مطلوب (يجب إرفاق ملف واحد على الأقل)."),
			frappe.ValidationError,
		)

	if len(parsed_staged) > MAX_ATTACHMENTS_PER_REGISTRY:
		frappe.throw(
			_("الحد الأقصى لعدد المرفقات هو {0}.").format(MAX_ATTACHMENTS_PER_REGISTRY),
			frappe.ValidationError,
		)

	doc = frappe.get_doc(
		{
			"doctype": COMMERCIAL_REGISTRY_DOCTYPE,
			"commercial_registry_no": clean_no,
			"registry_name": clean_name,
			"account_owner": clean_account,
		}
	)

	added_files = _resolve_and_bind_staged_files(doc, parsed_staged, user=user)
	if not (doc.attachments or []):
		frappe.throw(
			_("مرفق السجل التجاري مطلوب (يجب إرفاق ملف واحد على الأقل)."),
			frappe.ValidationError,
		)
	doc.insert(ignore_permissions=True)
	_finalize_bound_files(doc, [f["file_id"] for f in added_files])

	account_owner_name = (
		cstr(frappe.db.get_value("Archive Account", doc.account_owner, "account_name") or doc.account_owner).strip()
	)

	log_commercial_registry_event(
		doc,
		"created",
		"إنشاء السجل التجاري",
		details={
			"fields": [
				{"fieldname": "commercial_registry_no", "label": "رقم السجل التجاري", "value": doc.commercial_registry_no},
				{"fieldname": "registry_name", "label": "اسم السجل", "value": doc.registry_name},
				{"fieldname": "account_owner", "label": "صاحب السجل", "value": account_owner_name},
			],
			"attachments": [f["file_name"] for f in added_files],
		},
	)

	res = _build_registry_details_response(doc, user)
	res["message"] = "تمت إضافة السجل التجاري بنجاح."
	return res


@frappe.whitelist(methods=["POST"])
def update_commercial_registry(
	name: str,
	commercial_registry_no: str | None = None,
	registry_name: str | None = None,
	account_owner: str | None = None,
	staged_file_ids: str | list[str] | None = None,
	deleted_file_ids: str | list[str] | None = None,
	attachments: str | list[Any] | None = None,
) -> dict[str, Any]:
	require_commercial_registries_screen_access()
	clean_doc_name = cstr(name).strip()
	if not clean_doc_name or not frappe.db.exists(COMMERCIAL_REGISTRY_DOCTYPE, clean_doc_name):
		frappe.throw(
			_("السجل التجاري غير موجود."),
			frappe.DoesNotExistError,
		)

	doc = frappe.get_doc(COMMERCIAL_REGISTRY_DOCTYPE, clean_doc_name)
	require_edit_commercial_registry(doc)
	user = cstr(frappe.session.user or "Guest").strip()

	old_values = {
		"commercial_registry_no": cstr(doc.commercial_registry_no).strip(),
		"registry_name": cstr(doc.registry_name).strip(),
		"account_owner": cstr(doc.account_owner).strip(),
	}

	if commercial_registry_no is not None:
		doc.commercial_registry_no = validate_commercial_registry_no_format(commercial_registry_no)
	if registry_name is not None:
		doc.registry_name = cstr(registry_name).strip()
	if account_owner is not None:
		doc.account_owner = cstr(account_owner).strip()

	parsed_deleted = set(_parse_json_value(deleted_file_ids, []) or [])
	parsed_staged = _parse_json_value(staged_file_ids, []) or []
	if not isinstance(parsed_staged, list):
		parsed_staged = []

	if attachments is not None and staged_file_ids is None and deleted_file_ids is None:
		desired_ids = _extract_file_ids_from_attachments_arg(None, attachments)
		current_ids = [cstr(r.file_id).strip() for r in (doc.attachments or []) if cstr(r.file_id).strip()]
		parsed_deleted = set(current_ids) - set(desired_ids)
		parsed_staged = [fid for fid in desired_ids if fid not in current_ids]

	removed_files: list[dict[str, str]] = []
	if parsed_deleted:
		remaining_rows = []
		for row in doc.attachments or []:
			fid = cstr(row.file_id).strip()
			if fid in parsed_deleted:
				removed_files.append(
					{
						"file_id": fid,
						"file_name": cstr(row.file_name or fid).strip(),
					}
				)
			else:
				remaining_rows.append(row)
		doc.set("attachments", remaining_rows)

	added_files = _resolve_and_bind_staged_files(doc, parsed_staged, user=user)

	if not (doc.attachments or []):
		frappe.throw(
			_("مرفق السجل التجاري مطلوب (يجب إرفاق ملف واحد على الأقل)."),
			frappe.ValidationError,
		)

	if len(doc.attachments or []) > MAX_ATTACHMENTS_PER_REGISTRY:
		frappe.throw(
			_("الحد الأقصى لعدد المرفقات هو {0}.").format(MAX_ATTACHMENTS_PER_REGISTRY),
			frappe.ValidationError,
		)

	doc.save(ignore_permissions=True)
	_finalize_bound_files(doc, [f["file_id"] for f in added_files])

	for rem in removed_files:
		fid = rem["file_id"]
		if fid and frappe.db.exists("File", fid):
			frappe.delete_doc("File", fid, ignore_permissions=True)

	changes: list[dict[str, str]] = []
	for fieldname in ("commercial_registry_no", "registry_name", "account_owner"):
		new_val = cstr(doc.get(fieldname)).strip()
		old_val = old_values[fieldname]
		if new_val != old_val:
			disp_old = old_val
			disp_new = new_val
			if fieldname == "account_owner":
				if old_val:
					disp_old = cstr(frappe.db.get_value("Archive Account", old_val, "account_name") or old_val).strip()
				if new_val:
					disp_new = cstr(frappe.db.get_value("Archive Account", new_val, "account_name") or new_val).strip()
			changes.append(
				{
					"fieldname": fieldname,
					"label": FIELD_LABELS.get(fieldname, fieldname),
					"old_value": disp_old,
					"new_value": disp_new,
				}
			)

	if changes:
		log_commercial_registry_event(
			doc,
			"manual_edit",
			"تعديل بيانات السجل التجاري",
			details={"changes": changes},
		)

	for added in added_files:
		log_commercial_registry_event(
			doc,
			"attachment_added",
			"إضافة مرفق",
			details={"file_id": added["file_id"], "file_name": added["file_name"]},
		)

	for rem in removed_files:
		log_commercial_registry_event(
			doc,
			"attachment_deleted",
			"حذف مرفق",
			details={"file_id": rem["file_id"], "file_name": rem["file_name"]},
		)

	res = get_commercial_registry_details(doc.name)
	res["message"] = "تم تحديث السجل التجاري بنجاح."
	return res


@frappe.whitelist(methods=["POST"])
def delete_commercial_registry(name: str) -> dict[str, Any]:
	require_commercial_registries_screen_access()
	clean_name = cstr(name).strip()
	if not clean_name or not frappe.db.exists(COMMERCIAL_REGISTRY_DOCTYPE, clean_name):
		frappe.throw(
			_("السجل التجاري غير موجود."),
			frappe.DoesNotExistError,
		)

	doc = frappe.get_doc(COMMERCIAL_REGISTRY_DOCTYPE, clean_name)
	require_delete_commercial_registry(doc)

	file_ids = [
		cstr(row.file_id).strip()
		for row in (doc.attachments or [])
		if cstr(row.file_id).strip()
	]
	file_names = [
		cstr(row.file_name or row.file_id).strip()
		for row in (doc.attachments or [])
		if cstr(row.file_name or row.file_id).strip()
	]

	log_commercial_registry_event(
		doc,
		"deleted",
		"حذف السجل التجاري",
		details={
			"commercial_registry_no": cstr(doc.commercial_registry_no).strip(),
			"registry_name": cstr(doc.registry_name).strip(),
			"account_owner": cstr(doc.account_owner).strip(),
			"attachments": file_names,
		},
	)

	frappe.delete_doc(COMMERCIAL_REGISTRY_DOCTYPE, doc.name, ignore_permissions=True)

	for fid in file_ids:
		if frappe.db.exists("File", fid):
			frappe.delete_doc("File", fid, ignore_permissions=True)

	return {"deleted": True, "name": clean_name, "message": "تم حذف السجل التجاري بنجاح."}


@frappe.whitelist()
def get_commercial_registry_timeline(
	name: str | None = None,
	registry_name: str | None = None,
) -> dict[str, Any]:
	require_commercial_registries_screen_access()
	clean_name = cstr(name or registry_name).strip()
	if not clean_name:
		frappe.throw(_("معرف السجل التجاري مطلوب."), frappe.ValidationError)

	user = cstr(frappe.session.user or "Guest").strip()
	if not can_view_commercial_registry_timeline_role(user=user):
		frappe.throw(
			_("ليست لديك صلاحية عرض سجل مستخدم العملية."),
			frappe.PermissionError,
		)

	reg_meta: dict[str, Any] = {}
	if frappe.db.exists(COMMERCIAL_REGISTRY_DOCTYPE, clean_name):
		doc = frappe.get_doc(COMMERCIAL_REGISTRY_DOCTYPE, clean_name)
		require_view_commercial_registry_timeline(doc, user=user)
		acc_name = (
			cstr(
				frappe.db.get_value("Archive Account", doc.account_owner, "account_name")
				or doc.account_owner
			).strip()
			if doc.account_owner
			else ""
		)
		reg_meta = {
			"name": doc.name,
			"commercial_registry_no": cstr(doc.commercial_registry_no).strip(),
			"registry_name": cstr(doc.registry_name).strip(),
			"account_owner": cstr(doc.account_owner).strip(),
			"account_owner_name": acc_name,
			"creation": _format_event_raw_datetime(doc.creation),
			"modified": _format_event_raw_datetime(doc.modified),
		}
	else:
		first_log = frappe.db.get_value(
			COMMERCIAL_REGISTRY_LOG_DOCTYPE,
			{"commercial_registry": clean_name},
			["commercial_registry_no", "registry_name", "account_owner", "record_owner"],
			as_dict=True,
		)
		if not first_log:
			frappe.throw(_("السجل التجاري غير موجود."), frappe.DoesNotExistError)
		if not can_view_commercial_registry_by_owner(
			cstr(first_log.get("record_owner")), user=user
		):
			frappe.throw(
				_("ليست لديك صلاحية عرض هذا السجل التجاري."),
				frappe.PermissionError,
			)
		reg_meta = {
			"name": clean_name,
			"commercial_registry_no": cstr(first_log.get("commercial_registry_no")).strip(),
			"registry_name": cstr(first_log.get("registry_name")).strip(),
			"account_owner": cstr(first_log.get("account_owner")).strip(),
			"account_owner_name": cstr(first_log.get("account_owner")).strip(),
		}

	log_rows = frappe.get_all(
		COMMERCIAL_REGISTRY_LOG_DOCTYPE,
		filters={"commercial_registry": clean_name},
		fields=[
			"name",
			"event_type",
			"event_title",
			"event_datetime",
			"event_user",
			"event_source",
			"remarks",
			"details_json",
			"creation",
		],
		order_by="event_datetime desc, creation desc",
		ignore_permissions=True,
	)

	user_ids = {
		cstr(r.get("event_user")).strip()
		for r in log_rows
		if cstr(r.get("event_user")).strip()
	}
	user_names: dict[str, str] = {}
	if user_ids:
		u_rows = frappe.get_all(
			"User",
			filters={"name": ["in", list(user_ids)]},
			fields=["name", "full_name"],
			ignore_permissions=True,
		)
		for u in u_rows:
			uid = cstr(u.get("name")).strip()
			user_names[uid] = cstr(u.get("full_name") or uid).strip()

	events: list[dict[str, Any]] = []
	for r in log_rows:
		uid = cstr(r.get("event_user")).strip()
		raw_details = _parse_json_value(r.get("details_json"), {})
		ev_dt = _format_event_raw_datetime(r.get("event_datetime") or r.get("creation"))
		ev_label = EVENT_TYPE_LABELS.get(
			cstr(r.get("event_type")), cstr(r.get("event_title") or r.get("event_type"))
		)
		actor_name = user_names.get(uid, uid or "—")
		events.append(
			{
				"name": cstr(r.get("name")),
				"event_type": cstr(r.get("event_type")),
				"event_type_label": ev_label,
				"event_label": ev_label,
				"event_title": cstr(r.get("event_title")),
				"summary": cstr(r.get("remarks") or r.get("event_title") or ev_label),
				"event_datetime": ev_dt,
				"event_datetime_formatted": _format_arabic_12h_datetime(
					r.get("event_datetime") or r.get("creation")
				),
				"event_user": uid,
				"actor_user": uid,
				"event_user_name": actor_name,
				"event_user_full_name": actor_name,
				"actor_full_name": actor_name,
				"event_source": cstr(r.get("event_source") or "user"),
				"remarks": cstr(r.get("remarks") or ""),
				"details": raw_details if isinstance(raw_details, dict) else {},
			}
		)

	return {
		"registry": reg_meta,
		"events": events,
	}


@frappe.whitelist()
def log_commercial_registry_attachment_action(
	registry_name: str,
	action: str = "view",
	file_id: str | None = None,
	file_name: str | None = None,
) -> dict[str, Any]:
	require_commercial_registries_screen_access()
	clean_reg = cstr(registry_name).strip()
	if not clean_reg or not frappe.db.exists(COMMERCIAL_REGISTRY_DOCTYPE, clean_reg):
		return {"logged": False}

	doc = frappe.get_doc(COMMERCIAL_REGISTRY_DOCTYPE, clean_reg)
	require_view_commercial_registry(doc)

	clean_action = cstr(action or "view").strip().lower()
	event_type = "attachment_downloaded" if clean_action == "download" else "attachment_viewed"
	event_title = "تنزيل مرفق" if clean_action == "download" else "عرض مرفق"

	resolved_file_name = cstr(file_name or "").strip()
	clean_fid = cstr(file_id or "").strip()
	if not resolved_file_name and clean_fid:
		for r in doc.attachments or []:
			if cstr(r.file_id).strip() == clean_fid:
				resolved_file_name = cstr(r.file_name or clean_fid).strip()
				break

	log_commercial_registry_event(
		doc,
		event_type,
		event_title,
		details={"file_id": clean_fid, "file_name": resolved_file_name},
	)
	return {"logged": True}


@frappe.whitelist()
def search_sender_name_suggestions(
	txt: str | None = None,
	query: str | None = None,
	limit: int | str = 10,
) -> dict[str, Any]:
	require_commercial_registries_screen_access()
	user = cstr(frappe.session.user or "Guest").strip()
	if not (
		has_any_commercial_registry_view_scope(user=user)
		or can_create_commercial_registry(user=user)
		or has_explicit_commercial_registry_role(ROLE_EDIT_OWN_COMMERCIAL_REGISTRY, user=user)
		or has_explicit_commercial_registry_role(ROLE_EDIT_OTHERS_COMMERCIAL_REGISTRY, user=user)
	):
		return {"suggestions": [], "items": []}

	search_text = cstr(txt if txt is not None else query).strip()
	resolved_limit = max(1, min(cint(limit) or 10, 20))

	params: dict[str, Any] = {
		"starts_with": f"{search_text}%",
		"contains": f"%{search_text}%",
		"limit": resolved_limit,
	}
	conditions = "sender_name IS NOT NULL AND TRIM(sender_name) != ''"
	if search_text:
		conditions += " AND TRIM(sender_name) LIKE %(contains)s"

	rows = frappe.db.sql(
		f"""
		SELECT
			TRIM(sender_name) AS sender_name,
			MAX(modified) AS last_used,
			CASE
				WHEN TRIM(sender_name) LIKE %(starts_with)s THEN 0
				ELSE 1
			END AS match_rank
		FROM `tabArchive Operation`
		WHERE {conditions}
		GROUP BY TRIM(sender_name)
		ORDER BY match_rank ASC, last_used DESC, sender_name ASC
		LIMIT %(limit)s
		""",
		params,
		as_dict=True,
	)

	names = [
		cstr(row.get("sender_name")).strip()
		for row in rows
		if cstr(row.get("sender_name")).strip()
	]
	items = [{"value": n, "label": n} for n in names]
	return {
		"suggestions": names,
		"items": items,
	}


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def search_archive_accounts(
	doctype: str = "Archive Account",
	txt: str = "",
	searchfield: str = "name",
	start: int = 0,
	page_len: int = 20,
	filters: Any = None,
) -> list[tuple[str, str]]:
	require_commercial_registries_screen_access()
	search_txt = cstr(txt or "").strip()
	params: dict[str, Any] = {
		"like_txt": f"%{search_txt}%",
		"starts_txt": f"{search_txt}%",
		"start": max(0, cint(start)),
		"page_len": max(1, min(cint(page_len) or 20, 50)),
	}
	where_clause = "IFNULL(`disabled`, 0) = 0"
	if search_txt:
		where_clause += " AND (`name` LIKE %(like_txt)s OR `account_name` LIKE %(like_txt)s)"

	rows = frappe.db.sql(
		f"""
		SELECT `name`, `account_name`
		FROM `tabArchive Account`
		WHERE {where_clause}
		ORDER BY
			CASE WHEN `account_name` LIKE %(starts_txt)s THEN 0 ELSE 1 END ASC,
			`account_name` ASC
		LIMIT %(page_len)s OFFSET %(start)s
		""",
		params,
	)
	return list(rows or [])


@frappe.whitelist()
def validate_archive_account(account_name: str) -> dict[str, Any]:
	require_commercial_registries_screen_access()
	clean_acc = cstr(account_name).strip()
	if not clean_acc or not frappe.db.exists("Archive Account", clean_acc):
		return {"valid": False, "name": "", "account_name": ""}
	row = frappe.db.get_value(
		"Archive Account",
		clean_acc,
		["name", "account_name", "disabled"],
		as_dict=True,
	)
	if not row:
		return {"valid": False, "name": "", "account_name": ""}
	return {
		"valid": True,
		"name": cstr(row.get("name")).strip(),
		"account_name": cstr(row.get("account_name") or row.get("name")).strip(),
	}


@frappe.whitelist()
def download_commercial_registry_attachment(
	registry_name: str,
	file_id: str,
	inline: int | str = 0,
) -> None:
	require_commercial_registries_screen_access()
	clean_reg = cstr(registry_name).strip()
	clean_fid = cstr(file_id).strip()

	if not clean_reg or not clean_fid:
		frappe.throw(_("بيانات المرفق غير مكتملة."), frappe.ValidationError)

	if not frappe.db.exists(COMMERCIAL_REGISTRY_DOCTYPE, clean_reg):
		frappe.throw(_("السجل التجاري غير موجود."), frappe.DoesNotExistError)

	reg_doc = frappe.get_doc(COMMERCIAL_REGISTRY_DOCTYPE, clean_reg)
	require_view_commercial_registry(reg_doc)

	att_row = next(
		(r for r in (reg_doc.attachments or []) if cstr(r.file_id).strip() == clean_fid),
		None,
	)
	if not att_row or not frappe.db.exists("File", clean_fid):
		frappe.throw(_("المرفق غير موجود في هذا السجل التجاري."), frappe.DoesNotExistError)

	file_doc = frappe.get_doc("File", clean_fid)
	content = file_doc.get_content()
	filename = cstr(att_row.file_name or file_doc.file_name or clean_fid).strip()
	content_type, _ = mimetypes.guess_type(filename)

	frappe.local.response.filename = filename
	frappe.local.response.filecontent = content
	frappe.local.response.type = "download"
	if cint(inline):
		frappe.local.response.display_content_as = "inline"
		if content_type:
			frappe.local.response.content_type = content_type
	else:
		frappe.local.response.display_content_as = "attachment"
