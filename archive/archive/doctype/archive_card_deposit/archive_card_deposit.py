from __future__ import annotations

import math

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr, flt, getdate
from archive.services.fiscal_year_permissions import (
	derive_fiscal_year_from_date,
	enforce_immutable_fiscal_fields,
	require_fiscal_permission,
)


class ArchiveCardDeposit(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account_number_snapshot: DF.Data | None
		audit_history_json: DF.LongText | None
		bank_name_snapshot: DF.Data | None
		bank_snapshot: DF.Link | None
		base_card_name_snapshot: DF.Data | None
		card: DF.Link
		card_name_snapshot: DF.Data | None
		card_number_snapshot: DF.Data | None
		copy_no_snapshot: DF.Int
		daily_limit_snapshot: DF.Float
		deposit_amount: DF.Float
		deposit_date: DF.Date
		last_modified_at: DF.Datetime | None
		last_modified_by: DF.Link | None
		previous_amount: DF.Float
		recorded_at: DF.Datetime | None
		recorded_by: DF.Link | None
		region_name_snapshot: DF.Data | None
		region_snapshot: DF.Link | None
		representative_name_snapshot: DF.Data | None
		representative_snapshot: DF.Link | None
	# end: auto-generated types

	def check_permission(self, permtype: str = "read", permlevel: str | int | None = None) -> None:
		from archive.api.deposits import has_deposit_permission

		if not has_deposit_permission(self, permtype, user=frappe.session.user):
			frappe.throw(
				_("ليست لديك صلاحية الوصول إلى شاشة الإيداعات أو بياناتها."),
				frappe.PermissionError,
			)

	def validate(self) -> None:
		if not self.card:
			frappe.throw(_("يجب تحديد البطاقة."), frappe.ValidationError)

		card_state = frappe.db.get_value(
			"Archive Card",
			self.card,
			["status", "is_deleted", "card_name"],
			as_dict=True,
		)
		if (
			not card_state
			or int(card_state.get("is_deleted") or 0) != 0
			or cstr(card_state.get("status")) != "نشطة"
		):
			frappe.throw(
				_("لا يمكن حفظ أو تعديل إيداع للبطاقة غير النشطة ({0}).").format(
					cstr((card_state or {}).get("card_name") or self.card)
				),
				frappe.ValidationError,
			)

		if not self.deposit_date:
			frappe.throw(_("يجب تحديد تاريخ الإيداع."), frappe.ValidationError)

		self.deposit_date = cstr(getdate(self.deposit_date))
		derived_year = derive_fiscal_year_from_date(self.deposit_date)

		if self.is_new():
			self.fiscal_year = derived_year
			if (
				not getattr(self.flags, "from_deposits_batch_api", False)
				and not getattr(frappe.flags, "in_migrate", False)
				and not getattr(frappe.flags, "in_patch", False)
			):
				require_fiscal_permission(self.fiscal_year, "add", check_open=True)
		else:
			enforce_immutable_fiscal_fields(self, has_sequence=False)
			if cstr(self.fiscal_year).strip() and derived_year != cstr(self.fiscal_year).strip():
				frappe.throw(
					_("لا يمكن تغيير تاريخ الإيداع إلى سنة مالية أخرى ({0} ← {1}).").format(
						self.fiscal_year, derived_year
					),
					frappe.ValidationError,
				)
			if not cstr(self.fiscal_year).strip():
				self.fiscal_year = derived_year
			if (
				not getattr(self.flags, "from_deposits_batch_api", False)
				and not getattr(frappe.flags, "in_migrate", False)
				and not getattr(frappe.flags, "in_patch", False)
			):
				require_fiscal_permission(self.fiscal_year, "edit", check_open=True)

		if (
			not getattr(self.flags, "from_deposits_batch_api", False)
			and not getattr(frappe.flags, "in_migrate", False)
			and not getattr(frappe.flags, "in_patch", False)
		):
			from archive.api.deposits import require_deposit_save_permission

			require_deposit_save_permission(self.deposit_date)

		raw_amount = self.deposit_amount
		if raw_amount is None or cstr(raw_amount).strip() == "":
			frappe.throw(_("مبلغ الإيداع غير صالح."), frappe.ValidationError)

		try:
			numeric_amount = float(raw_amount)
		except (TypeError, ValueError):
			frappe.throw(_("مبلغ الإيداع يجب أن يكون رقماً صحيحاً أو عشرياً صالحاً."), frappe.ValidationError)

		if not math.isfinite(numeric_amount) or numeric_amount < 0:
			frappe.throw(_("لا يُسمح بإدخال مبلغ إيداع سالب أو غير صالح."), frappe.ValidationError)

		self.deposit_amount = flt(numeric_amount, 2)

		duplicate = frappe.db.get_value(
			"Archive Card Deposit",
			{
				"card": self.card,
				"deposit_date": self.deposit_date,
				"name": ["!=", self.name or ""],
			},
			"name",
		)
		if duplicate:
			frappe.throw(
				_("يوجد سجل إيداع محفوظ مسبقاً لهذه البطاقة في نفس التاريخ."),
				frappe.DuplicateEntryError,
			)


def on_doctype_update() -> None:
	frappe.db.add_unique(
		"Archive Card Deposit",
		["card", "deposit_date"],
		constraint_name="unique_archive_card_deposit_card_date",
	)
	frappe.db.add_index(
		"Archive Card Deposit",
		["deposit_date", "card"],
		index_name="idx_archive_card_deposit_date_card",
	)
