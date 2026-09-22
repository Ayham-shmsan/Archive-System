from pathlib import Path
from hashlib import sha256
import frappe
from frappe import _
from frappe.utils import cstr


DOCUMENT_ROLE_SHARED_ATTACHMENT = (
    "shared_attachment"
)


MAX_SHARED_DOCUMENTS = 10


SHARED_DOCUMENT_ALLOWED_EXTENSIONS = {
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

    ".doc",
    ".docx",

    ".xls",
    ".xlsx",
}


def _get_file_extension(
    file_doc,
) -> str:

    file_name = cstr(
        file_doc.file_name
        or file_doc.file_url
    ).strip()

    return (
        Path(file_name)
        .suffix
        .lower()
    )

def _get_file_content_hash(
    file_doc,
) -> str:

    content_hash = cstr(
        file_doc.content_hash
    ).strip()


    if content_hash:
        return content_hash


    return sha256(
        cstr(
            file_doc.file_url
        ).encode(
            "utf-8"
        )
    ).hexdigest()


def validate_shared_document_file(
    file_doc,
):
    extension = (
        _get_file_extension(
            file_doc
        )
    )

    if (
        extension
        not in
        SHARED_DOCUMENT_ALLOWED_EXTENSIONS
    ):
        frappe.throw(
            _(
                "صيغة الملف غير مسموحة "
                "ضمن مستندات العملية: {0}"
            ).format(
                file_doc.file_name
            )
        )


def _lock_operation_group(
    operation_group,
):
    """
    نقفل صف المجموعة أثناء حساب العدد والإضافة.

    هذا يمنع مستخدمين متزامنين من تجاوز
    حد 10 ملفات لنفس المجموعة.
    """

    result = frappe.db.sql(
        """
        SELECT name
        FROM `tabArchive Operation Group`
        WHERE name = %s
        FOR UPDATE
        """,
        (
            operation_group,
        ),
    )

    if not result:
        frappe.throw(
            _("مجموعة العملية غير موجودة.")
        )


def create_shared_operation_documents(
    *,
    operation,
    file_docs,
):
    """
    إنشاء المستندات المشتركة الجديدة
    المرتبطة بمجموعة العملية.

    هذه هي نقطة الإنشاء الوحيدة
    لـ Archive Operation Document
    من نوع shared_attachment.

    السلوك Idempotent:
    إذا كان نفس محتوى الملف موجوداً
    مسبقاً في المجموعة فلا نضيف نسخة ثانية.
    """

    if not file_docs:
        return []


    operation_group = cstr(
        operation.operation_group
    ).strip()


    if not operation_group:
        frappe.throw(
            _(
                "العملية غير مرتبطة "
                "بمجموعة عملية."
            )
        )


    # ========================================================
    # Validate files first
    # ========================================================

    prepared_files = []

    seen_hashes = set()


    for file_doc in file_docs:

        validate_shared_document_file(
            file_doc
        )


        content_hash = (
            _get_file_content_hash(
                file_doc
            )
        )


        # نفس المحتوى مرسل مرتين
        # داخل نفس الطلب.
        if content_hash in seen_hashes:
            continue


        seen_hashes.add(
            content_hash
        )


        prepared_files.append(
            (
                file_doc,
                content_hash,
            )
        )


    if not prepared_files:
        return []


    # ========================================================
    # Lock group
    #
    # كل حساب العدد + الإنشاء يحدث
    # تحت نفس القفل.
    # ========================================================

    _lock_operation_group(
        operation_group
    )


    # ========================================================
    # Existing shared content
    # ========================================================

    existing_rows = frappe.get_all(
        "Archive Operation Document",

        filters={
            "operation_group":
                operation_group,

            "document_role":
                DOCUMENT_ROLE_SHARED_ATTACHMENT,
        },

        fields=[
            "content_hash",
        ],

        limit_page_length=
            0,
    )


    existing_hashes = {
        cstr(
            row.content_hash
        ).strip()

        for row
        in existing_rows

        if cstr(
            row.content_hash
        ).strip()
    }


    # ========================================================
    # Truly new documents
    # ========================================================

    new_files = [
        (
            file_doc,
            content_hash,
        )

        for (
            file_doc,
            content_hash,
        )
        in prepared_files

        if content_hash
        not in existing_hashes
    ]


    if not new_files:
        return []


    # ========================================================
    # Limit
    #
    # الحد يطبق على المستندات التي ستضاف فعلياً،
    # وليس على الملفات المكررة.
    # ========================================================

    current_count = frappe.db.count(
        "Archive Operation Document",
        {
            "operation_group":
                operation_group,
        },
    )


    if (
        current_count
        +
        len(
            new_files
        )
        >
        MAX_SHARED_DOCUMENTS
    ):

        remaining = max(
            MAX_SHARED_DOCUMENTS
            -
            current_count,
            0,
        )


        frappe.throw(
            _(
                "يمكن إرفاق {0} مستندات كحد أقصى "
                "للعملية. المتاح حالياً: {1}."
            ).format(
                MAX_SHARED_DOCUMENTS,
                remaining,
            )
        )


    # ========================================================
    # Create
    # ========================================================

    created = []


    for (
        file_doc,
        content_hash,
    ) in new_files:

        document = frappe.new_doc(
            "Archive Operation Document"
        )


        document.operation_group = (
            operation_group
        )

        document.source_operation = (
            operation.name
        )

        document.document_role = (
            DOCUMENT_ROLE_SHARED_ATTACHMENT
        )

        document.file = (
            file_doc.file_url
        )


        try:

            document.insert(
                ignore_permissions=True
            )


        except frappe.DuplicateEntryError:

            # حماية نهائية من أي سباق أو
            # بيانات موجودة مسبقاً.
            #
            # لا نفشل العملية كلها لأن
            # النتيجة المطلوبة موجودة أصلاً.
            continue


        file_doc.db_set(
            {
                "attached_to_doctype":
                    "Archive Operation Document",

                "attached_to_name":
                    document.name,

                "attached_to_field":
                    "file",
            },

            update_modified=False,
        )


        created.append(
            document
        )


    return created


def delete_shared_operation_documents(
    *,
    operation,
    document_names,
):
    """
    حذف مستندات العملية المشتركة المحفوظة على مستوى الـGroup.

    القواعد:
    - المستند يجب أن يتبع نفس operation_group.
    - نحذف فقط Archive Operation Document المطلوب بالاسم.
    - لا نستخدم file_url كهوية عالمية.
    - File يحذف فقط إذا كان مربوطاً بنفس AOD المحدد.
    """

    if not document_names:
        return []


    operation_group = cstr(
        operation.operation_group
    ).strip()


    if not operation_group:

        frappe.throw(
            _(
                "العملية غير مرتبطة بمجموعة عملية."
            )
        )


    # ========================================================
    # Normalize document names
    # ========================================================

    normalized_names = []

    seen_names = set()


    for document_name in document_names:

        document_name = cstr(
            document_name
        ).strip()


        if not document_name:
            continue


        if document_name in seen_names:
            continue


        seen_names.add(
            document_name
        )

        normalized_names.append(
            document_name
        )


    if not normalized_names:
        return []


    # ========================================================
    # Lock Group
    #
    # حتى لا يحدث حذف/إضافة متزامنة تؤثر على العدد.
    # ========================================================

    _lock_operation_group(
        operation_group
    )


    # ========================================================
    # Load exact documents
    #
    # البحث مقيد بالـGroup الحالي وبنوع Shared Document.
    # ========================================================

    documents = frappe.get_all(
        "Archive Operation Document",
        filters={
            "name": [
                "in",
                normalized_names,
            ],

            "operation_group":
                operation_group,

            "document_role":
                DOCUMENT_ROLE_SHARED_ATTACHMENT,
        },
        fields=[
            "name",
            "file",
            "file_name",
            "document_role",
            "operation_group",
            "source_operation",
        ],
        limit_page_length=0,
    )


    documents_by_name = {
        document.name:
            document
        for document
        in documents
    }


    # ========================================================
    # Every requested document must belong to this Group
    # ========================================================

    missing_names = [
        document_name
        for document_name
        in normalized_names
        if document_name
        not in documents_by_name
    ]


    if missing_names:

        frappe.throw(
            _(
                "أحد مستندات العملية المطلوب حذفها "
                "غير موجود أو لا يتبع مجموعة هذه العملية."
            )
        )


    deleted_documents = []


    # ========================================================
    # Delete
    # ========================================================

    for document_name in normalized_names:

        document = (
            documents_by_name[
                document_name
            ]
        )


        # ====================================================
        # Resolve exact File records attached to this AOD
        #
        # مهم:
        # لا نبحث بواسطة file_url فقط.
        # ====================================================

        file_rows = frappe.get_all(
            "File",
            filters={
                "attached_to_doctype":
                    "Archive Operation Document",

                "attached_to_name":
                    document.name,

                "attached_to_field":
                    "file",
            },
            fields=[
                "name",
                "file_name",
                "file_url",
            ],
            limit_page_length=0,
        )


        if len(file_rows) > 1:

            frappe.throw(
                _(
                    "وجد أكثر من سجل File مرتبط "
                    "بالمستند {0}. تم إيقاف الحذف "
                    "لحماية البيانات."
                ).format(
                    document.name
                )
            )


        file_row = (
            file_rows[0]
            if file_rows
            else None
        )


        deleted_documents.append(
            {
                "document":
                    document.name,

                "file_name":
                    document.file_name
                    or (
                        file_row.file_name
                        if file_row
                        else None
                    ),

                "file_url":
                    document.file,

                "operation_group":
                    operation_group,
            }
        )


        # ====================================================
        # Delete AOD
        # ====================================================

        frappe.delete_doc(
            "Archive Operation Document",
            document.name,
            ignore_permissions=True,
        )


        # ====================================================
        # Delete exact File if Frappe did not already remove it
        # ====================================================

        if (
            file_row
            and
            frappe.db.exists(
                "File",
                file_row.name,
            )
        ):

            frappe.delete_doc(
                "File",
                file_row.name,
                ignore_permissions=True,
            )


    return deleted_documents

# def delete_shared_operation_document(
#     *,
#     operation,
#     document_name,
# ):
#     """
#     حذف مستند مشترك محفوظ على مستوى الـGroup.

#     الحذف مقيد بمجموعة العملية المفتوحة،
#     ولا يعتمد على file_url كهوية للمستند.
#     """

#     operation_group = cstr(
#         operation.operation_group
#     ).strip()

#     document_name = cstr(
#         document_name
#     ).strip()


#     if not operation_group:
#         frappe.throw(
#             _(
#                 "العملية غير مرتبطة بمجموعة عملية."
#             )
#         )


#     if not document_name:
#         frappe.throw(
#             _(
#                 "معرف المستند المشترك مطلوب."
#             )
#         )


#     # ========================================================
#     # Lock group
#     # ========================================================

#     _lock_operation_group(
#         operation_group
#     )


#     # ========================================================
#     # Exact AOD
#     # ========================================================

#     document = frappe.get_doc(
#         "Archive Operation Document",
#         document_name,
#     )


#     if (
#         cstr(
#             document.operation_group
#         ).strip()
#         !=
#         operation_group
#     ):
#         frappe.throw(
#             _(
#                 "المستند المشترك لا يتبع "
#                 "مجموعة هذه العملية."
#             ),
#             frappe.PermissionError,
#         )


#     # ========================================================
#     # Exact File identity
#     #
#     # لا نبحث عن الملف عالمياً بواسطة URL.
#     # يجب أن يكون File مربوطاً بهذا AOD تحديداً.
#     # ========================================================

#     file_rows = frappe.get_all(
#         "File",
#         filters={
#             "attached_to_doctype":
#                 "Archive Operation Document",

#             "attached_to_name":
#                 document.name,

#             "attached_to_field":
#                 "file",

#             "file_url":
#                 document.file,
#         },
#         fields=[
#             "name",
#             "file_name",
#             "file_url",
#         ],
#         limit_page_length=0,
#     )


#     if len(file_rows) > 1:
#         frappe.throw(
#             _(
#                 "وجد أكثر من سجل File للمستند المشترك، "
#                 "ولن يتم الحذف لحماية البيانات."
#             )
#         )


#     file_row = (
#         file_rows[0]
#         if file_rows
#         else None
#     )


#     result = {
#         "document_name":
#             document.name,

#         "file_name":
#             document.file_name
#             or (
#                 file_row.file_name
#                 if file_row
#                 else ""
#             ),

#         "file_url":
#             document.file,

#         "document_role":
#             document.document_role,

#         "operation_group":
#             document.operation_group,
#     }


#     # ========================================================
#     # Delete AOD first
#     # ========================================================

#     frappe.delete_doc(
#         "Archive Operation Document",
#         document.name,
#         ignore_permissions=True,
#     )


#     # ========================================================
#     # Delete exact File if it still exists
#     #
#     # Frappe قد يحذفه مع المستند،
#     # لذلك نفحص أولاً.
#     # ========================================================

#     if (
#         file_row
#         and
#         frappe.db.exists(
#             "File",
#             file_row.name,
#         )
#     ):
#         frappe.delete_doc(
#             "File",
#             file_row.name,
#             ignore_permissions=True,
#         )


#     return result