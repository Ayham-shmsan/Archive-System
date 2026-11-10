from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cstr

from archive.services.pending_operation_attachments import (
    add_uploaded_pending_attachment,
    cleanup_staged_pending_attachments,
    delete_pending_attachment as
        delete_pending_attachment_service,
    stage_pending_attachment_file,
)

from archive.services.pending_operation_permissions import (
    _require_create_pending_operation,
    _require_view_pending_operation,
)


@frappe.whitelist(
    methods=["POST"]
)
def stage_pending_attachment():
    """
    يستدعى من frappe.handler.upload_file عبر method=...

    يستخدم أثناء Create قبل وجود Parent.
    """

    _require_create_pending_operation()

    filename, content = (
        _get_uploaded_file_payload()
    )

    return stage_pending_attachment_file(
        filename=filename,
        content=content,
    )


@frappe.whitelist(
    methods=["POST"]
)
def upload_pending_attachment():
    """
    رفع مباشر لعملية محفوظة.
    """

    operation_name = cstr(
        frappe.form_dict.get(
            "operation_name"
        )
    ).strip()

    if not operation_name:
        frappe.throw(
            _("اسم العملية المعلقة مطلوب."),
            frappe.ValidationError,
        )

    filename, content = (
        _get_uploaded_file_payload()
    )

    return add_uploaded_pending_attachment(
        operation_name=operation_name,
        filename=filename,
        content=content,
    )


@frappe.whitelist(
    methods=["POST"]
)
def delete_pending_attachment(
    name: str,
    file_id: str,
):
    return (
        delete_pending_attachment_service(
            operation_name=name,
            file_id=file_id,
        )
    )


@frappe.whitelist(
    methods=["POST"]
)
def cleanup_pending_staged_attachments(
    file_ids: str | list[str],
):
    _require_create_pending_operation()

    if isinstance(
        file_ids,
        str,
    ):
        file_ids = frappe.parse_json(
            file_ids
        )

    if not isinstance(
        file_ids,
        list,
    ):
        frappe.throw(
            _("قائمة الملفات غير صالحة."),
            frappe.ValidationError,
        )

    return (
        cleanup_staged_pending_attachments(
            file_ids,
        )
    )


@frappe.whitelist()
def download_pending_attachment(
    operation_name: str,
    file_id: str,
) -> None:
    clean_op = cstr(operation_name).strip()
    clean_fid = cstr(file_id).strip()

    if not clean_op or not clean_fid:
        frappe.throw(
            _("بيانات المرفق غير مكتملة."),
            frappe.ValidationError,
        )

    if not frappe.db.exists("Archive Pending Operation", clean_op):
        frappe.throw(
            _("العملية المعلقة غير موجودة."),
            frappe.DoesNotExistError,
        )

    doc = frappe.get_doc("Archive Pending Operation", clean_op)
    _require_view_pending_operation(doc)

    att_row = next(
        (
            row
            for row in (doc.attachments or [])
            if cstr(row.file_id).strip() == clean_fid
        ),
        None,
    )
    if not att_row or not frappe.db.exists("File", clean_fid):
        frappe.throw(
            _("المرفق غير موجود في هذه العملية المعلقة."),
            frappe.DoesNotExistError,
        )

    file_doc = frappe.get_doc("File", clean_fid)
    content = file_doc.get_content()
    filename = cstr(
        att_row.file_name or file_doc.file_name or clean_fid
    ).strip()

    frappe.local.response.filename = filename
    frappe.local.response.filecontent = content
    frappe.local.response.type = "download"


def _get_uploaded_file_payload() -> tuple[
    str,
    bytes,
]:
    filename = cstr(
        getattr(
            frappe.local,
            "uploaded_filename",
            None,
        )
        or ""
    ).strip()

    content = getattr(
        frappe.local,
        "uploaded_file",
        None,
    )

    if not filename:
        frappe.throw(
            _("اسم الملف المرفوع غير موجود."),
            frappe.ValidationError,
        )

    if not content:
        frappe.throw(
            _("محتوى الملف المرفوع غير موجود."),
            frappe.ValidationError,
        )

    if isinstance(
        content,
        bytearray,
    ):
        content = bytes(
            content
        )

    return (
        filename,
        content,
    )