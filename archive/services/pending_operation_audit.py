from __future__ import annotations

import json
from typing import Any

import frappe
from frappe.utils import now_datetime


PENDING_LOG_DOCTYPE = (
    "Archive Pending Operation Log"
)


def create_pending_operation_log(
    *,
    operation_name: str,
    event_type: str,
    event_title: str,
    event_source: str,
    details: dict[str, Any] | None = None,
    remarks: str | None = None,
    effective_datetime=None,
    event_user: str | None = None,
):
    """
    إنشاء Business Audit Log داخل نفس Transaction.

    لا يوجد commit هنا عمدًا.
    إذا فشلت الحركة المالية، يرجع معها الـLog أيضًا.
    """

    log = frappe.get_doc(
        {
            "doctype":
                PENDING_LOG_DOCTYPE,

            "pending_operation":
                operation_name,

            "event_type":
                event_type,

            "event_title":
                event_title,

            "event_datetime":
                now_datetime(),

            "event_user":
                event_user
                or frappe.session.user,

            "event_source":
                event_source,

            "effective_datetime":
                effective_datetime,

            "remarks":
                remarks,

            "details_json":
                _serialize_details(
                    details
                ),
        }
    )

    log.insert(
        ignore_permissions=True
    )

    return log


def log_status_change(
    *,
    operation_name: str,
    before_status: str,
    after_status: str,
    financial_summary: dict[str, Any],
    event_user: str | None = None,
):
    if (
        before_status
        == after_status
    ):
        return None

    return create_pending_operation_log(
        operation_name=operation_name,
        event_type="status_change",
        event_title="تغيير حالة العملية",
        event_source="System",
        event_user=event_user,
        details={
            "before_status":
                before_status,

            "after_status":
                after_status,

            "financial_summary":
                financial_summary,
        },
    )


def _serialize_details(
    details: dict[str, Any] | None,
) -> str:
    if not details:
        return ""

    return json.dumps(
        details,
        ensure_ascii=False,
        sort_keys=True,
        default=str,
        separators=(",", ":"),
    )