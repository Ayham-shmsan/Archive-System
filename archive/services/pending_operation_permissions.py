from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.permissions import get_role_permissions


PENDING_DOCTYPE = "Archive Pending Operation"

CREATE_PENDING_OPERATION_PERMISSION = (
    "create_pending_operation"
)
VIEW_OWN_PENDING_OPERATIONS_PERMISSION = (
    "view_own_pending_operations"
)
VIEW_ALL_PENDING_OPERATIONS_PERMISSION = (
    "view_all_pending_operations"
)
EDIT_OWN_PENDING_OPERATIONS_PERMISSION = (
    "edit_own_pending_operations"
)
EDIT_ALL_PENDING_OPERATIONS_PERMISSION = (
    "edit_all_pending_operations"
)
ADD_PENDING_RETURN_PERMISSION = (
    "add_pending_return"
)
CORRECT_PENDING_LEDGER_PERMISSION = (
    "correct_pending_ledger"
)

PENDING_PERMISSION_TYPES = (
    CREATE_PENDING_OPERATION_PERMISSION,
    VIEW_OWN_PENDING_OPERATIONS_PERMISSION,
    VIEW_ALL_PENDING_OPERATIONS_PERMISSION,
    EDIT_OWN_PENDING_OPERATIONS_PERMISSION,
    EDIT_ALL_PENDING_OPERATIONS_PERMISSION,
    ADD_PENDING_RETURN_PERMISSION,
    CORRECT_PENDING_LEDGER_PERMISSION,
)

_READ_LIKE_PERMISSION_TYPES = {
    "read",
    "select",
    "report",
    "export",
    "print",
    "email",
}

_ALWAYS_DENIED_GENERIC_PERMISSION_TYPES = {
    "delete",
    "share",
    "submit",
    "cancel",
    "amend",
    "import",
}


def _get_user(user: str | None = None) -> str:
    return user or frappe.session.user


def _is_administrator(user: str) -> bool:
    return user == "Administrator"


def _get_pending_role_permissions(
    user: str | None = None,
) -> dict[str, Any]:
    """
    يعيد Role Permissions الفعلية للـDocType.

    نستخدم get_role_permissions مباشرة بدل frappe.has_permission
    حتى لا ندخل في recursion مع has_permission hook الخاص بنفس DocType.
    """

    user = _get_user(user)

    if user == "Guest":
        return {}

    return get_role_permissions(
        PENDING_DOCTYPE,
        user=user,
    )


def _has_pending_permission(
    permission_type: str,
    user: str | None = None,
) -> bool:
    user = _get_user(user)

    if _is_administrator(user):
        return True

    if user == "Guest":
        return False

    permissions = _get_pending_role_permissions(user)

    return bool(
        permissions.get(permission_type)
    )


def _get_pending_scope(
    user: str | None = None,
    *,
    throw: bool = True,
) -> str | None:
    """
    يعيد نطاق رؤية المعلقات للمستخدم:

    all  -> جميع العمليات.
    own  -> العمليات التي owner فيها هو المستخدم الحالي.
    None -> لا توجد صلاحية رؤية.
    """

    user = _get_user(user)

    if _is_administrator(user):
        return "all"

    if _has_pending_permission(
        VIEW_ALL_PENDING_OPERATIONS_PERMISSION,
        user=user,
    ):
        return "all"

    if _has_pending_permission(
        VIEW_OWN_PENDING_OPERATIONS_PERMISSION,
        user=user,
    ):
        return "own"

    if throw:
        frappe.throw(
            _(
                "ليس لديك صلاحية لعرض العمليات المعلقة."
            ),
            frappe.PermissionError,
        )

    return None


def _get_operation_owner(operation) -> str:
    if isinstance(operation, str):
        return (
            frappe.db.get_value(
                PENDING_DOCTYPE,
                operation,
                "owner",
            )
            or ""
        )

    if isinstance(operation, dict):
        return operation.get("owner") or ""

    return (
        getattr(operation, "owner", None)
        or ""
    )


def _is_own_operation(
    operation,
    user: str,
) -> bool:
    return (
        _get_operation_owner(operation)
        == user
    )


def _can_view_pending_operation(
    operation,
    user: str | None = None,
) -> bool:
    user = _get_user(user)

    if _is_administrator(user):
        return True

    scope = _get_pending_scope(
        user=user,
        throw=False,
    )

    if scope == "all":
        return True

    if scope == "own":
        return _is_own_operation(
            operation,
            user,
        )

    return False


def _require_create_pending_operation(
    user: str | None = None,
) -> None:
    user = _get_user(user)

    if _has_pending_permission(
        CREATE_PENDING_OPERATION_PERMISSION,
        user=user,
    ):
        return

    frappe.throw(
        _(
            "ليس لديك صلاحية لإنشاء عملية معلقة جديدة."
        ),
        frappe.PermissionError,
    )


def _require_view_pending_operation(
    operation,
    user: str | None = None,
) -> None:
    user = _get_user(user)

    if _can_view_pending_operation(
        operation,
        user=user,
    ):
        return

    frappe.throw(
        _(
            "ليس لديك صلاحية لعرض هذه العملية المعلقة."
        ),
        frappe.PermissionError,
    )


def _can_edit_pending_operation(
    operation,
    user: str | None = None,
) -> bool:
    user = _get_user(user)

    if _is_administrator(user):
        return True

    if not _can_view_pending_operation(
        operation,
        user=user,
    ):
        return False

    if _has_pending_permission(
        EDIT_ALL_PENDING_OPERATIONS_PERMISSION,
        user=user,
    ):
        return True

    if (
        _has_pending_permission(
            EDIT_OWN_PENDING_OPERATIONS_PERMISSION,
            user=user,
        )
        and _is_own_operation(
            operation,
            user,
        )
    ):
        return True

    return False


def _require_edit_pending_operation(
    operation,
    user: str | None = None,
) -> None:
    user = _get_user(user)

    if _can_edit_pending_operation(
        operation,
        user=user,
    ):
        return

    frappe.throw(
        _(
            "ليس لديك صلاحية لتعديل بيانات هذه العملية المعلقة."
        ),
        frappe.PermissionError,
    )


def _can_add_pending_return(
    operation,
    user: str | None = None,
) -> bool:
    user = _get_user(user)

    if _is_administrator(user):
        return True

    return bool(
        _can_view_pending_operation(
            operation,
            user=user,
        )
        and _has_pending_permission(
            ADD_PENDING_RETURN_PERMISSION,
            user=user,
        )
    )


def _require_add_pending_return(
    operation,
    user: str | None = None,
) -> None:
    user = _get_user(user)

    if _can_add_pending_return(
        operation,
        user=user,
    ):
        return

    frappe.throw(
        _(
            "ليس لديك صلاحية لإضافة مبلغ مرتجع لهذه العملية."
        ),
        frappe.PermissionError,
    )


def _can_correct_pending_ledger(
    operation,
    user: str | None = None,
) -> bool:
    user = _get_user(user)

    if _is_administrator(user):
        return True

    return bool(
        _can_view_pending_operation(
            operation,
            user=user,
        )
        and _has_pending_permission(
            CORRECT_PENDING_LEDGER_PERMISSION,
            user=user,
        )
    )


def _require_correct_pending_ledger(
    operation,
    user: str | None = None,
) -> None:
    user = _get_user(user)

    if _can_correct_pending_ledger(
        operation,
        user=user,
    ):
        return

    frappe.throw(
        _(
            "ليس لديك صلاحية لتصحيح الحركة المالية لهذه العملية."
        ),
        frappe.PermissionError,
    )


# def get_pending_capabilities(
#     user: str | None = None,
# ) -> dict[str, Any]:
#     """
#     قدرات عامة للشاشة.

#     الصلاحيات المرتبطة بسجل محدد تحسب مرة أخرى عبر
#     get_pending_record_permissions لأن own/all قد يغير النتيجة.
#     """

#     user = _get_user(user)

#     if user == "Guest":
#         frappe.throw(
#             _("يجب تسجيل الدخول."),
#             frappe.PermissionError,
#         )

#     scope = _get_pending_scope(
#         user=user,
#         throw=False,
#     )

#     can_view_own = _has_pending_permission(
#         VIEW_OWN_PENDING_OPERATIONS_PERMISSION,
#         user=user,
#     )
#     can_view_all = _has_pending_permission(
#         VIEW_ALL_PENDING_OPERATIONS_PERMISSION,
#         user=user,
#     )
#     can_edit_own = _has_pending_permission(
#         EDIT_OWN_PENDING_OPERATIONS_PERMISSION,
#         user=user,
#     )
#     can_edit_all = _has_pending_permission(
#         EDIT_ALL_PENDING_OPERATIONS_PERMISSION,
#         user=user,
#     )

#     can_view = bool(scope)

#     return {
#         "can_create": _has_pending_permission(
#             CREATE_PENDING_OPERATION_PERMISSION,
#             user=user,
#         ),

#         "can_view": can_view,

#         "scope": scope,

#         "can_view_own": can_view_own,

#         "can_view_all": can_view_all,

#         "can_edit": bool(
#             can_view
#             and (
#                 can_edit_own
#                 or can_edit_all
#             )
#         ),

#         "can_edit_own": can_edit_own,

#         "can_edit_all": can_edit_all,

#         "can_add_return": bool(
#             can_view
#             and _has_pending_permission(
#                 ADD_PENDING_RETURN_PERMISSION,
#                 user=user,
#             )
#         ),

#         "can_correct_ledger": bool(
#             can_view
#             and _has_pending_permission(
#                 CORRECT_PENDING_LEDGER_PERMISSION,
#                 user=user,
#             )
#         ),
#     }

def get_pending_capabilities(
    user: str | None = None,
) -> dict[str, Any]:
    user = _get_user(user)

    if user == "Guest":
        frappe.throw(
            _("يجب تسجيل الدخول."),
            frappe.PermissionError,
        )

    # مهم:
    # المستخدم قد يملك create_pending_operation
    # بدون أي صلاحية View.
    #
    # لذلك لا يجوز أن نرمي PermissionError هنا.
    # scope=None حالة صحيحة ومقصودة.
    scope = _get_pending_scope(
        user,
        throw=False,
    )

    can_view_own = (
        _has_pending_permission(
            VIEW_OWN_PENDING_OPERATIONS_PERMISSION,
            user,
        )
    )

    can_view_all = (
        _has_pending_permission(
            VIEW_ALL_PENDING_OPERATIONS_PERMISSION,
            user,
        )
    )

    can_edit_own = (
        _has_pending_permission(
            EDIT_OWN_PENDING_OPERATIONS_PERMISSION,
            user,
        )
    )

    can_edit_all = (
        _has_pending_permission(
            EDIT_ALL_PENDING_OPERATIONS_PERMISSION,
            user,
        )
    )

    can_view = (
        scope in {
            "own",
            "all",
        }
    )

    can_create = (
        _has_pending_permission(
            CREATE_PENDING_OPERATION_PERMISSION,
            user,
        )
    )

    can_edit = (
        can_view
        and (
            can_edit_own
            or can_edit_all
        )
    )

    can_add_return = (
        can_view
        and _has_pending_permission(
            ADD_PENDING_RETURN_PERMISSION,
            user,
        )
    )

    can_correct_ledger = (
        can_view
        and _has_pending_permission(
            CORRECT_PENDING_LEDGER_PERMISSION,
            user,
        )
    )

    return {
        "can_create":
            can_create,

        "can_view":
            can_view,

        "scope":
            scope,

        "can_view_own":
            can_view_own,

        "can_view_all":
            can_view_all,

        "can_edit":
            can_edit,

        "can_edit_own":
            can_edit_own,

        "can_edit_all":
            can_edit_all,

        "can_add_return":
            can_add_return,

        "can_correct_ledger":
            can_correct_ledger,
    }

def get_pending_record_permissions(
    operation,
    user: str | None = None,
) -> dict[str, bool]:
    user = _get_user(user)

    can_view = _can_view_pending_operation(
        operation,
        user=user,
    )

    return {
        "can_view": can_view,

        "can_edit": bool(
            can_view
            and _can_edit_pending_operation(
                operation,
                user=user,
            )
        ),

        "can_add_return": bool(
            can_view
            and _can_add_pending_return(
                operation,
                user=user,
            )
        ),

        "can_correct_ledger": bool(
            can_view
            and _can_correct_pending_ledger(
                operation,
                user=user,
            )
        ),

        "can_delete": False,

        "can_share": False,
    }


def get_permission_query_conditions(
    user: str | None = None,
) -> str:
    """
    حماية List View / reports / frappe.get_list.

    view_all -> بلا شرط إضافي.
    view_own -> owner == user.
    بدون صلاحية -> لا يعيد أي سجل.
    """

    user = _get_user(user)

    if _is_administrator(user):
        return ""

    scope = _get_pending_scope(
        user=user,
        throw=False,
    )

    if scope == "all":
        return ""

    if scope == "own":
        return (
            f"`tab{PENDING_DOCTYPE}`.`owner` = "
            f"{frappe.db.escape(user)}"
        )

    return "1=0"


def has_permission(
    doc,
    ptype: str | None = None,
    user: str | None = None,
    debug: bool = False,
) -> bool:
    """
    حماية إضافية على مستوى السجل للـDesk والـGeneric API.

    Frappe controller permission hooks تستطيع المنع فقط؛
    Role Permission Manager يبقى مسؤولاً عن منح الـpermission الأساسي.
    """

    del debug

    user = _get_user(user)
    ptype = ptype or "read"

    if _is_administrator(user):
        return True

    if user == "Guest":
        return False

    if ptype in _READ_LIKE_PERMISSION_TYPES:
        return _can_view_pending_operation(
            doc,
            user=user,
        )

    if ptype == "write":
        return _can_edit_pending_operation(
            doc,
            user=user,
        )

    if ptype == "create":
        return _has_pending_permission(
            CREATE_PENDING_OPERATION_PERMISSION,
            user=user,
        )

    if ptype in _ALWAYS_DENIED_GENERIC_PERMISSION_TYPES:
        return False

    # Permission Types المخصصة نفسها يقررها Role Permission Engine.
    # نعيد True هنا حتى لا نلغي نتيجة الـDocPerm / Custom DocPerm.
    if ptype in PENDING_PERMISSION_TYPES:
        return True

    return True