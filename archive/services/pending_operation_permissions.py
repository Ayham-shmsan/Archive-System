from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint


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
CHANGE_PENDING_FAILURE_STATUS_PERMISSION = (
    "change_pending_failure_status"
)
CLOSE_REOPEN_PENDING_OPERATION_PERMISSION = (
    "close_reopen_pending_operation"
)
VIEW_PENDING_OPERATION_TIMELINE_PERMISSION = (
    "view_pending_operation_timeline"
)

ROLE_CREATE_PENDING_OPERATION = (
    "صلاحية إضافة عملية معلقة"
)
ROLE_VIEW_OWN_PENDING_OPERATIONS = (
    "صلاحية عرض المعلقات الخاصة بالمستخدم"
)
ROLE_VIEW_ALL_PENDING_OPERATIONS = (
    "صلاحية عرض جميع المعلقات"
)
ROLE_EDIT_OWN_PENDING_OPERATIONS = (
    "صلاحية تعديل المعلقات الخاصة بالمستخدم"
)
ROLE_EDIT_ALL_PENDING_OPERATIONS = (
    "صلاحية تعديل جميع المعلقات"
)
ROLE_ADD_PENDING_RETURN = (
    "صلاحية إضافة إرجاع في المعلقات"
)
ROLE_CORRECT_PENDING_LEDGER = (
    "صلاحية تصحيح حركة المبلغ في المعلقات"
)
ROLE_CHANGE_PENDING_FAILURE_STATUS = (
    "صلاحية تغيير حالة الفشل في المعلقات"
)
ROLE_CLOSE_REOPEN_PENDING_OPERATION = (
    "صلاحية إنهاء وإعادة فتح المعلقات"
)
ROLE_VIEW_PENDING_OPERATION_TIMELINE = (
    "صلاحية عرض سجل مستخدم العملية في شاشة المعلقات"
)
ROLE_PENDING_SCREEN_ACCESS = (
    "صلاحية الوصول إلى شاشة المعلقات"
)

NEW_SEPARATED_PENDING_ROLES = (
    ROLE_CREATE_PENDING_OPERATION,
    ROLE_VIEW_OWN_PENDING_OPERATIONS,
    ROLE_VIEW_ALL_PENDING_OPERATIONS,
    ROLE_EDIT_OWN_PENDING_OPERATIONS,
    ROLE_EDIT_ALL_PENDING_OPERATIONS,
    ROLE_ADD_PENDING_RETURN,
    ROLE_CORRECT_PENDING_LEDGER,
    ROLE_CHANGE_PENDING_FAILURE_STATUS,
    ROLE_CLOSE_REOPEN_PENDING_OPERATION,
    ROLE_VIEW_PENDING_OPERATION_TIMELINE,
)

PENDING_PERMISSION_ROLE_MAP: dict[str, str] = {
    CREATE_PENDING_OPERATION_PERMISSION:
        ROLE_CREATE_PENDING_OPERATION,
    VIEW_OWN_PENDING_OPERATIONS_PERMISSION:
        ROLE_VIEW_OWN_PENDING_OPERATIONS,
    VIEW_ALL_PENDING_OPERATIONS_PERMISSION:
        ROLE_VIEW_ALL_PENDING_OPERATIONS,
    EDIT_OWN_PENDING_OPERATIONS_PERMISSION:
        ROLE_EDIT_OWN_PENDING_OPERATIONS,
    EDIT_ALL_PENDING_OPERATIONS_PERMISSION:
        ROLE_EDIT_ALL_PENDING_OPERATIONS,
    ADD_PENDING_RETURN_PERMISSION:
        ROLE_ADD_PENDING_RETURN,
    CORRECT_PENDING_LEDGER_PERMISSION:
        ROLE_CORRECT_PENDING_LEDGER,
    CHANGE_PENDING_FAILURE_STATUS_PERMISSION:
        ROLE_CHANGE_PENDING_FAILURE_STATUS,
    CLOSE_REOPEN_PENDING_OPERATION_PERMISSION:
        ROLE_CLOSE_REOPEN_PENDING_OPERATION,
    VIEW_PENDING_OPERATION_TIMELINE_PERMISSION:
        ROLE_VIEW_PENDING_OPERATION_TIMELINE,
}

PENDING_PERMISSION_TYPES = tuple(
    PENDING_PERMISSION_ROLE_MAP.keys()
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
    return user or frappe.session.user or "Guest"


def _has_explicit_pending_role(
    role_name: str,
    user: str | None = None,
) -> bool:
    resolved_user = _get_user(user)
    if (
        not resolved_user
        or resolved_user == "Guest"
        or not role_name
    ):
        return False

    if not cint(
        frappe.db.get_value(
            "User",
            resolved_user,
            "enabled",
        )
    ):
        return False

    return bool(
        frappe.db.exists(
            "Has Role",
            {
                "parent": resolved_user,
                "parenttype": "User",
                "role": role_name,
            },
        )
    )


def has_pending_screen_access_role(
    user: str | None = None,
) -> bool:
    return _has_explicit_pending_role(
        ROLE_PENDING_SCREEN_ACCESS,
        user=user,
    )


def require_pending_screen_access(
    user: str | None = None,
) -> None:
    if not has_pending_screen_access_role(
        user=user
    ):
        frappe.throw(
            _(
                "ليست لديك صلاحية الوصول إلى شاشة المعلقات."
            ),
            frappe.PermissionError,
        )


def _has_pending_permission(
    permission_type: str,
    user: str | None = None,
) -> bool:
    if not has_pending_screen_access_role(
        user=user
    ):
        return False

    role_name = PENDING_PERMISSION_ROLE_MAP.get(
        permission_type
    )
    if not role_name:
        return False

    return _has_explicit_pending_role(
        role_name,
        user=user,
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

    if not has_pending_screen_access_role(
        user=user
    ):
        if throw:
            require_pending_screen_access(
                user=user
            )
        return None

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
    require_pending_screen_access(user=user)

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
    require_pending_screen_access(user=user)

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


def _can_change_pending_failure_status(
    operation,
    user: str | None = None,
) -> bool:
    user = _get_user(user)

    return bool(
        _can_view_pending_operation(
            operation,
            user=user,
        )
        and _has_pending_permission(
            CHANGE_PENDING_FAILURE_STATUS_PERMISSION,
            user=user,
        )
    )


def _require_change_pending_failure_status(
    operation,
    user: str | None = None,
) -> None:
    user = _get_user(user)

    if _can_change_pending_failure_status(
        operation,
        user=user,
    ):
        return

    frappe.throw(
        _(
            "ليس لديك صلاحية لتغيير حالة الفشل لهذه العملية المعلقة."
        ),
        frappe.PermissionError,
    )


def _can_close_reopen_pending_operation(
    operation,
    user: str | None = None,
) -> bool:
    user = _get_user(user)

    return bool(
        _can_view_pending_operation(
            operation,
            user=user,
        )
        and _has_pending_permission(
            CLOSE_REOPEN_PENDING_OPERATION_PERMISSION,
            user=user,
        )
    )


def _require_close_reopen_pending_operation(
    operation,
    user: str | None = None,
) -> None:
    user = _get_user(user)

    if _can_close_reopen_pending_operation(
        operation,
        user=user,
    ):
        return

    frappe.throw(
        _(
            "ليس لديك صلاحية لإنهاء أو إعادة فتح هذه العملية المعلقة."
        ),
        frappe.PermissionError,
    )


def _can_view_pending_operation_timeline(
    operation,
    user: str | None = None,
) -> bool:
    user = _get_user(user)

    return bool(
        _can_view_pending_operation(
            operation,
            user=user,
        )
        and _has_pending_permission(
            VIEW_PENDING_OPERATION_TIMELINE_PERMISSION,
            user=user,
        )
    )


def _require_view_pending_operation_timeline(
    operation,
    user: str | None = None,
) -> None:
    user = _get_user(user)

    if _can_view_pending_operation_timeline(
        operation,
        user=user,
    ):
        return

    frappe.throw(
        _(
            "ليس لديك صلاحية لعرض مسار هذه العملية المعلقة."
        ),
        frappe.PermissionError,
    )


def get_pending_capabilities(
    user: str | None = None,
) -> dict[str, Any]:
    user = _get_user(user)

    if user == "Guest":
        frappe.throw(
            _("يجب تسجيل الدخول."),
            frappe.PermissionError,
        )

    require_pending_screen_access(user=user)

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

    can_change_failure_status = (
        can_view
        and _has_pending_permission(
            CHANGE_PENDING_FAILURE_STATUS_PERMISSION,
            user,
        )
    )

    can_close_reopen = (
        can_view
        and _has_pending_permission(
            CLOSE_REOPEN_PENDING_OPERATION_PERMISSION,
            user,
        )
    )

    can_view_timeline = (
        can_view
        and _has_pending_permission(
            VIEW_PENDING_OPERATION_TIMELINE_PERMISSION,
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

        "can_change_failure_status":
            can_change_failure_status,

        "can_close_reopen":
            can_close_reopen,

        "can_view_timeline":
            can_view_timeline,
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

        "can_change_failure_status": bool(
            can_view
            and _can_change_pending_failure_status(
                operation,
                user=user,
            )
        ),

        "can_close_reopen": bool(
            can_view
            and _can_close_reopen_pending_operation(
                operation,
                user=user,
            )
        ),

        "can_view_timeline": bool(
            can_view
            and _can_view_pending_operation_timeline(
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
    del debug

    user = _get_user(user)
    ptype = ptype or "read"

    if user == "Guest":
        return False

    if ptype in _READ_LIKE_PERMISSION_TYPES:
        if doc is None:
            return bool(
                _get_pending_scope(
                    user=user,
                    throw=False,
                )
            )
        return _can_view_pending_operation(
            doc,
            user=user,
        )

    if ptype == "write":
        if doc is None:
            return bool(
                _get_pending_scope(
                    user=user,
                    throw=False,
                )
                and (
                    _has_pending_permission(
                        EDIT_ALL_PENDING_OPERATIONS_PERMISSION,
                        user=user,
                    )
                    or _has_pending_permission(
                        EDIT_OWN_PENDING_OPERATIONS_PERMISSION,
                        user=user,
                    )
                )
            )
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

    if ptype in PENDING_PERMISSION_TYPES:
        return _has_pending_permission(
            ptype,
            user=user,
        )

    return False
