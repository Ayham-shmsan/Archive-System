from collections import defaultdict

import frappe

from archive.archive.doctype.archive_operation.archive_operation import (
    make_operation_no_hash,
    normalize_operation_no,
)


def execute():

    operations = frappe.get_all(
        "Archive Operation",
        filters=[
            [
                "operation_no",
                "is",
                "set",
            ]
        ],
        fields=[
            "name",
            "operation_no",
            "creation",
            "allow_duplicate_operation_no",
        ],
        order_by=
            "creation asc, name asc",
        limit_page_length=0,
    )


    groups = defaultdict(
        list
    )


    # ========================================================
    # المرحلة الأولى:
    # تعبئة normalized وإعطاء مفتاح مؤقت فريد لكل سجل.
    #
    # المفتاح المؤقت مهم لأن بعض العمليات الجديدة قد يكون
    # لديها بالفعل N:<hash> ونريد إعادة بناء المفاتيح
    # بدون الاصطدام بالـ UNIQUE constraint.
    # ========================================================

    for operation in operations:

        normalized = (
            normalize_operation_no(
                operation.operation_no
            )
        )


        if not normalized:
            continue


        frappe.db.set_value(
            "Archive Operation",
            operation.name,
            {
                "operation_no_normalized":
                    normalized,

                "operation_no_uniqueness_key":
                    (
                        f"MIG:{operation.name}"
                    ),
            },
            update_modified=False,
        )


        groups[
            normalized
        ].append(
            operation
        )


    # ========================================================
    # المرحلة الثانية:
    # إنشاء المفاتيح النهائية.
    #
    # أول سجل:
    # N:<hash>
    #
    # أي تكرار قديم بعده:
    # D:<hash>:<document-name>
    # ========================================================

    for (
        normalized,
        group,
    ) in groups.items():

        digest = (
            make_operation_no_hash(
                normalized
            )
        )


        for (
            index,
            operation,
        ) in enumerate(
            group
        ):

            is_duplicate = (
                index > 0
            )


            if is_duplicate:

                uniqueness_key = (
                    f"D:{digest}:"
                    f"{operation.name}"
                )

            else:

                uniqueness_key = (
                    f"N:{digest}"
                )


            updates = {
                "operation_no_normalized":
                    normalized,

                "operation_no_uniqueness_key":
                    uniqueness_key,
            }


            # العمليات القديمة التي كانت بالفعل مكررة
            # نعرّفها للنظام كتكرار موجود مسبقاً.
            if is_duplicate:
                updates[
                    "allow_duplicate_operation_no"
                ] = 1


            frappe.db.set_value(
                "Archive Operation",
                operation.name,
                updates,
                update_modified=False,
            )