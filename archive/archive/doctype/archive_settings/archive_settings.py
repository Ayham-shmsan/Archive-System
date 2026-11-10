import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr


class ArchiveSettings(Document):

	def validate(self):
		self.validate_default_fiscal_year()
		self.validate_final_swift_banks()

	def validate_default_fiscal_year(self):
		year_name = cstr(self.default_fiscal_year).strip()
		if not year_name:
			return

		if not frappe.db.exists("Archive Fiscal Year", year_name):
			frappe.throw(
				_("السنة المالية الافتراضية ({0}) غير موجودة.").format(frappe.bold(year_name)),
				frappe.ValidationError,
			)

		is_closed = cint(frappe.db.get_value("Archive Fiscal Year", year_name, "is_closed"))
		if is_closed:
			frappe.throw(
				_("لا يمكن اختيار سنة مالية مغلقة ({0}) لتكون السنة الافتراضية.").format(
					frappe.bold(year_name)
				),
				frappe.ValidationError,
			)

		old_default = cstr(
			frappe.db.get_single_value("Archive Settings", "default_fiscal_year")
		).strip()
		self._old_default_fiscal_year = old_default

	def on_update(self):
		old_default = getattr(self, "_old_default_fiscal_year", None)
		new_default = cstr(self.default_fiscal_year).strip()
		if old_default is not None and old_default != new_default and new_default:
			try:
				self.add_comment(
					"Info",
					text=_("تم تغيير السنة المالية الافتراضية من ({0}) إلى ({1}) بواسطة {2}.").format(
						old_default or "غير محدد", new_default, frappe.session.user
					),
				)
			except Exception:
				pass

	def validate_final_swift_banks(self):
		seen = set()

		for row in (
			self.final_swift_banks or []
		):
			if not row.bank:
				continue

			if row.bank in seen:
				frappe.throw(
					_(
						"البنك {0} مكرر في قائمة بنوك السويفت النهائي."
					).format(
						frappe.bold(
							row.bank
						)
					)
				)

			seen.add(
				row.bank
			)
