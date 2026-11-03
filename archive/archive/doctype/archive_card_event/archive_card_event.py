# Copyright (c) 2026, Ayham-shmsan and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ArchiveCardEvent(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		card: DF.Link
		card_owner: DF.Data | None
		card_owner_name: DF.Data | None
		event_date: DF.Date
		event_type: DF.Literal["temporary_stop", "reactivated", "permanent_stop"]
		new_status: DF.Data
		previous_status: DF.Data
		reason: DF.SmallText | None
		recorded_at: DF.Datetime
		recorded_by: DF.Link
		recorded_by_name: DF.Data | None
		region: DF.Data | None
		region_name: DF.Data | None
		representative: DF.Data | None
		representative_name: DF.Data | None
	# end: auto-generated types

	def before_insert(self):
		if not getattr(self.flags, "_allow_card_event_insert", False):
			frappe.throw(
				_("سجل أحداث البطاقة مدار تلقائياً عبر النظام ولا يمكن إنشاؤه يدوياً."),
				frappe.PermissionError,
			)

	def validate(self):
		if not self.is_new():
			frappe.throw(
				_("سجل أحداث البطاقة غير قابل للتعديل بعد إنشائه (Append-only)."),
				frappe.PermissionError,
			)

	def on_trash(self):
		frappe.throw(
			_("لا يُسمح بحذف سجلات أحداث البطاقة."),
			frappe.PermissionError,
		)
