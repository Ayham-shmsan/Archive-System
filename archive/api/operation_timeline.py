import json

import frappe
from frappe import _
from frappe.utils import now_datetime
from typing import Any


# ============================================================
# Permission
# ============================================================

VIEW_OPERATION_TIMELINE_PERMISSION = (
    "view_operation_timeline"
)


# ============================================================
# Event types
# ============================================================

VALID_EVENT_TYPES = {
    "created",
    "data_extracted",
    "manual_edit",
    "status_change",
    "attachment_added",
    "attachment_deleted",
    "final_swift_added",
    "final_swift_deleted",
    "attachment_downloaded",
}


EVENT_TYPE_LABELS = {
    "created":
        "إنشاء العملية",

    "data_extracted":
        "استخراج البيانات",

    "manual_edit":
        "تعديل البيانات",

    "status_change":
        "تغيير الحالة",

    "attachment_added":
        "إضافة مرفق",

    "attachment_deleted":
        "حذف مرفق",

    "final_swift_added":
        "إرفاق السويفت النهائي",

    "final_swift_deleted":
        "حذف السويفت النهائي",
    "attachment_downloaded":
        "تنزيل مرفق",
}


# ============================================================
# Event sources
# ============================================================

VALID_EVENT_SOURCES = {
    "User",
    "System",
    "PDF Extraction",
}


EVENT_SOURCE_LABELS = {
    "User":
        "المستخدم",

    "System":
        "النظام",

    "PDF Extraction":
        "استخراج PDF",
}


# ============================================================
# Helpers
# ============================================================

def _serialize_details(
    details: Any,
) -> str | None:
    """
    تحويل تفاصيل الحدث إلى JSON
    قابل للحفظ في details_json.
    """

    if details is None:
        return None

    return json.dumps(
        details,
        ensure_ascii=False,
        default=str,
        separators=(
            ",",
            ":",
        ),
    )


def _parse_details(
    value: str | None,
) -> Any:

    if not value:
        return {}

    try:
        return json.loads(
            value
        )

    except Exception:
        # احتياط في حال وجود سجل قديم
        # غير محفوظ كـ JSON صحيح.
        return {
            "raw":
                value,
        }


def can_view_operation_timeline(
    operation=None,
) -> bool:
    """
    صلاحية مشاهدة مسار العملية.

    لا نمرر operation إلى has_permission
    لأن هذه الصلاحية مخصصة على مستوى
    Archive Operation.
    """

    user = (
        frappe.session.user
    )

    if user == "Administrator":
        return True

    return bool(
        frappe.has_permission(
            "Archive Operation",
            ptype=
                VIEW_OPERATION_TIMELINE_PERMISSION,
            user=
                user,
        )
    )


# ============================================================
# Create immutable log entry
# ============================================================

def log_operation_event(
    operation_name: str,
    event_type: str,
    event_title: str,
    *,
    details: Any = None,
    remarks: str | None = None,
    effective_date=None,
    event_source: str = "User",
    event_user: str | None = None,
    event_datetime=None,
) -> str:
    """
    تسجيل حدث واحد في مسار العملية.

    هذه الدالة داخلية ويجب استخدامها
    من APIs الخاصة بتطبيق Archive.

    ترجع اسم Archive Operation Log الجديد.
    """

    operation_name = (
        operation_name or ""
    ).strip()

    event_type = (
        event_type or ""
    ).strip()

    event_title = (
        event_title or ""
    ).strip()

    event_source = (
        event_source or ""
    ).strip()

    remarks = (
        remarks or ""
    ).strip()


    # ========================================================
    # Validation
    # ========================================================

    if not operation_name:
        frappe.throw(
            _(
                "اسم العملية مطلوب "
                "لتسجيل مسار العملية."
            )
        )


    if not frappe.db.exists(
        "Archive Operation",
        operation_name,
    ):
        frappe.throw(
            _(
                "العملية {0} غير موجودة."
            ).format(
                operation_name
            )
        )


    if (
        event_type
        not in VALID_EVENT_TYPES
    ):
        frappe.throw(
            _(
                "نوع حدث مسار العملية غير صحيح: {0}"
            ).format(
                event_type
            )
        )


    if not event_title:
        frappe.throw(
            _(
                "عنوان حدث مسار العملية مطلوب."
            )
        )


    if (
        event_source
        not in VALID_EVENT_SOURCES
    ):
        frappe.throw(
            _(
                "مصدر حدث مسار العملية غير صحيح: {0}"
            ).format(
                event_source
            )
        )


    # ========================================================
    # Audit identity
    # ========================================================

    event_user = (
        event_user
        or frappe.session.user
        or "Administrator"
    )

    event_datetime = (
        event_datetime
        or now_datetime()
    )


    # ========================================================
    # Create log
    # ========================================================

    log = frappe.new_doc(
        "Archive Operation Log"
    )

    log.operation = (
        operation_name
    )

    log.event_type = (
        event_type
    )

    log.event_title = (
        event_title
    )

    log.event_datetime = (
        event_datetime
    )

    log.event_user = (
        event_user
    )

    log.event_source = (
        event_source
    )

    log.effective_date = (
        effective_date
        or None
    )

    log.remarks = (
        remarks
        or None
    )

    log.details_json = (
        _serialize_details(
            details
        )
    )


    log.insert(
            ignore_permissions=True
        )

    return log.name


# ============================================================
# User names
# ============================================================

def _get_user_names(
    user_ids: set[str],
) -> dict[str, str]:

    if not user_ids:
        return {}

    users = frappe.get_all(
        "User",

        filters={
            "name": [
                "in",
                list(
                    user_ids
                ),
            ],
        },

        fields=[
            "name",
            "full_name",
            "first_name",
        ],
    )


    result = {}

    for user in users:

        result[
            user.name
        ] = (
            user.full_name
            or user.first_name
            or user.name
        )

    return result


# ============================================================
# Operation header
# ============================================================

def _serialize_operation_header(
    operation,
) -> dict[str, Any]:

    customer_name = None

    if operation.customer:
        customer_name = (
            frappe.db.get_value(
                "Archive Customer",
                operation.customer,
                "customer_name",
            )
        )


    return {
        "name":
            operation.name,

        "serial_no":
            operation.serial_no,

        "operation_no":
            operation.operation_no,

        "customer":
            operation.customer,

        "customer_name":
            customer_name
            or operation.customer,

        "reference_no":
            operation.reference_no,

        "status":
            operation.status,

        "request_date":
            operation.request_date,

        "transferring_bank":
            operation.transferring_bank,

        "creation":
            operation.creation,

        "modified":
            operation.modified,
    }


# ============================================================
# Get timeline
# ============================================================

@frappe.whitelist(
    methods=[
        "GET",
        "POST",
    ]
)
def get_operation_timeline(
    operation_name: str,
) -> dict[str, Any]:

    operation_name = (
        operation_name or ""
    ).strip()


    if not operation_name:
        frappe.throw(
            _(
                "اسم العملية مطلوب."
            )
        )


    # ========================================================
    # Operation + normal Read permission
    # ========================================================

    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )

    operation.check_permission(
        "read"
    )


    # ========================================================
    # Special timeline permission
    # ========================================================

    if not can_view_operation_timeline(
        operation
    ):
        frappe.throw(
            _(
                "ليس لديك صلاحية مشاهدة مسار العملية."
            ),
            frappe.PermissionError,
        )


    # ========================================================
    # Timeline entries
    #
    # نستخدم get_all لأن المستخدم لا يحتاج
    # صلاحية مباشرة على Archive Operation Log.
    # الحماية تمت أعلاه على Archive Operation.
    # ========================================================

    logs = frappe.get_all(
        "Archive Operation Log",

        filters={
            "operation":
                operation.name,
        },

        fields=[
            "name",
            "event_type",
            "event_title",
            "event_datetime",
            "event_user",
            "event_source",
            "effective_date",
            "remarks",
            "details_json",
            "creation",
        ],

        order_by=
            "event_datetime desc, creation desc",

        limit_page_length=
            0,
    )


    # ========================================================
    # User display names
    # ========================================================

    user_ids = {
        row.event_user
        for row in logs
        if row.event_user
    }

    user_names = (
        _get_user_names(
            user_ids
        )
    )


    # ========================================================
    # Serialize events
    # ========================================================

    events = []

    for row in logs:

        events.append(
            {
                "name":
                    row.name,

                "event_type":
                    row.event_type,

                "event_type_label":
                    EVENT_TYPE_LABELS.get(
                        row.event_type,
                        row.event_type,
                    ),

                "event_title":
                    row.event_title,

                "event_datetime":
                    row.event_datetime,

                "event_user":
                    row.event_user,

                "event_user_name":
                    user_names.get(
                        row.event_user,
                        row.event_user,
                    ),

                "event_source":
                    row.event_source,

                "event_source_label":
                    EVENT_SOURCE_LABELS.get(
                        row.event_source,
                        row.event_source,
                    ),

                "effective_date":
                    row.effective_date,

                "remarks":
                    row.remarks,

                "details":
                    _parse_details(
                        row.details_json
                    ),
            }
        )


    return {
        "operation":
            _serialize_operation_header(
                operation
            ),

        "events":
            events,

        "count":
            len(
                events
            ),

        "permissions": {
            "can_view_timeline":
                True,
        },
    }


