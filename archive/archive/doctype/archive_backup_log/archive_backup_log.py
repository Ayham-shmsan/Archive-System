from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document


class ArchiveBackupLog(Document):
	def check_permission(self, permtype: str = "read", permlevel: str | int | None = None) -> None:
		if (
			getattr(self.flags, "ignore_permissions", False)
			or getattr(self.flags, "from_backup_engine", False)
		):
			return
		from archive.services.backup_manager import has_backup_log_permission

		if not has_backup_log_permission(self, permtype, user=frappe.session.user):
			frappe.throw(
				_("ليست لديك صلاحية الوصول إلى سجل النسخ الاحتياطي."),
				frappe.PermissionError,
			)

	def validate(self) -> None:
		if (
			getattr(self.flags, "from_backup_engine", False)
			or getattr(frappe.flags, "in_migrate", False)
			or getattr(frappe.flags, "in_patch", False)
		):
			return
		frappe.throw(
			_("لا يُسمح بإنشاء أو تعديل سجلات النسخ الاحتياطي يدوياً."),
			frappe.PermissionError,
		)

	def on_trash(self) -> None:
		if (
			getattr(self.flags, "from_backup_engine", False)
			or getattr(frappe.flags, "in_migrate", False)
			or getattr(frappe.flags, "in_patch", False)
		):
			return
		frappe.throw(
			_("لا يُسمح بحذف سجلات النسخ الاحتياطي حفاظاً على سجل التدقيق."),
			frappe.PermissionError,
		)


def on_doctype_update() -> None:
	frappe.db.add_index(
		"Archive Backup Log",
		["status", "started_at"],
		index_name="idx_archive_backup_log_status_started",
	)
