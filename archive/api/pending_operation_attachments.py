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