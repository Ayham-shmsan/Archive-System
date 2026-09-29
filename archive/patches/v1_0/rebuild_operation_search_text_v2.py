from __future__ import annotations

import frappe
from frappe.utils import cstr

from archive.api.operation_search import (
    build_operation_search_text,
)


OPERATION_DOCTYPE = (
    "Archive Operation"
)


def execute() -> None:
    """
    Force-rebuild the derived unified search index
    for every Archive Operation.

    - لا يغير Business Data.
    - لا يغير modified.
    - لا يستخدم doc.save().
    - يعيد البناء من المصدر الحالي للبيانات.
    - آمن للتنفيذ على العمليات المستوردة من Excel.
    """

    if not frappe.db.exists(
        "DocType",
        OPERATION_DOCTYPE,
    ):
        print(
            "[Archive Search Rebuild] "
            "Archive Operation does not exist."
        )

        return


    operation_names = frappe.get_all(
        OPERATION_DOCTYPE,

        pluck="name",

        order_by="name asc",

        limit_page_length=0,
    )


    total_count = len(
        operation_names
    )

    changed_count = 0

    unchanged_count = 0

    empty_count = 0


    print(
        "[Archive Search Rebuild] "
        f"Starting {total_count} operations..."
    )


    for operation_name in (
        operation_names
    ):

        operation = frappe.get_doc(
            OPERATION_DOCTYPE,
            operation_name,
        )


        rebuilt_search_text = cstr(
            build_operation_search_text(
                operation
            )
        ).strip()


        if not rebuilt_search_text:

            empty_count += 1


        current_search_text = cstr(
            operation.search_text
            or ""
        ).strip()


        if (
            rebuilt_search_text
            ==
            current_search_text
        ):

            unchanged_count += 1

            continue


        frappe.db.set_value(
            OPERATION_DOCTYPE,

            operation_name,

            "search_text",

            rebuilt_search_text,

            update_modified=False,
        )


        changed_count += 1


    print(
        "[Archive Search Rebuild] "
        f"Total={total_count}, "
        f"Changed={changed_count}, "
        f"Unchanged={unchanged_count}, "
        f"Empty={empty_count}"
    )