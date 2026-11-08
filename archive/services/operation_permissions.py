import frappe
from frappe import _
from frappe.utils import cint


MANAGE_ATTACHMENTS_PERMISSION = (
    "manage_attachments"
)

RE_EXTRACT_OPERATION_DATA_PERMISSION = (
    "re_extract_operation_data"
)

ROLE_ATTACH_INCOMPLETE_INVOICE = (
    "صلاحية إرفاق الفاتورة غير المكتملة"
)

ROLE_OPERATIONS_SCREEN_ACCESS = (
    "صلاحية الوصول إلى شاشة العمليات"
)


def has_operations_screen_access_role(
    user: str | None = None,
) -> bool:
    """
    بوابة الدخول المستقلة لشاشة العمليات.
    فحص صريح في Has Role للمستخدم المفعّل دون أي تجاوز لـ Administrator أو System Manager.
    """
    resolved_user = user or frappe.session.user or "Guest"
    if not resolved_user or resolved_user == "Guest":
        return False
    if not cint(frappe.db.get_value("User", resolved_user, "enabled")):
        return False
    return bool(
        frappe.db.exists(
            "Has Role",
            {
                "parent": resolved_user,
                "parenttype": "User",
                "role": ROLE_OPERATIONS_SCREEN_ACCESS,
            },
        )
    )


def require_operations_screen_access(
    user: str | None = None,
) -> None:
    if not has_operations_screen_access_role(user=user):
        frappe.throw(
            _("ليست لديك صلاحية الوصول إلى شاشة العمليات."),
            frappe.PermissionError,
        )


def can_attach_incomplete_invoice(
    operation=None,
    user: str | None = None,
) -> bool:
    """
    صلاحية مستقلة وحصرية لإرفاق الفاتورة غير المكتملة.
    لا تُمنح تلقائيًا لـ Administrator أو System Manager أو أي دور آخر،
    بل فقط لمن يحمل Role (صلاحية إرفاق الفاتورة غير المكتملة) صراحةً في Has Role.
    """
    resolved_user = user or frappe.session.user or "Guest"
    if not resolved_user or resolved_user == "Guest":
        return False

    has_explicit_role = bool(
        frappe.db.exists(
            "Has Role",
            {
                "parent": resolved_user,
                "parenttype": "User",
                "role": ROLE_ATTACH_INCOMPLETE_INVOICE,
            },
        )
    )
    if not has_explicit_role:
        return False

    if operation is not None:
        return bool(
            frappe.has_permission(
                "Archive Operation",
                ptype="read",
                doc=operation,
                user=resolved_user,
            )
        )

    return bool(
        frappe.has_permission(
            "Archive Operation",
            ptype="read",
            user=resolved_user,
        )
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