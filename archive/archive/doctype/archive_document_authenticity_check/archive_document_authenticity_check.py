from __future__ import annotations

import frappe

from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr
from archive.services.fiscal_year_permissions import (
    enforce_immutable_fiscal_fields,
    get_next_fiscal_sequence,
    resolve_target_fiscal_year_for_create,
)


class ArchiveDocumentAuthenticityCheck(
    Document
):
    """
    سجل فحص مستند مستقل.

    هذا السجل Audit Record:
    بعد إنشائه لا يسمح بتعديل نتيجة الفحص.
    """

    def before_insert(self):
        if not cstr(getattr(self, "fiscal_year", "")).strip():
            self.fiscal_year = resolve_target_fiscal_year_for_create(None)
        else:
            self.fiscal_year = resolve_target_fiscal_year_for_create(self.fiscal_year)

        if not cint(getattr(self, "fiscal_sequence", 0)):
            self.fiscal_sequence = get_next_fiscal_sequence(
                self.doctype,
                self.fiscal_year,
            )

    def validate(
        self,
    ):
        self._validate_risk_score()

        if self.is_new():
            if not cstr(getattr(self, "fiscal_year", "")).strip():
                self.fiscal_year = resolve_target_fiscal_year_for_create(None)
            else:
                self.fiscal_year = resolve_target_fiscal_year_for_create(self.fiscal_year)
            if not cint(getattr(self, "fiscal_sequence", 0)):
                self.fiscal_sequence = get_next_fiscal_sequence(
                    self.doctype,
                    self.fiscal_year,
                )
        else:
            enforce_immutable_fiscal_fields(self, has_sequence=True)
            frappe.throw(
                _(
                    "لا يمكن تعديل سجل فحص مستند بعد إنشائه."
                ),
                frappe.ValidationError,
            )


    def on_trash(
        self,
    ):
        frappe.throw(
            _(
                "لا يمكن حذف سجل فحص مستند."
            ),
            frappe.PermissionError,
        )


    def _validate_risk_score(
        self,
    ):
        score = int(
            self.risk_score or 0
        )

        if (
            score < 0
            or score > 100
        ):
            frappe.throw(
                _(
                    "درجة الخطورة يجب أن تكون بين 0 و100."
                )
            )


def on_doctype_update():
    try:
        frappe.db.add_unique(
            "Archive Document Authenticity Check",
            ["fiscal_year", "fiscal_sequence"],
            constraint_name="uniq_archive_auth_fy_seq",
        )
    except Exception:
        pass