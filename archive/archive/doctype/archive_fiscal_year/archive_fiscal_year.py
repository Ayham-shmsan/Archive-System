from __future__ import annotations

import re
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr, getdate, now_datetime


YEAR_NAME_RE = re.compile(r"^\d{4}$")


def _require_fiscal_admin() -> None:
	if getattr(frappe.flags, "in_patch", False) or getattr(frappe.flags, "in_install", False) or getattr(frappe.flags, "in_migrate", False):
		return
	user = cstr(frappe.session.user or "Guest")
	if user == "Guest":
		frappe.throw(_("غير مصرح بإدارة السنوات المالية."), frappe.PermissionError)
	if user != "Administrator" and "System Manager" not in frappe.get_roles(user):
		frappe.throw(_("إدارة السنوات المالية متاحة لمدير النظام فقط."), frappe.PermissionError)


class ArchiveFiscalYear(Document):
	def before_validate(self) -> None:
		self.year_name = cstr(self.year_name).strip()
		if YEAR_NAME_RE.match(self.year_name):
			if not self.start_date:
				self.start_date = f"{self.year_name}-01-01"
			if not self.end_date:
				self.end_date = f"{self.year_name}-12-31"

	def validate(self) -> None:
		_require_fiscal_admin()
		self._validate_year_format_and_dates()
		self._validate_status_transition()

	def _validate_year_format_and_dates(self) -> None:
		if not YEAR_NAME_RE.match(self.year_name):
			frappe.throw(
				_("اسم السنة المالية يجب أن يتكون من 4 أرقام مثل 2026."),
				frappe.ValidationError,
			)
		year_int = int(self.year_name)
		if year_int < 1900 or year_int > 2100:
			frappe.throw(
				_("اسم السنة المالية خارج النطاق المسموح (1900 - 2100)."),
				frappe.ValidationError,
			)

		expected_start = getdate(f"{self.year_name}-01-01")
		expected_end = getdate(f"{self.year_name}-12-31")
		actual_start = getdate(self.start_date) if self.start_date else None
		actual_end = getdate(self.end_date) if self.end_date else None

		if actual_start != expected_start or actual_end != expected_end:
			frappe.throw(
				_("يجب أن تبدأ السنة المالية {0} في {1}-01-01 وتنتهي في {1}-12-31.").format(
					frappe.bold(self.year_name), self.year_name
				),
				frappe.ValidationError,
			)
		self.start_date = cstr(expected_start)
		self.end_date = cstr(expected_end)

	def _validate_status_transition(self) -> None:
		new_closed = cint(self.is_closed)
		if self.is_new():
			if new_closed:
				self.closed_at = self.closed_at or now_datetime()
				self.closed_by = self.closed_by or frappe.session.user
			self._status_transition = "created"
			return

		old_doc = self.get_doc_before_save()
		old_closed = cint(old_doc.is_closed) if old_doc else cint(
			frappe.db.get_value("Archive Fiscal Year", self.name, "is_closed")
		)

		if old_doc and cstr(old_doc.year_name) != self.year_name:
			frappe.throw(_("لا يمكن تغيير اسم السنة المالية بعد إنشائها."), frappe.ValidationError)

		if new_closed and not old_closed:
			default_year = cstr(
				frappe.db.get_single_value("Archive Settings", "default_fiscal_year")
			).strip()
			if default_year and default_year == self.year_name:
				frappe.throw(
					_("لا يمكن إغلاق السنة المالية الافتراضية ({0}) قبل اختيار سنة افتراضية أخرى مفتوحة.").format(
						frappe.bold(self.year_name)
					),
					frappe.ValidationError,
				)
			self.closed_at = now_datetime()
			self.closed_by = frappe.session.user
			self._status_transition = "closed"
		elif not new_closed and old_closed:
			self.reopened_at = now_datetime()
			self.reopened_by = frappe.session.user
			self._status_transition = "reopened"
		else:
			if old_doc:
				self.closed_at = old_doc.closed_at
				self.closed_by = old_doc.closed_by
				self.reopened_at = old_doc.reopened_at
				self.reopened_by = old_doc.reopened_by
			self._status_transition = None

	def after_insert(self) -> None:
		self._log_fiscal_event(_("تم إنشاء السنة المالية {0}.").format(self.year_name))

	def on_update(self) -> None:
		transition = getattr(self, "_status_transition", None)
		if transition == "closed":
			self._log_fiscal_event(
				_("تم إغلاق السنة المالية {0} بواسطة {1} في {2}.").format(
					self.year_name, self.closed_by, self.closed_at
				)
			)
		elif transition == "reopened":
			self._log_fiscal_event(
				_("تمت إعادة فتح السنة المالية {0} بواسطة {1} في {2}.").format(
					self.year_name, self.reopened_by, self.reopened_at
				)
			)

	def on_trash(self) -> None:
		_require_fiscal_admin()
		default_year = cstr(
			frappe.db.get_single_value("Archive Settings", "default_fiscal_year")
		).strip()
		if default_year == self.name:
			frappe.throw(
				_("لا يمكن حذف السنة المالية الافتراضية ({0}).").format(frappe.bold(self.name)),
				frappe.ValidationError,
			)

		linked_doctypes = (
			("Archive Operation", "العمليات"),
			("Archive Pending Operation", "المعلقات"),
			("Archive Card Deposit", "الإيداعات"),
			("Archive Document Authenticity Check", "فحص المستندات"),
		)
		for dt, label in linked_doctypes:
			if frappe.db.has_column(dt, "fiscal_year") and frappe.db.exists(dt, {"fiscal_year": self.name}):
				frappe.throw(
					_("لا يجوز حذف السنة المالية ({0}) لارتباطها بسجلات قائمة في ({1}).").format(
						frappe.bold(self.name), label
					),
					frappe.ValidationError,
				)

		if frappe.db.table_exists("Archive User Fiscal Permission") and frappe.db.exists(
			"Archive User Fiscal Permission",
			{"fiscal_year": self.name},
		):
			has_granted = frappe.db.sql(
				"""
				SELECT name FROM `tabArchive User Fiscal Permission`
				WHERE fiscal_year = %s
				  AND (can_view = 1 OR can_add = 1 OR can_edit = 1 OR can_delete = 1 OR can_export = 1)
				LIMIT 1
				""",
				(self.name,),
			)
			if has_granted:
				frappe.throw(
					_("لا يجوز حذف السنة المالية ({0}) لارتباطها بصلاحيات موظفين مفعّلة.").format(
						frappe.bold(self.name)
					),
					frappe.ValidationError,
				)
			frappe.db.delete("Archive User Fiscal Permission", {"fiscal_year": self.name})

	def _log_fiscal_event(self, text: str) -> None:
		try:
			self.add_comment("Info", text=text)
		except Exception:
			pass
