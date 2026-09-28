from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import getseries
from frappe.utils import (
    cint,
    cstr,
    now_datetime,
)

from archive.services.pending_ledger import (
    PENDING_CURRENCY,
    enforce_pending_currency,
    financial_summary_snapshot,
    validate_and_recalculate_ledger,
    validate_financial_mutation,
)

from archive.services.pending_operation_audit import (
    create_pending_operation_log,
)

from archive.services.pending_operation_permissions import (
    _require_create_pending_operation,
)
from archive.api.pending_operation_search import (
    set_pending_search_text,
)

from archive.services.pending_operation_attachments import (
    adopt_pending_attachment_files,
    validate_pending_attachment_reference,
)

PENDING_OPERATION_SERIAL_SERIES_KEY = (
    "ARCHIVE-PENDING-OPERATION-SERIAL"
)

PENDING_OPERATION_SERIAL_DIGITS = 10

_METADATA_AUDIT_FIELDS = (
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
)

_FAILURE_MUTATION_TOKEN = (
    object()
)

_CLOSURE_STATE_FIELDS = (
    "is_closed",
    "closed_date",
    "closed_at",
    "closed_by",
)


def authorize_pending_closure_transition(
    doc,
) -> None:
    """
    يسمح لمسارات الإنهاء الرسمية فقط بتغيير
    حقول Lifecycle الخاصة بالإنهاء.

    Private runtime flag:
    لا يحفظ في قاعدة البيانات.
    """

    doc._pending_closure_transition_authorized = (
        True
    )


def is_pending_closure_transition_authorized(
    doc,
) -> bool:
    return bool(
        getattr(
            doc,
            "_pending_closure_transition_authorized",
            False,
        )
    )
def authorize_pending_failure_transition(
    doc,
) -> None:
    doc.flags._pending_failure_mutation_token = (
        _FAILURE_MUTATION_TOKEN
    )


def get_next_pending_operation_serial() -> int:
    return int(
        getseries(
            PENDING_OPERATION_SERIAL_SERIES_KEY,
            PENDING_OPERATION_SERIAL_DIGITS,
        )
    )


class ArchivePendingOperation(Document):
    """
    Parent للعملية المعلقة.

    الـLedger هو مصدر الحقيقة المالي.
    Parent totals والحالة مشتقة بالكامل منه.
    """
    def on_update(
        self,
    ) -> None:
        adopt_pending_attachment_files(
            self
        )

        self._log_metadata_changes()

        self._log_attachment_changes()


    def _log_attachment_changes(
        self,
    ) -> None:
        previous = (
            self.get_doc_before_save()
        )

        if not previous:
            return

        before = {
            cstr(
                row.file_id
            ).strip():
                row

            for row in (
                previous.attachments
                or []
            )

            if cstr(
                row.file_id
            ).strip()
        }

        after = {
            cstr(
                row.file_id
            ).strip():
                row

            for row in (
                self.attachments
                or []
            )

            if cstr(
                row.file_id
            ).strip()
        }

        added_ids = (
            set(after)
            -
            set(before)
        )

        deleted_ids = (
            set(before)
            -
            set(after)
        )

        for file_id in sorted(
            added_ids
        ):
            row = after[
                file_id
            ]

            create_pending_operation_log(
                operation_name=
                    self.name,

                event_type=
                    "attachment_added",

                event_title=
                    "إضافة مرفق",

                event_source=
                    "User",

                remarks=
                    (
                        "تمت إضافة المرفق: "
                        f"{row.file_name}"
                    ),

                details={
                    "file_id":
                        file_id,

                    "file_name":
                        row.file_name,

                    "file_url":
                        row.file,
                },
            )

        for file_id in sorted(
            deleted_ids
        ):
            row = before[
                file_id
            ]

            create_pending_operation_log(
                operation_name=
                    self.name,

                event_type=
                    "attachment_deleted",

                event_title=
                    "حذف مرفق",

                event_source=
                    "User",

                remarks=
                    (
                        "تم حذف المرفق: "
                        f"{row.file_name}"
                    ),

                details={
                    "file_id":
                        file_id,

                    "file_name":
                        row.file_name,

                    "file_url":
                        row.file,
                },
            )
    def _log_metadata_changes(
        self,
    ) -> None:
        previous = (
            self.get_doc_before_save()
        )
        if (
            is_pending_closure_transition_authorized(
                self
            )
        ):
            return

        # Insert جديد ليس Manual Edit.
        if not previous:
            return

        changes = {}

        for fieldname in (
            _METADATA_AUDIT_FIELDS
        ):
            before_value = cstr(
                getattr(
                    previous,
                    fieldname,
                    None,
                )
                or ""
            )

            after_value = cstr(
                getattr(
                    self,
                    fieldname,
                    None,
                )
                or ""
            )

            if (
                before_value
                == after_value
            ):
                continue

            changes[
                fieldname
            ] = {
                "before":
                    before_value,

                "after":
                    after_value,
            }

        if not changes:
            return

        create_pending_operation_log(
            operation_name=self.name,
            event_type="manual_edit",
            event_title="تعديل بيانات العملية",
            event_source="User",
            details={
                "changes":
                    changes,
            },
        )
    def before_insert(
        self,
    ) -> None:
        _require_create_pending_operation()

        enforce_pending_currency(
            self
        )

        self.is_failed = 0
        self.failed_at = None
        self.failed_by = None
        self.failed_note = None

        if not cint(
            self.serial_no
        ):
            self.serial_no = (
                get_next_pending_operation_serial()
            )
        self.is_closed = 0
        self.closed_date = None
        self.closed_at = None
        self.closed_by = None

    def before_validate(
        self,
    ) -> None:
        enforce_pending_currency(
            self
        )

        self._prepare_ledger_rows()

        self._canonicalize_attachments()

        validate_and_recalculate_ledger(
            self
        )

        set_pending_search_text(
            self
        )

    def validate(
        self,
    ) -> None:
        if (
            cstr(
                self.currency
            )
            != PENDING_CURRENCY
        ):
            frappe.throw(
                _(
                    "عملة المعلقات ثابتة على الريال السعودي."
                ),
                frappe.ValidationError,
            )

        self._validate_failure_mutation()

        validate_financial_mutation(
            self
        )
        self._validate_closure_mutation()

        self._validate_closed_immutability()

    def _validate_closure_mutation(
        self,
    ) -> None:
        """
        يمنع تعديل is_closed / closed_at / closed_by
        من Save عادي أو REST أو Generic Form.

        التغيير مسموح فقط عبر:
        close_pending_operation
        reopen_pending_operation
        """

        previous = (
            self.get_doc_before_save()
        )

        if not previous:
            return

        changed = any(
            cstr(
                getattr(
                    previous,
                    fieldname,
                    None,
                )
                or ""
            )
            !=
            cstr(
                getattr(
                    self,
                    fieldname,
                    None,
                )
                or ""
            )

            for fieldname
            in _CLOSURE_STATE_FIELDS
        )

        if (
            changed
            and
            not is_pending_closure_transition_authorized(
                self
            )
        ):
            frappe.throw(
                _(
                    "لا يمكن تغيير حالة إنهاء العملية "
                    "مباشرة. استخدم إجراء إنهاء العملية "
                    "أو إلغاء الإنهاء."
                ),
                frappe.PermissionError,
            )


    def _validate_closed_immutability(
        self,
    ) -> None:
        """
        العملية المنتهية Frozen تشغيليًا.

        أي تعديل عليها يتطلب أولًا إلغاء الإنهاء.
        الاستثناء الوحيد هو Transition الرسمي الخاص
        بإلغاء الإنهاء نفسه.
        """

        previous = (
            self.get_doc_before_save()
        )

        if not previous:
            return

        if (
            cint(
                previous.is_closed
            )
            and
            not is_pending_closure_transition_authorized(
                self
            )
        ):
            frappe.throw(
                _(
                    "هذه العملية منتهية. "
                    "ألغِ الإنهاء أولًا قبل تعديلها."
                ),
                frappe.ValidationError,
            )  
    def _validate_failure_mutation(
        self,
    ) -> None:
        if self.is_new():
            return

        previous = (
            self.get_doc_before_save()
        )

        if not previous:
            previous = (
                self.get_latest()
            )

        failure_fields = (
            "is_failed",
            "failed_at",
            "failed_by",
            "failed_note",
        )

        changed = any(
            cstr(
                getattr(
                    previous,
                    fieldname,
                    None,
                )
                or ""
            )
            !=
            cstr(
                getattr(
                    self,
                    fieldname,
                    None,
                )
                or ""
            )

            for fieldname
            in failure_fields
        )

        if not changed:
            return

        if (
            self.flags.get(
                "_pending_failure_mutation_token"
            )
            is _FAILURE_MUTATION_TOKEN
        ):
            return

        frappe.throw(
            _(
                "لا يمكن تغيير حالة المعلقة الفاشلة مباشرة. "
                "استخدم الإجراء المخصص لهذه الحالة."
            ),
            frappe.PermissionError,
        )

    def after_insert(self) -> None:
        adopt_pending_attachment_files(
            self
        )
        create_pending_operation_log(
            operation_name=self.name,
            event_type="created",
            event_title="إنشاء العملية المعلقة",
            event_source="User",
            details={
                "financial_summary":
                    financial_summary_snapshot(
                        self
                    ),
            },
        )

    def _prepare_ledger_rows(self) -> None:
        """
        currency + entered_by + entered_at
        كلها Server-owned.

        Existing rows تحتفظ بمن سجلها أصلًا.
        New rows فقط تحصل على metadata جديدة.
        """

        parent_is_new = (
            self.is_new()
        )

        for row in (
            self.ledger_entries
            or []
        ):
            row.currency = (
                PENDING_CURRENCY
            )

            if (
                parent_is_new
                or row.is_new()
            ):
                row.entered_by = (
                    frappe.session.user
                )

                row.entered_at = (
                    now_datetime()
                )

    def _canonicalize_attachments(
        self,
    ) -> None:
        seen_file_ids: set[str] = set()

        for row in (
            self.attachments
            or []
        ):
            file_id = cstr(
                row.file_id
            ).strip()

            if not file_id:
                frappe.throw(
                    _("يوجد مرفق بدون معرف File.")
                )

            if file_id in seen_file_ids:
                frappe.throw(
                    _(
                        "يوجد مرفق مكرر في العملية."
                    )
                )

            seen_file_ids.add(
                file_id
            )

            file_data = (
                validate_pending_attachment_reference(
                    self,
                    file_id,
                )
            )

            supplied_url = cstr(
                row.file
            ).strip()

            actual_url = cstr(
                file_data.file_url
            ).strip()

            if (
                supplied_url
                and
                supplied_url
                != actual_url
            ):
                frappe.throw(
                    _(
                        "بيانات المرفق غير متطابقة "
                        "مع سجل File: {0}"
                    ).format(
                        file_id
                    )
                )

            row.file = (
                actual_url
            )

            row.file_name = (
                file_data.file_name
            )