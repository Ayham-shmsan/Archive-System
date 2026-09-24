from __future__ import annotations

import re

import frappe
from frappe import _
from frappe.model.document import Document


def _normalize_name(value: str | None) -> str:
    """
    تنظيف الاسم قبل الحفظ:
    - إزالة الفراغات من البداية والنهاية.
    - دمج الفراغات المتكررة إلى فراغ واحد.
    """

    return re.sub(
        r"\s+",
        " ",
        (value or "").strip(),
    )


class ArchiveCardOwner(Document):
    def validate(self) -> None:
        self.card_owner_name = _normalize_name(
            self.card_owner_name
        )

        if not self.card_owner_name:
            frappe.throw(
                _("اسم مالك البطاقة مطلوب.")
            )
