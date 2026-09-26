from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable

import frappe
from frappe import _
from frappe.utils import cstr

from archive.api.operation_search import (
    normalize_search_text,
)


PENDING_DOCTYPE = "Archive Pending Operation"

BACKFILL_BATCH_SIZE = 500


_CONTEXT_DB_FIELDS = [
    "name",
    "serial_no",
    "card_name",
    "card_number",
    "operation_datetime",
    "card_owner",
    "currency",
    "bank",
    "region",
    "machine_location",
    "machine_no",
    "branch_no",
    "representative",
    "total_suspended",
    "total_returned",
    "remaining_amount",
    "status",
    "owner",
    "creation",
    "modified",

    # نحتاجها فقط لبناء search_text.
    # لن نعيدها في Context النهائي.
    "notes",
]


def set_pending_search_text(doc) -> str:
    """
    يبني search_text المخزن على Parent عند كل Save.

    لا نعتمد على قيم Display IDs فقط؛ نضيف أيضًا أسماء
    Masters الفعلية حتى يمكن البحث باسم البنك/المنطقة/
    المندوب/مالك البطاقة.
    """

    owner = (
        doc.owner
        or frappe.session.user
        or ""
    )

    values = frappe._dict(
        {
            "name": doc.name,
            "serial_no": doc.serial_no,
            "card_name": doc.card_name,
            "card_number": doc.card_number,
            "operation_datetime":
                doc.operation_datetime,
            "card_owner": doc.card_owner,
            "currency": doc.currency,
            "bank": doc.bank,
            "region": doc.region,
            "machine_location":
                doc.machine_location,
            "machine_no": doc.machine_no,
            "branch_no": doc.branch_no,
            "representative":
                doc.representative,
            "status": doc.status,
            "owner": owner,
            "notes": doc.notes,

            "card_owner_name":
                _get_link_label(
                    "Archive Card Owner",
                    doc.card_owner,
                    "card_owner_name",
                ),

            "bank_name":
                _get_link_label(
                    "Archive Bank",
                    doc.bank,
                    "bank_name",
                ),

            "region_name":
                _get_link_label(
                    "Archive Region",
                    doc.region,
                    "region_name",
                ),

            "representative_name":
                _get_link_label(
                    "Archive Representative",
                    doc.representative,
                    "representative_name",
                ),

            "owner_full_name":
                _get_link_label(
                    "User",
                    owner,
                    "full_name",
                ),
        }
    )

    attachment_filenames = [
        cstr(row.file_name).strip()
        for row in (
            doc.attachments
            or []
        )
        if cstr(
            row.file_name
        ).strip()
    ]

    doc.search_text = (
        build_pending_search_text(
            values,
            attachment_filenames=(
                attachment_filenames
            ),
        )
    )

    return doc.search_text


def build_pending_search_text(
    values,
    *,
    attachment_filenames:
        Iterable[str] | None = None,
) -> str:
    """
    Context البحث الموحد للعملية.

    الناتج يمر عبر نفس normalize_search_text المستخدم
    أصلًا في Archive Operations.
    """

    parts: list[str] = []

    search_fields = (
        "name",
        "serial_no",
        "card_name",
        "card_number",

        # نضع ID والاسم المقروء معًا.
        "card_owner",
        "card_owner_name",

        "currency",

        "bank",
        "bank_name",

        "region",
        "region_name",

        "machine_location",
        "machine_no",
        "branch_no",

        "representative",
        "representative_name",

        "operation_datetime",
        "status",

        "owner",
        "owner_full_name",

        "notes",
    )

    for fieldname in search_fields:
        _append_search_part(
            parts,
            _get_value(
                values,
                fieldname,
            ),
        )

    for filename in (
        attachment_filenames
        or []
    ):
        _append_search_part(
            parts,
            filename,
        )

    raw_text = " ".join(parts)

    return normalize_search_text(
        raw_text
    )


def get_pending_context_rows(
    *,
    user: str,
    scope: str | None,
) -> list[frappe._dict]:
    """
    يعيد Snapshot خفيفًا فقط.

    SECURITY:
    frappe.get_all يتجاوز Permission Engine العام،
    لذلك لا يستدعى إلا بعد تثبيت Scope هنا صراحة.

    scope=own:
        owner == user

    scope=all:
        جميع العمليات

    scope=None:
        لا بيانات.
    """

    if not user or user == "Guest":
        frappe.throw(
            _("يجب تسجيل الدخول."),
            frappe.PermissionError,
        )

    if scope is None:
        return []

    if scope not in {
        "own",
        "all",
    }:
        frappe.throw(
            _("نطاق عرض المعلقات غير صالح."),
            frappe.PermissionError,
        )

    filters = {}

    if scope == "own":
        filters["owner"] = user

    rows = frappe.get_all(
        PENDING_DOCTYPE,
        filters=filters,
        fields=_CONTEXT_DB_FIELDS,
        order_by=(
            "operation_datetime desc, "
            "creation desc, "
            "serial_no desc"
        ),
    )

    return hydrate_pending_context_rows(
        rows
    )


def hydrate_pending_context_rows(
    rows: Iterable[dict[str, Any]],
) -> list[frappe._dict]:
    """
    يضيف Display Labels وsearch_text للـRows دفعة واحدة.

    لا يوجد N+1:
    - Card Owners في Query واحدة.
    - Banks في Query واحدة.
    - Regions في Query واحدة.
    - Representatives في Query واحدة.
    - Users في Query واحدة.
    - Attachment filenames في Query واحدة.
    """

    rows = [
        frappe._dict(row)
        for row in rows
    ]

    if not rows:
        return []

    operation_names = {
        row.name
        for row in rows
        if row.name
    }

    card_owner_ids = {
        row.card_owner
        for row in rows
        if row.card_owner
    }

    bank_ids = {
        row.bank
        for row in rows
        if row.bank
    }

    region_ids = {
        row.region
        for row in rows
        if row.region
    }

    representative_ids = {
        row.representative
        for row in rows
        if row.representative
    }

    owner_ids = {
        row.owner
        for row in rows
        if row.owner
    }

    card_owner_map = _load_label_map(
        "Archive Card Owner",
        "card_owner_name",
        card_owner_ids,
    )

    bank_map = _load_label_map(
        "Archive Bank",
        "bank_name",
        bank_ids,
    )

    region_map = _load_label_map(
        "Archive Region",
        "region_name",
        region_ids,
    )

    representative_map = _load_label_map(
        "Archive Representative",
        "representative_name",
        representative_ids,
    )

    owner_map = _load_label_map(
        "User",
        "full_name",
        owner_ids,
    )

    attachment_map = (
        _load_attachment_filename_map(
            operation_names
        )
    )

    result: list[frappe._dict] = []

    for row in rows:
        row.card_owner_name = (
            card_owner_map.get(
                row.card_owner
            )
            or row.card_owner
            or ""
        )

        row.bank_name = (
            bank_map.get(
                row.bank
            )
            or row.bank
            or ""
        )

        row.region_name = (
            region_map.get(
                row.region
            )
            or row.region
            or ""
        )

        row.representative_name = (
            representative_map.get(
                row.representative
            )
            or row.representative
            or ""
        )

        row.owner_full_name = (
            owner_map.get(
                row.owner
            )
            or row.owner
            or ""
        )

        row.search_text = (
            build_pending_search_text(
                row,
                attachment_filenames=(
                    attachment_map.get(
                        row.name,
                        [],
                    )
                ),
            )
        )

        # الملاحظات تدخل Search Context،
        # لكنها ليست مطلوبة في Grid Snapshot.
        row.pop(
            "notes",
            None,
        )

        result.append(row)

    return result


def rebuild_pending_search_text(
    operation_names:
        Iterable[str] | None = None,
) -> int:
    """
    Backfill آمن للـsearch_text المخزن.

    يستخدم batches ولا يغير modified.
    """

    total_updated = 0

    if operation_names is not None:
        names = [
            cstr(name).strip()
            for name
            in operation_names
            if cstr(
                name
            ).strip()
        ]

        for name_chunk in _chunks(
            names,
            BACKFILL_BATCH_SIZE,
        ):
            rows = frappe.get_all(
                PENDING_DOCTYPE,
                filters={
                    "name": [
                        "in",
                        name_chunk,
                    ],
                },
                fields=_CONTEXT_DB_FIELDS,
            )

            total_updated += (
                _persist_hydrated_search_text(
                    rows
                )
            )

        return total_updated

    offset = 0

    while True:
        rows = frappe.get_all(
            PENDING_DOCTYPE,
            fields=_CONTEXT_DB_FIELDS,
            order_by=(
                "creation asc, "
                "name asc"
            ),
            limit_start=offset,
            limit_page_length=(
                BACKFILL_BATCH_SIZE
            ),
        )

        if not rows:
            break

        total_updated += (
            _persist_hydrated_search_text(
                rows
            )
        )

        offset += len(rows)

    return total_updated


def _persist_hydrated_search_text(
    rows,
) -> int:
    hydrated = (
        hydrate_pending_context_rows(
            rows
        )
    )

    for row in hydrated:
        frappe.db.set_value(
            PENDING_DOCTYPE,
            row.name,
            "search_text",
            row.search_text,
            update_modified=False,
        )

    return len(hydrated)


def _load_label_map(
    doctype: str,
    label_field: str,
    names: Iterable[str],
) -> dict[str, str]:
    names = list(
        {
            cstr(name).strip()
            for name in names
            if cstr(name).strip()
        }
    )

    if not names:
        return {}

    rows = frappe.get_all(
        doctype,
        filters={
            "name": [
                "in",
                names,
            ],
        },
        fields=[
            "name",
            label_field,
        ],
    )

    return {
        row.name:
            cstr(
                row.get(
                    label_field
                )
            ).strip()

        for row in rows
    }


def _load_attachment_filename_map(
    operation_names: Iterable[str],
) -> dict[str, list[str]]:
    operation_names = list(
        {
            cstr(name).strip()
            for name
            in operation_names
            if cstr(name).strip()
        }
    )

    if not operation_names:
        return {}

    rows = frappe.get_all(
        "Archive Pending Attachment",
        filters={
            "parent": [
                "in",
                operation_names,
            ],
            "parenttype":
                PENDING_DOCTYPE,
            "parentfield":
                "attachments",
        },
        fields=[
            "parent",
            "file_name",
        ],
        order_by="idx asc",
    )

    result: defaultdict[
        str,
        list[str],
    ] = defaultdict(list)

    for row in rows:
        filename = cstr(
            row.file_name
        ).strip()

        if filename:
            result[
                row.parent
            ].append(
                filename
            )

    return dict(result)


def _get_link_label(
    doctype: str,
    name: str | None,
    label_field: str,
) -> str:
    name = cstr(
        name
    ).strip()

    if not name:
        return ""

    return cstr(
        frappe.db.get_value(
            doctype,
            name,
            label_field,
        )
        or ""
    ).strip()


def _append_search_part(
    parts: list[str],
    value: Any,
) -> None:
    if value is None:
        return

    text = cstr(
        value
    ).strip()

    if text:
        parts.append(text)


def _get_value(
    values,
    fieldname: str,
):
    if isinstance(
        values,
        dict,
    ):
        return values.get(
            fieldname
        )

    return getattr(
        values,
        fieldname,
        None,
    )


def _chunks(
    values: list[str],
    size: int,
):
    for index in range(
        0,
        len(values),
        size,
    ):
        yield values[
            index:
            index + size
        ]