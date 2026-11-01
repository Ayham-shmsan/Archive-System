# Copyright (c) 2026, Ayham-shmsan and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ArchiveCardFamily(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account_number: DF.Data
		account_number_normalized: DF.Data
		base_card_name: DF.Data
		highest_copy_no: DF.Int
	# end: auto-generated types

	def before_insert(self):
		if not getattr(self.flags, "_allow_card_family_mutation", False):
			frappe.throw(
				_("سجل عائلة البطاقات مدار تلقائياً عبر النظام ولا يمكن إنشاؤه يدوياً."),
				frappe.PermissionError,
			)

	def validate(self):
		if not getattr(self.flags, "_allow_card_family_mutation", False):
			frappe.throw(
				_("سجل عائلة البطاقات مدار تلقائياً عبر النظام ولا يمكن تعديله مباشرة."),
				frappe.PermissionError,
			)
		self.account_number = (self.account_number or "").strip()
		self.account_number_normalized = (self.account_number_normalized or "").strip()
		self.base_card_name = (self.base_card_name or "").strip()
		if not self.is_new() and self.has_value_changed("account_number_normalized"):
			frappe.throw(
				_("هوية رقم الحساب الموحد لعائلة البطاقات ثابتة ولا يمكن تحويلها لحساب آخر."),
				frappe.ValidationError,
			)
		if not self.account_number or not self.account_number_normalized:
			frappe.throw(_("رقم الحساب مطلوب لعائلة البطاقات."), frappe.ValidationError)
		if not self.base_card_name:
			frappe.throw(_("الاسم الأساسي للعائلة مطلوب."), frappe.ValidationError)
		if int(self.highest_copy_no or 0) < 0:
			frappe.throw(_("أعلى رقم نسخة لا يمكن أن يكون سالباً."), frappe.ValidationError)

	def on_trash(self):
		frappe.throw(
			_("لا يُسمح بحذف سجل عائلة البطاقات حفاظاً على تسلسل النسخ وسجل التدقيق."),
			frappe.PermissionError,
		)
