from __future__ import annotations

import frappe

from frappe.core.doctype.doctype.doctype import (
    validate_permissions_for_doctype,
)
from frappe.permissions import (
    setup_custom_perms,
)


PENDING_DOCTYPE = (
    "Archive Pending Operation"
)


ROLE_OPERATOR = (
    "موظف المعلقات"
)

ROLE_SUPERVISOR = (
    "مشرف المعلقات"
)

ROLE_FINANCIAL_AUDITOR = (
    "مدقق المعلقات المالي"
)

ROLE_VIEWER = (
    "قارئ المعلقات"
)


CUSTOM_PERMISSION_FIELDS = (
    "create_pending_operation",
    "view_own_pending_operations",
    "view_all_pending_operations",
    "edit_own_pending_operations",
    "edit_all_pending_operations",
    "add_pending_return",
    "correct_pending_ledger",
)


ROLE_MATRIX = {
    ROLE_OPERATOR: {
        "create_pending_operation":
            1,

        "view_own_pending_operations":
            1,

        "view_all_pending_operations":
            0,

        "edit_own_pending_operations":
            1,

        "edit_all_pending_operations":
            0,

        "add_pending_return":
            1,

        "correct_pending_ledger":
            0,
    },

    ROLE_SUPERVISOR: {
        "create_pending_operation":
            1,

        "view_own_pending_operations":
            1,

        "view_all_pending_operations":
            1,

        "edit_own_pending_operations":
            1,

        "edit_all_pending_operations":
            1,

        "add_pending_return":
            1,

        "correct_pending_ledger":
            0,
    },

    ROLE_FINANCIAL_AUDITOR: {
        "create_pending_operation":
            0,

        "view_own_pending_operations":
            0,

        "view_all_pending_operations":
            1,

        "edit_own_pending_operations":
            0,

        "edit_all_pending_operations":
            0,

        "add_pending_return":
            0,

        "correct_pending_ledger":
            1,
    },

    ROLE_VIEWER: {
        "create_pending_operation":
            0,

        "view_own_pending_operations":
            0,

        "view_all_pending_operations":
            1,

        "edit_own_pending_operations":
            0,

        "edit_all_pending_operations":
            0,

        "add_pending_return":
            0,

        "correct_pending_ledger":
            0,
    },
}


def execute() -> None:
    _validate_permission_fields()

    for role_name in (
        ROLE_MATRIX
    ):
        _ensure_role(
            role_name
        )

        # مهم:
    # إذا لم توجد Custom DocPerm بعد، يقوم Frappe
    # أولًا بنسخ DocPerm الأصلية الموجودة على DocType.
    #
    # بهذا لا نفقد صلاحيات System Manager أو أي
    # Permission أصلية موجودة قبل إنشاء Roles الجديدة.
    setup_custom_perms(
        PENDING_DOCTYPE
    )

    for (
        role_name,
        permissions,
    ) in ROLE_MATRIX.items():
        _replace_role_permission(
            role_name,
            permissions,
        )

    validate_permissions_for_doctype(
        PENDING_DOCTYPE
    )

    frappe.clear_cache()


def _validate_permission_fields() -> None:
    meta = frappe.get_meta(
        "Custom DocPerm"
    )

    missing = [
        fieldname

        for fieldname
        in CUSTOM_PERMISSION_FIELDS

        if not meta.get_field(
            fieldname
        )
    ]

    if missing:
        frappe.throw(
            (
                "حقول Permission Type التالية "
                "غير موجودة في Custom DocPerm: "
                +
                ", ".join(
                    missing
                )
            )
        )


def _ensure_role(
    role_name: str,
) -> None:
    if frappe.db.exists(
        "Role",
        role_name,
    ):
        frappe.db.set_value(
            "Role",
            role_name,
            {
                "disabled":
                    0,

                "desk_access":
                    1,
            },
            update_modified=False,
        )

        return

    role = frappe.get_doc(
        {
            "doctype":
                "Role",

            "role_name":
                role_name,

            "disabled":
                0,

            "desk_access":
                1,

            # Role يديرها التطبيق وليست Role
            # مؤقتة أنشأها مستخدم من الواجهة.
            "is_custom":
                0,
        }
    )

    role.insert(
        ignore_permissions=True
    )


def _replace_role_permission(
    role_name: str,
    custom_permissions: dict[
        str,
        int,
    ],
) -> None:
    """
    كل Role من Roles المعلقات مُدارة من التطبيق.

    نحافظ على Custom DocPerm الخاصة بالأدوار الأخرى،
    لكن نجعل صف هذا الـRole محددًا وواضحًا.
    """

    existing = frappe.get_all(
        "Custom DocPerm",
        filters={
            "parent":
                PENDING_DOCTYPE,

            "role":
                role_name,
        },
        pluck="name",
    )

    for name in existing:
        frappe.delete_doc(
            "Custom DocPerm",
            name,
            ignore_permissions=True,
            force=True,
        )

    values = {
        "doctype":
            "Custom DocPerm",

        "parent":
            PENDING_DOCTYPE,

        "parenttype":
            "DocType",

        "parentfield":
            "permissions",

        "role":
            role_name,

        "permlevel":
            0,

        "if_owner":
            0,

                # نحتاج Read حتى يستطيع Frappe إظهار السجل،
        # ثم محرك own/all الخاص بنا يحدد أي سجلات يراه.
        "read":
            1,

        # لا نعطي Generic Form صلاحيات تعديل/إنشاء.
        # العمليات الحساسة تمر فقط من Custom APIs.
        "write":
            0,

        "create":
            0,

        "delete":
            0,

        "share":
            0,

        "import":
            0,

        "export":
            0,
    }

    for fieldname in (
        CUSTOM_PERMISSION_FIELDS
    ):
        values[
            fieldname
        ] = int(
            bool(
                custom_permissions.get(
                    fieldname
                )
            )
        )

    permission = frappe.get_doc(
        values
    )

    permission.insert(
        ignore_permissions=True
    )