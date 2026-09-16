import frappe
from frappe import _
from pathlib import Path
from frappe.utils import getdate, now_datetime , cstr,cint
from typing import Any
from archive.api.operation_timeline import (
    log_operation_event,
    can_view_operation_timeline,
)

from archive.api.operation_search import (
    search_operation_names,
)


MANUAL_FIELD_LABELS = {
    "operation_no":
        "رقم العملية",

    "customer":
        "اسم العميل",

    "customer_rate":
        "سعر العميل",

    "from_account":
        "عن طريق",

    "request_date":
        "تاريخ الطلب",

    "swift_code":
        "رمز SWIFT",

    "country":
        "الجهة (الدولة)",

    "transferring_bank":
        "اسم البنك المحول",
}


PDF_EXTRACTED_FIELD_LABELS = {
    "sender_account":
        "رقم حساب المرسل",

    "beneficiary_account":
        "رقم حساب المستفيد",

    "amount":
        "المبلغ",

    "currency":
        "العملة",

    "bank_transfer_rate":
        "سعر البنك المحول",

    "beneficiary_name":
        "اسم المستفيد",

    "beneficiary_bank":
        "اسم بنك المستفيد",

    "execution_datetime":
        "تاريخ تنفيذ العملية",

    "reference_no":
        "رقم المرجع",

    "sender_name":
        "اسم المرسل",

    "notes":
        "ملاحظات",
}
# ============================================================
# Operation fields
# الحقول التي يسمح باستقبالها عند إنشاء عملية جديدة
# ============================================================

OPERATION_FIELDS = {
    "operation_no",
    "customer",
    "amount",
    "currency",
    "customer_rate",
    "beneficiary_name",
    "beneficiary_account",
    "beneficiary_bank",
    "swift_code",
    "country",
    "sender_name",
    "sender_account",
    "execution_datetime",
    "transferring_bank",
    "request_date",
    "from_account",
    "reference_no",
    "bank_transfer_rate",
    "notes",
    "allow_duplicate_operation_no",
    "is_blocked_operation",
}
MAX_FINAL_SWIFT_FILES = 10

FINAL_SWIFT_ALLOWED_EXTENSIONS = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
    ".avif",
}
# ============================================================
# Statuses
# ============================================================

VALID_STATUSES = (
    "غير مؤكدة",
    "مؤكدة",
    "مرتجعة",
    "محضورة",
)

ACTION_STATUSES = (
    "غير مؤكدة",
    "مؤكدة",
    "مرتجعة",
    "محضورة",
)

MANUAL_EDITABLE_FIELDS = {
    "operation_no",
    "customer",
    "customer_rate",
    "from_account",
    "request_date",
    "swift_code",
    "country",
    "transferring_bank",
}


# ============================================================
# Custom permission types
# ============================================================

INITIAL_STATUS_PERMISSION = (
    "change_initial_status"
)

ADVANCED_STATUS_PERMISSION = (
    "change_advanced_status"
)

FINAL_SWIFT_PERMISSION = (
    "attach_final_swift"
)

MANAGE_ATTACHMENTS_PERMISSION = (
    "manage_attachments"
)


# ============================================================
# Helpers
# ============================================================

def _parse(
    value: Any,
    default: Any,
) -> Any:

    if value is None:
        return default

    if isinstance(value, str):
        return frappe.parse_json(
            value
        )

    return value


def _get_uploaded_file(
    file_url: str,
):
    file_name = frappe.db.get_value(
        "File",
        {
            "file_url": file_url,
        },
        "name",
    )

    if not file_name:
        frappe.throw(
            _(
                "الملف غير موجود: {0}"
            ).format(
                file_url
            )
        )

    file_doc = frappe.get_doc(
        "File",
        file_name,
    )

    user = frappe.session.user

    is_system_manager = (
        "System Manager"
        in frappe.get_roles(
            user
        )
    )

    if (
        file_doc.owner != user
        and not is_system_manager
    ):
        frappe.throw(
            _(
                "لا تملك صلاحية استخدام هذا الملف."
            ),
            frappe.PermissionError,
        )

    if (
        file_doc.attached_to_doctype
        or file_doc.attached_to_name
    ):
        frappe.throw(
            _(
                "الملف مرتبط بمستند آخر بالفعل: {0}"
            ).format(
                file_doc.file_name
            )
        )

    return file_doc


def get_final_swift_count(
    operation,
) -> int:

    attachments = getattr(
        operation,
        "attachments",
        None,
    )

    if attachments is not None:
        return sum(
            1
            for row in attachments
            if row.is_final_swift
        )

    if not operation.name:
        return 0

    return frappe.db.count(
        "Archive Operation Attachment",
        {
            "parent":
                operation.name,

            "parenttype":
                "Archive Operation",

            "parentfield":
                "attachments",

            "is_final_swift":
                1,
        },
    )
def can_manage_operation_attachments(
    operation=None,
) -> bool:
    """
    صلاحية إدارة مرفقات Archive Operation.
    """

    user = frappe.session.user

    if user == "Administrator":
        return True

    return bool(
        frappe.has_permission(
            "Archive Operation",
            ptype=
                MANAGE_ATTACHMENTS_PERMISSION,
            user=
                user,
        )
    )

def get_final_swift_banks() -> set[str]:

    settings = frappe.get_single(
        "Archive Settings"
    )

    return {
        row.bank
        for row in (
            settings.final_swift_banks or []
        )
        if row.bank
    }


def get_final_swift_state(
    operation,
    configured_banks: set[str] | None = None,
    final_swift_count: int | None = None,
) -> dict[str, Any]:

    if configured_banks is None:
        configured_banks = (
            get_final_swift_banks()
        )

    if final_swift_count is None:
        final_swift_count = (
            get_final_swift_count(
                operation
            )
        )

    final_swift_required = bool(
        operation.transferring_bank
        and operation.transferring_bank
        in configured_banks
    )

    has_final_swift = (
        final_swift_count > 0
    )

    return {
        "final_swift_required":
            final_swift_required,

        "has_final_swift":
            has_final_swift,

        "final_swift_pending":
            (
                final_swift_required
                and not has_final_swift
            ),

        "final_swift_count":
            final_swift_count,

        "final_swift_limit":
            MAX_FINAL_SWIFT_FILES,

        "final_swift_remaining":
            max(
                MAX_FINAL_SWIFT_FILES
                - final_swift_count,
                0,
            ),
    }

def can_attach_final_swift(
    operation=None,
) -> bool:
    """
    صلاحية إرفاق السويفت النهائي
    هي صلاحية على DocType Archive Operation.

    لا نمرر operation إلى has_permission
    لأن قائمة العمليات ترجع frappe._dict
    وليس Document كاملاً.
    """

    user = frappe.session.user

    if user == "Administrator":
        return True

    return bool(
        frappe.has_permission(
            "Archive Operation",
            ptype=
                FINAL_SWIFT_PERMISSION,
            user=
                user,
        )
    )

def can_change_operation_status(
    current_status: str,
) -> bool:
    """
    صلاحية تغيير حالة العملية مستقلة
    عن Read و Write.

    غير مؤكدة:
        تحتاج change_initial_status

    باقي الحالات:
        تحتاج change_advanced_status
    """

    user = frappe.session.user

    if user == "Administrator":
        return True


    if (
        current_status
        in {
            "معلقة",
            "غير مؤكدة",
        }
    ):
        return bool(
            frappe.has_permission(
                "Archive Operation",
                ptype=
                    INITIAL_STATUS_PERMISSION,
                user=
                    user,
            )
        )


    return bool(
        frappe.has_permission(
            "Archive Operation",
            ptype=
                ADVANCED_STATUS_PERMISSION,
            user=
                user,
        )
    )

def can_release_pending_operation() -> bool:
    """
    صلاحية نقل العملية:
        معلقة -> غير مؤكدة

    تستخدم نفس صلاحية المرحلة الأولية.
    """

    user = frappe.session.user

    if user == "Administrator":
        return True

    return bool(
        frappe.has_permission(
            "Archive Operation",
            ptype=
                INITIAL_STATUS_PERMISSION,
            user=
                user,
        )
    )
# ============================================================
# Serialize operation for view
# ============================================================

def serialize_operation_for_view(
    operation,
) -> dict[str, Any]:

    attachments = []

    for row in (
        operation.attachments
        or []
    ):
        attachments.append(
            {
                "name":
                    row.name,
                "file":
                    row.file,

                "file_name":
                    row.file_name,

                "is_extraction_source":
                    bool(
                        row.is_extraction_source
                    ),
                "is_final_swift":
                    bool(
                        row.is_final_swift
                    ),
            }
        )

    status_history = []

    for row in (
        operation.status_history
        or []
    ):
        status_history.append(
            {
                "from_status":
                    row.from_status,

                "to_status":
                    row.to_status,

                "status_effective_datetime":
                    row.status_effective_datetime,

                "system_datetime":
                    row.system_datetime,

                "changed_by":
                    row.changed_by,

                "remarks":
                    row.remarks,
            }
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

        "amount":
            operation.amount,

        "currency":
            operation.currency,

        "customer_rate":
            operation.customer_rate,

        "beneficiary_name":
            operation.beneficiary_name,

        "beneficiary_account":
            operation.beneficiary_account,

        "beneficiary_bank":
            operation.beneficiary_bank,

        "swift_code":
            operation.swift_code,

        "country":
            operation.country,

        "sender_name":
            operation.sender_name,

        "sender_account":
            operation.sender_account,

        "execution_datetime":
            operation.execution_datetime,

        "transferring_bank":
            operation.transferring_bank,

        "request_date":
            operation.request_date,

        "from_account":
            operation.from_account,

        "reference_no":
            operation.reference_no,

        "bank_transfer_rate":
            operation.bank_transfer_rate,

        "notes":
            operation.notes,

        "status":
            operation.status,

        "status_effective_datetime":
            operation.status_effective_datetime,

        "status_changed_at":
            operation.status_changed_at,

        "status_changed_by":
            operation.status_changed_by,

        "extraction_source_file":
            operation.extraction_source_file,

        "attachments":
            attachments,

        "status_history":
            status_history,
        "final_swift_file":
            operation.final_swift_file,

        "final_swift_uploaded_at":
            operation.final_swift_uploaded_at,

        "final_swift_uploaded_by":
            operation.final_swift_uploaded_by,
    }


# ============================================================
# Create operation
# ============================================================

@frappe.whitelist(
    methods=["POST"]
)
def create_operation(
    values: dict[str, Any] | str | None = None,
    attachments: list[dict[str, Any]] | list[str] | str | None = None,
    extraction_source_file: str | None = None,
) -> dict[str, Any]:

    values = _parse(
        values,
        {},
    )

    attachments = _parse(
        attachments,
        [],
    )

    if not isinstance(
        values,
        dict,
    ):
        frappe.throw(
            _(
                "بيانات العملية غير صحيحة."
            )
        )

    if not isinstance(
        attachments,
        list,
    ):
        frappe.throw(
            _(
                "بيانات المرفقات غير صحيحة."
            )
        )

    if not attachments:
        frappe.throw(
            _(
                "يجب إضافة مرفق واحد على الأقل "
                "قبل حفظ العملية."
            )
        )

    file_docs = {}
    attachment_rows = []

    for attachment in attachments:

        if isinstance(
            attachment,
            str,
        ):
            file_url = attachment

        else:
            file_url = (
                attachment.get(
                    "file_url"
                )
            )

        if not file_url:
            frappe.throw(
                _(
                    "يوجد مرفق بدون رابط ملف."
                )
            )

        # منع تكرار نفس الملف.
        if file_url in file_docs:
            continue

        file_doc = (
            _get_uploaded_file(
                file_url
            )
        )

        file_docs[
            file_url
        ] = file_doc

        attachment_rows.append(
            {
                "file":
                    file_url,

                "file_name":
                    file_doc.file_name,

                "is_extraction_source":
                    (
                        1
                        if (
                            file_url
                            == extraction_source_file
                        )
                        else 0
                    ),
            }
        )

    if extraction_source_file:
        if (
            extraction_source_file
            not in file_docs
        ):
            frappe.throw(
                _(
                    "ملف استخراج البيانات يجب "
                    "أن يكون ضمن مرفقات العملية."
                )
            )

    # doc = frappe.new_doc(
    #     "Archive Operation"
    # )

    # for fieldname in (
    #     OPERATION_FIELDS
    # ):
    #     if (
    #         fieldname
    #         not in values
    #     ):
    #         continue

    #     value = values.get(
    #         fieldname
    #     )

    #     if value == "":
    #         value = None

    #     doc.set(
    #         fieldname,
    #         value,
    #     )

    # # أي عملية جديدة تبدأ غير مؤكدة.
    # doc.status = (
    #     "غير مؤكدة"
    # )
    doc = frappe.new_doc(
        "Archive Operation"
    )

    for fieldname in (
        OPERATION_FIELDS
    ):
        if (
            fieldname
            not in values
        ):
            continue

        value = values.get(
            fieldname
        )

        if value == "":
            value = None

        doc.set(
            fieldname,
            value,
        )


    # ========================================================
    # Operation creation mode
    # ========================================================

    doc.allow_duplicate_operation_no = cint(
        values.get(
            "allow_duplicate_operation_no"
        )
    )

    doc.is_blocked_operation = cint(
        values.get(
            "is_blocked_operation"
        )
    )


    # ========================================================
    # Blocked operation
    # ========================================================

    if doc.is_blocked_operation:

        # العملية المحضورة لا تحتاج رقم عملية.
        doc.operation_no = None

        # لا يوجد معنى للسماح بالتكرار بدون رقم.
        doc.allow_duplicate_operation_no = 0

        # تبدأ مباشرة محضورة.
        doc.status = (
            "محضورة"
        )


    # ========================================================
    # Normal operation
    # ========================================================

    else:

        # أي عملية طبيعية جديدة تبدأ معلقة.
        doc.status = (
            "معلقة"
        )

    if extraction_source_file:
        doc.extraction_source_file = (
            extraction_source_file
        )

    for row in attachment_rows:
        doc.append(
            "attachments",
            row,
        )

    # صلاحية Create يتم فحصها هنا تلقائياً.
    doc.insert()

    # بعد إنشاء العملية نربط ملفات File
    # فعلياً بالمستند.
    for (
        file_url,
        file_doc,
    ) in file_docs.items():

        file_doc.db_set(
            {
                "attached_to_doctype":
                    "Archive Operation",

                "attached_to_name":
                    doc.name,

                "attached_to_field":
                    "attachments",
            },
            update_modified=False,
        )

    # ========================================================
    # Timeline: operation created
    # ========================================================
    created_event_title = (
                "تم إنشاء العملية كعملية محضورة"
                if doc.is_blocked_operation
                else "تم إنشاء العملية"
            )

    
    log_operation_event(
        doc.name,
        "created",
        created_event_title,
        details={
            "status":
                doc.status,

            "operation_no":
                doc.operation_no,
            "allow_duplicate_operation_no":
                bool(
                    doc.allow_duplicate_operation_no
                ),

            "is_blocked_operation":
                bool(
                    doc.is_blocked_operation
                ),

            "customer":
                doc.customer,

            "amount":
                doc.amount,

            "currency":
                doc.currency,

            "transferring_bank":
                doc.transferring_bank,
        },
        event_source=
            "User",
    )


    # ========================================================
    # Timeline: PDF extraction
    # ========================================================

    if extraction_source_file:

        extracted_fields = []

        for (
            fieldname,
            label,
        ) in (
            PDF_EXTRACTED_FIELD_LABELS.items()
        ):

            value = doc.get(
                fieldname
            )

            if (
                value is None
                or value == ""
            ):
                continue

            extracted_fields.append(
                {
                    "fieldname":
                        fieldname,

                    "label":
                        label,

                    "value":
                        value,
                }
            )


        extraction_file_doc = (
            file_docs.get(
                extraction_source_file
            )
        )

        

        log_operation_event(
            doc.name,
            "data_extracted",
            "تم استخراج بيانات العملية من المستند",
            details={
                "file_url":
                    extraction_source_file,

                "file_name":
                    (
                        extraction_file_doc.file_name
                        if extraction_file_doc
                        else None
                    ),

                "fields":
                    extracted_fields,
            },
            event_source=
                "PDF Extraction",
        )


    # ========================================================
    # Timeline: initial attachments
    # ========================================================

    created_attachments = [
        {
            "file_name":
                file_doc.file_name,

            "file_url":
                file_url,

            "is_extraction_source":
                (
                    file_url
                    == extraction_source_file
                ),
        }
        for (
            file_url,
            file_doc,
        ) in file_docs.items()
    ]


    if created_attachments:

        log_operation_event(
            doc.name,
            "attachment_added",
            "تم إرفاق ملفات مع إنشاء العملية",
            details={
                "files":
                    created_attachments,
            },
            event_source=
                "User",
        )

    return {
        "name":
            doc.name,

        "serial_no":
            doc.serial_no,

        "status":
            doc.status,
    }


# ============================================================
# Delete temporary files
# ============================================================

@frappe.whitelist(
    methods=["POST"]
)
def delete_temporary_files(
    file_urls: list[str] | str | None = None,
) -> None:
    """
    تنظيف الملفات التي تم رفعها مؤقتاً
    إذا فشل إنشاء العملية أو تم إلغاء الإدخال.
    """

    file_urls = _parse(
        file_urls,
        [],
    )

    if not isinstance(
        file_urls,
        list,
    ):
        return

    user = frappe.session.user

    is_system_manager = (
        "System Manager"
        in frappe.get_roles(
            user
        )
    )

    for file_url in file_urls:

        file_name = (
            frappe.db.get_value(
                "File",
                {
                    "file_url":
                        file_url,
                },
                "name",
            )
        )

        if not file_name:
            continue

        file_doc = frappe.get_doc(
            "File",
            file_name,
        )

        if (
            file_doc.owner
            != user
            and not is_system_manager
        ):
            continue

        # لا نحذف ملفاً أصبح مرتبطاً بمستند.
        if (
            file_doc.attached_to_doctype
            or file_doc.attached_to_name
        ):
            continue

        file_doc.delete(
            ignore_permissions=True
        )


# ============================================================
# Operations list
# ============================================================

@frappe.whitelist(
    methods=["GET", "POST"]
)
def get_operations(
    search: str | None = None,
    status: str | None = None,
    final_swift_pending: int = 0,
    start: int = 0,
    page_length: int =100000 ,
) -> dict[str, Any]:

    frappe.has_permission(
        "Archive Operation",
        "read",
        throw=True,
    )

    search = (
        search or ""
    ).strip()

    status = (
        status or ""
    ).strip()
    final_swift_pending = bool(
        int(
            final_swift_pending or 0
        )
    )

    configured_final_swift_banks = (
        get_final_swift_banks()
    )

    start = max(
        int(
            start or 0
        ),
        0,
    )

    page_length = min(
        max(
            int(
                page_length
                or 100000
            ),
            1,
        ),
        100000,
    )

    

    filters = {}

    force_empty_results = False


    # ========================================================
    # Final Swift filter
    # ========================================================

    if final_swift_pending:

        if not configured_final_swift_banks:

            # لا توجد بنوك معرفة للسويفت النهائي،
            # إذن هذه البطاقة لا تحتوي نتائج.
            #
            # لا نعمل return هنا حتى تستمر
            # عدادات البحث في العمل.
            force_empty_results = True

        else:

            filters[
                "transferring_bank"
            ] = [
                "in",
                list(
                    configured_final_swift_banks
                ),
            ]

            filters[
                "final_swift_file"
            ] = [
                "is",
                "not set",
            ]


    # ========================================================
    # Status filter
    # ========================================================

    if status:

        if (
            status
            not in ACTION_STATUSES
        ):
            frappe.throw(
                _(
                    "لا يمكن الانتقال إلى هذه الحالة "
                    "من إجراءات تغيير الحالة."
                )
            )

        filters[
            "status"
        ] = status


    # ========================================================
    # Powerful operation search
    #
    # search_operation_names هو المصدر الوحيد
    # الآن لتحديد العمليات المطابقة.
    # ========================================================

    if force_empty_results:

        matching_names = []

    else:

        matching_names = (
            search_operation_names(
                search,
                base_filters=
                    filters,
            )
        )


    total_matching = len(
        matching_names
    )


    # ========================================================
    # Pagination
    # ========================================================

    page_names = (
        matching_names[
            start:
            start + page_length
        ]
    )


    # ========================================================
    # Load current page
    # ========================================================

    if page_names:

        operations = frappe.get_list(
            "Archive Operation",

            filters={
                "name": [
                    "in",
                    page_names,
                ],
            },

            fields=[
                "name",
                "serial_no",
                "operation_no",
                "customer",
                "amount",
                "currency",
                "customer_rate",

                "beneficiary_name",
                "beneficiary_account",
                "beneficiary_bank",
                "swift_code",
                "country",

                "bank_transfer_rate",

                "sender_name",
                "sender_account",
                "execution_datetime",

                "transferring_bank",
                "request_date",
                "from_account",

                "reference_no",
                "notes",

                "status",

                "final_swift_file",

                "creation",
                "modified",
            ],

            limit_page_length=
                0,
        )


        # ====================================================
        # Preserve search result order
        # ====================================================

        operation_order = {
            name:
                index

            for (
                index,
                name,
            ) in enumerate(
                page_names
            )
        }


        operations.sort(
            key=lambda row:
                operation_order.get(
                    row.name,
                    999999,
                )
        )

    else:

        operations = []

    


    # ========================================================
    # Customer names
    # ========================================================

    customer_names = {}

    customer_ids = {
        row.customer
        for row in operations
        if row.customer
    }

    if customer_ids:

        customers = frappe.get_all(
            "Archive Customer",

            filters={
                "name": [
                    "in",
                    list(
                        customer_ids
                    ),
                ],
            },

            fields=[
                "name",
                "customer_name",
            ],
        )

        customer_names = {
            row.name:
                row.customer_name
            for row in customers
        }


    # ========================================================
    # Account names
    # ========================================================

    account_names = {}

    account_ids = {
        row.from_account
        for row in operations
        if row.from_account
    }

    if account_ids:

        accounts = frappe.get_all(
            "Archive Account",

            filters={
                "name": [
                    "in",
                    list(
                        account_ids
                    ),
                ],
            },

            fields=[
                "name",
                "account_name",
            ],
        )

        account_names = {
            row.name:
                row.account_name
            for row in accounts
        }
        
    final_swift_counts = {}

    operation_names = [
        row.name
        for row in operations
    ]

    if operation_names:

        final_swift_rows = frappe.get_all(
            "Archive Operation Attachment",

            filters={
                "parent": [
                    "in",
                    operation_names,
                ],

                "parenttype":
                    "Archive Operation",

                "parentfield":
                    "attachments",

                "is_final_swift":
                    1,
            },

            fields=[
                "parent",
            ],
        )

        for row in final_swift_rows:

            final_swift_counts[
                row.parent
            ] = (
                final_swift_counts.get(
                    row.parent,
                    0,
                )
                + 1
            )
    # ========================================================
    # Enrich rows
    # ========================================================

    for operation in operations:

        operation[
            "customer_name"
        ] = (
            customer_names.get(
                operation.customer
            )
            if operation.customer
            else None
        )

        operation[
            "from_account_name"
        ] = (
            account_names.get(
                operation.from_account
            )
            if operation.from_account
            else None
        )
        

        # الواجهة تعتمد على هذه القيمة
        # لتفعيل أو تعطيل زر الإجراءات.
        operation[
            "can_change_status"
        ] = (
            can_change_operation_status(
                operation.status
            )
        )

        # هل المستخدم يستطيع مشاهدة مسار العملية؟
        operation[
            "can_view_timeline"
        ] = (
            can_view_operation_timeline(
                operation
            )
        )

        swift_state = (
            get_final_swift_state(
                operation,
                configured_final_swift_banks,
                final_swift_counts.get(
                    operation.name,
                    0,
                ),
            )
        )

        operation.update(
            swift_state
        )
        
        operation[
            "can_attach_final_swift"
        ] = bool(
            swift_state[
                "final_swift_required"
            ]
            and
            swift_state[
                "final_swift_count"
            ] < MAX_FINAL_SWIFT_FILES
            and
            can_attach_final_swift(
                operation
            )
        )

    # ========================================================
    # Search-aware status counters
    # ========================================================

    counts = {
        "all":
            len(
                search_operation_names(
                    search
                )
            ),

        "غير مؤكدة":
            len(
                search_operation_names(
                    search,
                    base_filters={
                        "status":
                            "غير مؤكدة",
                    },
                )
            ),

        "مؤكدة":
            len(
                search_operation_names(
                    search,
                    base_filters={
                        "status":
                            "مؤكدة",
                    },
                )
            ),

        "مرتجعة":
            len(
                search_operation_names(
                    search,
                    base_filters={
                        "status":
                            "مرتجعة",
                    },
                )
            ),

        "محضورة":
            len(
                search_operation_names(
                    search,
                    base_filters={
                        "status":
                            "محضورة",
                    },
                )
            ),
    }


    if configured_final_swift_banks:

        counts[
            "final_swift"
        ] = len(
            search_operation_names(
                search,
                base_filters={
                    "transferring_bank": [
                        "in",
                        list(
                            configured_final_swift_banks
                        ),
                    ],

                    "final_swift_file": [
                        "is",
                        "not set",
                    ],
                },
            )
        )

    else:

        counts[
            "final_swift"
        ] = 0

    return {
        "operations":
            operations,

        "counts":
            counts,

        "total":
            total_matching,

        "start":
            start,

        "page_length":
            page_length,

        "has_more":
            (
                start
                + len(
                    operations
                )
                < total_matching
            ),
    }


@frappe.whitelist(
    methods=["POST"]
)
def release_pending_operation(
    operation_name: str,
) -> dict[str, Any]:

    operation_name = (
        operation_name or ""
    ).strip()


    if not operation_name:
        frappe.throw(
            _("اسم العملية مطلوب.")
        )


    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )


    operation.check_permission(
        "read"
    )


    # ========================================================
    # Must be Pending
    # ========================================================

    if (
        operation.status
        != "معلقة"
    ):
        frappe.throw(
            _(
                "يمكن تنفيذ هذا الإجراء "
                "على العمليات المعلقة فقط."
            )
        )


    # ========================================================
    # Permission
    # ========================================================

    if not can_release_pending_operation():
        frappe.throw(
            _(
                "ليس لديك صلاحية نقل العملية "
                "من معلقة إلى غير مؤكدة."
            ),
            frappe.PermissionError,
        )


    system_datetime = (
        now_datetime()
    )


    changed_by = (
        frappe.session.user
    )


    old_status = (
        operation.status
    )


    # السماح للController بالانتقال الرسمي.
    operation.flags.allow_status_transition = (
        True
    )


    operation.status = (
        "غير مؤكدة"
    )


    operation.status_effective_datetime = (
        system_datetime
    )


    operation.status_changed_at = (
        system_datetime
    )


    operation.status_changed_by = (
        changed_by
    )


    operation.append(
        "status_history",
        {
            "from_status":
                old_status,

            "to_status":
                "غير مؤكدة",

            "status_effective_datetime":
                system_datetime,

            "system_datetime":
                system_datetime,

            "changed_by":
                changed_by,

            "remarks":
                "تم نقل العملية من معلقة إلى غير مؤكدة",
        },
    )


    operation.save(
        ignore_permissions=True
    )


    log_operation_event(
        operation.name,
        "status_change",
        "تم نقل العملية من معلقة إلى غير مؤكدة",

        details={
            "from_status":
                "معلقة",

            "to_status":
                "غير مؤكدة",

            "system_datetime":
                system_datetime,
        },

        remarks=
            "تم نقل العملية من معلقة إلى غير مؤكدة",

        effective_date=
            system_datetime.date(),

        event_source=
            "User",

        event_user=
            changed_by,

        event_datetime=
            system_datetime,
    )


    return {
        "name":
            operation.name,

        "from_status":
            old_status,

        "status":
            operation.status,

        "status_effective_datetime":
            operation.status_effective_datetime,

        "status_changed_at":
            operation.status_changed_at,

        "status_changed_by":
            operation.status_changed_by,
    }


@frappe.whitelist(
    methods=["GET"]
)
def get_operations_context() -> dict[str, Any]:
    """
    تحميل Snapshot كامل وخفيف لواجهة العمليات.

    يتم استدعاؤه عند:
        - فتح الصفحة
        - Refresh صريح

    البحث والفلترة والترتيب وPagination
    تتم بعد ذلك داخل المتصفح.
    """

    frappe.has_permission(
        "Archive Operation",
        "read",
        throw=True,
    )


    configured_final_swift_banks = (
        get_final_swift_banks()
    )


    # ========================================================
    # Operations
    # ========================================================

    operations = frappe.get_list(
        "Archive Operation",

        fields=[
            "name",
            "serial_no",
            "operation_no",
            "customer",

            "amount",
            "currency",
            "customer_rate",

            "beneficiary_name",
            "beneficiary_account",
            "beneficiary_bank",

            "swift_code",
            "country",

            "bank_transfer_rate",

            "sender_name",
            "sender_account",

            "execution_datetime",

            "transferring_bank",
            "request_date",
            "from_account",

            "reference_no",
            "notes",

            "status",

            "final_swift_file",

            "search_text",
            "operation_no",
            "operation_no_normalized",
            "allow_duplicate_operation_no",
            "is_blocked_operation",

            "creation",
            "modified",
        ],

        order_by=
            "serial_no desc",

        limit_page_length=
            0,
    )

    operation_number_groups = {}


    for operation in operations:

        operation.setdefault(
            "operation_no_duplicate_count",
            0,
        )
        
        operation.setdefault(
            "operation_no_duplicate_index",
            0,
        )

        normalized = cstr(
            operation.get(
                "operation_no_normalized"
            )
        ).strip()


        if not normalized:
            continue


        operation_number_groups.setdefault(
            normalized,
            [],
        ).append(
            operation
        )



    for group in (
        operation_number_groups.values()
    ):

        group.sort(
            key=lambda item: (
                item.get("creation")
                or "",
                item.get("name")
                or "",
            )
        )


        count = len(
            group
        )


        for index, operation in enumerate(
            group,
            start=1,
        ):
            operation[
                "operation_no_duplicate_count"
            ] = count

            operation[
                "operation_no_duplicate_index"
            ] = index
            


    # ========================================================
    # Final Swift counts
    # Query واحدة لكل البيانات وليس لكل عملية.
    # ========================================================

    final_swift_counts = {}


    operation_names = [
        row.name
        for row in operations
    ]


    if operation_names:

        final_swift_rows = frappe.get_all(
            "Archive Operation Attachment",

            filters={
                "parent": [
                    "in",
                    operation_names,
                ],

                "parenttype":
                    "Archive Operation",

                "parentfield":
                    "attachments",

                "is_final_swift":
                    1,
            },

            fields=[
                "parent",
            ],

            limit_page_length=
                0,
        )


        for row in final_swift_rows:

            final_swift_counts[
                row.parent
            ] = (
                final_swift_counts.get(
                    row.parent,
                    0,
                )
                + 1
            )


    # ========================================================
    # Capabilities
    # نحسب صلاحية المستخدم مرة واحدة.
    # ========================================================

    can_change_initial_status = (
        can_change_operation_status(
            "غير مؤكدة"
        )
    )

    can_release_pending = (
        can_release_pending_operation()
    )


    can_change_advanced_status = (
        can_change_operation_status(
            "مؤكدة"
        )
    )


    can_attach_swift = (
        can_attach_final_swift()
    )


    # ========================================================
    # Enrich
    # ========================================================

    for operation in operations:

        operation[
            "can_view_timeline"
        ] = bool(
            can_view_operation_timeline(
                operation
            )
        )

        final_swift_count = (
            final_swift_counts.get(
                operation.name,
                0,
            )
        )


        final_swift_required = bool(
            operation.transferring_bank
            and
            operation.transferring_bank
            in configured_final_swift_banks
        )


        operation[
            "final_swift_required"
        ] = final_swift_required


        operation[
            "final_swift_count"
        ] = final_swift_count


        operation[
            "final_swift_limit"
        ] = MAX_FINAL_SWIFT_FILES


        operation[
            "has_final_swift"
        ] = (
            final_swift_count > 0
        )


        operation[
            "final_swift_pending"
        ] = bool(
            final_swift_required
            and
            final_swift_count == 0
        )


        operation[
            "can_attach_final_swift"
        ] = bool(
            final_swift_required
            and
            final_swift_count
                < MAX_FINAL_SWIFT_FILES
            and
            can_attach_swift
        )


        if (
            operation.status
            == "معلقة"
        ):
            operation[
                "can_change_status"
            ] = False

            operation[
                "can_release_pending"
            ] = bool(
                can_release_pending
            )

        else:

            operation[
                "can_release_pending"
            ] = False

            operation[
                "can_change_status"
            ] = (
                can_change_initial_status
                if operation.status
                    == "غير مؤكدة"
                else
                can_change_advanced_status
            )


        # في التصميم الحالي name هو الاسم المقروء
        # للعميل والحساب.
        operation[
            "customer_name"
        ] = operation.customer


        operation[
            "from_account_name"
        ] = operation.from_account


    # ========================================================
    # Context version
    # ========================================================

    context_version = ""

    if operations:

        context_version = str(
            max(
                (
                    row.modified
                    for row in operations
                    if row.modified
                ),
                default="",
            )
        )


    return {
        "records":
            operations,

        "total":
            len(
                operations
            ),

        "version":
            context_version,

        "capabilities": {
            "can_change_initial_status":
                can_change_initial_status,

            "can_change_advanced_status":
                can_change_advanced_status,

            "can_attach_final_swift":
                can_attach_swift,
            "can_release_pending":
                can_release_pending,
        },
    }
# ============================================================
# Get operation for custom view dialog
# ============================================================

@frappe.whitelist(
    methods=["GET", "POST"]
)
def get_operation_for_view(
    operation_name: str,) -> dict[str, Any]:

    operation_name = (
        operation_name or ""
    ).strip()

    if not operation_name:
        frappe.throw(
            _(
                "اسم العملية مطلوب."
            )
        )

    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )

    # يجب أن يملك المستخدم Read على العملية.
    operation.check_permission(
        "read"
    )

    # صلاحية Write العادية من Role Permission Manager.
    can_edit = bool(
        operation.has_permission(
            "write"
        )
    )

    editable_fields = (
        sorted(
            MANUAL_EDITABLE_FIELDS
        )
        if can_edit
        else []
    )

    return {
        "operation":
            serialize_operation_for_view(
                operation
            ),

        "permissions": {
            "can_edit":
                can_edit,

            "editable_fields":
                editable_fields,

            "can_change_status":
                can_change_operation_status(
                    operation.status
                ),
            "can_manage_attachments":
                can_manage_operation_attachments(
                    operation
                ),
        },
    }



@frappe.whitelist(
    methods=["POST"]
)
def register_attachment_download(
    operation_name: str,
    attachment_name: str,
) -> dict[str, Any]:
    """
    تسجيل تنزيل مرفق من نافذة عرض العملية.

    لا نقبل file_url مباشرة من الواجهة.
    نتحقق من أن صف المرفق تابع فعلاً للعملية.
    """

    operation_name = (
        operation_name or ""
    ).strip()

    attachment_name = (
        attachment_name or ""
    ).strip()


    if not operation_name:
        frappe.throw(
            _("اسم العملية مطلوب.")
        )

    if not attachment_name:
        frappe.throw(
            _("المرفق مطلوب.")
        )


    # ========================================================
    # Operation
    # ========================================================

    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )

    operation.check_permission(
        "read"
    )
    # ========================================================
    # Download permission
    # ========================================================
    if not can_manage_operation_attachments(
        operation
    ):
        frappe.throw(
            _(
                "ليس لديك صلاحية تنزيل مرفقات هذه العملية."
            ),
            frappe.PermissionError,
        )


    # ========================================================
    # Find attachment inside this operation
    # ========================================================

    attachment = next(
        (
            row
            for row in (
                operation.attachments
                or []
            )
            if row.name
            == attachment_name
        ),
        None,
    )


    if not attachment:
        frappe.throw(
            _(
                "المرفق غير موجود في هذه العملية."
            )
        )


    if not attachment.file:
        frappe.throw(
            _(
                "المرفق لا يحتوي على ملف."
            )
        )


    # ========================================================
    # Make sure File still exists
    # ========================================================

    file_doc_name = frappe.db.get_value(
        "File",
        {
            "file_url":
                attachment.file,

            "attached_to_doctype":
                "Archive Operation",

            "attached_to_name":
                operation.name,
        },
        "name",
    )


    if not file_doc_name:
        frappe.throw(
            _(
                "ملف المرفق غير موجود."
            )
        )


    file_doc = frappe.get_doc(
        "File",
        file_doc_name,
    )


    # ========================================================
    # Audit log
    # ========================================================

    event_datetime = (
        now_datetime()
    )

    event_user = (
        frappe.session.user
    )


    log_operation_event(
        operation.name,
        "attachment_downloaded",
        "تم تنزيل المرفق: {0}".format(
            attachment.file_name
            or file_doc.file_name
            or "مرفق"
        ),
        details={
            "attachment_name":
                attachment.name,

            "file_name":
                attachment.file_name
                or file_doc.file_name,

            "file_url":
                attachment.file,

            "is_extraction_source":
                bool(
                    attachment.is_extraction_source
                ),

            "is_final_swift":
                bool(
                    attachment.is_final_swift
                ),
        },
        event_source=
            "User",

        event_user=
            event_user,

        event_datetime=
            event_datetime,
    )


    return {
        "file_url":
            attachment.file,

        "file_name":
            attachment.file_name
            or file_doc.file_name,
    }




@frappe.whitelist(
    methods=["POST"]
)
def attach_final_swift(
    operation_name: str,
    file_urls: list[str] | str | None = None,
) -> dict[str, Any]:

    operation_name = (
        operation_name or ""
    ).strip()

    file_urls = _parse(
        file_urls,
        [],
    )

    if isinstance(
        file_urls,
        str,
    ):
        file_urls = [
            file_urls
        ]

    if not operation_name:
        frappe.throw(
            _("اسم العملية مطلوب.")
        )

    if not isinstance(
        file_urls,
        list,
    ):
        frappe.throw(
            _(
                "بيانات ملفات السويفت النهائي غير صحيحة."
            )
        )

    file_urls = [
        str(file_url).strip()
        for file_url in file_urls
        if str(file_url).strip()
    ]

    # إزالة التكرار مع المحافظة على الترتيب
    file_urls = list(
        dict.fromkeys(
            file_urls
        )
    )

    if not file_urls:
        frappe.throw(
            _(
                "يجب إرفاق ملف سويفت نهائي واحد على الأقل."
            )
        )


    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )

    operation.check_permission(
        "read"
    )


    # ========================================================
    # Permission
    # ========================================================

    if not can_attach_final_swift(
        operation
    ):
        frappe.throw(
            _(
                "ليس لديك صلاحية إرفاق السويفت النهائي."
            ),
            frappe.PermissionError,
        )


    # ========================================================
    # Bank
    # ========================================================

    configured_banks = (
        get_final_swift_banks()
    )

    swift_state = (
        get_final_swift_state(
            operation,
            configured_banks,
        )
    )

    if not swift_state[
        "final_swift_required"
    ]:
        frappe.throw(
            _(
                "البنك المحول لهذه العملية غير موجود "
                "ضمن بنوك السويفت النهائي في الإعدادات."
            )
        )


    # ========================================================
    # Maximum 10 files
    # ========================================================

    current_count = (
        swift_state[
            "final_swift_count"
        ]
    )

    remaining = (
        MAX_FINAL_SWIFT_FILES
        - current_count
    )

    if remaining <= 0:
        frappe.throw(
            _(
                "تم الوصول إلى الحد الأقصى "
                "لملفات السويفت النهائي وهو {0} ملفات."
            ).format(
                MAX_FINAL_SWIFT_FILES
            )
        )
    if len(file_urls) > remaining:
        frappe.throw(
            _(
                "يمكن إضافة {0} ملف فقط لهذه العملية. "
                "الحد الأقصى هو {1} ملفات."
            ).format(
                remaining,
                MAX_FINAL_SWIFT_FILES,
            )
        )


    # ========================================================
    # Validate every file before modifying operation
    # ========================================================

    file_docs = []

    for file_url in file_urls:

        file_doc = (
            _get_uploaded_file(
                file_url
            )
        )

        file_name = (
            file_doc.file_name
            or ""
        ).strip()


        extension = (
            Path(
                file_name
            )
            .suffix
            .lower()
        )


        if (
            extension
            not in FINAL_SWIFT_ALLOWED_EXTENSIONS
        ):
            frappe.throw(
                _(
                    "ملفات السويفت النهائي "
                    "يجب أن تكون PDF أو صور فقط."
                )
            )

        file_docs.append(
            file_doc
        )


    uploaded_at = (
        now_datetime()
    )

    uploaded_by = (
        frappe.session.user
    )


    # ========================================================
    # Append all final swift files
    # ========================================================

    for file_doc in file_docs:

        operation.append(
            "attachments",
            {
                "file":
                    file_doc.file_url,

                "file_name":
                    file_doc.file_name,

                "is_extraction_source":
                    0,

                "is_final_swift":
                    1,
            },
        )


    # مرجع مختصر لآخر ملف تم رفعه
    operation.final_swift_file = (
        file_docs[-1].file_url
    )

    operation.final_swift_uploaded_at = (
        uploaded_at
    )

    operation.final_swift_uploaded_by = (
        uploaded_by
    )


    operation.save(
        ignore_permissions=True
    )


    # ========================================================
    # Link File documents
    # ========================================================

    for file_doc in file_docs:

        file_doc.db_set(
            {
                "attached_to_doctype":
                    "Archive Operation",

                "attached_to_name":
                    operation.name,

                "attached_to_field":
                    "attachments",
            },
            update_modified=False,
        )


    final_swift_count = (
        get_final_swift_count(
            operation
        )
    )
    log_operation_event(
        operation.name,
        "final_swift_added",
        (
            "تم إرفاق ملف سويفت نهائي"
            if len(file_docs) == 1
            else
            "تم إرفاق {0} ملفات سويفت نهائي".format(
                len(file_docs)
            )
        ),
        details={
            "files": [
                {
                    "file_name":
                        file_doc.file_name,

                    "file_url":
                        file_doc.file_url,
                }
                for file_doc
                in file_docs
            ],

            "added_count":
                len(
                    file_docs
                ),

            "final_swift_count":
                final_swift_count,

            "final_swift_limit":
                MAX_FINAL_SWIFT_FILES,
        },
        event_source=
            "User",

        event_user=
            uploaded_by,

        event_datetime=
            uploaded_at,
    )


    return {
        "name":
            operation.name,

        "final_swift_file":
            operation.final_swift_file,

        "final_swift_uploaded_at":
            operation.final_swift_uploaded_at,

        "final_swift_uploaded_by":
            operation.final_swift_uploaded_by,

        "has_final_swift":
            final_swift_count > 0,

        "final_swift_pending":
            False,

        "final_swift_count":
            final_swift_count,

        "final_swift_limit":
            MAX_FINAL_SWIFT_FILES,

        "final_swift_remaining":
            max(
                MAX_FINAL_SWIFT_FILES
                - final_swift_count,
                0,
            ),
    }


# ============================================================
# Change operation status
# ============================================================

@frappe.whitelist(
    methods=["POST"]
)
def change_operation_status(
    operation_name: str,
    status: str,
    status_effective_datetime: str,
    remarks: str | None = None,
) -> dict[str, Any]:

    operation_name = (
        operation_name or ""
    ).strip()

    status = (
        status or ""
    ).strip()

    remarks = (
        remarks or ""
    ).strip()

    if not operation_name:
        frappe.throw(
            _(
                "اسم العملية مطلوب."
            )
        )

    if (
        status
        not in VALID_STATUSES
    ):
        frappe.throw(
            _(
                "حالة العملية غير صحيحة."
            )
        )

    if not status_effective_datetime:
        frappe.throw(
            _(
                "تاريخ الحالة مطلوب."
            )
        )

    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )

    # تغيير الحالة يحتاج Read على الأقل.
    operation.check_permission(
        "read"
    )

    if (
        operation.status
        == "معلقة"
    ):
        frappe.throw(
            _(
                "العملية المعلقة يجب نقلها أولاً "
                "إلى غير مؤكدة من الإجراء المخصص."
            )
        )

    # صلاحية تغيير الحالة مستقلة
    # عن صلاحية تعديل بيانات العملية.
    if not can_change_operation_status(
        operation.status
    ):
        frappe.throw(
            _(
                "ليس لديك صلاحية تغيير حالة هذه العملية."
            ),
            frappe.PermissionError,
        )

    old_status = (
        operation.status
    )

    if (
        old_status
        == status
    ):
        frappe.throw(
            _(
                "الحالة الجديدة مطابقة للحالة الحالية."
            )
        )

    try:
        # تاريخ فقط، بدون وقت.
        effective_date = getdate(
            status_effective_datetime
        )

    except Exception:
        frappe.throw(
            _(
                "تاريخ الحالة غير صحيح."
            )
        )

    # وقت التنفيذ الحقيقي داخل النظام.
    system_datetime = (
        now_datetime()
    )

    # تاريخ الحالة الفعلي لا يمكن
    # أن يكون بعد تاريخ اليوم.
    if (
        effective_date
        > system_datetime.date()
    ):
        frappe.throw(
            _(
                "تاريخ الحالة لا يمكن أن يكون في المستقبل."
            )
        )

    changed_by = (
        frappe.session.user
    )

    # السماح للController بتغيير status
    # فقط عبر هذا المسار المصرح به.
    operation.flags.allow_status_transition = (
        True
    )

    operation.status = (
        status
    )

    # التاريخ الفعلي للحالة.
    operation.status_effective_datetime = (
        effective_date
    )

    # متى سجل الموظف الإجراء في النظام.
    operation.status_changed_at = (
        system_datetime
    )

    # الموظف الذي نفذ التغيير.
    operation.status_changed_by = (
        changed_by
    )

    # سجل تاريخي دائم.
    operation.append(
        "status_history",
        {
            "from_status":
                old_status,

            "to_status":
                status,

            "status_effective_datetime":
                effective_date,

            "system_datetime":
                system_datetime,

            "changed_by":
                changed_by,

            "remarks":
                remarks
                or None,
        },
    )

    # لا نشترط Write هنا؛
    # صلاحية الحالة تم التحقق منها أعلاه.
    operation.save(
        ignore_permissions=True
    )
    log_operation_event(
        operation.name,
        "status_change",
        "تم تغيير حالة العملية من {0} إلى {1}".format(
            old_status,
            status,
        ),
        details={
            "from_status":
                old_status,

            "to_status":
                status,

            "effective_date":
                effective_date,

            "system_datetime":
                system_datetime,
        },
        remarks=
            remarks or None,

        effective_date=
            effective_date,

        event_source=
            "User",

        event_user=
            changed_by,

        event_datetime=
            system_datetime,
    )

    return {
        "name":
            operation.name,

        "from_status":
            old_status,

        "status":
            operation.status,

        "status_effective_datetime":
            operation.status_effective_datetime,

        "status_changed_at":
            operation.status_changed_at,

        "status_changed_by":
            operation.status_changed_by,
    }



@frappe.whitelist(
    methods=["POST"]
)
def save_operation_view_changes(
    operation_name: str,
    values: dict[str, Any] | str | None = None,
    new_attachments: list[dict[str, Any]] | str | None = None,
    delete_attachment_names: list[str] | str | None = None,
) -> dict[str, Any]:

    operation_name = (
        operation_name or ""
    ).strip()

    values = _parse(
        values,
        {},
    )

    new_attachments = _parse(
        new_attachments,
        [],
    )

    delete_attachment_names = _parse(
        delete_attachment_names,
        [],
    )

    if not operation_name:
        frappe.throw(
            _("اسم العملية مطلوب.")
        )

    if not isinstance(values, dict):
        frappe.throw(
            _("بيانات التعديل غير صحيحة.")
        )

    if not isinstance(
        new_attachments,
        list,
    ):
        frappe.throw(
            _("بيانات المرفقات الجديدة غير صحيحة.")
        )

    if not isinstance(
        delete_attachment_names,
        list,
    ):
        frappe.throw(
            _("بيانات المرفقات المحذوفة غير صحيحة.")
        )


    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )

    operation.check_permission(
        "read"
    )


    # ========================================================
    # Permissions
    # ========================================================

    can_edit = bool(
        operation.has_permission(
            "write"
        )
    )

    can_manage_attachments = (
        can_manage_operation_attachments(
            operation
        )
    )


    if values and not can_edit:
        frappe.throw(
            _(
                "ليس لديك صلاحية تعديل بيانات العملية."
            ),
            frappe.PermissionError,
        )


    if (
        (
            new_attachments
            or delete_attachment_names
        )
        and not can_manage_attachments
    ):
        frappe.throw(
            _(
                "ليس لديك صلاحية إدارة مرفقات العملية."
            ),
            frappe.PermissionError,
        )


    # ========================================================
    # Validate editable fields
    # ========================================================

    received_fields = set(
        values.keys()
    )

    forbidden_fields = (
        received_fields
        - MANUAL_EDITABLE_FIELDS
    )

    if forbidden_fields:
        frappe.throw(
            _(
                "لا يسمح بتعديل الحقول التالية: {0}"
            ).format(
                ", ".join(
                    sorted(
                        forbidden_fields
                    )
                )
            ),
            frappe.PermissionError,
        )


    # ========================================================
    # Validate deleted attachments BEFORE changing anything
    # ========================================================

    rows_by_name = {
        row.name: row
        for row in (
            operation.attachments or []
        )
    }

    rows_to_delete = []


    for attachment_name in (
        delete_attachment_names
    ):

        attachment_name = (
            attachment_name or ""
        ).strip()

        row = rows_by_name.get(
            attachment_name
        )

        if not row:
            frappe.throw(
                _(
                    "أحد المرفقات المطلوب حذفها "
                    "غير موجود في العملية."
                )
            )


        # مصدر الاستخراج محمي دائماً.
        if row.is_extraction_source:
            frappe.throw(
                _(
                    "لا يمكن حذف مستند استخراج البيانات "
                    "لأنه مصدر البيانات المؤرشفة للعملية."
                )
            )


        rows_to_delete.append(
            row
        )


    # ========================================================
    # Validate new uploaded files BEFORE changing operation
    # ========================================================

    existing_urls = {
        row.file
        for row in (
            operation.attachments or []
        )
        if row.file
    }

    new_file_docs = []


    for attachment in (
        new_attachments
    ):

        if isinstance(
            attachment,
            str,
        ):
            file_url = attachment

        elif isinstance(
            attachment,
            dict,
        ):
            file_url = (
                attachment.get(
                    "file_url"
                )
                or attachment.get(
                    "file"
                )
            )

        else:
            frappe.throw(
                _(
                    "صيغة أحد المرفقات الجديدة غير صحيحة."
                )
            )


        file_url = (
            file_url or ""
        ).strip()


        if not file_url:
            frappe.throw(
                _(
                    "يوجد مرفق جديد بدون رابط ملف."
                )
            )


        if file_url in existing_urls:
            continue


        file_doc = (
            _get_uploaded_file(
                file_url
            )
        )


        new_file_docs.append(
            file_doc
        )

        existing_urls.add(
            file_url
        )

    manual_changes = []


    for fieldname in (
        MANUAL_EDITABLE_FIELDS
    ):

        if fieldname not in values:
            continue


        old_value = (
            operation.get(
                fieldname
            )
        )

        new_value = (
            values.get(
                fieldname
            )
        )


        if new_value == "":
            new_value = None


        if (
            str(
                old_value
                if old_value is not None
                else ""
            )
            ==
            str(
                new_value
                if new_value is not None
                else ""
            )
        ):
            continue


        manual_changes.append(
            {
                "fieldname":
                    fieldname,

                "label":
                    MANUAL_FIELD_LABELS.get(
                        fieldname,
                        fieldname,
                    ),

                "old_value":
                    old_value,

                "new_value":
                    new_value,
            }
        )
    # ========================================================
    # Manual fields
    # ========================================================

    for fieldname in (
        MANUAL_EDITABLE_FIELDS
    ):

        if fieldname not in values:
            continue

        value = values.get(
            fieldname
        )

        if value == "":
            value = None

        operation.set(
            fieldname,
            value,
        )


    # ========================================================
    # Delete attachment rows
    # ========================================================

    deleted_file_urls = []

    deleted_final_swift = False

    deleted_normal_files = []

    deleted_final_swift_files = []

    for row in rows_to_delete:

        deleted_file_urls.append(
            row.file
        )


        file_info = {
            "file_name":
                row.file_name,

            "file_url":
                row.file,
        }


        if row.is_final_swift:

            deleted_final_swift = True

            deleted_final_swift_files.append(
                file_info
            )

        else:

            deleted_normal_files.append(
                file_info
            )


        operation.remove(
            row
        )



    if deleted_final_swift:

        remaining_final_swift_rows = [
            row
            for row in (
                operation.attachments
                or []
            )
            if row.is_final_swift
        ]

        if remaining_final_swift_rows:

            latest_final_swift = max(
                remaining_final_swift_rows,
                key=lambda row:
                    row.creation
                    or "",
            )

            operation.final_swift_file = (
                latest_final_swift.file
            )

            operation.final_swift_uploaded_at = (
                latest_final_swift.creation
            )

            operation.final_swift_uploaded_by = (
                latest_final_swift.owner
            )

        else:

            operation.final_swift_file = None
            operation.final_swift_uploaded_at = None
            operation.final_swift_uploaded_by = None


    # ========================================================
    # Add normal attachments
    #
    # لا يمكن من هذه الواجهة تحويل ملف عادي
    # إلى سويفت نهائي.
    # ========================================================

    for file_doc in (
        new_file_docs
    ):

        operation.append(
            "attachments",
            {
                "file":
                    file_doc.file_url,

                "file_name":
                    file_doc.file_name,

                "is_extraction_source":
                    0,

                "is_final_swift":
                    0,
            },
        )


    # ========================================================
    # One document save
    # ========================================================

    operation.save(
        ignore_permissions=True
    )

    if manual_changes:

        log_operation_event(
            operation.name,
            "manual_edit",
            "تم تعديل بيانات العملية",
            details={
                "changes":
                    manual_changes,
            },
            event_source=
                "User",
        )
    
    # ========================================================
    # Attach new File records
    # ========================================================

    for file_doc in (
        new_file_docs
    ):

        file_doc.db_set(
            {
                "attached_to_doctype":
                    "Archive Operation",

                "attached_to_name":
                    operation.name,

                "attached_to_field":
                    "attachments",
            },
            update_modified=False,
        )


    # ========================================================
    # Delete removed File documents
    # ========================================================

    for file_url in (
        deleted_file_urls
    ):

        if not file_url:
            continue

        file_name = frappe.db.get_value(
            "File",
            {
                "file_url":
                    file_url,

                "attached_to_doctype":
                    "Archive Operation",

                "attached_to_name":
                    operation.name,
            },
            "name",
        )

        if file_name:
            frappe.delete_doc(
                "File",
                file_name,
                ignore_permissions=True,
            )


    operation.reload()

    if new_file_docs:

        log_operation_event(
            operation.name,
            "attachment_added",
            (
                "تم إضافة مرفق جديد"
                if len(new_file_docs) == 1
                else
                "تم إضافة {0} مرفقات جديدة".format(
                    len(new_file_docs)
                )
            ),
            details={
                "files": [
                    {
                        "file_name":
                            file_doc.file_name,

                        "file_url":
                            file_doc.file_url,
                    }
                    for file_doc
                    in new_file_docs
                ],
            },
            event_source=
                "User",
        )
    if deleted_normal_files:

        log_operation_event(
            operation.name,
            "attachment_deleted",
            (
                "تم حذف مرفق"
                if len(
                    deleted_normal_files
                ) == 1
                else
                "تم حذف {0} مرفقات".format(
                    len(
                        deleted_normal_files
                    )
                )
            ),
            details={
                "files":
                    deleted_normal_files,
            },
            event_source=
                "User",
        )
    if deleted_final_swift_files:

        remaining_final_swift_count = (
            get_final_swift_count(
                operation
            )
        )


        log_operation_event(
            operation.name,
            "final_swift_deleted",
            (
                "تم حذف ملف سويفت نهائي"
                if len(
                    deleted_final_swift_files
                ) == 1
                else
                "تم حذف {0} ملفات سويفت نهائي".format(
                    len(
                        deleted_final_swift_files
                    )
                )
            ),
            details={
                "files":
                    deleted_final_swift_files,

                "remaining_count":
                    remaining_final_swift_count,

                "final_swift_limit":
                    MAX_FINAL_SWIFT_FILES,
            },
            event_source=
                "User",
        )


    return {
        "operation":
            serialize_operation_for_view(
                operation
            ),

        "permissions": {
            "can_edit":
                can_edit,

            "can_manage_attachments":
                can_manage_attachments,

            "editable_fields":
                (
                    sorted(
                        MANUAL_EDITABLE_FIELDS
                    )
                    if can_edit
                    else []
                ),
        },
    }