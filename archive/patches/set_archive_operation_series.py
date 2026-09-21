import re

import frappe

from frappe.model.naming import NamingSeries


def execute():

    names = frappe.get_all(
        "Archive Operation",
        pluck="name",
    )


    max_number = 0


    for name in names:

        match = re.fullmatch(
            r"OP-(\d+)",
            str(name or ""),
        )


        if not match:
            continue


        max_number = max(
            max_number,
            int(
                match.group(1)
            ),
        )


    NamingSeries(
        "OP-.#####"
    ).update_counter(
        max_number
    )