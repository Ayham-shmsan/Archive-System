from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import (
    cint,
    cstr,
    now_datetime,
)
from archive.services.pending_operation_attachments import (
    serialize_pending_attachments,
)
from archive.api.pending_operation_search import (
    get_pending_context_rows,
)
from archive.archive.doctype.archive_pending_operation.archive_pending_operation import (
    authorize_pending_failure_transition,
)
from archive.services.pending_ledger import (
    FINANCIAL_MODE_APPEND_RETURN,
    FINANCIAL_MODE_CORRECTION,
    authorize_financial_mutation,
    build_ledger_diff,
    financial_snapshot,
    financial_summary_snapshot,
    money_decimal,
    operation_financial_state,
    validate_and_recalculate_ledger,
    PENDING_CURRENCY,
)

from archive.services.pending_operation_audit import (
    create_pending_operation_log,
    log_status_change,
)

from archive.services.pending_operation_permissions import (
    _require_add_pending_return,
    _require_correct_pending_ledger,
    _require_create_pending_operation,
    _require_edit_pending_operation,
    _require_view_pending_operation,
    get_pending_capabilities as get_pending_capabilities_service,
    get_pending_record_permissions,
)


PENDING_DOCTYPE = (
    "Archive Pending Operation"
)

@frappe.whitelist(
    methods=["GET"]
)
def get_pending_capabilities():
    """
    API خفيف لقدرات المستخدم العامة.

    تستخدمه الصفحة لاحقًا لتقرير:
    - هل يظهر زر الإنشاء؟
    - هل يوجد History/Grid؟
    - ما هو own/all؟
    """

    return get_pending_capabilities_service()


@frappe.whitelist(
    methods=["GET"]
)
def get_pending_operations_context():
    """
    Snapshot الرئيسي لشاشة المعلقات.

    لا يعيد:
    - Ledger كامل.
    - Attachments كاملة.
    - Timeline.

    هذه البيانات تأتي فقط عند فتح سجل محدد
    في المرحلة المخصصة لذلك.
    """

    user = frappe.session.user

    capabilities = (
        get_pending_capabilities_service(
            user=user
        )
    )

    if capabilities.get(
        "can_view"
    ):
        operations = (
            get_pending_context_rows(
                user=user,
                scope=capabilities.get(
                    "scope"
                ),
            )
        )

    else:
        # مهم لحالة create-only.
        #
        # يمكن للمستخدم دخول الصفحة وإنشاء معلقة
        # بدون أن نرسل له أي بيانات History.
        operations = []

    return {
        "context_version": 2,

        "generated_at":
            now_datetime(),

        "scope":
            capabilities.get(
                "scope"
            ),

        "total":
            len(operations),

        "capabilities":
            capabilities,

        "operations":
            operations,
    }


_CREATE_ALLOWED_FIELDS = {
    "bank",
    "card_name",
    "account_number",
    "card_number",
    "operation_datetime",
    "suspended_note",
    "region",
    "machine_location",
    "branch_no",
    "machine_no",
    "representative",
    "card_owner",
    "ledger_entries",
    "notes",
    "attachments",
}


_LEDGER_INPUT_FIELDS = {
    "suspended_amount",
    "returned_amount",
    "return_date",
    "return_note",
}



_CORRECTION_LEDGER_INPUT_FIELDS = {
    "name",
    "suspended_amount",
    "returned_amount",
    "return_date",
    "return_note",
}

_ADD_RETURN_FIELDS = {
    "returned_amount",
    "return_date",
    "return_note",
}


_CORRECTION_FIELDS = {
    "reason",
    "expected_modified",
    "ledger_entries",
}



_UPDATE_TEXT_FIELDS = {
    "card_name",
    "card_number",
    "card_owner",
    "bank",
    "region",
    "machine_location",
    "machine_no",
    "branch_no",
    "representative",
    "notes",
}

_UPDATE_METADATA_FIELDS = {
    "bank",
    "card_name",
    "account_number",
    "card_number",
    "operation_datetime",
    "suspended_note",
    "region",
    "machine_location",
    "branch_no",
    "machine_no",
    "representative",
    "card_owner",
    "notes",
}

_UPDATE_ALLOWED_FIELDS = {
    *_UPDATE_METADATA_FIELDS,
    "ledger_entries",
}
@frappe.whitelist(
    methods=["GET"]
)
def get_pending_operation_details(
    name: str,
) -> dict[str, Any]:
    name = cstr(
        name
    ).strip()

    if not name:
        frappe.throw(
            _("اسم العملية المعلقة مطلوب."),
            frappe.ValidationError,
        )

    doc = frappe.get_doc(
        PENDING_DOCTYPE,
        name,
    )

    _require_view_pending_operation(
        doc
    )

    return _build_pending_operation_details(
        doc
    )


# @frappe.whitelist(
#     methods=["POST"]
# )
# def update_pending_operation(
#     name: str,
#     payload: str | dict[str, Any],
#     expected_modified: Any = None,
# ) -> dict[str, Any]:
#     name = cstr(
#         name
#     ).strip()

#     if not name:
#         frappe.throw(
#             _("اسم العملية المعلقة مطلوب."),
#             frappe.ValidationError,
#         )

#     data = _parse_dict_payload(
#         payload,
#         context=_(
#             "بيانات تعديل العملية"
#         ),
#     )

#     _reject_unknown_keys(
#         data,
#         _UPDATE_ALLOWED_FIELDS,
#         context=_(
#             "بيانات تعديل العملية"
#         ),
#     )

#     if not expected_modified:
#         frappe.throw(
#             _(
#                 "تعذر التحقق من نسخة العملية الحالية. "
#                 "أعد فتح العملية وحاول مرة أخرى."
#             ),
#             frappe.ValidationError,
#         )

#     # Lock حتى لا يتزامن Metadata edit
#     # مع Return/Correction بشكل غير منضبط.
#     doc = frappe.get_doc(
#         PENDING_DOCTYPE,
#         name,
#         for_update=True,
#     )

#     _require_edit_pending_operation(
#         doc
#     )

#     if (
#         cstr(doc.modified)
#         != cstr(expected_modified)
#     ):
#         frappe.throw(
#             _(
#                 "تم تعديل العملية من جلسة أخرى بعد فتحها. "
#                 "أعد تحميل العملية قبل حفظ تغييراتك."
#             ),
#             frappe.ValidationError,
#         )

#     for (
#         fieldname,
#         value,
#     ) in data.items():

#         if (
#             fieldname
#             in _UPDATE_TEXT_FIELDS
#         ):
#             value = cstr(
#                 value
#             ).strip()

#         doc.set(
#             fieldname,
#             value,
#         )

#     # نتجاوز Generic write لأن Business Permission
#     # تم فحصها أعلاه عبر edit_own/edit_all.
#     #
#     # Ledger نفسه لم يتغير، وبالتالي Controller
#     # سيمنع أي محاولة لتهريبه ضمن هذا المسار.
#     doc.save(
#         ignore_permissions=True
#     )

#     return _build_pending_operation_details(
#         doc
#     )


@frappe.whitelist(
    methods=["POST"]
)
def update_pending_operation(
    name: str,
    payload: str | dict[str, Any],
    expected_modified: Any = None,
) -> dict[str, Any]:
    name = cstr(
        name
    ).strip()

    if not name:
        frappe.throw(
            _(
                "اسم العملية المعلقة مطلوب."
            ),
            frappe.ValidationError,
        )

    data = _parse_dict_payload(
        payload,
        context=_(
            "بيانات تعديل العملية"
        ),
    )

    _reject_unknown_keys(
        data,
        _UPDATE_ALLOWED_FIELDS,
        context=_(
            "بيانات تعديل العملية"
        ),
    )

    if not expected_modified:
        frappe.throw(
            _(
                "تعذر التحقق من نسخة العملية الحالية. "
                "أعد فتح العملية وحاول مرة أخرى."
            ),
            frappe.ValidationError,
        )

    doc = frappe.get_doc(
        PENDING_DOCTYPE,
        name,
        for_update=True,
    )

    _require_view_pending_operation(
        doc
    )

    if (
        cstr(
            doc.modified
        )
        !=
        cstr(
            expected_modified
        )
    ):
        frappe.throw(
            _(
                "تم تعديل العملية من جلسة أخرى بعد فتحها. "
                "أعد تحميل العملية قبل حفظ تغييراتك."
            ),
            frappe.ValidationError,
        )

    permissions = (
        get_pending_record_permissions(
            doc,
            user=frappe.session.user,
        )
    )

    metadata_payload = {
        fieldname:
            value

        for (
            fieldname,
            value,
        ) in data.items()

        if fieldname
        in _UPDATE_METADATA_FIELDS
    }

    has_ledger_payload = (
        "ledger_entries"
        in data
    )

    if (
        metadata_payload
        and
        not permissions.get(
            "can_edit"
        )
    ):
        frappe.throw(
            _(
                "ليس لديك صلاحية لتعديل "
                "بيانات هذه العملية المعلقة."
            ),
            frappe.PermissionError,
        )

    if (
        has_ledger_payload
        and
        not permissions.get(
            "can_correct_ledger"
        )
    ):
        frappe.throw(
            _(
                "ليس لديك صلاحية لتعديل "
                "الحركة المالية لهذه العملية."
            ),
            frappe.PermissionError,
        )

    if (
        not metadata_payload
        and
        not has_ledger_payload
    ):
        frappe.throw(
            _(
                "لا توجد بيانات لتعديلها."
            ),
            frappe.ValidationError,
        )

    before_status = (
        doc.status
    )

    before_summary = None
    before_ledger = None
    ledger_changed = False

    if has_ledger_payload:
        validate_and_recalculate_ledger(
            doc
        )

        before_summary = (
            financial_summary_snapshot(
                doc
            )
        )

        before_ledger = (
            financial_snapshot(
                doc
            )
        )

        rows = _parse_ledger_list(
            data.get(
                "ledger_entries"
            ),
            context=_(
                "حركات تعديل العملية"
            ),
        )

        if not rows:
            frappe.throw(
                _(
                    "يجب أن يحتوي جدول الحركة "
                    "على حركة مالية واحدة على الأقل."
                ),
                frappe.ValidationError,
            )

        _rebuild_ledger_for_edit(
            doc,
            rows,
        )

        doc._prepare_ledger_rows()

        validate_and_recalculate_ledger(
            doc
        )

        after_candidate = (
            financial_snapshot(
                doc
            )
        )

        ledger_changed = (
            after_candidate
            != before_ledger
        )

        if ledger_changed:
            authorize_financial_mutation(
                doc,
                FINANCIAL_MODE_CORRECTION,
            )

    for (
        fieldname,
        value,
    ) in metadata_payload.items():

        if (
            fieldname
            in _UPDATE_TEXT_FIELDS
        ):
            value = cstr(
                value
            ).strip()

        doc.set(
            fieldname,
            value,
        )

    doc.save(
        ignore_permissions=True
    )

    if ledger_changed:
        after_summary = (
            financial_summary_snapshot(
                doc
            )
        )

        after_ledger = (
            financial_snapshot(
                doc
            )
        )

        create_pending_operation_log(
            operation_name=
                doc.name,

            event_type=
                "ledger_corrected",

            event_title=
                "تعديل الحركة المالية",

            event_source=
                "User",

            details={
                "before":
                    before_summary,

                "after":
                    after_summary,

                "ledger_diff":
                    build_ledger_diff(
                        before_ledger,
                        after_ledger,
                    ),
            },
        )

        log_status_change(
            operation_name=
                doc.name,

            before_status=
                before_status,

            after_status=
                doc.status,

            financial_summary=
                after_summary,
        )

    return (
        _build_pending_operation_details(
            doc
        )
    )

@frappe.whitelist(
    methods=["POST"]
)
def create_pending_operation(
    payload: str | dict[str, Any],
) -> dict[str, Any]:
    _require_create_pending_operation()

    data = _parse_dict_payload(
        payload,
        context=_(
            "بيانات إنشاء العملية"
        ),
    )

    _reject_unknown_keys(
        data,
        _CREATE_ALLOWED_FIELDS,
        context=_(
            "بيانات إنشاء العملية"
        ),
    )

    ledger_entries = (
        _sanitize_create_ledger_entries(
            data.get(
                "ledger_entries"
            )
        )
    )

    doc_data = {
        "doctype":
            PENDING_DOCTYPE,

        "currency":
            PENDING_CURRENCY,

        **{
            key:
                value

            for (
                key,
                value,
            ) in data.items()

            if key
            != "ledger_entries"
        },

        "ledger_entries":
            ledger_entries,
    }

    doc = frappe.get_doc(
        doc_data
    )

    # Custom capability هو الحاكم هنا.
    # لا نعتمد بعده على Generic write/create.
    doc.insert(
        ignore_permissions=True
    )

    return operation_financial_state(
        doc
    )


# @frappe.whitelist(
#     methods=["POST"]
# )
# def add_pending_return(
#     name: str,
#     payload: str | dict[str, Any],
# ) -> dict[str, Any]:
#     name = cstr(
#         name
#     ).strip()

#     if not name:
#         frappe.throw(
#             _(
#                 "اسم العملية المعلقة مطلوب."
#             ),
#             frappe.ValidationError,
#         )

#     data = _parse_dict_payload(
#         payload,
#         context=_(
#             "بيانات الإرجاع"
#         ),
#     )

#     _reject_unknown_keys(
#         data,
#         _ADD_RETURN_FIELDS,
#         context=_(
#             "بيانات الإرجاع"
#         ),
#     )

#     if (
#         "returned_amount"
#         not in data
#     ):
#         frappe.throw(
#             _(
#                 "المبلغ المرتجع مطلوب."
#             ),
#             frappe.ValidationError,
#         )

#     # هذه أهم نقطة في Concurrency.
#     #
#     # Parent + Child Ledger يُحمّلان FOR UPDATE
#     # داخل Transaction الحالية.
#     doc = frappe.get_doc(
#         PENDING_DOCTYPE,
#         name,
#         for_update=True,
#     )

#     _require_add_pending_return(
#         doc
#     )

#     # لا نثق حتى Parent totals الموجودة في DB.
#     # نعيد الحساب من Ledger الحقيقي بعد القفل.
#     validate_and_recalculate_ledger(
#         doc
#     )

#     before_status = (
#         doc.status
#     )

#     before_summary = (
#         financial_summary_snapshot(
#             doc
#         )
#     )

#     returned_amount = (
#         money_decimal(
#             doc,
#             data.get(
#                 "returned_amount"
#             ),
#             label=_(
#                 "المبلغ المرتجع"
#             ),
#         )
#     )

#     remaining_amount = (
#         money_decimal(
#             doc,
#             doc.remaining_amount,
#             label=_(
#                 "المبلغ المتبقي"
#             ),
#         )
#     )

#     if returned_amount <= 0:
#         frappe.throw(
#             _(
#                 "يجب أن يكون المبلغ المرتجع موجبًا."
#             ),
#             frappe.ValidationError,
#         )

#     if remaining_amount <= 0:
#         frappe.throw(
#             _(
#                 "العملية مرتجعة بالكامل "
#                 "ولا يوجد رصيد متبقٍ للإرجاع."
#             ),
#             frappe.ValidationError,
#         )

#     if (
#         returned_amount
#         > remaining_amount
#     ):
#         frappe.throw(
#             _(
#                 "المبلغ المرتجع يتجاوز الرصيد المتبقي. "
#                 "الرصيد المتبقي الحالي هو {0}."
#             ).format(
#                 doc.remaining_amount
#             ),
#             frappe.ValidationError,
#         )

#     return_datetime = (
#         data.get(
#             "return_datetime"
#         )
#         or now_datetime()
#     )

#     new_row = doc.append(
#         "ledger_entries",
#         {
#             "suspended_amount":
#                 0,

#             "returned_amount":
#                 returned_amount,

#             "return_datetime":
#                 return_datetime,
#         },
#     )

#     authorize_financial_mutation(
#         doc,
#         FINANCIAL_MODE_APPEND_RETURN,
#     )

#     # ignore_permissions هنا لا يعني تجاوز Security.
#     # الـBusiness permission تحققناه فوق، بينما
#     # write permission العام مستقل عن add_pending_return.
#     doc.save(
#         ignore_permissions=True
#     )

#     after_summary = (
#         financial_summary_snapshot(
#             doc
#         )
#     )

#     create_pending_operation_log(
#         operation_name=doc.name,
#         event_type="return_added",
#         event_title="تسجيل مبلغ مرتجع",
#         event_source="User",
#         effective_datetime=(
#             new_row.return_datetime
#         ),
#         details={
#             "ledger_row":
#                 new_row.name,

#             "returned_amount":
#                 new_row.returned_amount,

#             "return_datetime":
#                 new_row.return_datetime,

#             "before":
#                 before_summary,

#             "after":
#                 after_summary,
#         },
#     )

#     log_status_change(
#         operation_name=doc.name,
#         before_status=before_status,
#         after_status=doc.status,
#         financial_summary=(
#             after_summary
#         ),
#     )

#     return operation_financial_state(
#         doc
#     )

@frappe.whitelist(
    methods=["POST"]
)
def add_pending_return(
    name: str,
    payload: str | dict[str, Any],
) -> dict[str, Any]:
    name = cstr(
        name
    ).strip()

    if not name:
        frappe.throw(
            _(
                "اسم العملية المعلقة مطلوب."
            ),
            frappe.ValidationError,
        )

    data = _parse_dict_payload(
        payload,
        context=_(
            "بيانات الإرجاع"
        ),
    )

    _reject_unknown_keys(
        data,
        _ADD_RETURN_FIELDS,
        context=_(
            "بيانات الإرجاع"
        ),
    )

    if (
        "returned_amount"
        not in data
    ):
        frappe.throw(
            _(
                "المبلغ المرتجع مطلوب."
            ),
            frappe.ValidationError,
        )

    if not data.get(
        "return_date"
    ):
        frappe.throw(
            _(
                "تاريخ الإرجاع مطلوب."
            ),
            frappe.ValidationError,
        )

    doc = frappe.get_doc(
        PENDING_DOCTYPE,
        name,
        for_update=True,
    )

    _require_add_pending_return(
        doc
    )

    if cint(
        doc.is_failed
    ):
        frappe.throw(
            _(
                "لا يمكن إضافة إرجاع "
                "لعملية معلقة فاشلة."
            ),
            frappe.ValidationError,
        )

    validate_and_recalculate_ledger(
        doc
    )

    before_status = (
        doc.status
    )

    before_summary = (
        financial_summary_snapshot(
            doc
        )
    )

    returned_amount = (
        money_decimal(
            doc,
            data.get(
                "returned_amount"
            ),
            label=_(
                "المبلغ المرتجع"
            ),
        )
    )

    remaining_amount = (
        money_decimal(
            doc,
            doc.remaining_amount,
            label=_(
                "المبلغ المتبقي"
            ),
        )
    )

    if returned_amount <= 0:
        frappe.throw(
            _(
                "يجب أن يكون المبلغ المرتجع موجبًا."
            ),
            frappe.ValidationError,
        )

    if remaining_amount <= 0:
        frappe.throw(
            _(
                "العملية مرتجعة بالكامل "
                "ولا يوجد رصيد متبقٍ للإرجاع."
            ),
            frappe.ValidationError,
        )

    if (
        returned_amount
        > remaining_amount
    ):
        frappe.throw(
            _(
                "المبلغ المرتجع يتجاوز الرصيد المتبقي. "
                "الرصيد المتبقي الحالي هو {0}."
            ).format(
                doc.remaining_amount
            ),
            frappe.ValidationError,
        )

    return_note = cstr(
        data.get(
            "return_note"
        )
        or ""
    ).strip()

    if len(
        return_note
    ) > 2000:
        frappe.throw(
            _(
                "ملاحظة الإرجاع طويلة جدًا. "
                "الحد الأقصى 2000 حرف."
            ),
            frappe.ValidationError,
        )

    new_row = doc.append(
        "ledger_entries",
        {
            "suspended_amount":
                0,

            "returned_amount":
                returned_amount,

            "return_date":
                data.get(
                    "return_date"
                ),

            "return_note":
                return_note,
        },
    )

    authorize_financial_mutation(
        doc,
        FINANCIAL_MODE_APPEND_RETURN,
    )

    doc.save(
        ignore_permissions=True
    )

    after_summary = (
        financial_summary_snapshot(
            doc
        )
    )

    create_pending_operation_log(
        operation_name=
            doc.name,

        event_type=
            "return_added",

        event_title=
            "تسجيل مبلغ مرتجع",

        event_source=
            "User",

        
        remarks=
            (
                return_note
                or None
            ),

        details={
            "ledger_row":
                new_row.name,

            "returned_amount":
                new_row.returned_amount,

            "return_date":
                new_row.return_date,

            "return_note":
                (
                    new_row.return_note
                    or ""
                ),

            "before":
                before_summary,

            "after":
                after_summary,
        },
    )

    log_status_change(
        operation_name=
            doc.name,

        before_status=
            before_status,

        after_status=
            doc.status,

        financial_summary=
            after_summary,
    )

    return operation_financial_state(
        doc
    )


@frappe.whitelist(
    methods=["POST"]
)
def mark_pending_operation_failed(
    name: str,
    payload: str | dict[str, Any],
) -> dict[str, Any]:
    name = cstr(
        name
    ).strip()

    if not name:
        frappe.throw(
            _(
                "اسم العملية المعلقة مطلوب."
            ),
            frappe.ValidationError,
        )

    data = _parse_dict_payload(
        payload,
        context=_(
            "بيانات المعلقة الفاشلة"
        ),
    )

    _reject_unknown_keys(
        data,
        {
            "note",
        },
        context=_(
            "بيانات المعلقة الفاشلة"
        ),
    )

    note = cstr(
        data.get(
            "note"
        )
    ).strip()

    if not note:
        frappe.throw(
            _(
                "ملاحظة تحويل العملية "
                "إلى معلقة فاشلة مطلوبة."
            ),
            frappe.ValidationError,
        )

    if len(
        note
    ) > 2000:
        frappe.throw(
            _(
                "ملاحظة المعلقة الفاشلة طويلة جدًا. "
                "الحد الأقصى 2000 حرف."
            ),
            frappe.ValidationError,
        )

    doc = frappe.get_doc(
        PENDING_DOCTYPE,
        name,
        for_update=True,
    )

    _require_edit_pending_operation(
        doc
    )

    if cint(
        doc.is_failed
    ):
        frappe.throw(
            _(
                "العملية مصنفة كمعلقة فاشلة بالفعل."
            ),
            frappe.ValidationError,
        )

    validate_and_recalculate_ledger(
        doc
    )

    before_status = (
        doc.status
    )

    changed_at = (
        now_datetime()
    )

    authorize_pending_failure_transition(
        doc
    )

    doc.is_failed = 1

    doc.failed_at = (
        changed_at
    )

    doc.failed_by = (
        frappe.session.user
    )

    doc.failed_note = (
        note
    )

    doc.save(
        ignore_permissions=True
    )

    after_summary = (
        financial_summary_snapshot(
            doc
        )
    )

    create_pending_operation_log(
        operation_name=
            doc.name,

        event_type=
            "marked_failed",

        event_title=
            "تغيير الحالة إلى معلقة فاشلة",

        event_source=
            "User",

        effective_datetime=
            changed_at,

        remarks=
            note,

        details={
            "failed_at":
                doc.failed_at,

            "failed_by":
                doc.failed_by,

            "failed_note":
                doc.failed_note,

            "before_status":
                before_status,

            "after_status":
                doc.status,

            "financial_summary":
                after_summary,
        },
    )

    log_status_change(
        operation_name=
            doc.name,

        before_status=
            before_status,

        after_status=
            doc.status,

        financial_summary=
            after_summary,
    )

    return (
        _build_pending_operation_details(
            doc
        )
    )
@frappe.whitelist(
    methods=["POST"]
)
def correct_pending_ledger(
    name: str,
    payload: str | dict[str, Any],
) -> dict[str, Any]:
    data = _parse_dict_payload(
        payload,
        context=_(
            "بيانات تعديل الحركة المالية"
        ),
    )

    _reject_unknown_keys(
        data,
        {
            "reason",
            "expected_modified",
            "ledger_entries",
        },
        context=_(
            "بيانات تعديل الحركة المالية"
        ),
    )

    if (
        "ledger_entries"
        not in data
    ):
        frappe.throw(
            _(
                "جدول الحركة المالية مطلوب."
            ),
            frappe.ValidationError,
        )

    return update_pending_operation(
        name,
        {
            "ledger_entries":
                data.get(
                    "ledger_entries"
                ),
        },
        expected_modified=
            data.get(
                "expected_modified"
            ),
    )

def _rebuild_ledger_for_edit(
    doc,
    rows,
) -> None:
    existing_rows = {
        row.name:
            row

        for row
        in (
            doc.ledger_entries
            or []
        )
    }

    seen_names = set()

    rebuilt_rows = []

    for (
        position,
        raw_row,
    ) in enumerate(
        rows,
        start=1,
    ):
        row_data = (
            _parse_dict_payload(
                raw_row,
                context=_(
                    "الحركة رقم {0} في التعديل"
                ).format(
                    position
                ),
            )
        )

        _reject_unknown_keys(
            row_data,
            _CORRECTION_LEDGER_INPUT_FIELDS,
            context=_(
                "الحركة رقم {0} في التعديل"
            ).format(
                position
            ),
        )

        if (
            "suspended_amount"
            not in row_data
        ):
            frappe.throw(
                _(
                    "المبلغ المعلق مطلوب "
                    "في الحركة رقم {0}."
                ).format(
                    position
                ),
                frappe.ValidationError,
            )

        if (
            "returned_amount"
            not in row_data
        ):
            frappe.throw(
                _(
                    "المبلغ المرتجع مطلوب "
                    "في الحركة رقم {0}."
                ).format(
                    position
                ),
                frappe.ValidationError,
            )

        row_name = cstr(
            row_data.get(
                "name"
            )
        ).strip()

        if row_name:
            if (
                row_name
                in seen_names
            ):
                frappe.throw(
                    _(
                        "الحركة {0} مكررة "
                        "داخل طلب التعديل."
                    ).format(
                        row_name
                    ),
                    frappe.ValidationError,
                )

            source_row = (
                existing_rows.get(
                    row_name
                )
            )

            if not source_row:
                frappe.throw(
                    _(
                        "الحركة {0} لا تنتمي "
                        "إلى هذه العملية المعلقة."
                    ).format(
                        row_name
                    ),
                    frappe.ValidationError,
                )

            seen_names.add(
                row_name
            )

            rebuilt_rows.append(
                {
                    "name":
                        row_name,

                    "suspended_amount":
                        row_data.get(
                            "suspended_amount"
                        ),

                    "returned_amount":
                        row_data.get(
                            "returned_amount"
                        ),

                    "return_date":
                        (
                            row_data.get(
                                "return_date"
                            )
                            if (
                                "return_date"
                                in row_data
                            )
                            else (
                                source_row
                                    .return_date
                            )
                        ),

                    "return_note":
                        (
                            row_data.get(
                                "return_note"
                            )
                            if (
                                "return_note"
                                in row_data
                            )
                            else (
                                source_row
                                    .return_note
                            )
                        ),

                    "entered_by":
                        source_row
                            .entered_by,

                    "entered_at":
                        source_row
                            .entered_at,

                    "currency":
                        PENDING_CURRENCY,
                }
            )

        else:
            rebuilt_rows.append(
                {
                    "suspended_amount":
                        row_data.get(
                            "suspended_amount"
                        ),

                    "returned_amount":
                        row_data.get(
                            "returned_amount"
                        ),

                    "return_date":
                        row_data.get(
                            "return_date"
                        ),

                    "return_note":
                        row_data.get(
                            "return_note"
                        ),

                    "currency":
                        PENDING_CURRENCY,
                }
            )

    doc.set(
        "ledger_entries",
        [],
    )

    for row_data in (
        rebuilt_rows
    ):
        doc.append(
            "ledger_entries",
            row_data,
        )


def _sanitize_create_ledger_entries(
    raw_rows: Any,
) -> list[dict[str, Any]]:
    rows = _parse_ledger_list(
        raw_rows,
        context=_(
            "حركات إنشاء العملية"
        ),
    )

    sanitized = []

    for (
        position,
        raw_row,
    ) in enumerate(
        rows,
        start=1,
    ):
        row = _parse_dict_payload(
            raw_row,
            context=_(
                "الحركة رقم {0} "
                "عند إنشاء العملية"
            ).format(
                position
            ),
        )

        _reject_unknown_keys(
            row,
            _LEDGER_INPUT_FIELDS,
            context=_(
                "الحركة رقم {0} "
                "عند إنشاء العملية"
            ).format(
                position
            ),
        )

        sanitized.append(
            {
                "suspended_amount":
                    row.get(
                        "suspended_amount",
                        0,
                    ),

                "returned_amount":
                    row.get(
                        "returned_amount",
                        0,
                    ),

                "return_date":
                    row.get(
                        "return_date"
                    ),

                "return_note":
                    cstr(
                        row.get(
                            "return_note"
                        )
                        or ""
                    ).strip(),
            }
        )

    return sanitized


def _parse_ledger_list(
    value: Any,
    *,
    context: str,
) -> list[Any]:
    if isinstance(
        value,
        str,
    ):
        value = frappe.parse_json(
            value
        )

    if not isinstance(
        value,
        list,
    ):
        frappe.throw(
            _(
                "{0} يجب أن تكون قائمة."
            ).format(
                context
            ),
            frappe.ValidationError,
        )

    return value


def _parse_dict_payload(
    payload: Any,
    *,
    context: str,
) -> dict[str, Any]:
    if isinstance(
        payload,
        str,
    ):
        payload = frappe.parse_json(
            payload
        )

    if not isinstance(
        payload,
        dict,
    ):
        frappe.throw(
            _(
                "{0} يجب أن تكون "
                "كائن بيانات صالحًا."
            ).format(
                context
            ),
            frappe.ValidationError,
        )

    return dict(
        payload
    )


def _reject_unknown_keys(
    data: dict[str, Any],
    allowed_keys: set[str],
    *,
    context: str,
) -> None:
    unknown = sorted(
        set(data)
        - allowed_keys
    )

    if not unknown:
        return

    frappe.throw(
        _(
            "{0} تحتوي على حقول "
            "غير مسموح بها: {1}"
        ).format(
            context,
            ", ".join(
                unknown
            ),
        ),
        frappe.ValidationError,
    )


def _build_pending_operation_details(
    doc,
) -> dict[str, Any]:
    user = frappe.session.user

    permissions = (
        get_pending_record_permissions(
            doc,
            user=user,
        )
    )

    remaining = float(
        doc.remaining_amount
        or 0
    )

    is_failed = bool(
            cint(
                doc.is_failed
            )
        )


    permissions = dict(
        permissions
    )
    permissions[
        "can_manage_attachments"
    ] = bool(
        permissions.get(
            "can_edit"
        )
    )
    # Capability فعلي لهذه اللحظة،
    # وليس Permission Type فقط.
    permissions[
            "can_add_return"
        ] = bool(
            permissions.get(
                "can_add_return"
            )
            and
            remaining > 0
            and
            not is_failed
        )

    permissions[
        "can_mark_failed"
    ] = bool(
        permissions.get(
            "can_edit"
        )
        and
        not is_failed
    )

    permissions[
        "can_enter_edit_mode"
    ] = bool(
        permissions.get(
            "can_edit"
        )
        or
        permissions.get(
            "can_correct_ledger"
        )
    )

    operation = {
        "name":
            doc.name,

        "serial_no":
            doc.serial_no,

        "card_name":
            doc.card_name,

        "card_number":
            doc.card_number,

        "operation_datetime":
            doc.operation_datetime,

        "card_owner":
            doc.card_owner,
        "account_number":
            doc.account_number,

        "suspended_note":
            doc.suspended_note
            or "",

        "is_failed":
            cint(
                doc.is_failed
            ),

        "failed_at":
            doc.failed_at,

        "failed_by":
            doc.failed_by,

        "failed_by_full_name":
            _get_pending_link_label(
                "User",
                doc.failed_by,
                "full_name",
            ),

        "failed_note":
            doc.failed_note
            or "",

        "card_owner_name":
            _get_pending_link_label(
                "Archive Card Owner",
                doc.card_owner,
                "card_owner_name",
            ),

        "currency":
            doc.currency,

        "bank":
            doc.bank,

        "bank_name":
            _get_pending_link_label(
                "Archive Bank",
                doc.bank,
                "bank_name",
            ),

        "region":
            doc.region,

        "region_name":
            _get_pending_link_label(
                "Archive Region",
                doc.region,
                "region_name",
            ),

        "machine_location":
            doc.machine_location,

        "machine_no":
            doc.machine_no,

        "branch_no":
            doc.branch_no,

        "representative":
            doc.representative,

        "representative_name":
            _get_pending_link_label(
                "Archive Representative",
                doc.representative,
                "representative_name",
            ),

        "total_suspended":
            doc.total_suspended,

        "total_returned":
            doc.total_returned,

        "remaining_amount":
            doc.remaining_amount,

        "status":
            doc.status,

        "notes":
            doc.notes,

        "owner":
            doc.owner,

        "owner_full_name":
            _get_pending_link_label(
                "User",
                doc.owner,
                "full_name",
            ),

        "creation":
            doc.creation,

        "modified":
            doc.modified,
    }

    ledger_entries = [
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

            "return_date":
                row.return_date,

            "return_note":
                row.return_note
                or "",

            "currency":
                row.currency,

            "entered_by":
                row.entered_by,

            "entered_at":
                row.entered_at,
        }

        for row
        in doc.ledger_entries or []
    ]

    attachments = (
        serialize_pending_attachments(
            doc
        )
    )

    return {
        "operation":
            operation,

        "ledger_entries":
            ledger_entries,

        "attachments":
            attachments,

        "capabilities":
            permissions,
    }


def _get_pending_link_label(
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
        or name
    ).strip()