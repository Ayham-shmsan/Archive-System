from __future__ import annotations

import frappe

from frappe import _
from frappe.model.document import Document


class ArchiveDocumentAuthenticityCheck(
    Document
):
    """
    سجل فحص مستند مستقل.

    هذا السجل Audit Record:
    بعد إنشائه لا يسمح بتعديل نتيجة الفحص.
    """

    def validate(
        self,
    ):
        self._validate_risk_score()

        if not self.is_new():
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