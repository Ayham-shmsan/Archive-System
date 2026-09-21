import re

import frappe

from frappe.model.naming import (
    NamingSeries,
)


OPERATION_SERIAL_SERIES_KEY = (
    "ARCHIVE-OPERATION-SERIAL"
)


def execute():

    # ========================================================
    # Load operations
    #
    # نحافظ على ترتيب serial_no الحالي.
    #
    # هذا أكثر أماناً للإنتاج من الاعتماد فقط
    # على creation، خصوصاً مع البيانات المستوردة.
    # ========================================================

    rows = frappe.db.sql(
        """
        SELECT
            name,
            serial_no,
            creation

        FROM `tabArchive Operation`

        ORDER BY
            (serial_no IS NULL) ASC,
            serial_no ASC,
            creation ASC,
            name ASC
        """,
        as_dict=True,
    )


    total = len(
        rows
    )


    # ========================================================
    # No operations
    # ========================================================

    if not rows:

        NamingSeries(
            f"{OPERATION_SERIAL_SERIES_KEY}.##########"
        ).update_counter(
            0
        )

        NamingSeries(
            "OP-.#####"
        ).update_counter(
            0
        )

        return


    # ========================================================
    # Phase 1
    #
    # serial_no عليه Unique index.
    #
    # لذلك لا نستطيع مثلاً تحويل:
    #
    # 7 -> 6
    #
    # بينما 6 ما زال مستخدماً.
    #
    # ننقل الجميع مؤقتاً إلى نطاق لا يمكن
    # أن يتعارض مع القيم الحالية.
    # ========================================================

    existing_serials = [
        int(
            row.serial_no
        )

        for row in rows

        if row.serial_no
        is not None
    ]


    minimum_existing = (
        min(
            existing_serials
        )
        if existing_serials
        else 0
    )


    temporary_base = (
        min(
            minimum_existing,
            0,
        )
        -
        total
        -
        1000
    )


    for index, row in enumerate(
        rows,
        start=1,
    ):

        temporary_value = (
            temporary_base
            -
            index
        )


        frappe.db.sql(
            """
            UPDATE `tabArchive Operation`

            SET serial_no = %s

            WHERE name = %s
            """,
            (
                temporary_value,
                row.name,
            ),
        )


    # ========================================================
    # Phase 2
    #
    # Final strict sequence:
    # 1, 2, 3, ... N
    # ========================================================

    for serial_no, row in enumerate(
        rows,
        start=1,
    ):

        frappe.db.sql(
            """
            UPDATE `tabArchive Operation`

            SET serial_no = %s

            WHERE name = %s
            """,
            (
                serial_no,
                row.name,
            ),
        )


    # ========================================================
    # Seed dedicated business serial counter
    #
    # next operation will receive:
    # total + 1
    # ========================================================

    NamingSeries(
        f"{OPERATION_SERIAL_SERIES_KEY}.##########"
    ).update_counter(
        total
    )


    # ========================================================
    # Seed dedicated technical OP name series
    #
    # لا نعيد تسمية العمليات القديمة.
    #
    # فقط نضمن أن الاسم الجديد يبدأ بعد
    # أكبر OP-xxxxx موجود.
    # ========================================================

    max_operation_name_number = 0


    for row in rows:

        match = re.fullmatch(
            r"OP-(\d+)",
            str(
                row.name
                or ""
            ),
        )


        if not match:
            continue


        max_operation_name_number = max(
            max_operation_name_number,
            int(
                match.group(
                    1
                )
            ),
        )


    NamingSeries(
        "OP-.#####"
    ).update_counter(
        max_operation_name_number
    )