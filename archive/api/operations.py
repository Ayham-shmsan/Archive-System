import frappe
from frappe import _
from pathlib import Path
from frappe.utils import getdate, now_datetime , cstr,cint
from typing import Any
from archive.api.operation_timeline import (
    log_operation_event,
    can_view_operation_timeline,
)
from archive.services.uploaded_files import (
    delete_temporary_uploaded_files,
    get_unattached_uploaded_file,
)

from archive.services.operation_permissions import (
    can_manage_operation_attachments,
    can_re_extract_operation_data,
)
from archive.api.operation_search import (
    search_operation_names,
)

from archive.domain.shared_documents import (
    create_shared_operation_documents,
    MAX_SHARED_DOCUMENTS,
)
from archive.api.pdf_parser import (
    extract_operation_data
    as extract_pdf_operation_data,
)


MANUAL_FIELD_LABELS = {
    "customer":
        "اسم العميل",

    "customer_rate":
        "سعر العميل",

    "customer_rate_type":
        "نوع عمولة العميل",
    "customer_rate_amount":
        "مبلغ التسعير",

    "customer_rate_currency":
        "عملة سعر العميل",

    "from_account":
        "عن طريق",

    "request_date":
        "تاريخ الطلب",

    "execution_datetime":
        "تاريخ تنفيذ العملية",

    "swift_code":
        "رمز SWIFT",

    "country":
        "الجهة (الدولة)",

    "transferring_bank":
        "اسم البنك المحول",

    "user_notes":
        "ملاحظات المستخدم",
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
    "customer_rate_type",
    "customer_rate_amount",
    "customer_rate_currency",
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
    "user_notes",
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
    ".xlsx",
    ".xls",
    ".docx",
    ".doc"
}

# ============================================================
# Operation statuses
# ============================================================

VALID_STATUSES = (
    "معلقة",
    "غير مؤكدة",
    "مؤكدة",
    "مرتجعة",
    "محضورة",
)


STATUS_ACTION_TRANSITIONS = {
    "معلقة": (),

    "غير مؤكدة": (
        "معلقة",
        "مؤكدة",
        "مرتجعة",
        "محضورة",
    ),

    "مؤكدة": (
        "معلقة",
        "غير مؤكدة",
        "مرتجعة",
        "محضورة",
    ),

    "مرتجعة": (
        "معلقة",
        "غير مؤكدة",
        "مؤكدة",
        "محضورة",
    ),

    "محضورة": (
        "معلقة",
        "غير مؤكدة",
        "مؤكدة",
        "مرتجعة",
    ),
}


# للتوافق مع أي كود قديم يعتمد عليها.
ACTION_STATUSES = VALID_STATUSES


def get_allowed_status_transitions(
    current_status: str,
) -> tuple[str, ...]:
    """
    الحالات التي يسمح الوصول إليها من زر الإجراءات.

    قاعدة الانتقال موجودة هنا فقط حتى لا تتكرر
    داخل الواجهة أو الـ API.
    """

    current_status = (
        current_status or ""
    ).strip()

    return STATUS_ACTION_TRANSITIONS.get(
        current_status,
        (),
    )

MANUAL_EDITABLE_FIELDS = {
    "customer",

    "customer_rate",
    "customer_rate_type",
    "customer_rate_amount",
    "customer_rate_currency",

    "from_account",

    "request_date",
    "execution_datetime",

    "swift_code",
    "country",
    "transferring_bank",

    "user_notes",
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

def _normalize_customer_rate_values(
    values: dict[str, Any],
) -> None:
    """
    توحيد سعر العميل عند إنشاء العملية.

    دولار:
        له/عليه + مبلغ التسعير
        -> customer_rate تلقائي.

    بدون:
        -> بدون عمولة.

    سعودي:
        customer_rate يدوي.
        لا يوجد type ولا amount.
    """

    rate_currency = cstr(
        values.get(
            "customer_rate_currency"
        )
    ).strip()


    if not rate_currency:

        frappe.throw(
            _("عملة سعر العميل مطلوبة.")
        )


    # ========================================================
    # Saudi
    # ========================================================

    if rate_currency == "سعودي":

        values[
            "customer_rate_type"
        ] = None

        values[
            "customer_rate_amount"
        ] = None


        if not cstr(
            values.get(
                "customer_rate"
            )
        ).strip():

            frappe.throw(
                _(
                    "سعر العميل مطلوب "
                    "عند اختيار العملة سعودي."
                )
            )


        return


    # ========================================================
    # Dollar only
    # ========================================================

    if rate_currency != "دولار":

        frappe.throw(
            _("عملة سعر العميل غير صحيحة.")
        )


    rate_type = cstr(
        values.get(
            "customer_rate_type"
        )
    ).strip()


    if rate_type not in {
        "له",
        "عليه",
        "بدون",
        "بدل حوالة مرتجعة",
    }:

        frappe.throw(
            _(
                "نوع العمولة مطلوب للدولار: "
                "له أو عليه أو بدون أو بدل حوالة مرتجعة"
            )
        )


    # ========================================================
    # No commission
    # ========================================================

    if rate_type == "بدون":

        values[
            "customer_rate_amount"
        ] = None

        values[
            "customer_rate"
        ] = "بدون عمولة"

        return
    
    if rate_type == "بدل حوالة مرتجعة":
    
            values[
                "customer_rate_amount"
            ] = None
    
            values[
                "customer_rate"
            ] = "بدل حوالة مرتجعة"
    
            return


    # ========================================================
    # Dollar amount
    # ========================================================

    raw_amount = values.get(
        "customer_rate_amount"
    )


    try:

        rate_amount = float(
            raw_amount
        )

    except (
        TypeError,
        ValueError,
    ):

        frappe.throw(
            _(
                "مبلغ التسعير يجب أن يكون رقماً."
            )
        )


    if rate_amount <= 0:

        frappe.throw(
            _(
                "مبلغ التسعير يجب أن يكون أكبر من صفر."
            )
        )


    rate_amount = round(
        rate_amount,
        6,
    )


    amount_text = (
        f"{rate_amount:.6f}"
        .rstrip("0")
        .rstrip(".")
    )


    values[
        "customer_rate_amount"
    ] = rate_amount


    values[
        "customer_rate"
    ] = (
        f"{rate_type} "
        f"{amount_text} "
        "$ بالألف"
    )

def _prepare_shared_document_file_docs(
    shared_documents,
    *,
    forbidden_file_urls: set[str] | None = None,
):
    """
    تحويل Payload المستندات المشتركة إلى File documents
    مؤكدة الهوية وغير مرتبطة.

    File.name / file_id هو الهوية الأساسية.

    file_url يستخدم للتحقق فقط وللتوافق مع
    المسارات القديمة.

    forbidden_file_urls:
        ملفات لا يجوز استخدامها كمستند مشترك،
        وأهمها Extraction Source.
    """

    if not isinstance(
        shared_documents,
        list,
    ):
        frappe.throw(
            _(
                "بيانات مستندات العملية غير صحيحة."
            )
        )


    forbidden_file_urls = {
        cstr(
            file_url
        ).strip()

        for file_url
        in (
            forbidden_file_urls
            or set()
        )

        if cstr(
            file_url
        ).strip()
    }


    file_docs = []

    seen_files = set()


    for item in (
        shared_documents
        or []
    ):

        file_id = None
        file_url = None


        if isinstance(
            item,
            str,
        ):

            # توافق مع أي استدعاء قديم.
            file_url = cstr(
                item
            ).strip()


        elif isinstance(
            item,
            dict,
        ):

            file_id = cstr(
                item.get(
                    "file_id"
                )
            ).strip() or None


            file_url = cstr(
                item.get(
                    "file_url"
                )
                or item.get(
                    "file"
                )
            ).strip()


        else:

            frappe.throw(
                _(
                    "بيانات أحد المستندات "
                    "المشتركة غير صحيحة."
                )
            )


        if not file_url:

            frappe.throw(
                _(
                    "يوجد مستند مشترك بدون رابط ملف."
                )
            )


        # ====================================================
        # Request identity
        # // ====================================================

        identity_key = (
            f"id:{file_id}"
            if file_id
            else f"url:{file_url}"
        )


        if (
            identity_key
            in seen_files
        ):
            continue


        seen_files.add(
            identity_key
        )


        # ====================================================
        # Extraction and Shared Documents stay separate
        # ====================================================

        if (
            file_url
            in forbidden_file_urls
        ):

            frappe.throw(
                _(
                    "ملف استخراج البيانات "
                    "لا يمكن استخدامه كمستند "
                    "مشترك في نفس العملية."
                )
            )


        file_doc = (
            get_unattached_uploaded_file(
                file_id=
                    file_id,

                file_url=
                    file_url,
            )
        )


        file_docs.append(
            file_doc
        )


    return file_docs

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

def serialize_part_attachment(
    row,
) -> dict[str, Any]:

    return {
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

        "owner":
            row.owner,

        "creation":
            row.creation,
    }


def serialize_shared_document_for_view(
    row,
) -> dict[str, Any]:

    return {
        "name":
            row.name,

        "operation_group":
            row.operation_group,

        "source_operation":
            row.source_operation,

        "document_role":
            row.document_role,

        "file":
            row.file,

        "file_name":
            row.file_name,

        "file_extension":
            row.file_extension,

        "file_size":
            row.file_size,

        "owner":
            row.owner,

        "creation":
            row.creation,
    }


def get_operation_group_view_context(
    operation,
) -> dict[str, Any]:

    operation_group = cstr(
        operation.operation_group
    ).strip()


    if not operation_group:

        frappe.throw(
            _(
                "هذه العملية غير مرتبطة "
                "بمجموعة عملية."
            )
        )


    group = frappe.db.get_value(
        "Archive Operation Group",

        operation_group,

        [
            "name",
            "operation_no",
            "operation_no_normalized",
        ],

        as_dict=True,
    )


    if not group:

        frappe.throw(
            _(
                "مجموعة العملية غير موجودة."
            )
        )


    parts_count = frappe.db.count(
        "Archive Operation",
        {
            "operation_group":
                operation_group,
        },
    )


    shared_documents = frappe.get_all(
        "Archive Operation Document",

        filters={
            "operation_group":
                operation_group,
        },

        fields=[
            "name",
            "operation_group",
            "source_operation",
            "document_role",
            "file",
            "file_name",
            "file_extension",
            "file_size",
            "owner",
            "creation",
        ],

        order_by=
            "creation asc",

        limit_page_length=
            0,
    )


    return {
        "name":
            group.name,

        "operation_no":
            group.operation_no,

        "operation_no_normalized":
            group.operation_no_normalized,

        "parts_count":
            parts_count,

        "shared_documents":
            [
                serialize_shared_document_for_view(
                    row
                )
                for row
                in shared_documents
            ],

        "shared_documents_count":
            len(
                shared_documents
            ),

        "shared_documents_limit":
            MAX_SHARED_DOCUMENTS,
    }

# ============================================================
# Serialize operation for view
# ============================================================

# def serialize_operation_for_view(
#     operation,
# ) -> dict[str, Any]:

#     attachments = []

#     extraction_source = None

#     final_swift_files = []


#     for row in (
#         operation.attachments
#         or []
#     ):

#         serialized = (
#             serialize_part_attachment(
#                 row
#             )
#         )


#         attachments.append(
#             serialized
#         )


#         if row.is_extraction_source:

#             extraction_source = (
#                 serialized
#             )


#         if row.is_final_swift:

#             final_swift_files.append(
#                 serialized
#             )

#     status_history = []

#     for row in (
#         operation.status_history
#         or []
#     ):
#         status_history.append(
#             {
#                 "from_status":
#                     row.from_status,

#                 "to_status":
#                     row.to_status,

#                 "status_effective_datetime":
#                     row.status_effective_datetime,

#                 "system_datetime":
#                     row.system_datetime,

#                 "changed_by":
#                     row.changed_by,

#                 "remarks":
#                     row.remarks,
#             }
#         )

#     return {
#         "name":
#             operation.name,

#         "serial_no":
#             operation.serial_no,

#         "operation_no":
#             operation.operation_no,

#         "customer":
#             operation.customer,

#         "amount":
#             operation.amount,

#         "currency":
#             operation.currency,

#         "customer_rate":
#             operation.customer_rate,

#         "beneficiary_name":
#             operation.beneficiary_name,

#         "beneficiary_account":
#             operation.beneficiary_account,

#         "beneficiary_bank":
#             operation.beneficiary_bank,

#         "swift_code":
#             operation.swift_code,

#         "country":
#             operation.country,

#         "sender_name":
#             operation.sender_name,

#         "sender_account":
#             operation.sender_account,

#         "execution_datetime":
#             operation.execution_datetime,

#         "transferring_bank":
#             operation.transferring_bank,

#         "request_date":
#             operation.request_date,

#         "from_account":
#             operation.from_account,

#         "reference_no":
#             operation.reference_no,

#         "bank_transfer_rate":
#             operation.bank_transfer_rate,

#         "notes":
#             operation.notes,

#         "status":
#             operation.status,

#         "status_effective_datetime":
#             operation.status_effective_datetime,

#         "status_changed_at":
#             operation.status_changed_at,

#         "status_changed_by":
#             operation.status_changed_by,

#         "extraction_source_file":
#             operation.extraction_source_file,

#         "attachments":
#             attachments,

#         "status_history":
#             status_history,
#         "final_swift_file":
#             operation.final_swift_file,

#         "final_swift_uploaded_at":
#             operation.final_swift_uploaded_at,

#         "final_swift_uploaded_by":
#             operation.final_swift_uploaded_by,
#     }
def serialize_operation_for_view(
    operation,
) -> dict[str, Any]:

    # ========================================================
    # Part-specific attachments
    #
    # Archive Operation.attachments تحتوي الملفات
    # الخاصة بهذا الجزء فقط:
    #
    # - Extraction Source
    # - Final Swift
    #
    # نحتفظ أيضاً بالقائمة الكاملة مؤقتاً
    # للتوافق مع واجهة View القديمة إلى أن يتم
    # استبدالها بالواجهة الجديدة.
    # ========================================================

    attachments = []

    extraction_source = None

    final_swift_files = []


    for row in (
        operation.attachments
        or []
    ):

        attachment = (
            serialize_part_attachment(
                row
            )
        )


        attachments.append(
            attachment
        )


        # ====================================================
        # Extraction Source
        #
        # ملف واحد خاص بهذا Archive Operation / Part.
        # ====================================================

        if row.is_extraction_source:

            extraction_source = (
                attachment
            )


        # ====================================================
        # Final Swift
        #
        # قد يكون ملفاً واحداً أو عدة ملفات.
        #
        # يبقى Part-specific ولا يدخل في عداد
        # Shared Documents الخاص بالـGroup.
        # ====================================================

        if row.is_final_swift:

            final_swift_files.append(
                attachment
            )


    # ========================================================
    # Status history
    # ========================================================

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


    # ========================================================
    # View model
    # ========================================================

    return {

        # ====================================================
        # Technical identity
        # ====================================================

        "name":
            operation.name,

        "serial_no":
            operation.serial_no,


        # ====================================================
        # Operation / Group identity
        # ====================================================

        "operation_no":
            operation.operation_no,

        "operation_group":
            operation.operation_group,

        "operation_no_normalized":
            operation.operation_no_normalized,

        "allow_duplicate_operation_no":
            bool(
                operation.allow_duplicate_operation_no
            ),

        "is_blocked_operation":
            bool(
                operation.is_blocked_operation
            ),


        # ====================================================
        # Operation data
        # ====================================================

        "customer":
            operation.customer,

        "amount":
            operation.amount,

        "currency":
            operation.currency,

        "customer_rate":
            operation.customer_rate,

        "customer_rate_type":
            operation.customer_rate_type,
        "customer_rate_amount":
            operation.customer_rate_amount,

        "customer_rate_currency":
            operation.customer_rate_currency,

        "user_notes":
            operation.user_notes,


        # ====================================================
        # Beneficiary
        # ====================================================

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


        # ====================================================
        # Sender / transfer
        # ====================================================

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


        # ====================================================
        # Status
        # ====================================================

        "status":
            operation.status,

        "status_effective_datetime":
            operation.status_effective_datetime,

        "status_changed_at":
            operation.status_changed_at,

        "status_changed_by":
            operation.status_changed_by,

        "status_history":
            status_history,


        # ====================================================
        # Extraction
        #
        # extraction_source:
        #   الـRow الكامل الخاص بالملف.
        #
        # extraction_source_file:
        #   نبقيه مؤقتاً للتوافق مع الكود القديم.
        # ====================================================

        "extraction_source":
            extraction_source,

        "extraction_source_file":
            operation.extraction_source_file,


        # ====================================================
        # Part attachments
        #
        # attachments:
        #   Compatibility فقط حالياً.
        #
        # لاحقاً الواجهة الجديدة لن تعرضها كقسم
        # "مرفقات" عام.
        # ====================================================

        "attachments":
            attachments,


        # ====================================================
        # Final Swift
        #
        # القائمة الحقيقية هي final_swift_files.
        #
        # final_swift_file القديم مجرد Summary يشير
        # إلى آخر ملف، لذلك لا نعتمد عليه في العرض.
        # ====================================================

        "final_swift_files":
            final_swift_files,

        "final_swift_count":
            len(
                final_swift_files
            ),

        "final_swift_limit":
            MAX_FINAL_SWIFT_FILES,

        "final_swift_file":
            operation.final_swift_file,

        "final_swift_uploaded_at":
            operation.final_swift_uploaded_at,

        "final_swift_uploaded_by":
            operation.final_swift_uploaded_by,
    }

#
@frappe.whitelist(
    methods=["POST"]
)
def create_operation(
    values: dict[str, Any] | str | None = None,

    shared_documents:
        list[dict[str, Any]]
        | list[str]
        | str
        | None = None,

    extraction_source_file:
        str | None = None,
    extraction_file_id:
        str | None = None,
) -> dict[str, Any]:

    values = _parse(
        values,
        {},
    )

    shared_documents = _parse(
        shared_documents,
        [],
    )

    extraction_file_id = cstr(
        extraction_file_id
    ).strip() or None


    # ========================================================
    # Validate payload
    # ========================================================

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
        shared_documents,
        list,
    ):
        frappe.throw(
            _(
                "بيانات مستندات العملية غير صحيحة."
            )
        )

    _normalize_customer_rate_values(
        values
    )


    extraction_source_file = cstr(
        extraction_source_file
    ).strip() or None


    # ========================================================
    # Extraction file
    #
    # خاص بالجزء الحالي.
    # ========================================================

    extraction_file_doc = None


    if extraction_source_file:

        extraction_file_doc = (
            get_unattached_uploaded_file(
                file_id=
                    extraction_file_id,

                file_url=
                    extraction_source_file,
            )
        )


    # ========================================================
    # Shared documents
    #
    # خاصة بمجموعة العملية.
    # ========================================================

    shared_file_docs = []

    seen_shared_files = set()


    for item in shared_documents:

        file_id = None
        file_url = None


        if isinstance(
            item,
            str,
        ):

            # توافق مؤقت فقط مع أي استدعاء قديم.
            file_url = cstr(
                item
            ).strip()


        elif isinstance(
            item,
            dict,
        ):

            file_id = cstr(
                item.get(
                    "file_id"
                )
            ).strip() or None


            file_url = cstr(
                item.get(
                    "file_url"
                )
            ).strip()


        else:

            frappe.throw(
                _(
                    "بيانات أحد المستندات "
                    "غير صحيحة."
                )
            )


        if not file_url:

            frappe.throw(
                _(
                    "يوجد مستند بدون رابط ملف."
                )
            )


        # ========================================================
        # Request identity
        #
        # File.name هو الهوية الأساسية.
        # URL يستخدم فقط كتوافق قديم.
        # ========================================================

        identity_key = (
            f"id:{file_id}"
            if file_id
            else f"url:{file_url}"
        )


        if (
            identity_key
            in seen_shared_files
        ):
            continue


        seen_shared_files.add(
            identity_key
        )


        # ========================================================
        # Extraction remains a separate role
        # ========================================================

        if (
            extraction_source_file
            and
            file_url
            ==
            extraction_source_file
        ):

            frappe.throw(
                _(
                    "ملف استخراج البيانات "
                    "لا يمكن استخدامه كمستند "
                    "مشترك في نفس العملية."
                )
            )


        file_doc = (
            get_unattached_uploaded_file(
                file_id=
                    file_id,

                file_url=
                    file_url,
            )
        )


        shared_file_docs.append(
            file_doc
        )


    # ========================================================
    # Create Archive Operation
    # ========================================================

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
    # Creation mode
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


    if doc.is_blocked_operation:

        doc.operation_no = None

        doc.allow_duplicate_operation_no = (
            0
        )

        doc.status = (
            "محضورة"
        )

    else:

        doc.status = (
            "معلقة"
        )


    # ========================================================
    # Extraction source
    # ========================================================

    if extraction_source_file:

        doc.extraction_source_file = (
            extraction_source_file
        )


    # ========================================================
    # Insert
    #
    # هنا Controller يقوم بـ:
    #
    # - validation
    # - duplicate number validation
    # - operation group assignment
    # - sync extraction source
    # ========================================================

    doc.insert()


    # ========================================================
    # Attach extraction File physically to this part
    # ========================================================

    if extraction_file_doc:

        extraction_file_doc.db_set(
            {
                "attached_to_doctype":
                    "Archive Operation",

                "attached_to_name":
                    doc.name,

                "attached_to_field":
                    "extraction_source_file",
            },
            update_modified=False,
        )


    # ========================================================
    # Create shared documents
    #
    # doc.operation_group أصبح معروفاً الآن.
    # ========================================================

    created_shared_documents = (
        create_shared_operation_documents(
            operation=
                doc,

            file_docs=
                shared_file_docs,
        )
    )


    # ========================================================
    # Timeline: operation created
    # ========================================================

    created_event_title = (
        "تم إنشاء العملية كعملية محضورة"
        if doc.is_blocked_operation
        else
        "تم إنشاء العملية"
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
    # Timeline: shared documents
    # ========================================================

    if created_shared_documents:

        log_operation_event(
            doc.name,
            "attachment_added",
            "تم إرفاق مستندات مشتركة مع إنشاء العملية",

            details={
                "operation_group":
                    doc.operation_group,

                "files": [
                    {
                        "document":
                            document.name,

                        "file_name":
                            document.file_name,

                        "file_url":
                            document.file,
                    }

                    for document
                    in created_shared_documents
                ],
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

        "operation_group":
            doc.operation_group,

        "shared_documents_count":
            len(
                created_shared_documents
            ),
    }

# ============================================================
# Delete temporary files
# ============================================================
@frappe.whitelist(
    methods=["POST"]
)
def delete_temporary_files(
    file_ids: list[str] | str | None = None,
) -> dict[str, Any]:

    file_ids = _parse(
        file_ids,
        [],
    )


    if isinstance(
        file_ids,
        str,
    ):
        file_ids = [
            file_ids
        ]


    if not isinstance(
        file_ids,
        list,
    ):
        return {
            "deleted": [],
        }


    deleted = (
        delete_temporary_uploaded_files(
            file_ids
        )
    )


    return {
        "deleted":
            deleted,
    }

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

        operation[
            "allowed_status_transitions"
            ] = (
            list(
                get_allowed_status_transitions(
                    operation.status
                )
            )
            if operation[
                "can_change_status"
            ]
            else []
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
    operation_name: str,
) -> dict[str, Any]:

    # ========================================================
    # Validate operation identity
    # ========================================================

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
    # Load current Part
    # ========================================================

    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )


    # المستخدم يجب أن يستطيع قراءة Archive Operation نفسها.
    operation.check_permission(
        "read"
    )


    # ========================================================
    # Basic edit permission
    #
    # هذه ما زالت صلاحية Write الحالية.
    # سنعيد تصميم editable fields في مرحلة Edit لاحقاً.
    # ========================================================

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


    # ========================================================
    # Part read model
    #
    # يحتوي:
    # - بيانات العملية
    # - Extraction
    # - Final Swift files
    # ========================================================

    operation_data = (
        serialize_operation_for_view(
            operation
        )
    )


    # ========================================================
    # Group read model
    #
    # يحتوي:
    # - Group identity
    # - parts count
    # - Shared Documents
    # - Shared Documents limit
    # ========================================================

    group_data = (
        get_operation_group_view_context(
            operation
        )
    )


    # ========================================================
    # Final Swift state
    #
    # نستخدم العدد الذي خرج من نفس operation serializer،
    # حتى يبقى Final Swift منفصلاً تماماً عن Shared Documents.
    # ========================================================

    final_swift_state = (
        get_final_swift_state(
            operation,

            final_swift_count=
                operation_data[
                    "final_swift_count"
                ],
        )
    )


    # ========================================================
    # Actionable Final Swift permission
    #
    # وجود الصلاحية وحده لا يكفي.
    #
    # يجب أيضاً:
    # - أن يكون البنك يحتاج Final Swift
    # - ألا يكون وصل للحد الأقصى
    # ========================================================

    can_add_final_swift = bool(
        final_swift_state[
            "final_swift_required"
        ]
        and
        final_swift_state[
            "final_swift_remaining"
        ] > 0
        and
        can_attach_final_swift(
            operation
        )
    )


    # ========================================================
    # Final View Read Model
    # ========================================================

    return {

        # ====================================================
        # Current Archive Operation / Part
        # ====================================================

        "operation":
            operation_data,


        # ====================================================
        # Archive Operation Group
        # ====================================================

        "group":
            group_data,


        # ====================================================
        # Final Swift state
        # ====================================================

        "final_swift":
            final_swift_state,


        # ====================================================
        # Permissions / capabilities
        # ====================================================

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

            "can_attach_final_swift":
                can_add_final_swift,

            "can_re_extract":
                can_re_extract_operation_data(
                    operation
                ),
        },
    }



# @frappe.whitelist(
#     methods=["POST"]
# )
# def register_attachment_download(
#     operation_name: str,
#     attachment_name: str,
# ) -> dict[str, Any]:
#     """
#     تسجيل تنزيل مرفق من نافذة عرض العملية.

#     لا نقبل file_url مباشرة من الواجهة.
#     نتحقق من أن صف المرفق تابع فعلاً للعملية.
#     """

#     operation_name = (
#         operation_name or ""
#     ).strip()

#     attachment_name = (
#         attachment_name or ""
#     ).strip()


#     if not operation_name:
#         frappe.throw(
#             _("اسم العملية مطلوب.")
#         )

#     if not attachment_name:
#         frappe.throw(
#             _("المرفق مطلوب.")
#         )


#     # ========================================================
#     # Operation
#     # ========================================================

#     operation = frappe.get_doc(
#         "Archive Operation",
#         operation_name,
#     )

#     operation.check_permission(
#         "read"
#     )
#     # ========================================================
#     # Download permission
#     # ========================================================
#     if not can_manage_operation_attachments(
#         operation
#     ):
#         frappe.throw(
#             _(
#                 "ليس لديك صلاحية تنزيل مرفقات هذه العملية."
#             ),
#             frappe.PermissionError,
#         )


#     # ========================================================
#     # Find attachment inside this operation
#     # ========================================================

#     attachment = next(
#         (
#             row
#             for row in (
#                 operation.attachments
#                 or []
#             )
#             if row.name
#             == attachment_name
#         ),
#         None,
#     )


#     if not attachment:
#         frappe.throw(
#             _(
#                 "المرفق غير موجود في هذه العملية."
#             )
#         )


#     if not attachment.file:
#         frappe.throw(
#             _(
#                 "المرفق لا يحتوي على ملف."
#             )
#         )


#     # ========================================================
#     # Make sure File still exists
#     # ========================================================

#     file_doc_name = frappe.db.get_value(
#         "File",
#         {
#             "file_url":
#                 attachment.file,

#             "attached_to_doctype":
#                 "Archive Operation",

#             "attached_to_name":
#                 operation.name,
#         },
#         "name",
#     )


#     if not file_doc_name:
#         frappe.throw(
#             _(
#                 "ملف المرفق غير موجود."
#             )
#         )


#     file_doc = frappe.get_doc(
#         "File",
#         file_doc_name,
#     )


#     # ========================================================
#     # Audit log
#     # ========================================================

#     event_datetime = (
#         now_datetime()
#     )

#     event_user = (
#         frappe.session.user
#     )


#     log_operation_event(
#         operation.name,
#         "attachment_downloaded",
#         "تم تنزيل المرفق: {0}".format(
#             attachment.file_name
#             or file_doc.file_name
#             or "مرفق"
#         ),
#         details={
#             "attachment_name":
#                 attachment.name,

#             "file_name":
#                 attachment.file_name
#                 or file_doc.file_name,

#             "file_url":
#                 attachment.file,

#             "is_extraction_source":
#                 bool(
#                     attachment.is_extraction_source
#                 ),

#             "is_final_swift":
#                 bool(
#                     attachment.is_final_swift
#                 ),
#         },
#         event_source=
#             "User",

#         event_user=
#             event_user,

#         event_datetime=
#             event_datetime,
#     )


#     return {
#         "file_url":
#             attachment.file,

#         "file_name":
#             attachment.file_name
#             or file_doc.file_name,
#     }

@frappe.whitelist(
    methods=["POST"]
)
def register_attachment_download(
    operation_name: str,

    attachment_name:
        str | None = None,

    shared_document_name:
        str | None = None,
) -> dict[str, Any]:
    """
    تسجيل تنزيل مستند من شاشة عرض العملية.

    يدعم:

    1. Part-level attachment
       - Extraction Source
       - Final Swift

    2. Group-level document
       - Shared Document

    لا نقبل file_url مباشرة من الواجهة.

    يجب دائماً إرسال هوية المستند نفسه:
        attachment_name
    أو:
        shared_document_name
    """

    operation_name = cstr(
        operation_name
    ).strip()


    attachment_name = cstr(
        attachment_name
    ).strip()


    shared_document_name = cstr(
        shared_document_name
    ).strip()


    # ========================================================
    # Validate request
    # ========================================================

    if not operation_name:

        frappe.throw(
            _("اسم العملية مطلوب.")
        )


    if (
        not attachment_name
        and
        not shared_document_name
    ):

        frappe.throw(
            _("المستند المطلوب تنزيله غير محدد.")
        )


    if (
        attachment_name
        and
        shared_document_name
    ):

        frappe.throw(
            _(
                "لا يمكن تحديد مرفق ومستند "
                "مشترك في طلب تنزيل واحد."
            )
        )


    # ========================================================
    # Current Archive Operation / Part
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
    #
    # نبقي نفس قاعدة الصلاحية الحالية.
    # لا نغير نظام الصلاحيات في هذا التعديل.
    # ========================================================

    # if not can_manage_operation_attachments(
    #     operation
    # ):

    #     frappe.throw(
    #         _(
    #             "ليس لديك صلاحية تنزيل "
    #             "مستندات هذه العملية."
    #         ),
    #         frappe.PermissionError,
    #     )


    event_datetime = (
        now_datetime()
    )


    event_user = (
        frappe.session.user
    )


    # ========================================================
    # PATH A
    # Part-level attachment
    #
    # Extraction Source / Final Swift
    # ========================================================

    if attachment_name:
        # ====================================================
        # Part attachment download permission
        #
        # Extraction / Final Swift يحافظان على
        # صلاحية إدارة مرفقات العملية الحالية.
        # ====================================================

        if not can_manage_operation_attachments(
            operation
        ):

            frappe.throw(
                _(
                    "ليس لديك صلاحية تنزيل "
                    "مرفقات هذه العملية."
                ),
                frappe.PermissionError,
            )

        attachment = next(
            (
                row

                for row
                in (
                    operation.attachments
                    or []
                )

                if (
                    row.name
                    ==
                    attachment_name
                )
            ),
            None,
        )


        if not attachment:

            frappe.throw(
                _(
                    "المرفق غير موجود "
                    "في هذه العملية."
                )
            )


        if not attachment.file:

            frappe.throw(
                _(
                    "المرفق لا يحتوي على ملف."
                )
            )


        # ====================================================
        # Determine attachment role
        # ====================================================

        if attachment.is_final_swift:

            document_kind = (
                "final_swift"
            )

            document_label = (
                "السويفت النهائي"
            )


        elif attachment.is_extraction_source:

            document_kind = (
                "extraction_source"
            )

            document_label = (
                "مستند استخراج البيانات"
            )


        else:

            document_kind = (
                "operation_attachment"
            )

            document_label = (
                "مرفق العملية"
            )


        # ====================================================
        # Verify File record belongs to this operation
        #
        # لا نبحث عالمياً بواسطة URL فقط.
        # ====================================================

        file_filters = {
            "file_url":
                attachment.file,

            "attached_to_doctype":
                "Archive Operation",

            "attached_to_name":
                operation.name,
        }


        file_doc_name = frappe.db.get_value(
            "File",
            file_filters,
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


        file_name = (
            attachment.file_name
            or file_doc.file_name
            or "مرفق"
        )


        # ====================================================
        # Timeline
        # ====================================================

        log_operation_event(
            operation.name,
            "attachment_downloaded",

            "تم تنزيل {0}: {1}".format(
                document_label,
                file_name,
            ),

            details={
                "document_kind":
                    document_kind,

                "attachment_name":
                    attachment.name,

                "file_id":
                    file_doc.name,

                "file_name":
                    file_name,

                "file_url":
                    attachment.file,

                "is_extraction_source":
                    bool(
                        attachment
                            .is_extraction_source
                    ),

                "is_final_swift":
                    bool(
                        attachment
                            .is_final_swift
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
                file_name,

            "document_kind":
                document_kind,
        }


    # ========================================================
    # PATH B
    # Group-level Shared Document
    # ========================================================

    shared_document = frappe.get_doc(
        "Archive Operation Document",
        shared_document_name,
    )


    # ========================================================
    # Security boundary
    #
    # المستند يجب أن يكون تابعاً لنفس Group
    # الخاصة بالـPart المفتوح.
    #
    # source_operation لا نستخدمها للتحقق،
    # لأن المستند Shared وقد يكون أضيف أصلاً
    # من Part آخر داخل نفس Group.
    # ========================================================

    if (
        cstr(
            shared_document
                .operation_group
        ).strip()
        !=
        cstr(
            operation
                .operation_group
        ).strip()
    ):

        frappe.throw(
            _(
                "المستند المشترك لا يتبع "
                "مجموعة هذه العملية."
            ),
            frappe.PermissionError,
        )


    if not shared_document.file:

        frappe.throw(
            _(
                "المستند المشترك لا يحتوي "
                "على ملف."
            )
        )


    # ========================================================
    # Verify exact File is attached to this AOD
    #
    # لا نستخدم file_url وحده كهوية.
    # ========================================================

    shared_file_doc_name = (
        frappe.db.get_value(
            "File",
            {
                "file_url":
                    shared_document.file,

                "attached_to_doctype":
                    "Archive Operation Document",

                "attached_to_name":
                    shared_document.name,
            },
            "name",
        )
    )


    if not shared_file_doc_name:

        frappe.throw(
            _(
                "ملف المستند المشترك "
                "غير موجود."
            )
        )


    shared_file_doc = frappe.get_doc(
        "File",
        shared_file_doc_name,
    )


    file_name = (
        shared_document.file_name
        or shared_file_doc.file_name
        or "مستند مشترك"
    )


    # ========================================================
    # Timeline
    #
    # مهم:
    #
    # الحدث يسجل على العملية التي قام المستخدم
    # بالتنزيل منها الآن.
    #
    # حتى لو كان source_operation للمستند
    # Part آخر داخل نفس Group.
    # ========================================================

    log_operation_event(
        operation.name,
        "attachment_downloaded",

        "تم تنزيل مستند مشترك: {0}".format(
            file_name
        ),

        details={
            "document_kind":
                "shared_document",

            "shared_document_name":
                shared_document.name,

            "operation_group":
                operation.operation_group,

            "source_operation":
                shared_document
                    .source_operation,

            "document_role":
                shared_document
                    .document_role,

            "file_id":
                shared_file_doc.name,

            "file_name":
                file_name,

            "file_url":
                shared_document.file,
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
            shared_document.file,

        "file_name":
            file_name,

        "document_kind":
            "shared_document",
    }



# @frappe.whitelist(
#     methods=["POST"]
# )
# def attach_final_swift(
#     operation_name: str,
#     file_urls: list[str] | str | None = None,
# ) -> dict[str, Any]:

#     operation_name = (
#         operation_name or ""
#     ).strip()

#     file_urls = _parse(
#         file_urls,
#         [],
#     )

#     if isinstance(
#         file_urls,
#         str,
#     ):
#         file_urls = [
#             file_urls
#         ]

#     if not operation_name:
#         frappe.throw(
#             _("اسم العملية مطلوب.")
#         )

#     if not isinstance(
#         file_urls,
#         list,
#     ):
#         frappe.throw(
#             _(
#                 "بيانات ملفات السويفت النهائي غير صحيحة."
#             )
#         )

#     file_urls = [
#         str(file_url).strip()
#         for file_url in file_urls
#         if str(file_url).strip()
#     ]

#     # إزالة التكرار مع المحافظة على الترتيب
#     file_urls = list(
#         dict.fromkeys(
#             file_urls
#         )
#     )

#     if not file_urls:
#         frappe.throw(
#             _(
#                 "يجب إرفاق ملف سويفت نهائي واحد على الأقل."
#             )
#         )


#     operation = frappe.get_doc(
#         "Archive Operation",
#         operation_name,
#     )

#     operation.check_permission(
#         "read"
#     )


#     # ========================================================
#     # Permission
#     # ========================================================

#     if not can_attach_final_swift(
#         operation
#     ):
#         frappe.throw(
#             _(
#                 "ليس لديك صلاحية إرفاق السويفت النهائي."
#             ),
#             frappe.PermissionError,
#         )


#     # ========================================================
#     # Bank
#     # ========================================================

#     configured_banks = (
#         get_final_swift_banks()
#     )

#     swift_state = (
#         get_final_swift_state(
#             operation,
#             configured_banks,
#         )
#     )

#     if not swift_state[
#         "final_swift_required"
#     ]:
#         frappe.throw(
#             _(
#                 "البنك المحول لهذه العملية غير موجود "
#                 "ضمن بنوك السويفت النهائي في الإعدادات."
#             )
#         )


#     # ========================================================
#     # Maximum 10 files
#     # ========================================================

#     current_count = (
#         swift_state[
#             "final_swift_count"
#         ]
#     )

#     remaining = (
#         MAX_FINAL_SWIFT_FILES
#         - current_count
#     )

#     if remaining <= 0:
#         frappe.throw(
#             _(
#                 "تم الوصول إلى الحد الأقصى "
#                 "لملفات السويفت النهائي وهو {0} ملفات."
#             ).format(
#                 MAX_FINAL_SWIFT_FILES
#             )
#         )
#     if len(file_urls) > remaining:
#         frappe.throw(
#             _(
#                 "يمكن إضافة {0} ملف فقط لهذه العملية. "
#                 "الحد الأقصى هو {1} ملفات."
#             ).format(
#                 remaining,
#                 MAX_FINAL_SWIFT_FILES,
#             )
#         )


#     # ========================================================
#     # Validate every file before modifying operation
#     # ========================================================

#     file_docs = []

#     for file_url in file_urls:

#         file_doc = (
#             get_unattached_uploaded_file(
#                 file_url
#             )
#         )

#         file_name = (
#             file_doc.file_name
#             or ""
#         ).strip()


#         extension = (
#             Path(
#                 file_name
#             )
#             .suffix
#             .lower()
#         )


#         if (
#             extension
#             not in FINAL_SWIFT_ALLOWED_EXTENSIONS
#         ):
#             frappe.throw(
#                 _(
#                     "ملفات السويفت النهائي "
#                     "يجب أن تكون PDF أو صور فقط."
#                 )
#             )

#         file_docs.append(
#             file_doc
#         )


#     uploaded_at = (
#         now_datetime()
#     )

#     uploaded_by = (
#         frappe.session.user
#     )


#     # ========================================================
#     # Append all final swift files
#     # ========================================================

#     for file_doc in file_docs:

#         operation.append(
#             "attachments",
#             {
#                 "file":
#                     file_doc.file_url,

#                 "file_name":
#                     file_doc.file_name,

#                 "is_extraction_source":
#                     0,

#                 "is_final_swift":
#                     1,
#             },
#         )


#     # مرجع مختصر لآخر ملف تم رفعه
#     operation.final_swift_file = (
#         file_docs[-1].file_url
#     )

#     operation.final_swift_uploaded_at = (
#         uploaded_at
#     )

#     operation.final_swift_uploaded_by = (
#         uploaded_by
#     )


#     operation.save(
#         ignore_permissions=True
#     )


#     # ========================================================
#     # Link File documents
#     # ========================================================

#     for file_doc in file_docs:

#         file_doc.db_set(
#             {
#                 "attached_to_doctype":
#                     "Archive Operation",

#                 "attached_to_name":
#                     operation.name,

#                 "attached_to_field":
#                     "attachments",
#             },
#             update_modified=False,
#         )


#     final_swift_count = (
#         get_final_swift_count(
#             operation
#         )
#     )
#     log_operation_event(
#         operation.name,
#         "final_swift_added",
#         (
#             "تم إرفاق ملف سويفت نهائي"
#             if len(file_docs) == 1
#             else
#             "تم إرفاق {0} ملفات سويفت نهائي".format(
#                 len(file_docs)
#             )
#         ),
#         details={
#             "files": [
#                 {
#                     "file_name":
#                         file_doc.file_name,

#                     "file_url":
#                         file_doc.file_url,
#                 }
#                 for file_doc
#                 in file_docs
#             ],

#             "added_count":
#                 len(
#                     file_docs
#                 ),

#             "final_swift_count":
#                 final_swift_count,

#             "final_swift_limit":
#                 MAX_FINAL_SWIFT_FILES,
#         },
#         event_source=
#             "User",

#         event_user=
#             uploaded_by,

#         event_datetime=
#             uploaded_at,
#     )


#     return {
#         "name":
#             operation.name,

#         "final_swift_file":
#             operation.final_swift_file,

#         "final_swift_uploaded_at":
#             operation.final_swift_uploaded_at,

#         "final_swift_uploaded_by":
#             operation.final_swift_uploaded_by,

#         "has_final_swift":
#             final_swift_count > 0,

#         "final_swift_pending":
#             False,

#         "final_swift_count":
#             final_swift_count,

#         "final_swift_limit":
#             MAX_FINAL_SWIFT_FILES,

#         "final_swift_remaining":
#             max(
#                 MAX_FINAL_SWIFT_FILES
#                 - final_swift_count,
#                 0,
#             ),
#     }

@frappe.whitelist(
    methods=["POST"]
)
def attach_final_swift(
    operation_name: str,

    files:
        list[dict[str, Any]]
        | str
        | None = None,

    # ========================================================
    # Legacy compatibility
    #
    # نبقيه مؤقتاً فقط حتى نعدل
    # final_swift_dialog.js في الخطوة التالية.
    #
    # المسار الجديد يجب أن يستخدم files + file_id.
    # ========================================================
    file_urls:
        list[str]
        | str
        | None = None,
) -> dict[str, Any]:

    operation_name = cstr(
        operation_name
    ).strip()


    files = _parse(
        files,
        [],
    )


    file_urls = _parse(
        file_urls,
        [],
    )


    # ========================================================
    # Validate operation
    # ========================================================

    if not operation_name:

        frappe.throw(
            _("اسم العملية مطلوب.")
        )


    # ========================================================
    # Validate new payload
    # ========================================================

    if not isinstance(
        files,
        list,
    ):

        frappe.throw(
            _(
                "بيانات ملفات السويفت النهائي "
                "غير صحيحة."
            )
        )


    # ========================================================
    # Validate legacy payload
    # ========================================================

    if isinstance(
        file_urls,
        str,
    ):

        file_urls = [
            file_urls
        ]


    if not isinstance(
        file_urls,
        list,
    ):

        frappe.throw(
            _(
                "بيانات ملفات السويفت النهائي "
                "القديمة غير صحيحة."
            )
        )


    # ========================================================
    # Do not accept both payload styles
    # ========================================================

    if (
        files
        and
        file_urls
    ):

        frappe.throw(
            _(
                "لا يمكن إرسال files و file_urls "
                "معاً في نفس الطلب."
            )
        )


    # ========================================================
    # Current operation
    # ========================================================

    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )


    operation.check_permission(
        "read"
    )


    # ========================================================
    # Dedicated Final Swift permission
    # ========================================================

    if not can_attach_final_swift(
        operation
    ):

        frappe.throw(
            _(
                "ليس لديك صلاحية إرفاق "
                "السويفت النهائي."
            ),
            frappe.PermissionError,
        )


    # ========================================================
    # Final Swift business state
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
                "البنك المحول لهذه العملية "
                "غير موجود ضمن بنوك "
                "السويفت النهائي في الإعدادات."
            )
        )


    current_count = (
        swift_state[
            "final_swift_count"
        ]
    )


    remaining = (
        MAX_FINAL_SWIFT_FILES
        -
        current_count
    )


    if remaining <= 0:

        frappe.throw(
            _(
                "تم الوصول إلى الحد الأقصى "
                "لملفات السويفت النهائي وهو "
                "{0} ملفات."
            ).format(
                MAX_FINAL_SWIFT_FILES
            )
        )


    # ========================================================
    # Resolve exact File documents
    #
    # New mode:
    #     file_id هو الهوية الأساسية.
    #
    # Legacy mode:
    #     file_url فقط حتى نعدل الواجهة في
    #     الخطوة التالية.
    # ========================================================

    file_docs = []

    seen_file_ids = set()

    seen_file_urls = set()


    # ========================================================
    # NEW exact identity payload
    # ========================================================

    if files:

        for item in files:

            if not isinstance(
                item,
                dict,
            ):

                frappe.throw(
                    _(
                        "صيغة أحد ملفات "
                        "السويفت النهائي غير صحيحة."
                    )
                )


            file_id = cstr(
                item.get(
                    "file_id"
                )
            ).strip()


            file_url = cstr(
                item.get(
                    "file_url"
                )
                or item.get(
                    "file"
                )
            ).strip()


            if not file_id:

                frappe.throw(
                    _(
                        "يوجد ملف سويفت نهائي "
                        "بدون معرف File."
                    )
                )


            if not file_url:

                frappe.throw(
                    _(
                        "يوجد ملف سويفت نهائي "
                        "بدون رابط ملف."
                    )
                )


            # ====================================================
            # Duplicate exact File inside same request
            # ====================================================

            if (
                file_id
                in seen_file_ids
            ):
                continue


            seen_file_ids.add(
                file_id
            )


            # ====================================================
            # Exact temporary File
            #
            # file_id هو الهوية.
            # file_url تحقق إضافي فقط.
            # ====================================================

            file_doc = (
                get_unattached_uploaded_file(
                    file_id=
                        file_id,

                    file_url=
                        file_url,
                )
            )


            file_docs.append(
                file_doc
            )


    # ========================================================
    # LEGACY URL-only payload
    #
    # مؤقت حتى تعديل final_swift_dialog.js.
    # ========================================================

    else:

        for raw_file_url in (
            file_urls
        ):

            file_url = cstr(
                raw_file_url
            ).strip()


            if not file_url:
                continue


            if (
                file_url
                in seen_file_urls
            ):
                continue


            seen_file_urls.add(
                file_url
            )


            file_doc = (
                get_unattached_uploaded_file(
                    file_url=
                        file_url,
                )
            )


            file_docs.append(
                file_doc
            )


    # ========================================================
    # At least one file
    # ========================================================

    if not file_docs:

        frappe.throw(
            _(
                "يجب إرفاق ملف سويفت نهائي "
                "واحد على الأقل."
            )
        )


    # ========================================================
    # Maximum count
    # ========================================================

    if (
        len(
            file_docs
        )
        >
        remaining
    ):

        frappe.throw(
            _(
                "يمكن إضافة {0} ملف فقط "
                "لهذه العملية. "
                "الحد الأقصى هو {1} ملفات."
            ).format(
                remaining,
                MAX_FINAL_SWIFT_FILES,
            )
        )


    # ========================================================
    # Validate every File before changing anything
    # ========================================================

    for file_doc in (
        file_docs
    ):

        file_name = cstr(
            file_doc.file_name
            or file_doc.file_url
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
            not in
            FINAL_SWIFT_ALLOWED_EXTENSIONS
        ):

            frappe.throw(
                _(
                    "صيغة أحد ملفات السويفت "
                    "النهائي غير مدعومة."
                )
            )


    # ========================================================
    # Audit values
    # ========================================================

    uploaded_at = (
        now_datetime()
    )


    uploaded_by = (
        frappe.session.user
    )


    # ========================================================
    # Append Final Swift child rows
    #
    # هذه الملفات:
    # - Part-specific
    # - لا تدخل في Shared Documents
    # - لا تدخل في عداد Shared Documents = 10
    # ========================================================

    for file_doc in (
        file_docs
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
                    1,
            },
        )


    # ========================================================
    # Summary fields
    #
    # تشير إلى آخر Final Swift فقط.
    #
    # القائمة الحقيقية تبقى في attachments.
    # ========================================================

    operation.final_swift_file = (
        file_docs[-1]
            .file_url
    )


    operation.final_swift_uploaded_at = (
        uploaded_at
    )


    operation.final_swift_uploaded_by = (
        uploaded_by
    )


    # ========================================================
    # Bind the exact uploaded File records BEFORE save
    #
    # Archive Operation Attachment.file هو Attach.
    #
    # لذلك نربط File المحدد نفسه بالحقل "file"
    # قبل operation.save().
    #
    # إذا فشل الحفظ:
    # transaction rollback يعيد File إلى حالته السابقة.
    # ========================================================

    for file_doc in (
        file_docs
    ):

        file_doc.db_set(
            {
                "attached_to_doctype":
                    "Archive Operation",

                "attached_to_name":
                    operation.name,

                "attached_to_field":
                    "file",
            },
            update_modified=False,
        )


    # ========================================================
    # ONE operation save
    #
    # Frappe يرى الآن File record مرتبطاً بالفعل
    # بالزوج:
    #
    #     file_url + attached_to_field="file"
    #
    # فلا يحتاج اختيار orphan آخر لنفس URL
    # من أجل Child Attach field.
    # ========================================================

    operation.save(
        ignore_permissions=True
    )


    # ========================================================
    # Reload authoritative state
    # ========================================================

    operation.reload()


    final_swift_count = (
        get_final_swift_count(
            operation
        )
    )


    # ========================================================
    # Timeline
    # ========================================================

    log_operation_event(
        operation.name,
        "final_swift_added",

        (
            "تم إرفاق ملف سويفت نهائي"
            if len(
                file_docs
            ) == 1
            else
            "تم إرفاق {0} ملفات سويفت نهائي".format(
                len(
                    file_docs
                )
            )
        ),

        details={
            "files": [
                {
                    "file_id":
                        file_doc.name,

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


    # ========================================================
    # Response
    # ========================================================

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
                -
                final_swift_count,
                0,
            ),

        "files": [
            {
                "file_id":
                    file_doc.name,

                "file_name":
                    file_doc.file_name,

                "file_url":
                    file_doc.file_url,
            }

            for file_doc
            in file_docs
        ],
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

    allowed_statuses = (
        get_allowed_status_transitions(
            old_status
        )
    )


    if status not in allowed_statuses:
        frappe.throw(
            _(
                "لا يسمح بتغيير حالة العملية "
                "من {0} إلى {1}."
            ).format(
                frappe.bold(
                    old_status
                ),
                frappe.bold(
                    status
                ),
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
def save_operation_re_extraction(
    operation_name: str,
    values: dict[str, Any] | str | None = None,

    shared_documents:
        list[dict[str, Any]]
        | list[str]
        | str
        | None = None,

    file_id: str | None = None,
    file_url: str | None = None,
) -> dict[str, Any]:
    """
    حفظ إعادة استخراج بيانات عملية موجودة.

    القواعد:

    - يتطلب صلاحية re_extract_operation_data.
    - ملف الاستخراج الجديد يجب أن يكون PDF مؤقتاً
      وغير مرتبط بأي مستند.
    - لا نثق بنتيجة الاستخراج القادمة من المتصفح.
      الـBackend يعيد تشغيل Parser على الملف نفسه.
    - الحقول المستخرجة تطبق أولاً.
    - التعديلات اليدوية المسموحة تطبق بعدها.
      لذلك execution_datetime المصحح يدوياً يفوز
      على قيمة الـParser.
    - operation_no لا يتغير من هذا المسار.
    - Shared Documents وFinal Swift لا تتأثر.
    """

    # ========================================================
    # Request payload
    # ========================================================

    operation_name = cstr(
        operation_name
    ).strip()


    values = _parse(
        values,
        {},
    )
    shared_documents = _parse(
        shared_documents,
        [],
    )


    file_id = cstr(
        file_id
    ).strip()


    file_url = cstr(
        file_url
    ).strip()


    if not operation_name:

        frappe.throw(
            _("اسم العملية مطلوب.")
        )


    if not isinstance(
        values,
        dict,
    ):

        frappe.throw(
            _("بيانات التعديل غير صحيحة.")
        )


    if not isinstance(
        shared_documents,
        list,
    ):

        frappe.throw(
            _(
                "بيانات المستندات المشتركة غير صحيحة."
            )
        )


    if not file_id:

        frappe.throw(
            _(
                "معرف ملف إعادة الاستخراج مطلوب."
            )
        )


    if not file_url:

        frappe.throw(
            _(
                "رابط ملف إعادة الاستخراج مطلوب."
            )
        )


    # ========================================================
    # Current operation
    # ========================================================

    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )


    operation.check_permission(
        "read"
    )


    # ========================================================
    # Dedicated re-extraction permission
    # ========================================================

    if not can_re_extract_operation_data(
        operation
    ):

        frappe.throw(
            _(
                "ليس لديك صلاحية إعادة استخراج "
                "بيانات هذه العملية."
            ),
            frappe.PermissionError,
        )


    # ========================================================
    # Normal Write permission
    #
    # إعادة الاستخراج نفسها لا تحتاج Write.
    #
    # لكن إذا أرسل المستخدم تعديلات يدوية أخرى،
    # يجب أن يملك Write.
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


    if (
        shared_documents
        and
        not can_manage_attachments
    ):

        frappe.throw(
            _(
                "ليس لديك صلاحية إضافة "
                "مستندات مشتركة للعملية."
            ),
            frappe.PermissionError,
        )


    if (
        values
        and
        not can_edit
    ):

        frappe.throw(
            _(
                "ليس لديك صلاحية تعديل "
                "بيانات العملية يدوياً."
            ),
            frappe.PermissionError,
        )


    # ========================================================
    # Manual field protection
    # ========================================================

    received_fields = set(
        values.keys()
    )


    if (
        "operation_no"
        in received_fields
    ):

        frappe.throw(
            _(
                "لا يمكن تغيير رقم العملية "
                "من مسار إعادة الاستخراج."
            ),
            frappe.PermissionError,
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
    # Exact temporary File
    #
    # File.name / file_id هو الهوية الأساسية.
    # file_url مجرد تحقق إضافي.
    # ========================================================

    new_file_doc = (
        get_unattached_uploaded_file(
            file_id=
                file_id,

            file_url=
                file_url,
        )
    )


    # ========================================================
    # PDF only
    # ========================================================

    new_file_name = cstr(
        new_file_doc.file_name
        or new_file_doc.file_url
    ).strip()


    extension = (
        Path(
            new_file_name
        )
        .suffix
        .lower()
    )


    if extension != ".pdf":

        frappe.throw(
            _(
                "ملف إعادة استخراج البيانات "
                "يجب أن يكون بصيغة PDF."
            )
        )

    # ========================================================
    # Pending Shared Documents
    #
    # يتم التحقق منها كلها قبل لمس Archive Operation.
    #
    # لا يجوز استخدام:
    # - Extraction القديم
    # - Extraction الجديد
    # كمستند Shared.
    # ========================================================

    shared_file_docs = (
        _prepare_shared_document_file_docs(
            shared_documents,

            forbidden_file_urls={
                operation.extraction_source_file,
                new_file_doc.file_url,
            },
        )
    )


    # ========================================================
    # Server-side PDF extraction
    #
    # لا نعتمد على pending_extracted_data القادمة
    # من JavaScript لأنها Client data ويمكن تزويرها.
    # ========================================================

    parser_result = (
        extract_pdf_operation_data(
            new_file_doc.file_url
        )
        or {}
    )


    if not isinstance(
        parser_result,
        dict,
    ):

        frappe.throw(
            _(
                "نتيجة استخراج بيانات PDF غير صحيحة."
            )
        )


    parser_data = (
        parser_result.get(
            "data"
        )
        or {}
    )


    if not isinstance(
        parser_data,
        dict,
    ):

        frappe.throw(
            _(
                "بيانات PDF المستخرجة غير صحيحة."
            )
        )


    # ========================================================
    # Extracted field whitelist
    #
    # operation_no ليس من حق الـPDF إطلاقاً.
    # request_date ليس حقلاً مستخرجاً.
    # ========================================================

    extracted_values = {}


    for fieldname in (
        PDF_EXTRACTED_FIELD_LABELS
    ):

        value = parser_data.get(
            fieldname
        )


        if (
            value is None
            or value == ""
        ):
            continue


        extracted_values[
            fieldname
        ] = value


    if not extracted_values:

        frappe.throw(
            _(
                "لم يتم العثور على بيانات قابلة "
                "للاستخراج من ملف PDF."
            )
        )


    # ========================================================
    # Manual changes audit snapshot
    #
    # execution_datetime لا نسجله كـmanual_edit أثناء
    # إعادة الاستخراج، لأن حدث data_extracted الواحد
    # يمثل القيمة النهائية حتى لو صححها المستخدم.
    # ========================================================

    manual_changes = []


    for fieldname in (
        MANUAL_EDITABLE_FIELDS
    ):

        if (
            fieldname
            not in values
        ):
            continue


        if (
            fieldname
            == "execution_datetime"
        ):
            continue


        old_value = operation.get(
            fieldname
        )


        new_value = values.get(
            fieldname
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
    # Existing extraction source rows
    # ========================================================

    old_extraction_rows = [
        row
        for row in (
            operation.attachments
            or []
        )
        if row.is_extraction_source
    ]


    old_extraction_urls = {
        cstr(
            row.file
        ).strip()

        for row
        in old_extraction_rows

        if cstr(
            row.file
        ).strip()
    }


    # ========================================================
    # Existing physical File records
    #
    # نحفظ أسماء File records القديمة حتى نفصلها
    # عن العملية بعد نجاح Document validation/save.
    #
    # لا نحذف الملف الفيزيائي هنا؛ الحذف قبل COMMIT
    # قد يكسر atomicity، خصوصاً إذا كان هناك File
    # آخر بنفس file_url/content.
    # ========================================================

    old_file_ids = []


    for old_file_url in (
        old_extraction_urls
    ):

        old_file_ids.extend(
            frappe.get_all(
                "File",

                filters={
                    "file_url":
                        old_file_url,

                    "attached_to_doctype":
                        "Archive Operation",

                    "attached_to_name":
                        operation.name,

                    "attached_to_field":
                        "extraction_source_file",
                },

                pluck=
                    "name",
            )
        )


    old_file_ids = list(
        dict.fromkeys(
            old_file_ids
        )
    )


    # ========================================================
    # Remove old extraction child rows
    #
    # Final Swift rows remain untouched.
    # ========================================================

    for row in list(
        operation.attachments
        or []
    ):

        if not row.is_extraction_source:
            continue


        operation.remove(
            row
        )


    # ========================================================
    # New extraction source
    # ========================================================

    operation.extraction_source_file = (
        new_file_doc.file_url
    )


    operation.append(
        "attachments",
        {
            "file":
                new_file_doc.file_url,

            "file_name":
                new_file_doc.file_name,

            "is_extraction_source":
                1,

            "is_final_swift":
                0,
        },
    )


    # ========================================================
    # Apply extracted PDF values first
    # ========================================================

    for (
        fieldname,
        value,
    ) in extracted_values.items():

        operation.set(
            fieldname,
            value,
        )


    # ========================================================
    # Apply manual values second
    #
    # execution_datetime الموجود في values
    # يفوز هنا على قيمة PDF إذا عدله المستخدم.
    # ========================================================

    for fieldname in (
        MANUAL_EDITABLE_FIELDS
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


        operation.set(
            fieldname,
            value,
        )


    # ========================================================
    # ONE Archive Operation save
    #
    # Controller ينفذ هنا:
    # - customer rate validation
    # - strict date validation
    # - operation number rules
    # - group validation
    # - extraction sync
    # - attachment validation
    #
    # إذا فشل أي شيء:
    # request transaction ستعمل rollback،
    # والمصدر القديم يبقى كما كان في DB.
    # ========================================================

    operation.save(
        ignore_permissions=True
    )


    # ========================================================
    # Link new File record to current Part
    # ========================================================

    new_file_doc.db_set(
        {
            "attached_to_doctype":
                "Archive Operation",

            "attached_to_name":
                operation.name,

            "attached_to_field":
                "extraction_source_file",
        },
        update_modified=False,
    )


    # ========================================================
    # Detach previous extraction File records
    #
    # لا نحذفها فيزيائياً داخل هذه المعاملة.
    #
    # هذا متعمد لحماية atomicity ولأن file_url قد
    # يكون مشتركاً بين File records متطابقة المحتوى.
    # ========================================================

    for old_file_id in (
        old_file_ids
    ):

        if (
            old_file_id
            == new_file_doc.name
        ):
            continue


        if not frappe.db.exists(
            "File",
            old_file_id,
        ):
            continue


        old_file_doc = frappe.get_doc(
            "File",
            old_file_id,
        )


        if (
            old_file_doc.attached_to_doctype
            != "Archive Operation"
            or
            old_file_doc.attached_to_name
            != operation.name
        ):
            continue


        old_file_doc.db_set(
            {
                "attached_to_doctype":
                    None,

                "attached_to_name":
                    None,

                "attached_to_field":
                    None,
            },
            update_modified=False,
        )


    # ========================================================
    # Reload final authoritative values
    # ========================================================

    operation.reload()
    # ========================================================
    # Create Group Shared Documents
    #
    # نفس Domain Service المستخدمة في Create.
    #
    # Final Swift لا يدخل هنا إطلاقاً.
    # ========================================================

    created_shared_documents = (
        create_shared_operation_documents(
            operation=
                operation,

            file_docs=
                shared_file_docs,
        )
    )


    # ========================================================
    # Timeline: normal manual changes
    #
    # execution_datetime مستبعد أعلاه عمداً.
    # ========================================================

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
    # Timeline: re-extraction
    #
    # نسجل القيم النهائية المحفوظة، وليس مجرد
    # Raw parser values.
    # ========================================================

    extracted_fields = []


    for (
        fieldname,
        label,
    ) in (
        PDF_EXTRACTED_FIELD_LABELS.items()
    ):

        if (
            fieldname
            not in extracted_values
        ):
            continue


        final_value = operation.get(
            fieldname
        )


        if (
            final_value is None
            or final_value == ""
        ):
            continue


        extracted_fields.append(
            {
                "fieldname":
                    fieldname,

                "label":
                    label,

                "value":
                    final_value,
            }
        )


    log_operation_event(
        operation.name,
        "data_extracted",
        "تمت إعادة استخراج بيانات العملية من المستند",

        details={
            "file_url":
                new_file_doc.file_url,

            "file_name":
                new_file_doc.file_name,

            "fields":
                extracted_fields,
        },

        event_source=
            "PDF Extraction",
    )
    if created_shared_documents:

        log_operation_event(
            operation.name,
            "attachment_added",
            "تم إرفاق مستندات مشتركة",

            details={
                "operation_group":
                    operation.operation_group,

                "files": [
                    {
                        "document":
                            document.name,

                        "file_name":
                            document.file_name,

                        "file_url":
                            document.file,
                    }

                    for document
                    in created_shared_documents
                ],
            },

            event_source=
                "User",
        )


    # ========================================================
    # Response
    # ========================================================

    return {
        "operation":
            serialize_operation_for_view(
                operation
            ),

        "group":
            get_operation_group_view_context(
                operation
            ),

        "shared_documents_added":
            len(
                created_shared_documents
            ),

        "permissions": {
            "can_edit":
                can_edit,

            "editable_fields":
                (
                    sorted(
                        MANUAL_EDITABLE_FIELDS
                    )
                    if can_edit
                    else []
                ),

            "can_re_extract":
                can_re_extract_operation_data(
                    operation
                ),

            "can_manage_attachments":
                can_manage_attachments,

            "can_attach_final_swift":
                bool(
                    get_final_swift_state(
                        operation
                    )[
                        "final_swift_remaining"
                    ]
                    > 0
                    and
                    can_attach_final_swift(
                        operation
                    )
                ),
        },

        "re_extraction_saved":
            True,
    }

@frappe.whitelist(
    methods=["POST"]
)
def save_operation_view_changes(
    operation_name: str,
    values: dict[str, Any] | str | None = None,

    shared_documents:
        list[dict[str, Any]]
        | list[str]
        | str
        | None = None,

    new_attachments:
        list[dict[str, Any]]
        | str
        | None = None,

    delete_attachment_names:
        list[str]
        | str
        | None = None,
) -> dict[str, Any]:

    operation_name = (
        operation_name or ""
    ).strip()

    values = _parse(
        values,
        {},
    )

    shared_documents = _parse(
        shared_documents,
        [],
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

    if not isinstance(
        shared_documents,
        list,
    ):

        frappe.throw(
            _(
                "بيانات المستندات المشتركة غير صحيحة."
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

    if (
        shared_documents
        and
        not can_manage_attachments
    ):

        frappe.throw(
            _(
                "ليس لديك صلاحية إضافة "
                "مستندات مشتركة للعملية."
            ),
            frappe.PermissionError,
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
    # Validate new Shared Documents BEFORE changing anything
    #
    # Extraction Source لا يمكن تحويله إلى Shared Document.
    # ========================================================

    shared_file_docs = (
        _prepare_shared_document_file_docs(
            shared_documents,

            forbidden_file_urls={
                operation.extraction_source_file,
            },
        )
    )




    # ========================================================
    # Validate editable fields
    # ========================================================

    # ========================================================
    # Validate editable fields
    # ========================================================

    received_fields = set(
        values.keys()
    )


    # ========================================================
    # Operation number protection
    #
    # تغيير رقم عملية موجودة ليس تعديلاً عادياً.
    #
    # يجب أن يمر لاحقاً من مسار مخصص يعرف:
    #
    # - عدد أجزاء Source Group.
    # - هل Source Group مفردة أم متعددة الأجزاء.
    # - Target Group.
    # - قواعد retain / discard للملفات.
    # - Shared Documents الخاصة بالمصدر والهدف.
    #
    # لذلك يمنع هذا Endpoint من تعديل operation_no
    # حتى لو أرسلته الواجهة أو تم استدعاء API يدوياً.
    # ========================================================

    if "operation_no" in received_fields:

        frappe.throw(
            _(
                "لا يمكن تغيير رقم العملية "
                "من مسار التعديل العام."
            ),
            frappe.PermissionError,
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
            get_unattached_uploaded_file(
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
    # ========================================================
    # Shared Documents
    #
    # Group-level.
    # يستخدم نفس Domain Service الخاصة بـCreate.
    #
    # إذا فشل الحد الأقصى أو أي Validation هنا،
    # Request كلها تعمل rollback.
    # ========================================================

    created_shared_documents = (
        create_shared_operation_documents(
            operation=
                operation,

            file_docs=
                shared_file_docs,
        )
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
    if created_shared_documents:

        log_operation_event(
            operation.name,
            "attachment_added",
            "تم إرفاق مستندات مشتركة",

            details={
                "operation_group":
                    operation.operation_group,

                "files": [
                    {
                        "document":
                            document.name,

                        "file_name":
                            document.file_name,

                        "file_url":
                            document.file,
                    }

                    for document
                    in created_shared_documents
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


        "group":
            get_operation_group_view_context(
                operation
            ),

        "shared_documents_added":
            len(
                created_shared_documents
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