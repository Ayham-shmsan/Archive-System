from __future__ import annotations

import frappe

from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr


class ArchiveDocumentAuthenticityCheck(
    Document
):
    """
    سجل فحص مستند مستقل.

    هذا السجل Audit Record:
    بعد إنشائه لا يسمح بتعديل نتيجة الفحص.
    """

    def before_insert(self):
        if hasattr(self, "fiscal_year") and not cstr(self.fiscal_year or "").strip():
            self.fiscal_year = None

    def validate(
        self,
    ):
        self._validate_risk_score()

        if self.is_new():
            if hasattr(self, "fiscal_year") and not cstr(self.fiscal_year or "").strip():
                self.fiscal_year = None
        else:
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
        if frappe.db.sql(
            """
            SHOW INDEX FROM `tabArchive Document Authenticity Check`
            WHERE Key_name = 'uniq_archive_auth_fy_seq'
            """
        ):
            frappe.db.sql(
                "ALTER TABLE `tabArchive Document Authenticity Check` DROP INDEX `uniq_archive_auth_fy_seq`"
            )
    except Exception:
        pass