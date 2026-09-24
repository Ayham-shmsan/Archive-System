from __future__ import annotations

import re

import frappe
from frappe import _
from frappe.model.document import Document


def _normalize_name(value: str | None) -> str:
    """
    تنظيف اسم المندوب قبل الحفظ.
    """

    return re.sub(
        r"\s+",
        " ",
        (value or "").strip(),
    )


class ArchiveRepresentative(Document):
    def validate(self) -> None:
        self.representative_name = (
            _normalize_name(
                self.representative_name
            )
        )

        if not self.representative_name:
            frappe.throw(
                _("اسم المندوب مطلوب.")
            )
