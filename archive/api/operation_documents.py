from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cstr

from archive.api.operation_timeline import (
    log_operation_event,
)
from archive.services.uploaded_files import (
    delete_unattached_file,
    get_unattached_uploaded_file,
)
from archive.services.operation_permissions import (
    can_manage_operation_attachments,
)
from archive.domain.shared_documents import (
    MAX_SHARED_DOCUMENTS,
    create_shared_operation_documents,
)
DOCUMENT_ROLE_SHARED_ATTACHMENT = (
    "shared_attachment"
)

DOCUMENT_ROLE_INVOICE = (
    "invoice"
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


def _get_operation(
    operation_name: str,
):
    operation_name = cstr(
        operation_name
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

    if not operation.operation_group:
        frappe.throw(
            _(
                "هذه العملية غير مرتبطة "
                "بمجموعة عملية."
            )
        )

    return operation


def _require_manage_permission(
    operation,
):
    if not can_manage_operation_attachments(
        operation
    ):
        frappe.throw(
            _(
                "ليس لديك صلاحية إدارة "
                "مستندات هذه العملية."
            ),
            frappe.PermissionError,
        )


def _serialize_document(
    document,
) -> dict[str, Any]:

    return {
        "name":
            document.name,

        "operation_group":
            document.operation_group,

        "source_operation":
            document.source_operation,

        "document_role":
            document.document_role,

        "file":
            document.file,

        "file_name":
            document.file_name,

        "file_extension":
            document.file_extension,

        "file_size":
            document.file_size,

        "owner":
            document.owner,

        "creation":
            document.creation,
    }


def _get_group_documents(
    operation_group: str,
):

    names = frappe.get_all(
        "Archive Operation Document",
        filters={
            "operation_group":
                operation_group,
        },
        pluck="name",
        order_by=
            "creation asc",
    )

    return [
        frappe.get_doc(
            "Archive Operation Document",
            name,
        )
        for name in names
    ]


def _attach_file_to_document(
    file_doc,
    document,
):
    """
    Archive Operation Document هو المالك
    المنطقي والفعلي للـ File.

    لا نربط File بالجزء OP-xxxxx.
    """

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


# ============================================================
# Read state
# ============================================================

@frappe.whitelist(
    methods=["GET", "POST"]
)
def get_operation_documents(
    operation_name: str,
) -> dict[str, Any]:

    operation = _get_operation(
        operation_name
    )

    documents = (
        _get_group_documents(
            operation.operation_group
        )
    )

    invoice = None
    attachments = []

    for document in documents:

        serialized = (
            _serialize_document(
                document
            )
        )

        if (
            document.document_role
            == DOCUMENT_ROLE_INVOICE
        ):
            invoice = serialized

        elif (
            document.document_role
            == DOCUMENT_ROLE_SHARED_ATTACHMENT
        ):
            attachments.append(
                serialized
            )

    can_manage = bool(
        can_manage_operation_attachments(
            operation
        )
    )

    return {
        "operation_name":
            operation.name,

        "operation_group":
            operation.operation_group,

        "invoice":
            invoice,

        "has_invoice":
            bool(invoice),

        "attachments":
            attachments,

        "attachment_count":
            len(attachments),

        "permissions": {
            "can_manage":
                can_manage,
        },
    }


# ============================================================
# Add shared attachments
# ============================================================


@frappe.whitelist(
    methods=["POST"]
)
def add_shared_attachments(
    operation_name: str,
    file_urls: list[str] | str | None = None,
) -> dict[str, Any]:

    operation = _get_operation(
        operation_name
    )


    _require_manage_permission(
        operation
    )


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


    if not isinstance(
        file_urls,
        list,
    ):
        frappe.throw(
            _(
                "بيانات المرفقات غير صحيحة."
            )
        )


    file_urls = [
        cstr(
            file_url
        ).strip()

        for file_url
        in file_urls

        if cstr(
            file_url
        ).strip()
    ]


    file_urls = list(
        dict.fromkeys(
            file_urls
        )
    )


    if not file_urls:
        frappe.throw(
            _(
                "يجب اختيار ملف واحد "
                "على الأقل."
            )
        )


    file_docs = [
        get_unattached_uploaded_file(
            file_url
        )

        for file_url
        in file_urls
    ]


    # ========================================================
    # Domain
    #
    # لا ننشئ Archive Operation Document هنا.
    # ========================================================

    created_documents = (
        create_shared_operation_documents(
            operation=
                operation,

            file_docs=
                file_docs,
        )
    )


    created = [
        _serialize_document(
            document
        )

        for document
        in created_documents
    ]


    # ========================================================
    # Clean duplicate temporary uploads
    #
    # الملفات التي لم يستخدمها Domain لأنها
    # موجودة مسبقاً تبقى File مؤقتة،
    # فننظفها هنا.
    # ========================================================

    created_urls = {
        document.file

        for document
        in created_documents
    }


    for file_doc in file_docs:

        if (
            file_doc.file_url
            in created_urls
        ):
            continue


        delete_unattached_file(
            file_doc
        )


    # ========================================================
    # Timeline
    # ========================================================

    if created:

        log_operation_event(
            operation.name,

            "attachment_added",

            "تمت إضافة مستندات مشتركة للعملية",

            details={
                "operation_group":
                    operation.operation_group,

                "files": [
                    {
                        "document":
                            row["name"],

                        "file_name":
                            row["file_name"],

                        "file_url":
                            row["file"],
                    }

                    for row
                    in created
                ],
            },

            event_source=
                "User",
        )


    return {
        "created":
            created,

        "state":
            get_operation_documents(
                operation.name
            ),
    }

# ============================================================
# Attach invoice
# ============================================================

@frappe.whitelist(
    methods=["POST"]
)
def attach_invoice(
    operation_name: str,
    file_url: str,
) -> dict[str, Any]:

    operation = _get_operation(
        operation_name
    )

    _require_manage_permission(
        operation
    )

    file_url = cstr(
        file_url
    ).strip()

    if not file_url:
        frappe.throw(
            _("ملف الفاتورة مطلوب.")
        )

    # فحص مبكر لتحسين الرسالة فقط.
    #
    # الـ unique constraint داخل
    # Archive Operation Document
    # يبقى الحماية النهائية ضد التزامن.
    existing_invoice = frappe.db.get_value(
        "Archive Operation Document",
        {
            "operation_group":
                operation.operation_group,

            "document_role":
                DOCUMENT_ROLE_INVOICE,
        },
        "name",
    )

    if existing_invoice:
        frappe.throw(
            _(
                "تم إرفاق فاتورة لهذه "
                "العملية مسبقاً."
            )
        )

    file_doc = (
        get_unattached_uploaded_file(
            file_url
        )
    )

    document = frappe.new_doc(
        "Archive Operation Document"
    )

    document.operation_group = (
        operation.operation_group
    )

    document.source_operation = (
        operation.name
    )

    document.document_role = (
        DOCUMENT_ROLE_INVOICE
    )

    document.file = (
        file_doc.file_url
    )

    try:
        document.insert(
            ignore_permissions=True
        )

    except frappe.DuplicateEntryError:

        delete_unattached_file(
            file_doc
        )

        frappe.throw(
            _(
                "تم إرفاق فاتورة لهذه "
                "العملية مسبقاً."
            )
        )

    _attach_file_to_document(
        file_doc,
        document,
    )

    log_operation_event(
        operation.name,
        "invoice_attached",
        "تم إرفاق فاتورة العملية",
        details={
            "operation_group":
                operation.operation_group,

            "document":
                document.name,

            "file_name":
                document.file_name,

            "file_url":
                document.file,
        },
        event_source="User",
    )

    return {
        "document":
            _serialize_document(
                document
            ),

        "state":
            get_operation_documents(
                operation.name
            ),
    }


# ============================================================
# Delete document
# ============================================================

@frappe.whitelist(
    methods=["POST"]
)
def delete_operation_document(
    operation_name: str,
    document_name: str,
) -> dict[str, Any]:

    operation = _get_operation(
        operation_name
    )

    _require_manage_permission(
        operation
    )

    document_name = cstr(
        document_name
    ).strip()

    if not document_name:
        frappe.throw(
            _("المستند مطلوب.")
        )

    document = frappe.get_doc(
        "Archive Operation Document",
        document_name,
    )

    # حماية أساسية:
    # لا يكفي أن يعرف المستخدم اسم AOD.
    if (
        document.operation_group
        != operation.operation_group
    ):
        frappe.throw(
            _(
                "هذا المستند لا يتبع "
                "هذه العملية."
            ),
            frappe.PermissionError,
        )

    document_data = (
        _serialize_document(
            document
        )
    )

    file_name = frappe.db.get_value(
        "File",
        {
            "file_url":
                document.file,

            "attached_to_doctype":
                "Archive Operation Document",

            "attached_to_name":
                document.name,
        },
        "name",
    )

    role = (
        document.document_role
    )

    # نحذف الكيان أولاً.
    document.delete(
        ignore_permissions=True
    )

    # ثم ملف Frappe نفسه.
    if file_name:
        file_doc = frappe.get_doc(
            "File",
            file_name,
        )

        file_doc.delete(
            ignore_permissions=True
        )

    event_title = (
        "تم حذف فاتورة العملية"
        if role
        == DOCUMENT_ROLE_INVOICE
        else
        "تم حذف مرفق مشترك من العملية"
    )

    log_operation_event(
        operation.name,
        "operation_document_deleted",
        event_title,
        details={
            "operation_group":
                operation.operation_group,

            "document":
                document_data["name"],

            "document_role":
                role,

            "file_name":
                document_data["file_name"],

            "file_url":
                document_data["file"],
        },
        event_source="User",
    )

    return {
        "deleted":
            True,

        "state":
            get_operation_documents(
                operation.name
            ),
    }


# ============================================================
# Operation number context
# ============================================================

@frappe.whitelist(
    methods=["GET", "POST"]
)
def get_operation_number_context(
    operation_no: str | None = None,
) -> dict[str, Any]:

    from archive.archive.doctype.archive_operation.archive_operation import (
        normalize_operation_no,
    )

    operation_no = cstr(
        operation_no
    ).strip()

    if not operation_no:
        return {
            "exists": False,
            "operation_group": None,
            "operation_no": None,
            "parts_count": 0,
            "documents": [],
            "documents_count": 0,
            "max_documents":
                MAX_SHARED_DOCUMENTS,
        }


    normalized = normalize_operation_no(
        operation_no
    )

    if not normalized:
        return {
            "exists": False,
            "operation_group": None,
            "operation_no": operation_no,
            "parts_count": 0,
            "documents": [],
            "documents_count": 0,
            "max_documents":
                MAX_SHARED_DOCUMENTS,
        }


    group = frappe.db.get_value(
        "Archive Operation Group",
        {
            "operation_no_normalized":
                normalized,
        },
        [
            "name",
            "operation_no",
        ],
        as_dict=True,
    )


    if not group:
        return {
            "exists": False,
            "operation_group": None,
            "operation_no": operation_no,
            "operation_no_normalized":
                normalized,
            "parts_count": 0,
            "documents": [],
            "documents_count": 0,
            "max_documents":
                MAX_SHARED_DOCUMENTS,
        }


    parts_count = frappe.db.count(
        "Archive Operation",
        {
            "operation_group":
                group.name,
        },
    )


    document_names = frappe.get_all(
        "Archive Operation Document",
        filters={
            "operation_group":
                group.name,
        },
        pluck="name",
        order_by="creation asc",
    )


    documents = []

    for document_name in document_names:

        document = frappe.get_doc(
            "Archive Operation Document",
            document_name,
        )

        documents.append(
            _serialize_document(
                document
            )
        )


    return {
        "exists": True,

        "operation_group":
            group.name,

        "operation_no":
            group.operation_no,

        "operation_no_normalized":
            normalized,

        "parts_count":
            parts_count,

        "documents":
            documents,

        "documents_count":
            len(documents),

        "max_documents":
            MAX_SHARED_DOCUMENTS,
    }


# ============================================================
# Operation number suggestions
# ============================================================

@frappe.whitelist(
    methods=["GET", "POST"]
)
def get_operation_number_suggestions(
    query: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:

    query = cstr(
        query
    ).strip()

    try:
        limit = int(limit)
    except (
        TypeError,
        ValueError,
    ):
        limit = 10

    limit = max(
        1,
        min(
            limit,
            20,
        ),
    )


    filters = {
        "operation_no":
            ["is", "set"],
    }

    if query:
        filters[
            "operation_no"
        ] = [
            "like",
            f"%{query}%",
        ]


    groups = frappe.get_all(
        "Archive Operation Group",
        filters=filters,
        fields=[
            "name",
            "operation_no",
        ],
        order_by=
            "modified desc",
        limit_page_length=
            limit,
    )


    result = []

    for group in groups:

        parts_count = frappe.db.count(
            "Archive Operation",
            {
                "operation_group":
                    group.name,
            },
        )

        documents_count = frappe.db.count(
            "Archive Operation Document",
            {
                "operation_group":
                    group.name,
            },
        )

        result.append(
            {
                "value":
                    group.operation_no,

                "operation_group":
                    group.name,

                "parts_count":
                    parts_count,

                "documents_count":
                    documents_count,
            }
        )


    return result


@frappe.whitelist(
    methods=["GET", "POST"]
)
def lookup_operation_numbers(
    query: str | None = None,
    limit: int = 8,
) -> dict[str, Any]:

    from archive.archive.doctype.archive_operation.archive_operation import (
        normalize_operation_no,
    )


    # المستخدم الذي يرى أرقام العمليات السابقة
    # يجب أن يملك صلاحية القراءة على العمليات.
    frappe.has_permission(
        "Archive Operation",
        "read",
        throw=True,
    )


    query = cstr(
        query
    ).strip()


    try:
        limit = int(
            limit
        )

    except (
        TypeError,
        ValueError,
    ):
        limit = 8


    limit = max(
        1,
        min(
            limit,
            20,
        ),
    )


    normalized_query = (
        normalize_operation_no(
            query
        )
    )


    if not normalized_query:

        return {
            "query":
                query,

            "normalized_query":
                "",

            "exact":
                None,

            "suggestions":
                [],

            "max_documents":
                MAX_SHARED_DOCUMENTS,
        }


    # ========================================================
    # Lookup
    #
    # نبحث في الرقم الموحد وليس النص الخام.
    #
    # Prefix search:
    #
    #   78
    #
    # يجد:
    #
    #   7800
    #   784512
    #   789999
    #
    # وهو أسرع وأكثر منطقية من:
    #
    #   %78%
    # ========================================================

    rows = frappe.db.sql(
        """
        SELECT

            g.name
                AS operation_group,

            g.operation_no
                AS operation_no,

            g.operation_no_normalized
                AS operation_no_normalized,

            COUNT(
                DISTINCT o.name
            )
                AS parts_count,

            COUNT(
                DISTINCT d.name
            )
                AS documents_count,

            g.modified
                AS modified

        FROM
            `tabArchive Operation Group` g

        LEFT JOIN
            `tabArchive Operation` o

            ON
                o.operation_group
                =
                g.name

        LEFT JOIN
            `tabArchive Operation Document` d

            ON
                d.operation_group
                =
                g.name

        WHERE

            g.operation_no_normalized
                IS NOT NULL

            AND
            g.operation_no_normalized
                != ''

            AND
            g.operation_no_normalized
                LIKE %(prefix)s

        GROUP BY

            g.name,
            g.operation_no,
            g.operation_no_normalized,
            g.modified

        ORDER BY

            CASE
                WHEN
                    g.operation_no_normalized
                    =
                    %(normalized)s
                THEN 0
                ELSE 1
            END,

            g.modified DESC

        LIMIT %(limit)s
        """,

        {
            "prefix":
                f"{normalized_query}%",

            "normalized":
                normalized_query,

            "limit":
                limit,
        },

        as_dict=True,
    )


    suggestions = [
        {
            "value":
                row.operation_no,

            "operation_group":
                row.operation_group,

            "operation_no_normalized":
                row.operation_no_normalized,

            "parts_count":
                int(
                    row.parts_count
                    or 0
                ),

            "documents_count":
                int(
                    row.documents_count
                    or 0
                ),
        }

        for row
        in rows
    ]


    # ========================================================
    # Exact match
    # ========================================================

    exact_row = next(
        (
            row
            for row
            in rows

            if cstr(
                row.operation_no_normalized
            ).strip()
            ==
            normalized_query
        ),
        None,
    )


    exact = None


    if exact_row:

        # ====================================================
        # Original / parent Part
        #
        # أول جزء في المجموعة هو مصدر تاريخ الطلب
        # لجميع الأجزاء اللاحقة.
        # ====================================================

        original_parts = frappe.get_all(
            "Archive Operation",

            filters={
                "operation_group":
                    exact_row.operation_group,
            },

            fields=[
                "name",
                "request_date",
            ],

            order_by=
                "creation asc, name asc",

            limit_page_length=
                1,
        )


        original_part = (
            original_parts[0]
            if original_parts
            else None
        )
        documents = frappe.get_all(
            "Archive Operation Document",

            filters={
                "operation_group":
                    exact_row.operation_group,
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
        )


        exact = {
            "exists":
                True,

            "value":
                exact_row.operation_no,

            "operation_no":
                exact_row.operation_no,

            "operation_no_normalized":
                exact_row.operation_no_normalized,

            "operation_group":
                exact_row.operation_group,

            "parts_count":
                int(
                    exact_row.parts_count
                    or 0
                ),

            "documents_count":
                len(
                    documents
                ),

            "request_date":
                (
                    original_part.request_date
                    if original_part
                    else None
                ),

            "documents":
                documents,
        }


    return {
        "query":
            query,

        "normalized_query":
            normalized_query,

        "exact":
            exact,

        "suggestions":
            suggestions,

        "max_documents":
            MAX_SHARED_DOCUMENTS,
    }