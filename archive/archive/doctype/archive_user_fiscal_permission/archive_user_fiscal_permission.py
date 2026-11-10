from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr


class ArchiveUserFiscalPermission(Document):
	def validate(self) -> None:
		if not (
			getattr(frappe.flags, "in_patch", False)
			or getattr(frappe.flags, "in_install", False)
			or getattr(frappe.flags, "in_migrate", False)
		):
			user = cstr(frappe.session.user or "Guest")
			if user != "Administrator" and "System Manager" not in frappe.get_roles(user):
				frappe.throw(
					_("لا تملك الصلاحية الإدارية لتعديل مصفوفة صلاحيات السنوات المالية."),
					frappe.PermissionError,
				)

		self.parent_user = cstr(self.parent_user).strip()
		self.fiscal_year = cstr(self.fiscal_year).strip()
		if not self.parent_user or not self.fiscal_year:
			frappe.throw(_("يجب تحديد المستخدم والسنة المالية."), frappe.ValidationError)

		self.can_view = 1 if cint(self.can_view) else 0
		self.can_add = 1 if cint(self.can_add) else 0
		self.can_edit = 1 if cint(self.can_edit) else 0
		self.can_delete = 1 if cint(self.can_delete) else 0
		self.can_export = 1 if cint(self.can_export) else 0

		dup = frappe.db.get_value(
			"Archive User Fiscal Permission",
			{
				"parent_user": self.parent_user,
				"fiscal_year": self.fiscal_year,
				"name": ["!=", self.name or ""],
			},
			"name",
		)
		if dup:
			frappe.throw(
				_("يوجد سجل صلاحيات مسجل مسبقاً للمستخدم ({0}) في السنة المالية ({1}).").format(
					self.parent_user, self.fiscal_year
				),
				frappe.DuplicateEntryError,
			)


def on_doctype_update() -> None:
	frappe.db.add_unique(
		"Archive User Fiscal Permission",
		["parent_user", "fiscal_year"],
		constraint_name="uniq_archive_user_fiscal_perm",
	)
