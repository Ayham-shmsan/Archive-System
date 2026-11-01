# Copyright (c) 2026, Ayham-shmsan and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import getseries
from frappe.utils import cint, flt


VALID_CARD_STATUSES = ("نشطة", "موقفة مؤقتاً", "موقفة نهائياً")


class ArchiveCard(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account_number: DF.Data
		account_number_normalized: DF.Data
		back_image: DF.AttachImage
		bank: DF.Link
		base_card_name: DF.Data
		card_family: DF.Link
		card_name: DF.Data
		card_number: DF.Data
		card_owner: DF.Link
		copy_no: DF.Int
		daily_limit: DF.Float
		delete_reason: DF.SmallText | None
		deleted_at: DF.Datetime | None
		deleted_by: DF.Link | None
		front_image: DF.AttachImage
		has_pin: DF.Check
		is_deleted: DF.Check
		pin: DF.Password | None
		received_date: DF.Date
		region: DF.Link
		representative: DF.Link
		search_text: DF.LongText | None
		serial_no: DF.Int
		status: DF.Literal["نشطة", "موقفة مؤقتاً", "موقفة نهائياً"]
		status_changed_at: DF.Datetime | None
		status_changed_by: DF.Link | None
		status_reason: DF.SmallText | None
	# end: auto-generated types

	def before_insert(self):
		if not getattr(self.flags, "_allow_card_service_mutation", False):
			frappe.throw(
				_("إنشاء البطاقات مسموح فقط عبر واجهة خدمة البطاقات المعتمدة."),
				frappe.PermissionError,
			)
		self.flags.ignore_save_passwords = True
		if not cint(self.serial_no):
			self.serial_no = int(getseries("ARCHIVE-CARD-SERIAL", 10))

	def validate(self):
		if not getattr(self.flags, "_allow_card_service_mutation", False):
			frappe.throw(
				_("تعديل البطاقات مسموح فقط عبر مسارات الخدمة المعتمدة."),
				frappe.PermissionError,
			)
		self.flags.ignore_save_passwords = True

		if self.status not in VALID_CARD_STATUSES:
			frappe.throw(_("حالة البطاقة غير صالحة."), frappe.ValidationError)

		if cint(self.copy_no) < 1:
			frappe.throw(_("رقم النسخة يجب أن يكون 1 أو أكبر."), frappe.ValidationError)

		if self.daily_limit is not None and flt(self.daily_limit) < 0:
			frappe.throw(_("الحد اليومي لا يقبل قيماً سالبة."), frappe.ValidationError)

		if not cint(self.is_deleted) and (self.is_new() or self.has_value_changed("daily_limit")):
			if self.daily_limit is None or flt(self.daily_limit) <= 0:
				frappe.throw(
					_("الحد اليومي مطلوب ويجب أن يكون أكبر من صفر."),
					frappe.ValidationError,
				)

		if cint(self.is_deleted):
			self.search_text = ""
		else:
			from archive.api.card_search import set_card_search_text

			set_card_search_text(self)

	def on_trash(self):
		frappe.throw(
			_("لا يُسمح بالحذف الفيزيائي للبطاقة. استخدم إجراء حذف البطاقة المعتمد."),
			frappe.PermissionError,
		)


def on_doctype_update():
	if not frappe.db.has_index("tabArchive Card", "uq_card_family_copy"):
		frappe.db.sql(
			"ALTER TABLE `tabArchive Card` ADD UNIQUE INDEX `uq_card_family_copy` (`card_family`, `copy_no`)"
		)
