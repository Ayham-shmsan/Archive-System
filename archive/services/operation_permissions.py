import frappe


MANAGE_ATTACHMENTS_PERMISSION = (
    "manage_attachments"
)

RE_EXTRACT_OPERATION_DATA_PERMISSION = (
    "re_extract_operation_data"
)
def can_manage_operation_attachments(
    operation=None,
    user: str | None = None,
) -> bool:
    """
    الصلاحية المركزية لإدارة ملفات العملية.

    operation موجود في التوقيع حالياً
    للحفاظ على توافق الاستدعاءات الحالية.
    """

    user = (
        user
        or frappe.session.user
    )


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


def can_re_extract_operation_data(
    operation=None,
    user=None,
) -> bool:
    """
    صلاحية إعادة استخراج بيانات العملية
    من مستند PDF جديد.

    هذه الصلاحية مستقلة تماماً عن:
    - write
    - manage_attachments

    وجود أحدهما لا يمنح إعادة الاستخراج.
    """

    user = (
        user
        or frappe.session.user
    )


    if user == "Administrator":
        return True


    return bool(
        frappe.has_permission(
            "Archive Operation",

            ptype=
                RE_EXTRACT_OPERATION_DATA_PERMISSION,

            user=
                user,
        )
    )