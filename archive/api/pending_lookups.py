from __future__ import annotations

import math
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_datetime, now_datetime

from archive.api.operation_search import (
    normalize_search_text,
)

from archive.services.pending_operation_permissions import (
    get_pending_capabilities as get_pending_capabilities_service,
)


PENDING_DOCTYPE = "Archive Pending Operation"

DEFAULT_LIMIT = 10
MAX_LIMIT = 20

CANDIDATE_POOL_SIZE = 100
QUERY_POOL_SIZE = 200


_TARGET_FIELDS = {
    "machine_location",
    "machine_no",
    "branch_no",
}


_ALLOWED_CONTEXT_FIELDS = {
    "bank",
    "region",
    "machine_location",
    "machine_no",
    "branch_no",
}


_CONTEXT_TIERS = {
    "machine_location": (
        (
            (
                "bank",
                "region",
            ),
            260,
        ),
        (
            (
                "bank",
            ),
            180,
        ),
        (
            (
                "region",
            ),
            150,
        ),
        (
            (),
            0,
        ),
    ),

    "machine_no": (
        (
            (
                "bank",
                "region",
                "machine_location",
            ),
            330,
        ),
        (
            (
                "bank",
                "machine_location",
            ),
            290,
        ),
        (
            (
                "region",
                "machine_location",
            ),
            260,
        ),
        (
            (
                "machine_location",
            ),
            225,
        ),
        (
            (
                "bank",
                "region",
            ),
            180,
        ),
        (
            (
                "bank",
            ),
            120,
        ),
        (
            (
                "region",
            ),
            100,
        ),
        (
            (),
            0,
        ),
    ),

    "branch_no": (
        (
            (
                "bank",
                "region",
                "machine_location",
                "machine_no",
            ),
            400,
        ),
        (
            (
                "bank",
                "machine_location",
                "machine_no",
            ),
            360,
        ),
        (
            (
                "region",
                "machine_location",
                "machine_no",
            ),
            330,
        ),
        (
            (
                "machine_location",
                "machine_no",
            ),
            300,
        ),
        (
            (
                "machine_no",
            ),
            245,
        ),
        (
            (
                "machine_location",
            ),
            210,
        ),
        (
            (
                "bank",
                "region",
            ),
            160,
        ),
        (
            (),
            0,
        ),
    ),
}


_RELATED_FIELDS = {
    "machine_location": (
        "machine_no",
        "branch_no",
    ),

    "machine_no": (
        "machine_location",
        "branch_no",
    ),

    "branch_no": (
        "machine_location",
        "machine_no",
    ),
}


_INFERENCE_CONTEXT_FIELDS = {
    "machine_location": (
        "bank",
        "region",
    ),

    "machine_no": (
        "bank",
        "region",
        "machine_location",
    ),

    "branch_no": (
        "bank",
        "region",
        "machine_location",
    ),
}


@frappe.whitelist(
    methods=["GET"]
)
def get_pending_suggestions(
    fieldname: str,
    query: str = "",
    context: str | dict[str, Any] | None = None,
    limit: int = DEFAULT_LIMIT,
) -> dict[str, Any]:
    fieldname = _validate_target_field(
        fieldname
    )

    query = cstr(
        query
    ).strip()

    if len(query) > 120:
        frappe.throw(
            _(
                "نص البحث في الاقتراحات طويل جدًا."
            ),
            frappe.ValidationError,
        )

    limit = max(
        1,
        min(
            cint(limit)
            or DEFAULT_LIMIT,
            MAX_LIMIT,
        ),
    )

    context_data = _parse_context(
        context
    )

    user = frappe.session.user

    capabilities = (
        get_pending_capabilities_service(
            user=user
        )
    )

    # /*
    #  * create-only لا يرى تاريخ العمليات،
    #  * وبالتالي لا يحصل على اقتراحات تاريخية.
    #  */
    if not capabilities.get(
        "can_view"
    ):
        return {
            "suggestions": [],
            "scope": None,
        }

    scope = capabilities.get(
        "scope"
    )

    if scope not in {
        "own",
        "all",
    }:
        return {
            "suggestions": [],
            "scope": None,
        }

    normalized_query = (
        normalize_search_text(
            query
        )
    )

    query_tokens = [
        token
        for token
        in normalized_query.split()
        if token
    ]

    candidates: dict[
        str,
        dict[str, Any],
    ] = {}

    # /*
    #  * Query pool:
    #  * search_text عندنا Normalized أصلًا.
    #  *
    #  * هذه الطبقة مهمة خصوصًا للعربية:
    #  * الأهلي / الاهلي
    #  * والأرقام العربية / الإنجليزية.
    #  */
    if query_tokens:
        rows = _aggregate_candidates(
            fieldname=fieldname,
            user=user,
            scope=scope,
            context_filters={},
            search_tokens=query_tokens,
            limit=QUERY_POOL_SIZE,
        )

        _merge_candidates(
            candidates,
            rows,
            context_weight=20,
        )

    # /*
    #  * Context-aware pools.
    #  *
    #  * نبدأ بالأكثر تحديدًا ثم نتراجع تدريجيًا
    #  * حتى General history.
    #  */
    for (
        context_filters,
        context_weight,
    ) in _build_context_tiers(
        fieldname,
        context_data,
    ):
        rows = _aggregate_candidates(
            fieldname=fieldname,
            user=user,
            scope=scope,
            context_filters=context_filters,
            search_tokens=None,
            limit=CANDIDATE_POOL_SIZE,
        )

        _merge_candidates(
            candidates,
            rows,
            context_weight=context_weight,
        )

    ranked = []

    for candidate in candidates.values():
        match_score = _query_match_score(
            candidate["value"],
            normalized_query,
            query_tokens,
        )

        if match_score is None:
            continue

        score = (
            match_score
            + candidate["context_weight"]
            + _frequency_score(
                candidate["frequency"]
            )
            + _recency_score(
                candidate["last_used"]
            )
        )

        ranked.append(
            {
                "value":
                    candidate["value"],

                "score":
                    score,

                "normalized":
                    normalize_search_text(
                        candidate["value"]
                    ),
            }
        )

    ranked.sort(
        key=lambda item: (
            -item["score"],
            item["normalized"],
            item["value"],
        )
    )

    return {
        "scope":
            scope,

        "suggestions": [
            {
                "value":
                    item["value"],
            }
            for item
            in ranked[:limit]
        ],
    }


@frappe.whitelist(
    methods=["GET"]
)
def get_pending_related_fields(
    fieldname: str,
    value: str,
    context: str | dict[str, Any] | None = None,
) -> dict[str, Any]:
    fieldname = _validate_target_field(
        fieldname
    )

    value = cstr(
        value
    ).strip()

    if not value:
        return {
            "related": {},
        }

    context_data = _parse_context(
        context
    )

    user = frappe.session.user

    capabilities = (
        get_pending_capabilities_service(
            user=user
        )
    )

    if not capabilities.get(
        "can_view"
    ):
        return {
            "related": {},
        }

    scope = capabilities.get(
        "scope"
    )

    if scope not in {
        "own",
        "all",
    }:
        return {
            "related": {},
        }

    base_context = {}

    for context_field in (
        _INFERENCE_CONTEXT_FIELDS[
            fieldname
        ]
    ):
        context_value = cstr(
            context_data.get(
                context_field
            )
        ).strip()

        if context_value:
            base_context[
                context_field
            ] = context_value

    related = {}

    for related_field in (
        _RELATED_FIELDS[
            fieldname
        ]
    ):
        result = _get_unambiguous_related_value(
            source_field=fieldname,
            source_value=value,
            related_field=related_field,
            user=user,
            scope=scope,
            context_filters=base_context,
        )

        if result:
            related[
                related_field
            ] = result

    return {
        "related":
            related,
    }


def _aggregate_candidates(
    *,
    fieldname: str,
    user: str,
    scope: str,
    context_filters: dict[str, str],
    search_tokens: list[str] | None,
    limit: int,
) -> list[frappe._dict]:
    field_sql = (
        f"`{fieldname}`"
    )

    conditions = [
        f"{field_sql} IS NOT NULL",
        f"TRIM({field_sql}) != ''",
    ]

    values: list[Any] = []

    if scope == "own":
        conditions.append(
            "`owner` = %s"
        )

        values.append(
            user
        )

    for (
        context_field,
        context_value,
    ) in context_filters.items():
        if (
            context_field
            not in _ALLOWED_CONTEXT_FIELDS
        ):
            continue

        conditions.append(
            f"`{context_field}` = %s"
        )

        values.append(
            context_value
        )

    for token in (
        search_tokens
        or []
    ):
        conditions.append(
            "COALESCE(`search_text`, '') LIKE %s"
        )

        values.append(
            f"%{token}%"
        )

    values.append(
        int(limit)
    )

    query = f"""
        SELECT
            {field_sql} AS value,
            COUNT(*) AS frequency,
            MAX(`operation_datetime`) AS last_used

        FROM
            `tabArchive Pending Operation`

        WHERE
            {" AND ".join(conditions)}

        GROUP BY
            {field_sql}

        ORDER BY
            frequency DESC,
            last_used DESC

        LIMIT %s
    """

    return frappe.db.sql(
        query,
        tuple(values),
        as_dict=True,
    )


def _build_context_tiers(
    fieldname: str,
    context: dict[str, str],
):
    result = []
    seen = set()

    for (
        fields,
        weight,
    ) in _CONTEXT_TIERS[
        fieldname
    ]:
        filters = {}

        valid = True

        for context_field in fields:
            value = cstr(
                context.get(
                    context_field
                )
            ).strip()

            if not value:
                valid = False
                break

            filters[
                context_field
            ] = value

        if fields and not valid:
            continue

        signature = tuple(
            sorted(
                filters.items()
            )
        )

        if signature in seen:
            continue

        seen.add(
            signature
        )

        result.append(
            (
                filters,
                weight,
            )
        )

    if not any(
        not filters
        for filters, _
        in result
    ):
        result.append(
            (
                {},
                0,
            )
        )

    return result


def _merge_candidates(
    destination: dict[str, dict[str, Any]],
    rows,
    *,
    context_weight: int,
) -> None:
    for row in rows:
        value = cstr(
            row.value
        ).strip()

        if not value:
            continue

        item = destination.setdefault(
            value,
            {
                "value":
                    value,

                "frequency":
                    0,

                "last_used":
                    None,

                "context_weight":
                    0,
            },
        )

        item["frequency"] = max(
            item["frequency"],
            cint(
                row.frequency
            ),
        )

        item["context_weight"] = max(
            item["context_weight"],
            context_weight,
        )

        last_used = (
            row.last_used
        )

        if (
            last_used
            and (
                not item["last_used"]
                or get_datetime(
                    last_used
                )
                >
                get_datetime(
                    item["last_used"]
                )
            )
        ):
            item["last_used"] = (
                last_used
            )


def _query_match_score(
    value: str,
    normalized_query: str,
    query_tokens: list[str],
) -> float | None:
    if not normalized_query:
        return 0

    normalized_value = (
        normalize_search_text(
            value
        )
    )

    if not normalized_value:
        return None

    if (
        normalized_value
        == normalized_query
    ):
        return 1200

    if normalized_value.startswith(
        normalized_query
    ):
        return 1000

    value_tokens = [
        token
        for token
        in normalized_value.split()
        if token
    ]

    if (
        query_tokens
        and all(
            any(
                value_token.startswith(
                    query_token
                )
                for value_token
                in value_tokens
            )
            for query_token
            in query_tokens
        )
    ):
        return 850

    if (
        query_tokens
        and all(
            query_token
            in normalized_value
            for query_token
            in query_tokens
        )
    ):
        return 650

    return None


def _frequency_score(
    frequency: int,
) -> float:
    frequency = max(
        0,
        cint(
            frequency
        ),
    )

    return min(
        math.log1p(
            frequency
        )
        * 28,
        150,
    )


def _recency_score(
    last_used,
) -> float:
    if not last_used:
        return 0

    try:
        age_days = max(
            0,
            (
                now_datetime()
                -
                get_datetime(
                    last_used
                )
            ).total_seconds()
            /
            86400,
        )

    except Exception:
        return 0

    if age_days <= 7:
        return 80

    if age_days <= 30:
        return 60

    if age_days <= 90:
        return 40

    if age_days <= 180:
        return 28

    if age_days <= 365:
        return 16

    return 0


def _get_unambiguous_related_value(
    *,
    source_field: str,
    source_value: str,
    related_field: str,
    user: str,
    scope: str,
    context_filters: dict[str, str],
) -> dict[str, str] | None:
    source_sql = (
        f"`{source_field}`"
    )

    related_sql = (
        f"`{related_field}`"
    )

    conditions = [
        f"{source_sql} = %s",
        f"{related_sql} IS NOT NULL",
        f"TRIM({related_sql}) != ''",
    ]

    values: list[Any] = [
        source_value,
    ]

    if scope == "own":
        conditions.append(
            "`owner` = %s"
        )

        values.append(
            user
        )

    for (
        context_field,
        context_value,
    ) in context_filters.items():
        if (
            context_field
            not in _ALLOWED_CONTEXT_FIELDS
        ):
            continue

        # /*
        #  * لا نكرر شرط Source Field نفسه.
        #  */
        if (
            context_field
            == source_field
        ):
            continue

        conditions.append(
            f"`{context_field}` = %s"
        )

        values.append(
            context_value
        )

    query = f"""
        SELECT
            {related_sql} AS value,
            COUNT(*) AS frequency

        FROM
            `tabArchive Pending Operation`

        WHERE
            {" AND ".join(conditions)}

        GROUP BY
            {related_sql}

        ORDER BY
            frequency DESC

        LIMIT 2
    """

    rows = frappe.db.sql(
        query,
        tuple(values),
        as_dict=True,
    )

    # /*
    #  * إذا وجد أكثر من Related Value
    #  * فالتاريخ متعارض، وبالتالي لا نقترح
    #  * Autofill قطعي.
    #  */
    if len(rows) != 1:
        return None

    value = cstr(
        rows[0].value
    ).strip()

    if not value:
        return None

    frequency = cint(
        rows[0].frequency
    )

    return {
        "value":
            value,

        "confidence":
            (
                "high"
                if frequency >= 2
                else "tentative"
            ),
    }


def _parse_context(
    context: str | dict[str, Any] | None,
) -> dict[str, str]:
    if context in (
        None,
        "",
    ):
        return {}

    if isinstance(
        context,
        str,
    ):
        context = frappe.parse_json(
            context
        )

    if not isinstance(
        context,
        dict,
    ):
        frappe.throw(
            _(
                "سياق الاقتراحات غير صالح."
            ),
            frappe.ValidationError,
        )

    unknown = (
        set(context)
        -
        _ALLOWED_CONTEXT_FIELDS
    )

    if unknown:
        frappe.throw(
            _(
                "سياق الاقتراحات يحتوي على حقول غير مسموحة: {0}"
            ).format(
                ", ".join(
                    sorted(
                        unknown
                    )
                )
            ),
            frappe.ValidationError,
        )

    result = {}

    for fieldname in (
        _ALLOWED_CONTEXT_FIELDS
    ):
        value = cstr(
            context.get(
                fieldname
            )
        ).strip()

        if value:
            result[
                fieldname
            ] = value

    return result


def _validate_target_field(
    fieldname: str,
) -> str:
    fieldname = cstr(
        fieldname
    ).strip()

    if (
        fieldname
        not in _TARGET_FIELDS
    ):
        frappe.throw(
            _(
                "حقل الاقتراح غير مسموح."
            ),
            frappe.ValidationError,
        )

    return fieldname