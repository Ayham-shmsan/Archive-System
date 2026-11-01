# Copyright (c) 2026, Ayham-shmsan and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ArchiveCardFamily(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account_number: DF.Data
		account_number_normalized: DF.Data
		bank: DF.Link
		base_card_name: DF.Data
		highest_copy_no: DF.Int
	# end: auto-generated types

	def before_insert(self):
		if not getattr(self.flags, "_allow_card_family_mutation", False):
			frappe.throw(
				_("سجل عائلة البطاقات مدار تلقائياً عبر النظام ولا يمكن إنشاؤه يدوياً."),
				frappe.PermissionError,
			)

	def validate(self):
		if not getattr(self.flags, "_allow_card_family_mutation", False):
			frappe.throw(
				_("سجل عائلة البطاقات مدار تلقائياً عبر النظام ولا يمكن تعديله مباشرة."),
				frappe.PermissionError,
			)
		self.account_number = (self.account_number or "").strip()
		self.account_number_normalized = (self.account_number_normalized or "").strip()
		self.base_card_name = (self.base_card_name or "").strip()
		self.bank = (self.bank or "").strip()
		if not self.is_new() and self.has_value_changed("account_number_normalized"):
			frappe.throw(
				_("هوية رقم الحساب الموحد لعائلة البطاقات ثابتة ولا يمكن تحويلها لحساب آخر."),
				frappe.ValidationError,
			)
		if not self.account_number or not self.account_number_normalized:
			frappe.throw(_("رقم الحساب مطلوب لعائلة البطاقات."), frappe.ValidationError)
		if not self.base_card_name:
			frappe.throw(_("الاسم الأساسي للعائلة مطلوب."), frappe.ValidationError)
		if not self.bank:
			frappe.throw(_("البنك مطلوب لعائلة البطاقات."), frappe.ValidationError)
		if int(self.highest_copy_no or 0) < 0:
			frappe.throw(_("أعلى رقم نسخة لا يمكن أن يكون سالباً."), frappe.ValidationError)

	def on_trash(self):
		frappe.throw(
			_("لا يُسمح بحذف سجل عائلة البطاقات حفاظاً على تسلسل النسخ وسجل التدقيق."),
			frappe.PermissionError,
		)


def on_doctype_update():
	old_unique = frappe.db.sql(
		"""
		SHOW INDEX FROM `tabArchive Card Family`
		WHERE Key_name = 'account_number_normalized' AND Non_unique = 0
		"""
	)
	if old_unique:
		frappe.db.sql_ddl(
			"ALTER TABLE `tabArchive Card Family` DROP INDEX `account_number_normalized`, ADD INDEX `idx_account_number_normalized` (`account_number_normalized`)"
		)

	_backfill_and_reconcile_family_triplets()

	if not frappe.db.has_index("tabArchive Card Family", "uq_card_family_identity"):
		frappe.db.sql_ddl(
			"ALTER TABLE `tabArchive Card Family` ADD UNIQUE INDEX `uq_card_family_identity` (`account_number_normalized`, `bank`, `base_card_name`)"
		)


def _backfill_and_reconcile_family_triplets():
	if not frappe.db.has_column("Archive Card Family", "bank"):
		return

	families = frappe.db.sql(
		"""
		SELECT name, account_number, account_number_normalized, base_card_name, bank, highest_copy_no
		FROM `tabArchive Card Family`
		ORDER BY name ASC
		""",
		as_dict=True,
	)
	default_bank = frappe.db.get_value("Archive Bank", {}, "name") or ""

	for fam in families:
		cards = frappe.db.sql(
			"""
			SELECT name, copy_no, base_card_name, account_number, account_number_normalized, bank
			FROM `tabArchive Card`
			WHERE card_family = %(fam)s
			ORDER BY copy_no ASC, creation ASC
			""",
			{"fam": fam.name},
			as_dict=True,
		)
		if not cards:
			if not (fam.bank or "").strip() and default_bank:
				frappe.db.sql(
					"UPDATE `tabArchive Card Family` SET bank = %(bank)s WHERE name = %(name)s",
					{"bank": default_bank, "name": fam.name},
				)
			continue

		groups: list[tuple[tuple[str, str, str], list[dict]]] = []
		group_map: dict[tuple[str, str, str], list[dict]] = {}
		for c in cards:
			c_base = (c.base_card_name or fam.base_card_name or "").strip()
			c_norm = (c.account_number_normalized or fam.account_number_normalized or "").strip()
			c_bank = (c.bank or fam.bank or default_bank or "").strip()
			key = (c_base.casefold(), c_norm, c_bank)
			if key not in group_map:
				grp: list[dict] = []
				group_map[key] = grp
				groups.append((key, grp))
			group_map[key].append(c)

		first_key, first_cards = groups[0]
		first_sample = first_cards[0]
		first_bank = (first_sample.bank or fam.bank or default_bank or "").strip()
		first_base = (first_sample.base_card_name or fam.base_card_name or "").strip()
		first_max_copy = max(int(c.copy_no or 1) for c in first_cards)
		resolved_first_highest = (
			first_max_copy if len(groups) > 1 else max(int(fam.highest_copy_no or 1), first_max_copy)
		)

		if (
			(fam.bank or "").strip() != first_bank
			or (fam.base_card_name or "").strip() != first_base
			or int(fam.highest_copy_no or 0) != resolved_first_highest
		):
			frappe.db.sql(
				"""
				UPDATE `tabArchive Card Family`
				SET bank = %(bank)s, base_card_name = %(base)s, highest_copy_no = %(highest)s
				WHERE name = %(name)s
				""",
				{
					"bank": first_bank,
					"base": first_base,
					"highest": resolved_first_highest,
					"name": fam.name,
				},
			)

		for _, extra_cards in groups[1:]:
			sample = extra_cards[0]
			ex_base = (sample.base_card_name or fam.base_card_name or "").strip()
			ex_acc = (sample.account_number or fam.account_number or "").strip()
			ex_norm = (sample.account_number_normalized or fam.account_number_normalized or "").strip()
			ex_bank = (sample.bank or default_bank or "").strip()
			ex_max_copy = max(int(c.copy_no or 1) for c in extra_cards)

			existing_target = frappe.db.sql(
				"""
				SELECT name, highest_copy_no
				FROM `tabArchive Card Family`
				WHERE account_number_normalized = %(norm)s
				  AND bank = %(bank)s
				  AND LOWER(base_card_name) = LOWER(%(base)s)
				LIMIT 1
				""",
				{"norm": ex_norm, "bank": ex_bank, "base": ex_base},
				as_dict=True,
			)
			if existing_target:
				target_fam_name = existing_target[0].name
				if ex_max_copy > int(existing_target[0].highest_copy_no or 0):
					frappe.db.sql(
						"UPDATE `tabArchive Card Family` SET highest_copy_no = %(h)s WHERE name = %(n)s",
						{"h": ex_max_copy, "n": target_fam_name},
					)
			else:
				new_fam = frappe.new_doc("Archive Card Family")
				new_fam.account_number = ex_acc
				new_fam.account_number_normalized = ex_norm
				new_fam.base_card_name = ex_base
				new_fam.bank = ex_bank
				new_fam.highest_copy_no = ex_max_copy
				new_fam.flags._allow_card_family_mutation = True
				new_fam.insert(ignore_permissions=True)
				target_fam_name = new_fam.name

			card_names = [c.name for c in extra_cards]
			frappe.db.sql(
				"UPDATE `tabArchive Card` SET card_family = %(fam)s WHERE name IN %(names)s",
				{"fam": target_fam_name, "names": tuple(card_names)},
			)

