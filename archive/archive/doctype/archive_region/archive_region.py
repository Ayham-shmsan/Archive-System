from __future__ import annotations

import re

import frappe
from frappe import _
from frappe.model.document import Document


def _normalize_name(value: str | None) -> str:
    """
    تنظيف اسم المنطقة قبل الحفظ.
    """

    return re.sub(
        r"\s+",
        " ",
        (value or "").strip(),
    )


class ArchiveRegion(Document):
    def validate(self) -> None:
        self.region_name = _normalize_name(
            self.region_name
        )

        if not self.region_name:
            frappe.throw(
                _("اسم المنطقة مطلوب.")
            )

        existing = frappe.db.exists(
            "Archive Region",
            {
                "region_name":
                    self.region_name,
            },
        )

        if (
            existing
            and existing != self.name
        ):
            frappe.throw(
                _("اسم المنطقة موجود مسبقًا.")
            )
