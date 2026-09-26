from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import (
    cstr,
    now_datetime,
)
from archive.services.pending_operation_attachments import (
    serialize_pending_attachments,
)
from archive.api.pending_operation_search import (
    get_pending_context_rows,
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
        "context_version": 1,

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
    "ledger_entries",
    "notes",
    "attachments",
}


_LEDGER_INPUT_FIELDS = {
    "suspended_amount",
    "returned_amount",
    "return_datetime",
}


_CORRECTION_LEDGER_INPUT_FIELDS = {
    "name",
    "suspended_amount",
    "returned_amount",
    "return_datetime",
}


_ADD_RETURN_FIELDS = {
    "returned_amount",
    "return_datetime",
}


_CORRECTION_FIELDS = {
    "reason",
    "expected_modified",
    "ledger_entries",
}

_UPDATE_ALLOWED_FIELDS = {
    "card_name",
    "card_number",
    "operation_datetime",
    "card_owner",
    "bank",
    "region",
    "machine_location",
    "machine_no",
    "branch_no",
    "representative",
    "notes",
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
            _("اسم العملية المعلقة مطلوب."),
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

    # Lock حتى لا يتزامن Metadata edit
    # مع Return/Correction بشكل غير منضبط.
    doc = frappe.get_doc(
        PENDING_DOCTYPE,
        name,
        for_update=True,
    )

    _require_edit_pending_operation(
        doc
    )

    if (
        cstr(doc.modified)
        != cstr(expected_modified)
    ):
        frappe.throw(
            _(
                "تم تعديل العملية من جلسة أخرى بعد فتحها. "
                "أعد تحميل العملية قبل حفظ تغييراتك."
            ),
            frappe.ValidationError,
        )

    for (
        fieldname,
        value,
    ) in data.items():

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

    # نتجاوز Generic write لأن Business Permission
    # تم فحصها أعلاه عبر edit_own/edit_all.
    #
    # Ledger نفسه لم يتغير، وبالتالي Controller
    # سيمنع أي محاولة لتهريبه ضمن هذا المسار.
    doc.save(
        ignore_permissions=True
    )

    return _build_pending_operation_details(
        doc
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

        **{
            key: value
            for (
                key,
                value,
            ) in data.items()
            if (
                key
                != "ledger_entries"
            )
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

    # هذه أهم نقطة في Concurrency.
    #
    # Parent + Child Ledger يُحمّلان FOR UPDATE
    # داخل Transaction الحالية.
    doc = frappe.get_doc(
        PENDING_DOCTYPE,
        name,
        for_update=True,
    )

    _require_add_pending_return(
        doc
    )

    # لا نثق حتى Parent totals الموجودة في DB.
    # نعيد الحساب من Ledger الحقيقي بعد القفل.
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

    return_datetime = (
        data.get(
            "return_datetime"
        )
        or now_datetime()
    )

    new_row = doc.append(
        "ledger_entries",
        {
            "suspended_amount":
                0,

            "returned_amount":
                returned_amount,

            "return_datetime":
                return_datetime,
        },
    )

    authorize_financial_mutation(
        doc,
        FINANCIAL_MODE_APPEND_RETURN,
    )

    # ignore_permissions هنا لا يعني تجاوز Security.
    # الـBusiness permission تحققناه فوق، بينما
    # write permission العام مستقل عن add_pending_return.
    doc.save(
        ignore_permissions=True
    )

    after_summary = (
        financial_summary_snapshot(
            doc
        )
    )

    create_pending_operation_log(
        operation_name=doc.name,
        event_type="return_added",
        event_title="تسجيل مبلغ مرتجع",
        event_source="User",
        effective_datetime=(
            new_row.return_datetime
        ),
        details={
            "ledger_row":
                new_row.name,

            "returned_amount":
                new_row.returned_amount,

            "return_datetime":
                new_row.return_datetime,

            "before":
                before_summary,

            "after":
                after_summary,
        },
    )

    log_status_change(
        operation_name=doc.name,
        before_status=before_status,
        after_status=doc.status,
        financial_summary=(
            after_summary
        ),
    )

    return operation_financial_state(
        doc
    )


@frappe.whitelist(
    methods=["POST"]
)
def correct_pending_ledger(
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
            "بيانات تصحيح الحركة المالية"
        ),
    )

    _reject_unknown_keys(
        data,
        _CORRECTION_FIELDS,
        context=_(
            "بيانات تصحيح الحركة المالية"
        ),
    )

    reason = cstr(
        data.get(
            "reason"
        )
    ).strip()

    if not reason:
        frappe.throw(
            _(
                "سبب التصحيح المالي مطلوب."
            ),
            frappe.ValidationError,
        )

    if len(reason) > 2000:
        frappe.throw(
            _(
                "سبب التصحيح المالي طويل جدًا. "
                "الحد الأقصى 2000 حرف."
            ),
            frappe.ValidationError,
        )

    correction_rows = (
        _parse_ledger_list(
            data.get(
                "ledger_entries"
            ),
            context=_(
                "حركات التصحيح المالي"
            ),
        )
    )

    if not correction_rows:
        frappe.throw(
            _(
                "يجب أن يحتوي التصحيح على "
                "حركة مالية واحدة على الأقل."
            ),
            frappe.ValidationError,
        )

    # نفس Lock المستخدم في add return.
    # أي Return متزامن سينتظر انتهاء Correction والعكس.
    doc = frappe.get_doc(
        PENDING_DOCTYPE,
        name,
        for_update=True,
    )

    _require_correct_pending_ledger(
        doc
    )
    expected_modified = cstr(
        data.get(
            "expected_modified"
        )
    ).strip()

    if (
        expected_modified
        and
        cstr(
            doc.modified
        )
        != expected_modified
    ):
        frappe.throw(
            _(
                "تم تعديل العملية بعد فتح شاشة التصحيح. "
                "أغلق شاشة التصحيح وافتحها من جديد "
                "للحصول على أحدث الحركات المالية."
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

    before_ledger = (
        financial_snapshot(
            doc
        )
    )

    existing_rows = {
        row.name: row
        for row
        in doc.ledger_entries or []
    }

    seen_names: set[str] = set()

    rebuilt_rows = []

    for (
        position,
        raw_row,
    ) in enumerate(
        correction_rows,
        start=1,
    ):
        row_data = (
            _parse_dict_payload(
                raw_row,
                context=_(
                    "الحركة رقم {0} "
                    "في التصحيح"
                ).format(
                    position
                ),
            )
        )

        _reject_unknown_keys(
            row_data,
            _CORRECTION_LEDGER_INPUT_FIELDS,
            context=_(
                "الحركة رقم {0} "
                "في التصحيح"
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
                    "في الحركة رقم {0} "
                    "ضمن التصحيح."
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
                    "في الحركة رقم {0} "
                    "ضمن التصحيح."
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
                        "داخل طلب التصحيح."
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

                    "return_datetime":
                        (
                            row_data.get(
                                "return_datetime"
                            )
                            if (
                                "return_datetime"
                                in row_data
                            )
                            else (
                                source_row
                                .return_datetime
                            )
                        ),

                    # من سجل الحركة أصلًا لا يتغير.
                    # من قام بالتصحيح سيظهر في Audit Log.
                    "entered_by":
                        source_row.entered_by,

                    "entered_at":
                        source_row.entered_at,

                    "currency":
                        doc.currency,
                }
            )

        else:
            # صف مالي جديد أثناء Correction.
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

                    "return_datetime":
                        row_data.get(
                            "return_datetime"
                        ),

                    "currency":
                        doc.currency,
                }
            )

    doc.set(
        "ledger_entries",
        [],
    )

    for row_data in rebuilt_rows:
        doc.append(
            "ledger_entries",
            row_data,
        )

    # Validation قبل أي DB write.
    doc._prepare_ledger_rows()

    validate_and_recalculate_ledger(
        doc
    )

    candidate_ledger = (
        financial_snapshot(
            doc
        )
    )

    if (
        candidate_ledger
        == before_ledger
    ):
        frappe.throw(
            _(
                "لا توجد تغييرات مالية فعلية لتصحيحها."
            ),
            frappe.ValidationError,
        )

    authorize_financial_mutation(
        doc,
        FINANCIAL_MODE_CORRECTION,
    )

    doc.save(
        ignore_permissions=True
    )

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

    ledger_diff = (
        build_ledger_diff(
            before_ledger,
            after_ledger,
        )
    )

    create_pending_operation_log(
        operation_name=doc.name,
        event_type="ledger_corrected",
        event_title="تصحيح الحركة المالية",
        event_source="User",
        remarks=reason,
        details={
            "reason":
                reason,

            "before":
                before_summary,

            "after":
                after_summary,

            "ledger_diff":
                ledger_diff,
        },
    )

    log_status_change(
        operation_name=doc.name,
        before_status=before_status,
        after_status=doc.status,
        financial_summary=(
            after_summary
        ),
    )

    return operation_financial_state(
        doc
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

                "return_datetime":
                    row.get(
                        "return_datetime"
                    ),
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
    permissions["can_add_return"] = bool(
        permissions.get(
            "can_add_return"
        )
        and remaining > 0
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

            "return_datetime":
                row.return_datetime,

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