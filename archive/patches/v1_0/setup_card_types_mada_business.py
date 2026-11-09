from __future__ import annotations

import frappe


def execute() -> None:
	"""
	Idempotent patch for the 'مدى / أعمال' card type system:
	- Reloads Archive Card, Archive Card Family, and Archive Card Deposit schemas.
	- Normalizes NULL card_type values to '' on existing legacy records without guessing
	  or altering any legacy card's type, copy_no, daily_limit, or historical deposits.
	"""
	frappe.reload_doc("archive", "doctype", "archive_card_family")
	frappe.reload_doc("archive", "doctype", "archive_card")
	frappe.reload_doc("archive", "doctype", "archive_card_deposit")

	if frappe.db.has_column("Archive Card", "card_type"):
		frappe.db.sql(
			"""
			UPDATE `tabArchive Card`
			SET card_type = ''
			WHERE card_type IS NULL
			"""
		)

	if frappe.db.has_column("Archive Card Family", "card_type"):
		frappe.db.sql(
			"""
			UPDATE `tabArchive Card Family`
			SET card_type = ''
			WHERE card_type IS NULL
			"""
		)
		from archive.archive.doctype.archive_card_family.archive_card_family import (
			on_doctype_update as update_card_family_indexes,
		)
		update_card_family_indexes()

	if frappe.db.has_column("Archive Card Deposit", "card_type_snapshot"):
		frappe.db.sql(
			"""
			UPDATE `tabArchive Card Deposit`
			SET card_type_snapshot = ''
			WHERE card_type_snapshot IS NULL
			"""
		)

	frappe.db.commit()
