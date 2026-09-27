from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import (
    cint,
    cstr,
)


PENDING_COMPLETE_STATUS = (
    "مرتجعة مكتملة"
)

PENDING_CLOSED_MESSAGE = (
    "هذه العملية منتهية. "
    "ألغِ الإنهاء أولًا لإجراء تعديلات عليها."
)


_CLOSURE_MUTATION_TOKEN = object()

_CLOSURE_TOKEN_FLAG = (
    "_archive_pending_closure_mutation_token"
)


def is_pending_operation_closed(
    doc,
) -> bool:
    return bool(
        cint(
            getattr(
                doc,
                "is_closed",
                0,
            )
        )
    )


def require_pending_operation_open(
    doc,
) -> None:
    if not is_pending_operation_closed(
        doc
    ):
        return

    frappe.throw(
        _(PENDING_CLOSED_MESSAGE),
        frappe.ValidationError,
    )


def validate_close_note(
    value: Any,
) -> str:
    note = cstr(
        value
        or ""
    ).strip()

    if not note:
        frappe.throw(
            _(
                "ملاحظة إنهاء العملية مطلوبة."
            ),
            frappe.ValidationError,
        )

    if len(note) > 2000:
        frappe.throw(
            _(
                "ملاحظة إنهاء العملية طويلة جدًا. "
                "الحد الأقصى 2000 حرف."
            ),
            frappe.ValidationError,
        )

    return note


def ensure_pending_operation_can_close(
    doc,
) -> None:
    if is_pending_operation_closed(
        doc
    ):
        frappe.throw(
            _(
                "العملية منتهية بالفعل."
            ),
            frappe.ValidationError,
        )

    if (
        cstr(
            getattr(
                doc,
                "status",
                "",
            )
        ).strip()
        == PENDING_COMPLETE_STATUS
    ):
        frappe.throw(
            _(
                "العملية المرتجعة مكتملة لا تحتاج "
                "إلى إنهاء يدوي."
            ),
            frappe.ValidationError,
        )


def ensure_pending_operation_can_reopen(
    doc,
) -> None:
    if is_pending_operation_closed(
        doc
    ):
        return

    frappe.throw(
        _(
            "العملية غير منتهية."
        ),
        frappe.ValidationError,
    )


def append_closure_note(
    existing_notes: Any,
    closure_note: Any,
) -> str:
    """
    لا ننشئ حقلًا منفصلًا لملاحظة الإنهاء.

    الملاحظة تدخل مباشرة في notes الحالية،
    وSnapshot السابق يحفظ داخل Audit Log فقط.
    """

    before = cstr(
        existing_notes
        or ""
    ).strip()

    note = validate_close_note(
        closure_note
    )

    if not before:
        return note

    return (
        f"{before}\n\n{note}"
    )


def authorize_pending_closure_transition(
    doc,
) -> None:
    """
    يسمح بتغيير is_closed / closed_at / closed_by
    فقط لمسار Business Transition الرسمي.
    """

    setattr(
        doc.flags,
        _CLOSURE_TOKEN_FLAG,
        _CLOSURE_MUTATION_TOKEN,
    )


def consume_pending_closure_authorization(
    doc,
) -> bool:
    authorized = (
        getattr(
            doc.flags,
            _CLOSURE_TOKEN_FLAG,
            None,
        )
        is
        _CLOSURE_MUTATION_TOKEN
    )

    setattr(
        doc.flags,
        _CLOSURE_TOKEN_FLAG,
        None,
    )

    return authorized


def validate_pending_closure_state(
    doc,
) -> None:
    is_closed = (
        is_pending_operation_closed(
            doc
        )
    )

    closed_at = getattr(
        doc,
        "closed_at",
        None,
    )

    closed_by = cstr(
        getattr(
            doc,
            "closed_by",
            None,
        )
        or ""
    ).strip()

    if is_closed:
        if (
            not closed_at
            or
            not closed_by
        ):
            frappe.throw(
                _(
                    "بيانات إنهاء العملية غير مكتملة."
                ),
                frappe.ValidationError,
            )

        return

    if (
        closed_at
        or
        closed_by
    ):
        frappe.throw(
            _(
                "لا يمكن وجود بيانات إنهاء "
                "لعملية غير منتهية."
            ),
            frappe.ValidationError,
        )