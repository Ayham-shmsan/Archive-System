from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document


class ArchiveCommercialRegistryLog(Document):
	def validate(self) -> None:
		if not self.is_new():
			frappe.throw(
				_("لا يمكن تعديل سجل مستخدم العملية للسجلات التجارية بعد إنشائه."),
				frappe.PermissionError,
			)

	def on_trash(self) -> None:
		frappe.throw(
			_("لا يمكن حذف سجل مستخدم العملية للسجلات التجارية."),
			frappe.PermissionError,
		)
