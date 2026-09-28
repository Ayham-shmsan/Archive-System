from __future__ import annotations

import frappe
from frappe.utils import cstr

from archive.api.operation_search import (
    build_operation_search_text,
)


OPERATION_DOCTYPE = "Archive Operation"


def execute() -> None:
    """
    Rebuild the persisted unified search index for all Archive Operations.

    الهدف:
    - إصلاح العمليات التاريخية/المستوردة التي لم يُبنَ
      search_text لها، أو أصبح غير متزامن مع بيانات العملية.
    - عدم تغيير modified.
    - عدم تشغيل Document save hooks أو business mutations.
    - استخدام نفس canonical search builder الذي يستخدمه
      النظام حاليًا، بحيث لا ننشئ منطق بحث ثانياً داخل الـPatch.

    الـPatch idempotent:
    يمكن حساب نفس القيمة مرة أخرى دون تغيير Business State.
    """

    if not frappe.db.exists(
        "DocType",
        OPERATION_DOCTYPE,
    ):
        return


    meta = frappe.get_meta(
        OPERATION_DOCTYPE
    )


    if not meta.get_field(
        "search_text"
    ):
        return


    operation_names = frappe.get_all(
        OPERATION_DOCTYPE,

        pluck="name",

        order_by="name asc",

        limit_page_length=0,
    )


    for operation_name in operation_names:

        operation = frappe.get_doc(
            OPERATION_DOCTYPE,
            operation_name,
        )


        rebuilt_search_text = cstr(
            build_operation_search_text(
                operation
            )
        )


        current_search_text = cstr(
            operation.search_text
            or ""
        )


        # لا نكتب إلى DB إذا كانت القيمة صحيحة أصلًا.
        if (
            rebuilt_search_text
            ==
            current_search_text
        ):
            continue


        frappe.db.set_value(
            OPERATION_DOCTYPE,

            operation_name,

            "search_text",

            rebuilt_search_text,

            update_modified=False,
        )