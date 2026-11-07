# Copyright (c) 2026, Ayham-shmsan and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ArchiveCardLog(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		card: DF.Link
		details_json: DF.Code | None
		event_datetime: DF.Datetime
		event_source: DF.Literal["user", "system"]
		event_title: DF.Data
		event_type: DF.Literal[
			"created",
			"manual_edit",
			"account_family_changed",
			"family_base_name_changed",
			"status_change",
			"formal_transfer",
			"front_image_updated",
			"back_image_updated",
			"image_blur_revealed",
			"daily_limit_changed",
			"pin_changed",
			"deleted",
		]
		event_user: DF.Link
		remarks: DF.SmallText | None
	# end: auto-generated types

	def before_insert(self):
		if not getattr(self.flags, "_allow_card_log_insert", False):
			frappe.throw(
				_("سجل أحداث البطاقة مدار تلقائياً عبر النظام ولا يمكن إنشاؤه يدوياً."),
				frappe.PermissionError,
			)

	def validate(self):
		if not self.is_new():
			frappe.throw(
				_("سجل أحداث البطاقة غير قابل للتعديل بعد إنشائه."),
				frappe.PermissionError,
			)

	def on_trash(self):
		frappe.throw(
			_("لا يُسمح بحذف سجل أحداث البطاقة."),
			frappe.PermissionError,
		)
