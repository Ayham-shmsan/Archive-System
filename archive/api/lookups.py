import frappe
from frappe import _
from frappe.utils import cint, cstr


@frappe.whitelist()
def search_swift_codes(
    txt: str | None = None,
    query: str | None = None,
    limit: int = 10,
) -> list[dict]:

    search_text = cstr(
        txt
    ).strip().upper()


    limit = max(
        1,
        min(
            cint(limit) or 10,
            20,
        ),
    )


    params = {
        "starts_with":
            f"{search_text}%",

        "contains":
            f"%{search_text}%",

        "limit":
            limit,
    }


    conditions = """
        swift_code IS NOT NULL
        AND TRIM(swift_code) != ''
    """


    if search_text:

        conditions += """
            AND UPPER(
                TRIM(swift_code)
            ) LIKE %(contains)s
        """


    rows = frappe.db.sql(
        f"""
        SELECT
            UPPER(
                TRIM(swift_code)
            ) AS swift_code,

            COUNT(*) AS usage_count,

            MAX(modified) AS last_used,

            CASE
                WHEN UPPER(
                    TRIM(swift_code)
                ) LIKE %(starts_with)s
                THEN 0

                ELSE 1
            END AS match_rank

        FROM `tabArchive Operation`

        WHERE
            {conditions}

        GROUP BY
            UPPER(
                TRIM(swift_code)
            )

        ORDER BY
            match_rank ASC,
            usage_count DESC,
            last_used DESC,
            swift_code ASC

        LIMIT %(limit)s
        """,
        params,
        as_dict=True,
    )


    return [
        {
            "value":
                row.swift_code,

            "label":
                row.swift_code,

            "description":
                _(
                    "مستخدم في {0} عملية"
                ).format(
                    row.usage_count
                ),
        }

        for row in rows
    ]