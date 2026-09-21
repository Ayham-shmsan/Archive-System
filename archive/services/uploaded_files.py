from __future__ import annotations

from typing import Iterable

import frappe

from frappe import _
from frappe.utils import cstr


def _is_system_manager(
    user: str,
) -> bool:

    return (
        user == "Administrator"
        or
        "System Manager"
        in frappe.get_roles(
            user
        )
    )


def _validate_file_owner(
    file_doc,
):
    user = frappe.session.user

    if _is_system_manager(
        user
    ):
        return

    if (
        file_doc.owner
        != user
    ):
        frappe.throw(
            _(
                "لا تملك صلاحية استخدام هذا الملف."
            ),
            frappe.PermissionError,
        )


def _validate_file_unattached(
    file_doc,
):
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


def get_unattached_uploaded_file(
    file_url: str | None = None,
    file_id: str | None = None,
):
    """
    جلب سجل File مرفوع مؤقتاً وغير مرتبط.

    القاعدة الأساسية:
        File.name / file_id
        هو الهوية الحقيقية لسجل File.

    file_url:
        يستخدم للتحقق من أن السجل الذي أرسلته
        الواجهة هو بالفعل الملف المتوقع.

    يوجد fallback بالـ file_url مؤقتاً
    لدعم المسارات القديمة التي لم تنتقل
    إلى file_id بعد.
    """

    file_id = cstr(
        file_id
    ).strip()

    file_url = cstr(
        file_url
    ).strip()


    # ========================================================
    # Preferred path: exact File record
    # ========================================================

    if file_id:

        if not frappe.db.exists(
            "File",
            file_id,
        ):
            frappe.throw(
                _(
                    "سجل الملف المرفوع غير موجود."
                )
            )


        file_doc = frappe.get_doc(
            "File",
            file_id,
        )


        if (
            file_url
            and
            cstr(
                file_doc.file_url
            ).strip()
            !=
            file_url
        ):
            frappe.throw(
                _(
                    "بيانات الملف المرفوع غير متطابقة."
                )
            )


        _validate_file_owner(
            file_doc
        )

        _validate_file_unattached(
            file_doc
        )


        return file_doc


    # ========================================================
    # Legacy fallback by URL
    #
    # لا نختار أي File عشوائياً يحمل نفس URL.
    # نبحث فقط عن Upload غير مرتبط للمستخدم الحالي.
    # ========================================================

    if not file_url:
        frappe.throw(
            _("الملف مطلوب.")
        )


    user = frappe.session.user

    filters = {
        "file_url":
            file_url,

        "attached_to_doctype":
            ["is", "not set"],

        "attached_to_name":
            ["is", "not set"],
    }


    if not _is_system_manager(
        user
    ):
        filters[
            "owner"
        ] = user


    candidates = frappe.get_all(
        "File",

        filters=
            filters,

        fields=[
            "name",
        ],

        order_by=
            "creation desc",

        limit_page_length=
            1,
    )


    if not candidates:

        if frappe.db.exists(
            "File",
            {
                "file_url":
                    file_url,
            },
        ):
            frappe.throw(
                _(
                    "لا يوجد سجل رفع مؤقت غير مرتبط "
                    "لهذا الملف."
                )
            )

        frappe.throw(
            _(
                "الملف غير موجود: {0}"
            ).format(
                file_url
            )
        )


    file_doc = frappe.get_doc(
        "File",
        candidates[0].name,
    )


    _validate_file_owner(
        file_doc
    )

    _validate_file_unattached(
        file_doc
    )


    return file_doc


def delete_unattached_file(
    file_doc,
) -> bool:
    """
    حذف سجل File محدد فقط إذا بقي مؤقتاً
    وغير مرتبط بأي مستند.

    لا نبحث هنا بواسطة file_url.
    """

    if not file_doc:
        return False


    if not frappe.db.exists(
        "File",
        file_doc.name,
    ):
        return False


    file_doc.reload()


    if (
        file_doc.attached_to_doctype
        or file_doc.attached_to_name
    ):
        return False


    _validate_file_owner(
        file_doc
    )


    file_doc.delete(
        ignore_permissions=True
    )


    return True


def delete_temporary_uploaded_files(
    file_ids: Iterable[str],
) -> list[str]:
    """
    تنظيف ملفات Upload المؤقتة بواسطة
    File.name وليس file_url.

    هذا مهم لأن عدة File records يمكن
    أن تشير إلى نفس file_url/content.
    """

    deleted = []

    seen_ids = set()


    for file_id in (
        file_ids or []
    ):

        file_id = cstr(
            file_id
        ).strip()


        if (
            not file_id
            or file_id in seen_ids
        ):
            continue


        seen_ids.add(
            file_id
        )


        if not frappe.db.exists(
            "File",
            file_id,
        ):
            continue


        file_doc = frappe.get_doc(
            "File",
            file_id,
        )


        if delete_unattached_file(
            file_doc
        ):
            deleted.append(
                file_id
            )


    return deleted