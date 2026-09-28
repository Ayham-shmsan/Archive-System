from __future__ import annotations

import frappe
from frappe.utils import getdate


PENDING_DOCTYPE = (
    "Archive Pending Operation"
)


def execute() -> None:
    """
    يصلح الحالة التاريخية بعد إدخال closed_date:

    1) العملية المنتهية القديمة التي لا تملك closed_date
       تأخذ DATE(closed_at) كتاريخ تجاري افتراضي آمن.

    2) العملية المفتوحة لا يجوز أن تحتفظ closed_date
       في Current State. هذا يصلح السجلات التي أعيد فتحها
       أثناء وجود النسخة القديمة من reopen_pending_operation.

    لا نغيّر modified لأن هذا Data repair / backfill،
    وليس Business mutation نفذها المستخدم.
    """

    if not frappe.db.exists(
        "DocType",
        PENDING_DOCTYPE,
    ):
        return

    meta = frappe.get_meta(
        PENDING_DOCTYPE
    )

    required_fields = {
        "is_closed",
        "closed_date",
        "closed_at",
    }

    if any(
        not meta.get_field(fieldname)
        for fieldname
        in required_fields
    ):
        return

    closed_rows = frappe.get_all(
        PENDING_DOCTYPE,
        filters={
            "is_closed": 1,
            "closed_date": [
                "is",
                "not set",
            ],
            "closed_at": [
                "is",
                "set",
            ],
        },
        fields=[
            "name",
            "closed_at",
        ],
    )

    for row in closed_rows:
        if not row.closed_at:
            continue

        frappe.db.set_value(
            PENDING_DOCTYPE,
            row.name,
            "closed_date",
            getdate(
                row.closed_at
            ),
            update_modified=False,
        )

    reopened_rows = frappe.get_all(
        PENDING_DOCTYPE,
        filters={
            "is_closed": 0,
            "closed_date": [
                "is",
                "set",
            ],
        },
        pluck="name",
    )

    for name in reopened_rows:
        frappe.db.set_value(
            PENDING_DOCTYPE,
            name,
            "closed_date",
            None,
            update_modified=False,
        )