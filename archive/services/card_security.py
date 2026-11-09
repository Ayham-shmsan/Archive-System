from __future__ import annotations

import re
from typing import Any

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils.password import get_decrypted_password, remove_encrypted_password, set_encrypted_password

from archive.services.card_permissions import (
	CARD_DOCTYPE,
	has_card_permission,
	require_card_permission,
)

PIN_PATTERN = re.compile(r"^[0-9]{4}$")


def normalize_and_validate_pin(raw_pin: str | None, required: bool = True) -> str | None:
	if raw_pin is None:
		if required:
			frappe.throw(_("الرقم السري يجب أن يتكون من 4 أرقام بالضبط."), frappe.ValidationError)
		return None

	raw_str = str(raw_pin)
	if not raw_str.strip():
		if required:
			frappe.throw(_("الرقم السري يجب أن يتكون من 4 أرقام بالضبط."), frappe.ValidationError)
		return None

	# Reject leading/trailing whitespace or internal spaces
	if raw_str != raw_str.strip():
		frappe.throw(
			_("الرقم السري يجب أن يتكون من 4 أرقام بالضبط."),
			frappe.ValidationError,
		)

	# Convert Arabic-Indic / Eastern Arabic-Indic digits if entered
	trans_map = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
	cleaned = raw_str.translate(trans_map)

	if not PIN_PATTERN.match(cleaned):
		frappe.throw(
			_("الرقم السري يجب أن يتكون من 4 أرقام بالضبط."),
			frappe.ValidationError,
		)
	return cleaned


def save_card_pin(card_name: str, raw_pin: str) -> None:
	clean_pin = normalize_and_validate_pin(raw_pin, required=True)
	set_encrypted_password(CARD_DOCTYPE, card_name, clean_pin, fieldname="pin")
	frappe.db.set_value(
		CARD_DOCTYPE,
		card_name,
		{"pin": None, "has_pin": 1},
		update_modified=False,
	)


def get_card_pin(card_name: str, check_permission: bool = True) -> str:
	if check_permission:
		require_card_permission(
			"view_card_pin",
			_("ليست لديك صلاحية لإظهار الرقم السري للبطاقة."),
		)
	if not frappe.db.exists(CARD_DOCTYPE, card_name):
		frappe.throw(_("البطاقة غير موجودة."), frappe.DoesNotExistError)

	pin_val = get_decrypted_password(
		CARD_DOCTYPE,
		card_name,
		fieldname="pin",
		raise_exception=False,
	)
	return pin_val or ""


def clear_card_pin(card_name: str) -> None:
	remove_encrypted_password(CARD_DOCTYPE, card_name, fieldname="pin")
	frappe.db.set_value(
		CARD_DOCTYPE,
		card_name,
		{"pin": None, "has_pin": 0},
		update_modified=False,
	)


def is_archive_card_file_doc(doc_or_name: Any) -> bool:
	if not doc_or_name:
		return False

	if isinstance(doc_or_name, str):
		row = frappe.db.get_value(
			"File",
			doc_or_name,
			["attached_to_doctype", "attached_to_name", "file_url"],
			as_dict=True,
		)
		if not row:
			return False
		attached_to_doctype = row.get("attached_to_doctype")
		file_url = row.get("file_url")
	else:
		attached_to_doctype = getattr(doc_or_name, "attached_to_doctype", None)
		file_url = getattr(doc_or_name, "file_url", None)

	if attached_to_doctype == CARD_DOCTYPE:
		return True

	if file_url and str(file_url).startswith("/private/files/"):
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
			{"url": file_url},
		)
		if in_use:
			return True

	return False


def _get_commercial_registry_for_file(doc_or_name: Any) -> str | None:
	if not doc_or_name:
		return None

	if isinstance(doc_or_name, str):
		row = frappe.db.get_value(
			"File",
			doc_or_name,
			["name", "attached_to_doctype", "attached_to_name", "file_url"],
			as_dict=True,
		)
		if not row:
			return None
		file_id = row.get("name")
		attached_to_doctype = row.get("attached_to_doctype")
		attached_to_name = row.get("attached_to_name")
		file_url = row.get("file_url")
	else:
		file_id = getattr(doc_or_name, "name", None)
		attached_to_doctype = getattr(doc_or_name, "attached_to_doctype", None)
		attached_to_name = getattr(doc_or_name, "attached_to_name", None)
		file_url = getattr(doc_or_name, "file_url", None)

	if attached_to_doctype == "Archive Commercial Registry" and attached_to_name:
		return str(attached_to_name)

	if (file_id or file_url) and frappe.db.table_exists("Archive Commercial Registry Attachment"):
		parent = frappe.db.sql(
			"""
			SELECT parent
			FROM `tabArchive Commercial Registry Attachment`
			WHERE (%(file_id)s != '' AND file_id = %(file_id)s)
			   OR (%(file_url)s != '' AND file = %(file_url)s)
			LIMIT 1
			""",
			{"file_id": str(file_id or ""), "file_url": str(file_url or "")},
		)
		if parent and parent[0] and parent[0][0]:
			return str(parent[0][0])

	return None


def has_file_permission(
	doc: Any,
	ptype: str | None = None,
	user: str | None = None,
) -> bool | None:
	registry_name = _get_commercial_registry_for_file(doc)
	if registry_name:
		from archive.services.commercial_registry_permissions import (
			can_edit_commercial_registry,
			can_view_commercial_registry,
		)

		perm = ptype or "read"
		if perm in ("read", "select", "export", "print", "email"):
			return can_view_commercial_registry(registry_name, user=user)
		if perm in ("write", "create", "delete"):
			return can_edit_commercial_registry(registry_name, user=user)
		return False

	if not is_archive_card_file_doc(doc):
		return True

	perm = ptype or "read"
	if perm in ("read", "select", "export", "print", "email"):
		return has_card_permission("view_card_images", user=user)

	if perm in ("write", "create", "delete"):
		return has_card_permission("edit_card_images", user=user) or has_card_permission(
			"create_card", user=user
		)

	return False


class ArchiveFileMixin(Document):
	def is_downloadable(self) -> bool:
		registry_name = _get_commercial_registry_for_file(self)
		if registry_name:
			from archive.services.commercial_registry_permissions import (
				can_view_commercial_registry,
			)

			return can_view_commercial_registry(registry_name)
		if is_archive_card_file_doc(self):
			return has_card_permission("view_card_images")
		return super().is_downloadable()
