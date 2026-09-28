import frappe

from frappe import _
from frappe.utils import (
    cint,
    cstr,
)


def execute():
    if not frappe.db.exists(
        "DocType",
        "Archive Pending Operation",
    ):
        return

    if not frappe.db.exists(
        "DocType",
        "Archive Account",
    ):
        frappe.throw(
            _(
                "Archive Account غير موجود."
            )
        )

    rows = frappe.get_all(
        "Archive Pending Operation",

        filters={
            "card_owner": [
                "is",
                "set",
            ],
        },

        fields=[
            "name",
            "card_owner",
        ],
    )

    unresolved = []

    for row in rows:
        current_value = cstr(
            row.card_owner
        ).strip()

        if not current_value:
            continue

        # ---------------------------------------------
        # القيمة أصبحت أصلًا Archive Account.
        # لا نفعل شيئًا.
        # ---------------------------------------------

        if frappe.db.exists(
            "Archive Account",
            current_value,
        ):
            continue

        # ---------------------------------------------
        # القيمة القديمة يجب أن تكون
        # Archive Card Owner.
        # ---------------------------------------------

        if not frappe.db.exists(
            "Archive Card Owner",
            current_value,
        ):
            unresolved.append(
                (
                    row.name,
                    current_value,
                )
            )

            continue

        legacy = frappe.db.get_value(
            "Archive Card Owner",
            current_value,
            [
                "card_owner_name",
                "disabled",
            ],
            as_dict=True,
        )

        account_name = cstr(
            legacy.card_owner_name
            if legacy
            else ""
        ).strip()

        if not account_name:
            unresolved.append(
                (
                    row.name,
                    current_value,
                )
            )

            continue

        # ---------------------------------------------
        # إذا الحساب موجود أصلًا نستخدمه.
        #
        # وإذا غير موجود ننشئه مرة واحدة.
        # Archive Account يسمى بالـ account_name.
        # ---------------------------------------------

        if not frappe.db.exists(
            "Archive Account",
            account_name,
        ):
            account = frappe.get_doc({
                "doctype":
                    "Archive Account",

                "account_name":
                    account_name,

                "disabled":
                    cint(
                        legacy.disabled
                        if legacy
                        else 0
                    ),
            })

            account.insert(
                ignore_permissions=True
            )

        # ---------------------------------------------
        # ربط المعلقة بالـArchive Account الجديد/الموجود.
        # لا نغير modified للعملية التاريخية.
        # ---------------------------------------------

        frappe.db.set_value(
            "Archive Pending Operation",
            row.name,
            "card_owner",
            account_name,
            update_modified=False,
        )

    if unresolved:
        details = "\n".join(
            (
                f"{operation}: "
                f"{old_value}"
            )
            for (
                operation,
                old_value,
            )
            in unresolved
        )

        frappe.throw(
            _(
                "تعذر تحويل بعض ملاك البطاقات "
                "إلى Archive Account:\n{0}"
            ).format(
                details
            )
        )