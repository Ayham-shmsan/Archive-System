# import frappe
# from frappe import _
# from typing import Any
# from frappe.utils import getdate, now_datetime

# OPERATION_FIELDS = {
#     "operation_no",
#     "customer",
#     "amount",
#     "currency",
#     "customer_rate",
#     "beneficiary_name",
#     "beneficiary_account",
#     "beneficiary_bank",
#     "swift_code",
#     "country",
#     "sender_name",
#     "sender_account",
#     "execution_datetime",
#     "transferring_bank",
#     "request_date",
#     "from_account",
#     "reference_no",
#     "bank_transfer_rate",
#     "notes",
# }


# def _parse(value: Any, default: Any) -> Any:
#     if value is None:
#         return default

#     if isinstance(value, str):
#         return frappe.parse_json(value)

#     return value


# def _get_uploaded_file(file_url: str):
#     file_name = frappe.db.get_value(
#         "File",
#         {"file_url": file_url},
#         "name",
#     )

#     if not file_name:
#         frappe.throw(
#             _("الملف غير موجود: {0}").format(
#                 file_url
#             )
#         )

#     file_doc = frappe.get_doc(
#         "File",
#         file_name,
#     )

#     user = frappe.session.user
#     is_system_manager = (
#         "System Manager"
#         in frappe.get_roles(user)
#     )

#     if (
#         file_doc.owner != user
#         and not is_system_manager
#     ):
#         frappe.throw(
#             _("لا تملك صلاحية استخدام هذا الملف.")
#         )

#     if (
#         file_doc.attached_to_doctype
#         or file_doc.attached_to_name
#     ):
#         frappe.throw(
#             _(
#                 "الملف مرتبط بمستند آخر بالفعل: {0}"
#             ).format(file_doc.file_name)
#         )

#     return file_doc


# @frappe.whitelist(methods=["POST"])
# def create_operation(
#     values: dict[str, Any] | str | None = None,
#     attachments: list[dict[str, Any]] | list[str] | str | None = None,
#     extraction_source_file: str | None = None,
# ) -> dict[str, Any]:
#     values = _parse(values, {})
#     attachments = _parse(attachments, [])

#     if not isinstance(values, dict):
#         frappe.throw(
#             _("بيانات العملية غير صحيحة.")
#         )

#     if not isinstance(attachments, list):
#         frappe.throw(
#             _("بيانات المرفقات غير صحيحة.")
#         )

#     if not attachments:
#         frappe.throw(
#             _(
#                 "يجب إضافة مرفق واحد على الأقل "
#                 "قبل حفظ العملية."
#             )
#         )

#     file_docs = {}
#     attachment_rows = []

#     for attachment in attachments:
#         if isinstance(attachment, str):
#             file_url = attachment
#         else:
#             file_url = attachment.get(
#                 "file_url"
#             )

#         if not file_url:
#             frappe.throw(
#                 _("يوجد مرفق بدون رابط ملف.")
#             )

#         if file_url in file_docs:
#             continue

#         file_doc = _get_uploaded_file(
#             file_url
#         )

#         file_docs[file_url] = file_doc

#         attachment_rows.append(
#             {
#                 "file": file_url,
#                 "file_name": file_doc.file_name,
#                 "is_extraction_source": (
#                     1
#                     if file_url
#                     == extraction_source_file
#                     else 0
#                 ),
#             }
#         )

#     if extraction_source_file:
#         if (
#             extraction_source_file
#             not in file_docs
#         ):
#             frappe.throw(
#                 _(
#                     "ملف استخراج البيانات يجب "
#                     "أن يكون ضمن مرفقات العملية."
#                 )
#             )

#     doc = frappe.new_doc(
#         "Archive Operation"
#     )

#     for fieldname in OPERATION_FIELDS:
#         if fieldname not in values:
#             continue

#         value = values.get(fieldname)

#         if value == "":
#             value = None

#         doc.set(
#             fieldname,
#             value,
#         )

#     doc.status = "غير مؤكدة"

#     if extraction_source_file:
#         doc.extraction_source_file = (
#             extraction_source_file
#         )

#     for row in attachment_rows:
#         doc.append(
#             "attachments",
#             row,
#         )

#     doc.insert()

#     # بعد إنشاء العملية نربط ملفات File
#     # فعلياً بالمستند.
#     for file_url, file_doc in file_docs.items():
#         file_doc.db_set(
#             {
#                 "attached_to_doctype":
#                     "Archive Operation",
#                 "attached_to_name":
#                     doc.name,
#                 "attached_to_field":
#                     "attachments",
#             },
#             update_modified=False,
#         )

#     return {
#         "name": doc.name,
#         "serial_no": doc.serial_no,
#         "status": doc.status,
#     }


# @frappe.whitelist(methods=["POST"])
# def delete_temporary_files(
#     file_urls: list[str] | str | None = None,
# ) -> None:
#     """
#     تستخدم فقط لتنظيف الملفات التي تم رفعها
#     إذا فشل إنشاء العملية بعد الرفع.
#     """

#     file_urls = _parse(
#         file_urls,
#         [],
#     )

#     if not isinstance(
#         file_urls,
#         list,
#     ):
#         return

#     user = frappe.session.user
#     is_system_manager = (
#         "System Manager"
#         in frappe.get_roles(user)
#     )

#     for file_url in file_urls:
#         file_name = frappe.db.get_value(
#             "File",
#             {"file_url": file_url},
#             "name",
#         )

#         if not file_name:
#             continue

#         file_doc = frappe.get_doc(
#             "File",
#             file_name,
#         )

#         if (
#             file_doc.owner != user
#             and not is_system_manager
#         ):
#             continue

#         # لا نحذف أي ملف أصبح مرتبطاً بمستند.
#         if (
#             file_doc.attached_to_doctype
#             or file_doc.attached_to_name
#         ):
#             continue

#         file_doc.delete(
#             ignore_permissions=True
#         )




# VALID_STATUSES = (
#     "غير مؤكدة",
#     "مؤكدة",
#     "مرتجعة",
#     "محضورة",
# )
# MANUAL_EDITABLE_FIELDS = {
#     "operation_no",
#     "customer",
#     "customer_rate",
#     "from_account",
#     "request_date",
#     "swift_code",
#     "country",
#     "transferring_bank",
# }


# INITIAL_STATUS_ROLE = (
#     "Archive Operation Initial Status"
# )

# ADVANCED_STATUS_ROLE = (
#     "Archive Operation Advanced Status"
# )

# STATUS_MANAGER_ROLE = (
#     "Archive Operation Status Manager"
# )

# def can_change_operation_status(
#     current_status: str,
# ) -> bool:

#     user = frappe.session.user

#     if user == "Administrator":
#         return True

#     roles = set(
#         frappe.get_roles(user)
#     )

#     if STATUS_MANAGER_ROLE in roles:
#         return True

#     if current_status == "غير مؤكدة":
#         return (
#             INITIAL_STATUS_ROLE
#             in roles
#         )

#     return (
#         ADVANCED_STATUS_ROLE
#         in roles
#     )


# def serialize_operation_for_view(
#     operation,
# ) -> dict[str, Any]:

#     attachments = []

#     for row in (
#         operation.attachments or []
#     ):
#         attachments.append({
#             "file":
#                 row.file,

#             "file_name":
#                 row.file_name,

#             "is_extraction_source":
#                 bool(
#                     row.is_extraction_source
#                 ),
#         })

#     status_history = []

#     for row in (
#         operation.status_history or []
#     ):
#         status_history.append({
#             "from_status":
#                 row.from_status,

#             "to_status":
#                 row.to_status,

#             "status_effective_datetime":
#                 row.status_effective_datetime,

#             "system_datetime":
#                 row.system_datetime,

#             "changed_by":
#                 row.changed_by,

#             "remarks":
#                 row.remarks,
#         })

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
#     }



# @frappe.whitelist(methods=["GET", "POST"])
# def get_operations(
#     search: str | None = None,
#     status: str | None = None,
#     start: int = 0,
#     page_length: int = 20,
# ) -> dict[str, Any]:

#     frappe.has_permission(
#         "Archive Operation",
#         "read",
#         throw=True,
#     )

#     search = (search or "").strip()
#     status = (status or "").strip()

#     start = max(int(start or 0), 0)
#     page_length = min(
#         max(int(page_length or 20), 1),
#         100,
#     )

#     filters = {}

#     if status:
#         if status not in VALID_STATUSES:
#             frappe.throw(
#                 _("حالة العملية غير صحيحة.")
#             )

#         filters["status"] = status

#     or_filters = []

#     if search:
#         like_value = f"%{search}%"

#         search_fields = (
#             "name",
#             "operation_no",
#             "customer",
#             "beneficiary_name",
#             "beneficiary_account",
#             "beneficiary_bank",
#             "sender_name",
#             "sender_account",
#             "reference_no",
#         )

#         or_filters = [
#             [fieldname, "like", like_value]
#             for fieldname in search_fields
#         ]

#     operations = frappe.get_list(
#         "Archive Operation",
#         filters=filters,
#         or_filters=or_filters,
#         fields=[
#             "name",
#             "serial_no",
#             "operation_no",
#             "customer",
#             "amount",
#             "currency",
#             "customer_rate",
#             "beneficiary_name",
#             "beneficiary_account",
#             "beneficiary_bank",
#             "swift_code",
#             "country",
#             "bank_transfer_rate",
#             "sender_name",
#             "sender_account",
#             "execution_datetime",
#             "transferring_bank",
#             "request_date",
#             "from_account",
#             "reference_no",
#             "notes",
#             "status",
#             "creation",
#             "modified",
#         ],
#         order_by="creation desc",
#         start=start,
#         page_length=page_length,
#     )



#     customer_names = {}

#     customer_ids = {
#         row.customer
#         for row in operations
#         if row.customer
#     }

#     if customer_ids:
#         customers = frappe.get_all(
#             "Archive Customer",
#             filters={
#                 "name": ["in", list(customer_ids)],
#             },
#             fields=[
#                 "name",
#                 "customer_name",
#             ],
#         )

#         customer_names = {
#             row.name: row.customer_name
#             for row in customers
#         }


#     account_names = {}

#     account_ids = {
#         row.from_account
#         for row in operations
#         if row.from_account
#     }

#     if account_ids:
#         accounts = frappe.get_all(
#             "Archive Account",
#             filters={
#                 "name": ["in", list(account_ids)],
#             },
#             fields=[
#                 "name",
#                 "account_name",
#             ],
#         )

#         account_names = {
#             row.name: row.account_name
#             for row in accounts
#         }

#     for operation in operations:
#         operation["customer_name"] = (
#             customer_names.get(operation.customer)
#             if operation.customer
#             else None
#         )

#         operation["from_account_name"] = (
#             account_names.get(operation.from_account)
#             if operation.from_account
#             else None
#         )
#     # عدد النتائج المطابقة للفلتر/البحث الحالي.
#     matching_names = frappe.get_list(
#         "Archive Operation",
#         filters=filters,
#         or_filters=or_filters,
#         pluck="name",
#         limit_page_length=0,
#     )

#     total_matching = len(matching_names)

#     # عدادات الحالات لجميع العمليات.
#     counts = {
#         "all": frappe.db.count(
#             "Archive Operation"
#         ),

#         "غير مؤكدة": frappe.db.count(
#             "Archive Operation",
#             {
#                 "status": "غير مؤكدة",
#             },
#         ),

#         "مؤكدة": frappe.db.count(
#             "Archive Operation",
#             {
#                 "status": "مؤكدة",
#             },
#         ),

#         "مرتجعة": frappe.db.count(
#             "Archive Operation",
#             {
#                 "status": "مرتجعة",
#             },
#         ),

#         "محضورة": frappe.db.count(
#             "Archive Operation",
#             {
#                 "status": "محضورة",
#             },
#         ),
#     }

#     return {
#         "operations": operations,
#         "counts": counts,
#         "total": total_matching,
#         "start": start,
#         "page_length": page_length,
#         "has_more":
#             start + len(operations)
#             < total_matching,
#     }


# # @frappe.whitelist(methods=["POST"])
# # def change_operation_status(        
# #     operation_name: str,
# #     status: str,
# #     ) -> dict[str, Any]:

# #     operation_name = (operation_name or "").strip()
# #     status = (status or "").strip()

# #     if not operation_name:
# #         frappe.throw(
# #             _("اسم العملية مطلوب.")
# #         )

# #     if status not in VALID_STATUSES:
# #         frappe.throw(
# #             _("حالة العملية غير صحيحة.")
# #         )

# #     operation = frappe.get_doc(
# #         "Archive Operation",
# #         operation_name,
# #     )

# #     operation.check_permission("write")

# #     if operation.status == status:
# #         return {
# #             "name": operation.name,
# #             "status": operation.status,
# #         }

# #     operation.flags.allow_status_transition = True

# #     operation.status = status

# #     operation.save()

# #     return {
# #         "name": operation.name,
# #         "status": operation.status,
# #     }

# @frappe.whitelist(methods=["POST"])
# def change_operation_status(
#     operation_name: str,
#     status: str,
#     status_effective_datetime: str,
#     remarks: str | None = None,
# ) -> dict[str, Any]:

#     operation_name = (
#         operation_name or ""
#     ).strip()

#     status = (
#         status or ""
#     ).strip()

#     remarks = (
#         remarks or ""
#     ).strip()

#     if not operation_name:
#         frappe.throw(
#             _("اسم العملية مطلوب.")
#         )

#     if status not in VALID_STATUSES:
#         frappe.throw(
#             _("حالة العملية غير صحيحة.")
#         )

#     if not status_effective_datetime:
#         frappe.throw(
#             _("تاريخ الحالة مطلوب.")
#         )

#     operation = frappe.get_doc(
#         "Archive Operation",
#         operation_name,
#     )

#     operation.check_permission(
#         "write"
#     )

#     old_status = operation.status

#     if old_status == status:
#         frappe.throw(
#             _(
#                 "الحالة الجديدة مطابقة للحالة الحالية."
#             )
#         )

#     try:
#         effective_datetime = getdate(
#             status_effective_datetime
#         )
#     except Exception:
#         frappe.throw(
#             _("تاريخ الحالة غير صحيح.")
#         )

#     system_datetime = now_datetime()

#     # /*
#     #  * تاريخ الحالة هو تاريخ وقوع الحدث فعلياً،
#     #  * لذلك لا يجب أن يكون في المستقبل.
#     #  */
#     if (
#         effective_datetime
#         > system_datetime
#     ):
#         frappe.throw(
#             _(
#                 "تاريخ الحالة لا يمكن أن يكون في المستقبل."
#             )
#         )

#     changed_by = frappe.session.user

#     # /*
#     #  * Controller الخاص بـ Archive Operation
#     #  * يمنع تغيير status مباشرة.
#     #  * هذا العلم يسمح فقط لهذا المسار المصرح به.
#     #  */
#     operation.flags.allow_status_transition = True

#     operation.status = status

#     operation.status_effective_datetime = (
#         effective_datetime
#     )

#     operation.status_changed_at = (
#         system_datetime
#     )

#     operation.status_changed_by = (
#         changed_by
#     )

#     # /*
#     #  * إضافة سجل تاريخي دائم.
#     #  */
#     operation.append(
#         "status_history",
#         {
#             "from_status":
#                 old_status,

#             "to_status":
#                 status,

#             "status_effective_datetime":
#                 effective_datetime,

#             "system_datetime":
#                 system_datetime,

#             "changed_by":
#                 changed_by,

#             "remarks":
#                 remarks or None,
#         },
#     )

#     operation.save()

#     return {
#         "name":
#             operation.name,

#         "from_status":
#             old_status,

#         "status":
#             operation.status,

#         "status_effective_datetime":
#             operation.status_effective_datetime,

#         "status_changed_at":
#             operation.status_changed_at,

#         "status_changed_by":
#             operation.status_changed_by,
#     }

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime
from typing import Any


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


# ============================================================
# Manual editable fields
#
# هذه الحقول فقط يمكن تعديلها بعد إنشاء العملية.
#
# أي حقل تم استخراجه من المستند غير موجود هنا،
# وبالتالي لا يمكن تعديله حتى عن طريق API.
# ============================================================

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
# Status permission roles
#
# يتم إنشاء هذه Roles من النظام لاحقاً.
# ============================================================

INITIAL_STATUS_ROLE = (
    "Archive Operation Initial Status"
)

ADVANCED_STATUS_ROLE = (
    "Archive Operation Advanced Status"
)

STATUS_MANAGER_ROLE = (
    "Archive Operation Status Manager"
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


# ============================================================
# Status permissions
# ============================================================

def can_change_operation_status(
    current_status: str,
) -> bool:

    user = frappe.session.user

    # Administrator يملك جميع الصلاحيات.
    if user == "Administrator":
        return True

    roles = set(
        frappe.get_roles(
            user
        )
    )

    # مدير حالات الأرشيف.
    if (
        STATUS_MANAGER_ROLE
        in roles
    ):
        return True

    # تغيير العملية وهي غير مؤكدة
    # يحتاج صلاحية Initial Status.
    if (
        current_status
        == "غير مؤكدة"
    ):
        return (
            INITIAL_STATUS_ROLE
            in roles
        )

    # أي عملية خرجت من غير مؤكدة
    # تحتاج صلاحية Advanced Status.
    return (
        ADVANCED_STATUS_ROLE
        in roles
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
                "file":
                    row.file,

                "file_name":
                    row.file_name,

                "is_extraction_source":
                    bool(
                        row.is_extraction_source
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

    # أي عملية جديدة تبدأ غير مؤكدة.
    doc.status = (
        "غير مؤكدة"
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
    start: int = 0,
    page_length: int = 20,
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
                or 20
            ),
            1,
        ),
        100,
    )

    filters = {}

    if status:

        if (
            status
            not in VALID_STATUSES
        ):
            frappe.throw(
                _(
                    "حالة العملية غير صحيحة."
                )
            )

        filters[
            "status"
        ] = status

    or_filters = []

    if search:

        like_value = (
            f"%{search}%"
        )

        search_fields = (
            "name",
            "operation_no",
            "customer",
            "beneficiary_name",
            "beneficiary_account",
            "beneficiary_bank",
            "sender_name",
            "sender_account",
            "reference_no",
        )

        or_filters = [
            [
                fieldname,
                "like",
                like_value,
            ]
            for fieldname
            in search_fields
        ]

    operations = frappe.get_list(
        "Archive Operation",

        filters=
            filters,

        or_filters=
            or_filters,

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
            "creation",
            "modified",
        ],

        order_by=
            "creation desc",

        start=
            start,

        page_length=
            page_length,
    )


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


    # ========================================================
    # Matching count
    # ========================================================

    matching_names = frappe.get_list(
        "Archive Operation",

        filters=
            filters,

        or_filters=
            or_filters,

        pluck=
            "name",

        limit_page_length=
            0,
    )

    total_matching = len(
        matching_names
    )


    # ========================================================
    # Status counters
    # ========================================================

    counts = {
        "all":
            frappe.db.count(
                "Archive Operation"
            ),

        "غير مؤكدة":
            frappe.db.count(
                "Archive Operation",
                {
                    "status":
                        "غير مؤكدة",
                },
            ),

        "مؤكدة":
            frappe.db.count(
                "Archive Operation",
                {
                    "status":
                        "مؤكدة",
                },
            ),

        "مرتجعة":
            frappe.db.count(
                "Archive Operation",
                {
                    "status":
                        "مرتجعة",
                },
            ),

        "محضورة":
            frappe.db.count(
                "Archive Operation",
                {
                    "status":
                        "محضورة",
                },
            ),
    }

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


# ============================================================
# Get operation for custom view dialog
# ============================================================

@frappe.whitelist(
    methods=["GET", "POST"]
)
def get_operation_for_view(
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
        },
    }


# ============================================================
# Update only manually-entered fields
# ============================================================

@frappe.whitelist(
    methods=["POST"]
)
def update_operation_manual_fields(
    operation_name: str,
    values: dict[str, Any] | str | None = None,
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

    values = _parse(
        values,
        {},
    )

    if not isinstance(
        values,
        dict,
    ):
        frappe.throw(
            _(
                "بيانات التعديل غير صحيحة."
            )
        )

    operation = frappe.get_doc(
        "Archive Operation",
        operation_name,
    )

    # التعديل يعتمد على Write
    # من Role Permission Manager.
    operation.check_permission(
        "write"
    )

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

    operation.save()

    return {
        "operation":
            serialize_operation_for_view(
                operation
            )
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