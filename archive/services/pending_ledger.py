from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

import frappe
from frappe import _
from frappe.utils import cstr, get_datetime


PENDING_DOCTYPE = "Archive Pending Operation"

STATUS_UNDER_ACTION = "تحت الإجراء"
STATUS_PARTIALLY_RETURNED = "مرتجعة غير مكتملة"
STATUS_FULLY_RETURNED = "مرتجعة مكتملة"

FINANCIAL_MODE_APPEND_RETURN = "append_return"
FINANCIAL_MODE_CORRECTION = "correct_ledger"

_ALLOWED_FINANCIAL_MODES = {
    FINANCIAL_MODE_APPEND_RETURN,
    FINANCIAL_MODE_CORRECTION,
}

# Token داخلي لا يمكن للـClient إعادة إنشائه من JSON.
_INTERNAL_FINANCIAL_MUTATION_TOKEN = object()


def authorize_financial_mutation(doc, mode: str) -> None:
    if mode not in _ALLOWED_FINANCIAL_MODES:
        frappe.throw(
            _("وضع التعديل المالي غير صالح."),
            frappe.ValidationError,
        )

    doc.flags._pending_financial_mutation_token = (
        _INTERNAL_FINANCIAL_MUTATION_TOKEN
    )
    doc.flags._pending_financial_mutation_mode = mode


def get_financial_mutation_mode(doc) -> str | None:
    token = doc.flags.get(
        "_pending_financial_mutation_token"
    )

    if token is not _INTERNAL_FINANCIAL_MUTATION_TOKEN:
        return None

    mode = doc.flags.get(
        "_pending_financial_mutation_mode"
    )

    if mode not in _ALLOWED_FINANCIAL_MODES:
        return None

    return mode


def get_money_precision(doc) -> int:
    if not doc.currency:
        frappe.throw(
            _("العملة مطلوبة قبل احتساب الحركة المالية."),
            frappe.ValidationError,
        )

    precision = frappe.get_precision(
        PENDING_DOCTYPE,
        "total_suspended",
        currency=doc.currency,
        doc=doc,
    )

    if precision is None:
        precision = 2

    return int(precision)


def money_decimal(
    doc,
    value: Any,
    *,
    label: str,
    row_number: int | None = None,
) -> Decimal:
    precision = get_money_precision(doc)

    return _to_money_decimal(
        value,
        precision=precision,
        label=label,
        row_number=row_number,
        strict_precision=True,
    )


def validate_and_recalculate_ledger(doc):
    """
    الـLedger هو مصدر الحقيقة المالي.

    كل remaining_amount داخل Child، وجميع Parent totals،
    والحالة يتم حسابها بالكامل من السيرفر.
    """

    if not doc.currency:
        frappe.throw(
            _("العملة مطلوبة."),
            frappe.ValidationError,
        )

    rows = list(doc.ledger_entries or [])

    if not rows:
        frappe.throw(
            _("يجب إضافة حركة مالية واحدة على الأقل."),
            frappe.ValidationError,
        )

    precision = get_money_precision(doc)
    zero = _zero_for_precision(precision)

    total_suspended = zero
    total_returned = zero
    balance = zero

    for position, row in enumerate(
        rows,
        start=1,
    ):
        suspended = _to_money_decimal(
            row.suspended_amount,
            precision=precision,
            label=_("المبلغ المعلق"),
            row_number=position,
            strict_precision=True,
        )

        returned = _to_money_decimal(
            row.returned_amount,
            precision=precision,
            label=_("المبلغ المرتجع"),
            row_number=position,
            strict_precision=True,
        )

        if suspended < zero:
            frappe.throw(
                _(
                    "المبلغ المعلق لا يمكن أن يكون سالبًا "
                    "في الحركة رقم {0}."
                ).format(position),
                frappe.ValidationError,
            )

        if returned < zero:
            frappe.throw(
                _(
                    "المبلغ المرتجع لا يمكن أن يكون سالبًا "
                    "في الحركة رقم {0}."
                ).format(position),
                frappe.ValidationError,
            )

        if suspended == zero and returned == zero:
            frappe.throw(
                _(
                    "الحركة رقم {0} فارغة. يجب أن تحتوي على "
                    "مبلغ معلق أو مبلغ مرتجع."
                ).format(position),
                frappe.ValidationError,
            )

        if returned > zero:
            if not row.return_datetime:
                frappe.throw(
                    _(
                        "تاريخ ووقت الإرجاع مطلوب للحركة رقم {0}."
                    ).format(position),
                    frappe.ValidationError,
                )

            try:
                row.return_datetime = get_datetime(
                    row.return_datetime
                )
            except Exception:
                frappe.throw(
                    _(
                        "تاريخ ووقت الإرجاع غير صالح "
                        "في الحركة رقم {0}."
                    ).format(position),
                    frappe.ValidationError,
                )

        elif row.return_datetime:
            frappe.throw(
                _(
                    "لا يمكن تحديد تاريخ إرجاع للحركة رقم {0} "
                    "بدون مبلغ مرتجع."
                ).format(position),
                frappe.ValidationError,
            )

        available_before_return = (
            balance + suspended
        )

        next_balance = (
            available_before_return
            - returned
        )

        if next_balance < zero:
            frappe.throw(
                _(
                    "المبلغ المرتجع في الحركة رقم {0} يتجاوز "
                    "الرصيد المتاح. الرصيد المتاح قبل الإرجاع "
                    "هو {1}."
                ).format(
                    position,
                    format_money_decimal(
                        available_before_return,
                        precision,
                    ),
                ),
                frappe.ValidationError,
            )

        total_suspended += suspended
        total_returned += returned
        balance = next_balance

        row.currency = doc.currency

        row.suspended_amount = (
            _decimal_for_storage(
                suspended
            )
        )

        row.returned_amount = (
            _decimal_for_storage(
                returned
            )
        )

        row.remaining_amount = (
            _decimal_for_storage(
                balance
            )
        )

    if total_suspended <= zero:
        frappe.throw(
            _(
                "يجب أن تحتوي العملية على مبلغ معلق موجب."
            ),
            frappe.ValidationError,
        )

    remaining_amount = (
        total_suspended
        - total_returned
    )

    if remaining_amount != balance:
        frappe.throw(
            _(
                "تعذر التحقق من اتساق الرصيد المالي للعملية."
            ),
            frappe.ValidationError,
        )

    status = _derive_status(
        total_suspended=total_suspended,
        total_returned=total_returned,
        remaining_amount=remaining_amount,
        zero=zero,
    )

    doc.total_suspended = (
        _decimal_for_storage(
            total_suspended
        )
    )

    doc.total_returned = (
        _decimal_for_storage(
            total_returned
        )
    )

    doc.remaining_amount = (
        _decimal_for_storage(
            remaining_amount
        )
    )

    doc.status = status

    return frappe._dict(
        precision=precision,
        total_suspended=total_suspended,
        total_returned=total_returned,
        remaining_amount=remaining_amount,
        status=status,
    )


def validate_financial_mutation(doc) -> None:
    """
    بعد حفظ العملية لا يمكن تعديل Ledger من Form أو REST عادي.

    التغيير المالي يحتاج Server-authorized mutation context.
    """

    if doc.is_new():
        return

    previous = doc.get_doc_before_save()

    if not previous:
        previous = doc.get_latest()

    if cstr(previous.currency) != cstr(doc.currency):
        frappe.throw(
            _(
                "لا يمكن تغيير عملة العملية بعد إنشائها لأن جميع "
                "حركات الـLedger مسجلة بهذه العملة."
            ),
            frappe.ValidationError,
        )

    before = financial_snapshot(previous)
    after = financial_snapshot(doc)

    if before == after:
        return

    mode = get_financial_mutation_mode(doc)

    if mode == FINANCIAL_MODE_APPEND_RETURN:
        _validate_append_only_return(
            before=before,
            after=after,
            doc=doc,
        )
        return

    if mode == FINANCIAL_MODE_CORRECTION:
        return

    frappe.throw(
        _(
            "لا يمكن تعديل أو حذف الحركة المالية مباشرة. "
            "استخدم إجراء إضافة إرجاع أو وضع تصحيح الحركة المالية."
        ),
        frappe.PermissionError,
    )


def financial_snapshot(doc) -> dict[str, Any]:
    precision = get_money_precision(doc)

    rows = []

    for position, row in enumerate(
        doc.ledger_entries or [],
        start=1,
    ):
        rows.append(
            {
                "name": cstr(
                    row.name or ""
                ),

                "idx": int(
                    row.idx or position
                ),

                "suspended_amount":
                    format_money_decimal(
                        _to_money_decimal(
                            row.suspended_amount,
                            precision=precision,
                            label=_(
                                "المبلغ المعلق"
                            ),
                            row_number=position,
                            strict_precision=False,
                        ),
                        precision,
                    ),

                "returned_amount":
                    format_money_decimal(
                        _to_money_decimal(
                            row.returned_amount,
                            precision=precision,
                            label=_(
                                "المبلغ المرتجع"
                            ),
                            row_number=position,
                            strict_precision=False,
                        ),
                        precision,
                    ),

                "return_datetime":
                    _datetime_snapshot(
                        row.return_datetime
                    ),

                "entered_by": cstr(
                    row.entered_by or ""
                ),

                "entered_at":
                    _datetime_snapshot(
                        row.entered_at
                    ),
            }
        )

    return {
        "currency": cstr(
            doc.currency or ""
        ),
        "rows": rows,
    }


def financial_summary_snapshot(
    doc,
) -> dict[str, Any]:
    precision = get_money_precision(doc)

    return {
        "currency": cstr(
            doc.currency or ""
        ),

        "total_suspended":
            format_money_decimal(
                _to_money_decimal(
                    doc.total_suspended,
                    precision=precision,
                    label=_(
                        "إجمالي المعلق"
                    ),
                    strict_precision=False,
                ),
                precision,
            ),

        "total_returned":
            format_money_decimal(
                _to_money_decimal(
                    doc.total_returned,
                    precision=precision,
                    label=_(
                        "إجمالي المرتجع"
                    ),
                    strict_precision=False,
                ),
                precision,
            ),

        "remaining_amount":
            format_money_decimal(
                _to_money_decimal(
                    doc.remaining_amount,
                    precision=precision,
                    label=_(
                        "المبلغ المتبقي"
                    ),
                    strict_precision=False,
                ),
                precision,
            ),

        "status": cstr(
            doc.status or ""
        ),
    }


def build_ledger_diff(
    before: dict[str, Any],
    after: dict[str, Any],
) -> dict[str, Any]:
    before_rows = (
        before.get("rows")
        or []
    )

    after_rows = (
        after.get("rows")
        or []
    )

    before_by_name = {
        row["name"]: row
        for row in before_rows
        if row.get("name")
    }

    after_by_name = {
        row["name"]: row
        for row in after_rows
        if row.get("name")
    }

    added = [
        row
        for row in after_rows
        if (
            not row.get("name")
            or row.get("name")
            not in before_by_name
        )
    ]

    removed = [
        row
        for row in before_rows
        if (
            row.get("name")
            not in after_by_name
        )
    ]

    changed = []

    for (
        name,
        before_row,
    ) in before_by_name.items():
        after_row = (
            after_by_name.get(name)
        )

        if (
            after_row
            and before_row != after_row
        ):
            changed.append(
                {
                    "name": name,
                    "before": before_row,
                    "after": after_row,
                }
            )

    return {
        "order_before": [
            row.get("name")
            or "<new>"
            for row in before_rows
        ],

        "order_after": [
            row.get("name")
            or "<new>"
            for row in after_rows
        ],

        "added": added,
        "removed": removed,
        "changed": changed,
    }


def operation_financial_state(
    doc,
) -> dict[str, Any]:
    return {
        "name": doc.name,
        "serial_no": doc.serial_no,
        "currency": doc.currency,

        "total_suspended":
            doc.total_suspended,

        "total_returned":
            doc.total_returned,

        "remaining_amount":
            doc.remaining_amount,

        "status":
            doc.status,

        "modified":
            doc.modified,

        "ledger_entries": [
            {
                "name":
                    row.name,

                "idx":
                    row.idx,

                "suspended_amount":
                    row.suspended_amount,

                "returned_amount":
                    row.returned_amount,

                "remaining_amount":
                    row.remaining_amount,

                "return_datetime":
                    row.return_datetime,

                "entered_by":
                    row.entered_by,

                "entered_at":
                    row.entered_at,
            }
            for row
            in doc.ledger_entries or []
        ],
    }


def format_money_decimal(
    value: Decimal,
    precision: int,
) -> str:
    return f"{value:.{precision}f}"


def _validate_append_only_return(
    *,
    before: dict[str, Any],
    after: dict[str, Any],
    doc,
) -> None:
    before_rows = (
        before.get("rows")
        or []
    )

    after_rows = (
        after.get("rows")
        or []
    )

    if (
        len(after_rows)
        != len(before_rows) + 1
    ):
        frappe.throw(
            _(
                "إضافة الإرجاع يجب أن تضيف حركة جديدة واحدة فقط "
                "بدون تعديل أو حذف الحركات السابقة."
            ),
            frappe.PermissionError,
        )

    if (
        after_rows[:-1]
        != before_rows
    ):
        frappe.throw(
            _(
                "لا يمكن تعديل أو إعادة ترتيب الحركات المالية "
                "السابقة أثناء إضافة إرجاع جديد."
            ),
            frappe.PermissionError,
        )

    precision = get_money_precision(
        doc
    )

    zero_text = (
        format_money_decimal(
            _zero_for_precision(
                precision
            ),
            precision,
        )
    )

    new_row = after_rows[-1]

    if (
        new_row[
            "suspended_amount"
        ]
        != zero_text
    ):
        frappe.throw(
            _(
                "إجراء إضافة الإرجاع لا يسمح بإضافة "
                "مبلغ معلق جديد."
            ),
            frappe.PermissionError,
        )

    returned = _to_money_decimal(
        new_row[
            "returned_amount"
        ],
        precision=precision,
        label=_(
            "المبلغ المرتجع"
        ),
        strict_precision=False,
    )

    if (
        returned
        <= _zero_for_precision(
            precision
        )
    ):
        frappe.throw(
            _(
                "يجب أن يكون المبلغ المرتجع موجبًا."
            ),
            frappe.ValidationError,
        )


def _derive_status(
    *,
    total_suspended: Decimal,
    total_returned: Decimal,
    remaining_amount: Decimal,
    zero: Decimal,
) -> str:
    if total_returned == zero:
        return STATUS_UNDER_ACTION

    if remaining_amount > zero:
        return STATUS_PARTIALLY_RETURNED

    if (
        remaining_amount == zero
        and total_suspended > zero
    ):
        return STATUS_FULLY_RETURNED

    frappe.throw(
        _(
            "تعذر اشتقاق حالة العملية المالية."
        ),
        frappe.ValidationError,
    )


def _to_money_decimal(
    value: Any,
    *,
    precision: int,
    label: str,
    row_number: int | None = None,
    strict_precision: bool,
) -> Decimal:
    text = cstr(
        value
        if value not in (None, "")
        else "0"
    )

    text = (
        text.strip()
        or "0"
    )

    try:
        raw = Decimal(text)
    except (
        InvalidOperation,
        ValueError,
    ):
        frappe.throw(
            _(
                "قيمة {0} غير صالحة."
            ).format(label),
            frappe.ValidationError,
        )

    if not raw.is_finite():
        frappe.throw(
            _(
                "قيمة {0} غير صالحة."
            ).format(label),
            frappe.ValidationError,
        )

    quantum = (
        _quantum_for_precision(
            precision
        )
    )

    try:
        normalized = raw.quantize(
            quantum,
            rounding=ROUND_HALF_UP,
        )

    except InvalidOperation:
        frappe.throw(
            _(
                "قيمة {0} خارج النطاق المسموح."
            ).format(label),
            frappe.ValidationError,
        )

    if (
        strict_precision
        and raw != normalized
    ):
        row_suffix = (
            _(
                " في الحركة رقم {0}"
            ).format(row_number)
            if row_number
            else ""
        )

        frappe.throw(
            _(
                "{0}{1} تحتوي على منازل عشرية أكثر "
                "من المسموح للعملة الحالية ({2})."
            ).format(
                label,
                row_suffix,
                precision,
            ),
            frappe.ValidationError,
        )

    return normalized


def _decimal_for_storage(
    value: Decimal,
) -> float:
    if value == 0:
        return 0.0

    return float(value)


def _quantum_for_precision(
    precision: int,
) -> Decimal:
    return Decimal("1").scaleb(
        -precision
    )


def _zero_for_precision(
    precision: int,
) -> Decimal:
    return Decimal("0").quantize(
        _quantum_for_precision(
            precision
        )
    )


def _datetime_snapshot(
    value: Any,
) -> str:
    if not value:
        return ""

    return get_datetime(
        value
    ).isoformat(
        sep=" ",
        timespec="microseconds",
    )