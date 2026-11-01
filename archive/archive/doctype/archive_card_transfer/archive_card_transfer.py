# Copyright (c) 2026, Ayham-shmsan and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ArchiveCardTransfer(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		card: DF.Link
		event_type: DF.Literal["initial_assignment", "formal_transfer"]
		from_received_date: DF.Date | None
		from_region: DF.Link | None
		from_representative: DF.Link | None
		new_received_date: DF.Date
		performed_by: DF.Link
		sequence: DF.Int
		system_datetime: DF.Datetime
		to_region: DF.Link
		to_representative: DF.Link
		transfer_note: DF.SmallText | None
	# end: auto-generated types

	def before_insert(self):
		if not getattr(self.flags, "_allow_card_transfer_insert", False):
			frappe.throw(
				_("سجل نقل البطاقة مدار تلقائياً عبر النظام ولا يمكن إنشاؤه يدوياً."),
				frappe.PermissionError,
			)

	def validate(self):
		if not self.is_new():
			frappe.throw(
				_("سجل نقل البطاقة غير قابل للتعديل بعد إنشائه."),
				frappe.PermissionError,
			)

	def on_trash(self):
		frappe.throw(
			_("لا يُسمح بحذف سجل نقل البطاقة."),
			frappe.PermissionError,
		)


def on_doctype_update():
	if not frappe.db.has_index("tabArchive Card Transfer", "uq_card_transfer_seq"):
		frappe.db.sql(
			"ALTER TABLE `tabArchive Card Transfer` ADD UNIQUE INDEX `uq_card_transfer_seq` (`card`, `sequence`)"
		)
