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