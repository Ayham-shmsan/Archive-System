from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cstr

from archive.services.pending_operation_permissions import (
    _require_view_pending_operation,
)


PENDING_DOCTYPE = "Archive Pending Operation"

PENDING_LOG_DOCTYPE = (
    "Archive Pending Operation Log"
)


@frappe.whitelist(
    methods=["GET"]
)
def get_pending_operation_timeline(
    name: str,
) -> dict[str, Any]:
    name = cstr(
        name
    ).strip()

    if not name:
        frappe.throw(
            _("اسم العملية المعلقة مطلوب."),
            frappe.ValidationError,
        )

    operation = frappe.get_doc(
        PENDING_DOCTYPE,
        name,
    )

    # /*
    #  * أهم قاعدة أمنية:
    #  *
    #  * Timeline لا يملك Scope مستقل.
    #  * إذا لم يكن المستخدم يستطيع مشاهدة العملية،
    #  * لا يستطيع مشاهدة Logs الخاصة بها.
    #  */
    _require_view_pending_operation(
        operation
    )

    rows = frappe.get_all(
        PENDING_LOG_DOCTYPE,
        filters={
            "pending_operation":
                name,
        },
        fields=[
            "name",
            "event_type",
            "event_title",
            "event_datetime",
            "event_user",
            "event_source",
            "effective_datetime",
            "remarks",
            "details_json",
            "creation",
        ],
        order_by=(
            "event_datetime desc, "
            "creation desc"
        ),
    )

    user_ids = {
        cstr(row.event_user).strip()
        for row in rows
        if cstr(
            row.event_user
        ).strip()
    }

    user_map = _load_user_names(
        user_ids
    )

    events = []

    for row in rows:
        event_user = cstr(
            row.event_user
        ).strip()

        events.append(
            {
                "name":
                    row.name,

                "event_type":
                    row.event_type,

                "event_title":
                    row.event_title,

                "event_datetime":
                    row.event_datetime,

                "event_user":
                    event_user,

                "event_user_full_name":
                    (
                        user_map.get(
                            event_user
                        )
                        or event_user
                    ),

                "event_source":
                    row.event_source,

                "effective_datetime":
                    row.effective_datetime,

                "remarks":
                    row.remarks
                    or "",

                "details":
                    _parse_details(
                        row.details_json
                    ),
            }
        )

    return {
        "operation": {
            "name":
                operation.name,

            "serial_no":
                operation.serial_no,

            "card_name":
                operation.card_name,

            "card_number":
                operation.card_number,

            "currency":
                operation.currency,

            "status":
                operation.status,

            "total_suspended":
                operation.total_suspended,

            "total_returned":
                operation.total_returned,

            "remaining_amount":
                operation.remaining_amount,
        },

        "total":
            len(events),

        "events":
            events,
    }


def _load_user_names(
    user_ids,
) -> dict[str, str]:
    user_ids = list(
        {
            cstr(user_id).strip()
            for user_id
            in user_ids
            if cstr(
                user_id
            ).strip()
        }
    )

    if not user_ids:
        return {}

    rows = frappe.get_all(
        "User",
        filters={
            "name": [
                "in",
                user_ids,
            ],
        },
        fields=[
            "name",
            "full_name",
        ],
    )

    return {
        row.name:
            cstr(
                row.full_name
                or row.name
            ).strip()

        for row in rows
    }


def _parse_details(
    value,
) -> dict[str, Any]:
    if not value:
        return {}

    try:
        parsed = frappe.parse_json(
            value
        )

    except Exception:
        return {}

    if isinstance(
        parsed,
        dict,
    ):
        return parsed

    return {}