from __future__ import annotations

from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cstr

from archive.services.pending_operation_permissions import (
    _require_edit_pending_operation,
)


PENDING_DOCTYPE = (
    "Archive Pending Operation"
)

PENDING_ATTACHMENT_DOCTYPE = (
    "Archive Pending Attachment"
)


def stage_pending_attachment_file(
    *,
    filename: str,
    content: bytes,
) -> dict[str, Any]:
    """
    ينشئ File خاصًا غير مرتبط بعملية حتى يتم إنشاء
    العملية نفسها.

    يستخدم في Create Dialog فقط.
    """

    filename = cstr(
        filename
    ).strip()

    if not filename:
        frappe.throw(
            _("اسم الملف مطلوب."),
            frappe.ValidationError,
        )

    if not content:
        frappe.throw(
            _("محتوى الملف فارغ."),
            frappe.ValidationError,
        )

    file_doc = frappe.get_doc(
        {
            "doctype":
                "File",

            "file_name":
                filename,

            # مرفقات المعلقات خاصة دائمًا.
            "is_private":
                1,

            "content":
                content,
        }
    )

    file_doc.insert(
        ignore_permissions=True
    )

    return _serialize_file(
        file_doc,
        staged=True,
    )


def add_uploaded_pending_attachment(
    *,
    operation_name: str,
    filename: str,
    content: bytes,
) -> dict[str, Any]:
    operation_name = cstr(
        operation_name
    ).strip()

    filename = cstr(
        filename
    ).strip()

    if not operation_name:
        frappe.throw(
            _("اسم العملية المعلقة مطلوب."),
            frappe.ValidationError,
        )

    if not filename:
        frappe.throw(
            _("اسم الملف مطلوب."),
            frappe.ValidationError,
        )

    if not content:
        frappe.throw(
            _("محتوى الملف فارغ."),
            frappe.ValidationError,
        )

    doc = frappe.get_doc(
        PENDING_DOCTYPE,
        operation_name,
        for_update=True,
    )

    _require_edit_pending_operation(
        doc
    )

    file_doc = frappe.get_doc(
        {
            "doctype":
                "File",

            "file_name":
                filename,

            "is_private":
                1,

            "attached_to_doctype":
                PENDING_DOCTYPE,

            "attached_to_name":
                doc.name,

            "content":
                content,
        }
    )

    file_doc.insert(
        ignore_permissions=True
    )

    doc.append(
        "attachments",
        {
            "file_id":
                file_doc.name,
        },
    )

    doc.save(
        ignore_permissions=True
    )

    return {
        "attachment":
            _get_serialized_attachment(
                doc,
                file_doc.name,
            ),

        "attachments":
            serialize_pending_attachments(
                doc
            ),

        "modified":
            doc.modified,
    }


def delete_pending_attachment(
    *,
    operation_name: str,
    file_id: str,
) -> dict[str, Any]:
    operation_name = cstr(
        operation_name
    ).strip()

    file_id = cstr(
        file_id
    ).strip()

    if not operation_name:
        frappe.throw(
            _("اسم العملية المعلقة مطلوب."),
            frappe.ValidationError,
        )

    if not file_id:
        frappe.throw(
            _("معرف الملف مطلوب."),
            frappe.ValidationError,
        )

    doc = frappe.get_doc(
        PENDING_DOCTYPE,
        operation_name,
        for_update=True,
    )

    _require_edit_pending_operation(
        doc
    )

    target_row = None

    for row in (
        doc.attachments
        or []
    ):
        if (
            cstr(
                row.file_id
            ).strip()
            == file_id
        ):
            target_row = row
            break

    if not target_row:
        frappe.throw(
            _(
                "المرفق المحدد غير مرتبط بهذه العملية."
            ),
            frappe.ValidationError,
        )

    file_data = frappe.db.get_value(
        "File",
        file_id,
        [
            "name",
            "owner",
            "file_name",
            "file_url",
            "attached_to_doctype",
            "attached_to_name",
        ],
        as_dict=True,
    )

    doc.remove(
        target_row
    )

    doc.save(
        ignore_permissions=True
    )

    file_deleted = False

    if file_data:
        attached_to_doctype = cstr(
            file_data.attached_to_doctype
        ).strip()

        attached_to_name = cstr(
            file_data.attached_to_name
        ).strip()

        if (
            attached_to_doctype
            == PENDING_DOCTYPE
            and
            attached_to_name
            == doc.name
        ):
            frappe.delete_doc(
                "File",
                file_id,
                ignore_permissions=True,
            )

            file_deleted = True

    return {
        "file_id":
            file_id,

        "file_deleted":
            file_deleted,

        "attachments":
            serialize_pending_attachments(
                doc
            ),

        "modified":
            doc.modified,
    }


def cleanup_staged_pending_attachments(
    file_ids: Iterable[str],
    *,
    user: str | None = None,
) -> dict[str, Any]:
    """
    تنظيف Files التي رفعت أثناء Create ثم فشل إنشاء
    العملية.

    لا يحذف إلا:
    - File.name المحدد.
    - الذي يملكه نفس المستخدم.
    - غير المرتبط بأي Document.
    """

    user = (
        user
        or frappe.session.user
    )

    deleted = []
    skipped = []

    for raw_file_id in (
        file_ids
        or []
    ):
        file_id = cstr(
            raw_file_id
        ).strip()

        if not file_id:
            continue

        file_data = frappe.db.get_value(
            "File",
            file_id,
            [
                "name",
                "owner",
                "is_folder",
                "attached_to_doctype",
                "attached_to_name",
            ],
            as_dict=True,
        )

        if not file_data:
            continue

        if file_data.is_folder:
            skipped.append(
                file_id
            )
            continue

        if (
            user != "Administrator"
            and file_data.owner != user
        ):
            skipped.append(
                file_id
            )
            continue

        if (
            file_data.attached_to_doctype
            or file_data.attached_to_name
        ):
            skipped.append(
                file_id
            )
            continue

        frappe.delete_doc(
            "File",
            file_id,
            ignore_permissions=True,
        )

        deleted.append(
            file_id
        )

    return {
        "deleted":
            deleted,

        "skipped":
            skipped,
    }


def validate_pending_attachment_reference(
    doc,
    file_id: str,
) -> frappe._dict:
    """
    يمنع تمرير File.name يعود لمستند آخر.

    File غير المرتبط مسموح فقط لمالكه، لأنه يمثل
    Staged upload أثناء إنشاء العملية.
    """

    file_id = cstr(
        file_id
    ).strip()

    if not file_id:
        frappe.throw(
            _("يوجد مرفق بدون معرف File."),
            frappe.ValidationError,
        )

    file_data = frappe.db.get_value(
        "File",
        file_id,
        [
            "name",
            "owner",
            "is_folder",
            "file_name",
            "file_url",
            "attached_to_doctype",
            "attached_to_name",
        ],
        as_dict=True,
    )

    if not file_data:
        frappe.throw(
            _(
                "سجل الملف غير موجود: {0}"
            ).format(
                file_id
            ),
            frappe.ValidationError,
        )

    if file_data.is_folder:
        frappe.throw(
            _("لا يمكن استخدام مجلد كمرفق."),
            frappe.ValidationError,
        )

    attached_to_doctype = cstr(
        file_data.attached_to_doctype
    ).strip()

    attached_to_name = cstr(
        file_data.attached_to_name
    ).strip()

    if (
        attached_to_doctype
        or attached_to_name
    ):
        if not (
            attached_to_doctype
            == PENDING_DOCTYPE
            and
            attached_to_name
            == cstr(
                doc.name
            ).strip()
        ):
            frappe.throw(
                _(
                    "الملف {0} مرتبط بسجل آخر "
                    "ولا يمكن استخدامه في هذه العملية."
                ).format(
                    file_id
                ),
                frappe.ValidationError,
            )

        return file_data

    user = frappe.session.user

    if (
        user != "Administrator"
        and file_data.owner != user
    ):
        frappe.throw(
            _(
                "لا يمكنك استخدام ملف مرفوع "
                "بواسطة مستخدم آخر."
            ),
            frappe.PermissionError,
        )

    return file_data


def adopt_pending_attachment_files(
    doc,
) -> None:
    """
    يربط Staged File records بالـParent الحقيقي
    بعد حصول العملية على name نهائي.
    """

    operation_name = cstr(
        doc.name
    ).strip()

    if not operation_name:
        return

    for row in (
        doc.attachments
        or []
    ):
        file_id = cstr(
            row.file_id
        ).strip()

        if not file_id:
            continue

        file_data = (
            validate_pending_attachment_reference(
                doc,
                file_id,
            )
        )

        if (
            file_data.attached_to_doctype
            == PENDING_DOCTYPE
            and
            cstr(
                file_data.attached_to_name
            ).strip()
            == operation_name
        ):
            continue

        frappe.db.set_value(
            "File",
            file_id,
            {
                "attached_to_doctype":
                    PENDING_DOCTYPE,

                "attached_to_name":
                    operation_name,
            },
            update_modified=False,
        )


def serialize_pending_attachments(
    doc,
) -> list[dict[str, Any]]:
    rows = list(
        doc.attachments
        or []
    )

    if not rows:
        return []

    file_ids = {
        cstr(
            row.file_id
        ).strip()

        for row in rows

        if cstr(
            row.file_id
        ).strip()
    }

    if not file_ids:
        return []

    files = frappe.get_all(
        "File",
        filters={
            "name": [
                "in",
                list(file_ids),
            ],
        },
        fields=[
            "name",
            "file_name",
            "file_url",
            "file_size",
            "file_type",
            "is_private",
            "owner",
            "creation",
        ],
    )

    file_map = {
        row.name:
            row

        for row in files
    }

    result = []

    for row in rows:
        file_id = cstr(
            row.file_id
        ).strip()

        file_data = file_map.get(
            file_id
        )

        result.append(
            {
                "name":
                    row.name,

                "file_id":
                    file_id,

                "file":
                    (
                        file_data.file_url
                        if file_data
                        else row.file
                    ),

                "file_name":
                    (
                        file_data.file_name
                        if file_data
                        else row.file_name
                    ),

                "file_size":
                    (
                        file_data.file_size
                        if file_data
                        else None
                    ),

                "file_type":
                    (
                        file_data.file_type
                        if file_data
                        else None
                    ),

                "is_private":
                    (
                        file_data.is_private
                        if file_data
                        else None
                    ),

                "owner":
                    (
                        file_data.owner
                        if file_data
                        else None
                    ),

                "creation":
                    (
                        file_data.creation
                        if file_data
                        else None
                    ),
            }
        )

    return result


def _get_serialized_attachment(
    doc,
    file_id: str,
) -> dict[str, Any] | None:
    for attachment in (
        serialize_pending_attachments(
            doc
        )
    ):
        if (
            attachment["file_id"]
            == file_id
        ):
            return attachment

    return None


def _serialize_file(
    file_doc,
    *,
    staged: bool,
) -> dict[str, Any]:
    return {
        "file_id":
            file_doc.name,

        "file":
            file_doc.file_url,

        "file_name":
            file_doc.file_name,

        "file_size":
            file_doc.file_size,

        "file_type":
            file_doc.file_type,

        "is_private":
            file_doc.is_private,

        "owner":
            file_doc.owner,

        "creation":
            file_doc.creation,

        "staged":
            staged,
    }