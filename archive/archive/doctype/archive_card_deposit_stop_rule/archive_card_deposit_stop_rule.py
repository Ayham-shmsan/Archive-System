from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr, getdate, now_datetime

from archive.services.fiscal_year_permissions import (
	derive_fiscal_year_from_date,
	enforce_immutable_fiscal_fields,
	require_fiscal_permission,
)


class ArchiveCardDepositStopRule(Document):
	def check_permission(self, permtype: str = "read", permlevel: str | int | None = None) -> None:
		if (
			getattr(self.flags, "ignore_permissions", False)
			or getattr(self.flags, "from_deposits_batch_api", False)
		):
			return
		from archive.api.deposits import has_stop_rule_permission

		if not has_stop_rule_permission(self, permtype, user=frappe.session.user):
			frappe.throw(
				_("ليست لديك صلاحية الوصول إلى قرارات «موقف لسبب» في شاشة الإيداعات."),
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
		if not card_state:
			frappe.throw(
				_("البطاقة ({0}) غير موجودة.").format(cstr(self.card)),
				frappe.ValidationError,
			)

		if (
			not getattr(frappe.flags, "in_migrate", False)
			and not getattr(frappe.flags, "in_patch", False)
			and (
				cint(card_state.get("is_deleted")) != 0
				or cstr(card_state.get("status")).strip() != "نشطة"
			)
		):
			frappe.throw(
				_("لا يمكن تسجيل قرار «موقف لسبب» للبطاقة غير النشطة ({0}).").format(
					cstr(card_state.get("card_name") or self.card)
				),
				frappe.ValidationError,
			)

		if not self.effective_date:
			frappe.throw(_("يجب تحديد تاريخ بداية سريان القرار."), frappe.ValidationError)

		self.effective_date = cstr(getdate(self.effective_date))
		derived_year = derive_fiscal_year_from_date(self.effective_date)

		if self.is_new():
			if cstr(self.fiscal_year).strip() and cstr(self.fiscal_year).strip() != derived_year:
				frappe.throw(
					_("تاريخ القرار ({0}) لا ينتمي إلى السنة المالية ({1}).").format(
						self.effective_date, self.fiscal_year
					),
					frappe.ValidationError,
				)
			self.fiscal_year = derived_year
			self.revision = max(1, cint(self.revision or 1))
			if (
				not getattr(self.flags, "from_deposits_batch_api", False)
				and not getattr(frappe.flags, "in_migrate", False)
				and not getattr(frappe.flags, "in_patch", False)
			):
				require_fiscal_permission(self.fiscal_year, "add", check_open=True)
		else:
			enforce_immutable_fiscal_fields(self, has_sequence=False)
			db_prev = frappe.db.get_value(
				"Archive Card Deposit Stop Rule",
				self.name,
				["card", "effective_date", "fiscal_year"],
				as_dict=True,
			)
			if db_prev:
				if cstr(db_prev.get("card")) != cstr(self.card) or cstr(
					getdate(db_prev.get("effective_date"))
				) != self.effective_date:
					frappe.throw(
						_("لا يمكن تغيير البطاقة أو تاريخ السريان لقرار «موقف لسبب» محفوظ مسبقاً."),
						frappe.ValidationError,
					)
			if cstr(self.fiscal_year).strip() and derived_year != cstr(self.fiscal_year).strip():
				frappe.throw(
					_("لا يمكن نقل قرار «موقف لسبب» إلى سنة مالية أخرى ({0} ← {1}).").format(
						self.fiscal_year, derived_year
					),
					frappe.ValidationError,
				)
			if not cstr(self.fiscal_year).strip():
				self.fiscal_year = derived_year
			self.revision = max(1, cint(self.revision or 1))
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
			from archive.api.deposits import require_stopped_reason_permission

			require_stopped_reason_permission(self.effective_date)

		self.stopped_for_reason = 1 if cint(self.stopped_for_reason) else 0
		if not self.decided_by:
			self.decided_by = cstr(frappe.session.user or "Administrator")
		if not self.decided_at:
			self.decided_at = now_datetime()

		duplicate = frappe.db.get_value(
			"Archive Card Deposit Stop Rule",
			{
				"card": self.card,
				"fiscal_year": self.fiscal_year,
				"effective_date": self.effective_date,
				"name": ["!=", self.name or ""],
			},
			"name",
		)
		if duplicate:
			frappe.throw(
				_("يوجد قرار «موقف لسبب» مسجّل مسبقاً لهذه البطاقة في نفس التاريخ."),
				frappe.DuplicateEntryError,
			)

	def on_trash(self) -> None:
		if (
			getattr(frappe.flags, "in_migrate", False)
			or getattr(frappe.flags, "in_patch", False)
			or getattr(self.flags, "allow_stop_rule_delete", False)
		):
			return
		frappe.throw(
			_("لا يُسمح بحذف قرارات «موقف لسبب» التاريخية حفاظاً على سلامة السجل الزمني."),
			frappe.PermissionError,
		)


def on_doctype_update() -> None:
	frappe.db.add_unique(
		"Archive Card Deposit Stop Rule",
		["card", "fiscal_year", "effective_date"],
		constraint_name="unique_acd_stop_rule_card_fy_date",
	)
	frappe.db.add_index(
		"Archive Card Deposit Stop Rule",
		["fiscal_year", "card", "effective_date"],
		index_name="idx_acd_stop_rule_fy_card_date",
	)
