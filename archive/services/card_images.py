from __future__ import annotations

import mimetypes
import os
from typing import Any
from urllib.parse import quote

import frappe
from frappe import _
from frappe.core.doctype.file.utils import get_content_hash, get_file_name
from frappe.utils import cint
from frappe.utils.file_manager import save_file_on_filesystem

from archive.services.card_permissions import (
	CARD_DOCTYPE,
	has_card_image_preview_role,
	has_card_permission,
	require_card_image_preview_role,
	require_card_permission,
)

MAX_CARD_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
VALID_IMAGE_SIDES = ("front", "back")


def _extract_extension(filename: str) -> str:
	_, ext = os.path.splitext((filename or "").strip().lower())
	return ext


def _validate_image_filename_and_mime(filename: str, content_type: str | None = None) -> str:
	clean_name = os.path.basename((filename or "").strip())
	if not clean_name:
		frappe.throw(_("اسم ملف الصورة غير صالح."), frappe.ValidationError)

	ext = _extract_extension(clean_name)
	if ext not in ALLOWED_IMAGE_EXTENSIONS:
		frappe.throw(
			_("صيغة الصورة غير مدعومة. الصيغ المسموحة: JPG, JPEG, PNG, WEBP."),
			frappe.ValidationError,
		)

	mime = (content_type or "").split(";")[0].strip().lower()
	if mime and mime not in ALLOWED_IMAGE_MIME_TYPES and mime != "application/octet-stream":
		frappe.throw(
			_("نوع ملف الصورة غير مسموح. يرجى رفع صورة بصيغة JPG أو PNG أو WEBP."),
			frappe.ValidationError,
		)

	return clean_name


def stage_uploaded_card_image(
	filename: str,
	content: bytes,
	content_type: str | None = None,
	side: str | None = None,
) -> dict[str, Any]:
	if not (
		has_card_permission("create_card")
		or has_card_permission("edit_card_images")
		or has_card_image_preview_role()
	):
		frappe.throw(
			_("ليست لديك صلاحية لرفع صور البطاقات."),
			frappe.PermissionError,
		)

	if side and side not in VALID_IMAGE_SIDES:
		frappe.throw(_("جهة الصورة غير صالحة (front أو back)."), frappe.ValidationError)

	clean_name = _validate_image_filename_and_mime(filename, content_type)
	size_bytes = len(content or b"")
	if size_bytes <= 0:
		frappe.throw(_("ملف الصورة فارغ."), frappe.ValidationError)
	if size_bytes > MAX_CARD_IMAGE_BYTES:
		frappe.throw(
			_("حجم الصورة يتجاوز الحد الأقصى المسموح (10 ميجابايت)."),
			frappe.ValidationError,
		)

	unique_fname = get_file_name(clean_name, frappe.generate_hash(length=10))
	file_data = save_file_on_filesystem(
		fname=unique_fname,
		content=content,
		content_type=content_type,
		is_private=1,
	)

	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": file_data["file_name"],
			"file_url": file_data["file_url"],
			"file_size": size_bytes,
			"content_hash": get_content_hash(content),
			"is_private": 1,
		}
	)
	file_doc.flags.ignore_permissions = True
	file_doc.flags.ignore_duplicate_entry_error = True
	file_doc.insert()

	if not cint(file_doc.is_private) or not str(file_doc.file_url or "").startswith("/private/files/"):
		frappe.throw(_("فشل حفظ صورة البطاقة كملف خاص (Private)."), frappe.ValidationError)

	return {
		"file_id": file_doc.name,
		"file_url": file_doc.file_url,
		"file_name": file_doc.file_name or clean_name,
		"file_size": cint(file_doc.file_size or size_bytes),
		"side": side or "",
	}


def resolve_and_validate_card_image_file(
	file_ref: str | None,
	side_label: str,
	card_name: str | None = None,
) -> Any:
	ref = (file_ref or "").strip()
	if not ref:
		frappe.throw(
			_("صورة {0} مطلوبة.").format(side_label),
			frappe.ValidationError,
		)

	file_row = None
	if frappe.db.exists("File", ref):
		file_row = frappe.get_doc("File", ref)
	else:
		matches = frappe.get_all(
			"File",
			filters={"file_url": ref},
			fields=["name"],
			order_by="creation desc",
			limit=1,
		)
		if matches:
			file_row = frappe.get_doc("File", matches[0].name)

	if not file_row:
		frappe.throw(
			_("لم يتم العثور على ملف صورة {0} المرفوع.").format(side_label),
			frappe.ValidationError,
		)

	file_url = (file_row.file_url or "").strip()
	if not cint(file_row.is_private) or not file_url.startswith("/private/files/"):
		frappe.throw(
			_("يجب أن تكون صورة {0} محفوظة كملف خاص (Private File).").format(side_label),
			frappe.ValidationError,
		)

	_validate_image_filename_and_mime(file_row.file_name or os.path.basename(file_url))

	attached_dt = (file_row.attached_to_doctype or "").strip()
	attached_dn = (file_row.attached_to_name or "").strip()

	if attached_dn:
		if attached_dt != CARD_DOCTYPE or (card_name and attached_dn != card_name):
			frappe.throw(
				_("ملف صورة {0} مرتبط بسجل آخر ولا يمكن استخدامه.").format(side_label),
				frappe.PermissionError,
			)
	else:
		current_user = frappe.session.user
		if (
			file_row.owner != current_user
			and current_user != "Administrator"
			and "System Manager" not in frappe.get_roles(current_user)
		):
			frappe.throw(
				_("ملف صورة {0} المؤقت لا يخص الجلسة الحالية.").format(side_label),
				frappe.PermissionError,
			)

	return file_row


def adopt_card_image(
	file_doc: Any,
	card_name: str,
	fieldname: str,
) -> str:
	if (
		file_doc.attached_to_doctype != CARD_DOCTYPE
		or file_doc.attached_to_name != card_name
		or file_doc.attached_to_field != fieldname
		or not cint(file_doc.is_private)
	):
		frappe.db.set_value(
			"File",
			file_doc.name,
			{
				"attached_to_doctype": CARD_DOCTYPE,
				"attached_to_name": card_name,
				"attached_to_field": fieldname,
				"is_private": 1,
			},
			update_modified=False,
		)
	return file_doc.file_url


def remove_unreferenced_card_file_by_url(
	file_url: str | None,
	exclude_card_name: str | None = None,
) -> None:
	_ = exclude_card_name
	clean_url = (file_url or "").strip()
	if not clean_url or not clean_url.startswith("/private/files/"):
		return

	other_refs = frappe.db.sql(
		"""
		SELECT name
		FROM `tabArchive Card`
		WHERE (
			front_image = %(url)s
			OR back_image = %(url)s
			OR front_original_image = %(url)s
			OR back_original_image = %(url)s
		)
		LIMIT 1
		""",
		{"url": clean_url},
	)
	if other_refs:
		return

	file_names = frappe.get_all(
		"File",
		filters={"file_url": clean_url},
		pluck="name",
	)
	for fid in file_names:
		try:
			frappe.delete_doc("File", fid, ignore_permissions=True, force=True)
		except Exception:
			frappe.log_error(frappe.get_traceback(), "Archive Card Image Cleanup Error")


def schedule_unreferenced_card_file_cleanup(
	file_url: str | None,
	exclude_card_name: str | None = None,
) -> None:
	clean_url = (file_url or "").strip()
	if not clean_url or not clean_url.startswith("/private/files/"):
		return

	def _cleanup_callback() -> None:
		remove_unreferenced_card_file_by_url(clean_url, exclude_card_name=exclude_card_name)

	frappe.db.after_commit.add(_cleanup_callback)


def cleanup_staged_card_files(file_ids: list[str] | None = None) -> dict[str, Any]:
	cleaned: list[str] = []
	current_user = frappe.session.user
	is_priv = current_user == "Administrator" or "System Manager" in frappe.get_roles(current_user)

	for raw_id in file_ids or []:
		fid = (raw_id or "").strip()
		if not fid or not frappe.db.exists("File", fid):
			continue
		row = frappe.db.get_value(
			"File",
			fid,
			["name", "owner", "attached_to_doctype", "attached_to_name", "file_url"],
			as_dict=True,
		)
		if not row or row.get("attached_to_name"):
			continue
		if row.get("owner") != current_user and not is_priv:
			continue

		in_use = frappe.db.sql(
			"""
			SELECT name
			FROM `tabArchive Card`
			WHERE front_image = %(url)s
			   OR back_image = %(url)s
			   OR front_original_image = %(url)s
			   OR back_original_image = %(url)s
			LIMIT 1
			""",
			{"url": row.get("file_url")},
		)
		if in_use:
			continue

		frappe.delete_doc("File", fid, ignore_permissions=True, force=True)
		cleaned.append(fid)

	return {"cleaned_file_ids": cleaned}


def get_card_image_endpoint(
	card_name: str,
	side: str,
	version_token: str | None = None,
	user: str | None = None,
	original: bool = False,
) -> str | None:
	if original:
		if not has_card_image_preview_role(user=user):
			return None
	elif not has_card_permission("view_card_images", user=user):
		return None
	if side not in VALID_IMAGE_SIDES:
		return None
	ver = quote(str(version_token or "1"))
	orig_param = "&original=1" if original else ""
	return (
		f"/api/method/archive.api.cards.get_card_image"
		f"?card={quote(card_name)}&side={quote(side)}&v={ver}{orig_param}"
	)


def stream_card_image(card_name: str, side: str, original: bool = False) -> None:
	if original:
		require_card_image_preview_role(_("ليست لديك صلاحية معاينة البطائق."))
	else:
		require_card_permission(
			"view_card_images",
			_("ليست لديك صلاحية لعرض صور البطاقات."),
		)
	if side not in VALID_IMAGE_SIDES:
		frappe.throw(_("جهة الصورة المطلوبة غير صالحة."), frappe.ValidationError)

	card_row = frappe.db.get_value(
		CARD_DOCTYPE,
		card_name,
		[
			"name",
			"status",
			"is_deleted",
			"front_image",
			"back_image",
			"front_original_image",
			"back_original_image",
		],
		as_dict=True,
	)
	if not card_row or cint(card_row.get("is_deleted")):
		frappe.throw(_("البطاقة المطلوبة غير موجودة."), frappe.DoesNotExistError)

	if original and (card_row.get("status") or "").strip() == "موقفة نهائياً":
		frappe.throw(
			_("لا يمكن معاينة أو تعديل صور البطاقة الموقفة نهائياً إلا بعد تفعيلها."),
			frappe.ValidationError,
		)

	if side == "front":
		file_url = (
			(card_row.get("front_original_image") or card_row.get("front_image") or "")
			if original
			else (card_row.get("front_image") or "")
		).strip()
	else:
		file_url = (
			(card_row.get("back_original_image") or card_row.get("back_image") or "")
			if original
			else (card_row.get("back_image") or "")
		).strip()
	if not file_url:
		frappe.throw(_("صورة البطاقة غير متوفرة."), frappe.DoesNotExistError)

	file_matches = frappe.get_all(
		"File",
		filters={"file_url": file_url},
		fields=["name"],
		order_by="creation desc",
		limit=1,
	)
	if not file_matches:
		frappe.throw(_("ملف صورة البطاقة غير موجود."), frappe.DoesNotExistError)

	file_doc = frappe.get_doc("File", file_matches[0].name)
	content = file_doc.get_content()
	if isinstance(content, str):
		content = content.encode("utf-8")

	filename = file_doc.file_name or os.path.basename(file_url) or f"{card_name}_{side}.jpg"
	content_type, _encoding = mimetypes.guess_type(filename)

	frappe.local.response.filename = filename
	frappe.local.response.filecontent = content
	frappe.local.response.type = "binary"
	if content_type:
		frappe.local.response.content_type = content_type
