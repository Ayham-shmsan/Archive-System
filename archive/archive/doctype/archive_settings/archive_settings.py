import frappe
from frappe import _
from frappe.model.document import Document


class ArchiveSettings(Document):

	def validate(self):
		self.validate_final_swift_banks()

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