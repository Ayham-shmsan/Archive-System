from __future__ import annotations

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr

COMMERCIAL_REGISTRY_NO_PATTERN = re.compile(r"^[0-9]{10}$")


def validate_commercial_registry_no_format(raw_value: str | None) -> str:
	if raw_value is None or raw_value == "":
		frappe.throw(
			_("رقم السجل التجاري مطلوب ويجب أن يتكون من 10 أرقام بالضبط (0-9)."),
			frappe.ValidationError,
		)

	if not isinstance(raw_value, str):
		frappe.throw(
			_("رقم السجل التجاري يجب أن يكون نصًا مكونًا من 10 أرقام (0-9) فقط."),
			frappe.ValidationError,
		)

	if not COMMERCIAL_REGISTRY_NO_PATTERN.fullmatch(raw_value):
		frappe.throw(
			_("رقم السجل التجاري يجب أن يتكون من 10 أرقام بالضبط (0-9) دون مسافات أو حروف أو رموز."),
			frappe.ValidationError,
		)

	return raw_value


class ArchiveCommercialRegistry(Document):
	def validate(self) -> None:
		self._validate_commercial_registry_no()
		self._validate_registry_name()
		self._validate_account_owner()

	def _validate_commercial_registry_no(self) -> None:
		clean_no = validate_commercial_registry_no_format(self.commercial_registry_no)
		self.commercial_registry_no = clean_no

		filters: dict[str, object] = {"commercial_registry_no": clean_no}
		if not self.is_new() and self.name:
			filters["name"] = ["!=", self.name]

		if frappe.db.exists("Archive Commercial Registry", filters):
			frappe.throw(
				_("رقم السجل التجاري موجود مسبقًا."),
				frappe.ValidationError,
			)

	def _validate_registry_name(self) -> None:
		clean_name = cstr(self.registry_name).strip()
		if not clean_name:
			frappe.throw(
				_("اسم السجل مطلوب."),
				frappe.ValidationError,
			)
		self.registry_name = clean_name

	def _validate_account_owner(self) -> None:
		clean_owner = cstr(self.account_owner).strip()
		if not clean_owner:
			frappe.throw(
				_("صاحب السجل مطلوب."),
				frappe.ValidationError,
			)
		if not frappe.db.exists("Archive Account", clean_owner):
			frappe.throw(
				_("صاحب السجل المحدد غير موجود في الحسابات المعتمدة."),
				frappe.ValidationError,
			)
		self.account_owner = clean_owner

	def db_insert(self, *args, **kwargs):
		try:
			return super().db_insert(*args, **kwargs)
		except frappe.DuplicateEntryError:
			frappe.throw(
				_("رقم السجل التجاري موجود مسبقًا."),
				frappe.ValidationError,
			)

	def db_update(self, *args, **kwargs):
		try:
			return super().db_update(*args, **kwargs)
		except frappe.DuplicateEntryError:
			frappe.throw(
				_("رقم السجل التجاري موجود مسبقًا."),
				frappe.ValidationError,
			)
