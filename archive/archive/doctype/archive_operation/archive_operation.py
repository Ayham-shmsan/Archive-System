import os
import hashlib
import re
import frappe
from frappe import _
from frappe.model.document import Document
from archive.api.operation_search import (
    build_operation_search_text,
)
from frappe.utils import cint, cstr

_OPERATION_NUMBER_DIGITS = str.maketrans(
    "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹",
    "01234567890123456789",
)


def normalize_operation_no(
    value,
):
    """
    توحيد رقم العملية قبل المقارنة.

    ١٢٣٤٥  == 12345
    abc123 == ABC123
    المسافات لا تؤثر.
    """

    value = cstr(
        value
    ).strip()

    if not value:
        return ""

    value = value.translate(
        _OPERATION_NUMBER_DIGITS
    )

    value = re.sub(
        r"\s+",
        "",
        value,
    )

    return value.upper()


def make_operation_no_hash(
    normalized_value,
):
    return hashlib.sha256(
        normalized_value.encode(
            "utf-8"
        )
    ).hexdigest()
class ArchiveOperation(Document):
    # begin: auto-generated types
    # This code is auto-generated. Do not modify anything in this block.

    from typing import TYPE_CHECKING

    if TYPE_CHECKING:
        from archive.archive.doctype.archive_operation_attachment.archive_operation_attachment import ArchiveOperationAttachment
        from archive.archive.doctype.archive_operation_status_log.archive_operation_status_log import ArchiveOperationStatusLog
        from frappe.types import DF

        amount: DF.Currency
        attachments: DF.Table[ArchiveOperationAttachment]
        bank_transfer_rate: DF.Float
        beneficiary_account: DF.Data | None
        beneficiary_bank: DF.Data | None
        beneficiary_name: DF.Data | None
        confirmation_datetime: DF.Datetime | None
        country: DF.Link | None
        currency: DF.Link | None
        customer: DF.Link | None
        customer_rate: DF.Float
        execution_datetime: DF.Datetime | None
        extraction_source_file: DF.Attach | None
        final_swift_file: DF.Attach | None
        final_swift_uploaded_at: DF.Datetime | None
        final_swift_uploaded_by: DF.Link | None
        from_account: DF.Link | None
        notes: DF.Data | None
        operation_no: DF.Data | None
        reference_no: DF.Data | None
        request_date: DF.Date | None
        sender_account: DF.Data | None
        sender_name: DF.Data | None
        serial_no: DF.Int
        status: DF.Literal["\u063a\u064a\u0631 \u0645\u0624\u0643\u062f\u0629", "\u0645\u0624\u0643\u062f\u0629", "\u0645\u0631\u062a\u062c\u0639\u0629", "\u0645\u062d\u0636\u0648\u0631\u0629"]
        status_changed_at: DF.Datetime | None
        status_changed_by: DF.Link | None
        status_effective_datetime: DF.Date | None
        status_history: DF.Table[ArchiveOperationStatusLog]
        swift_code: DF.Data | None
        transferring_bank: DF.Link | None
    # end: auto-generated types

    VALID_STATUSES = (
        "معلقة",
        "غير مؤكدة",
        "مؤكدة",
        "مرتجعة",
        "محضورة",
    )
    ACTION_STATUSES = (
        "غير مؤكدة",
        "مؤكدة",
        "مرتجعة",
        "محضورة",
    )

    def before_insert(self):
        if not getattr(
            frappe.flags,
            "in_import",
            False,
        ):
            if cint(
                self.is_blocked_operation
            ):
                self.status = (
                    "محضورة"
                )

            else:
                self.status = (
                    "معلقة"
                )

        self.set_search_text()

    def set_search_text(
        self,
    ):
        self.search_text = (
            build_operation_search_text(
                self
            )
        )

    def before_save(
        self,
    ):
        self.set_search_text()

    def after_insert(self):
        """
        الرقم الداخلي للمستند مثل:
        OP-00001

        يصبح:
        serial_no = 1
        """
        if self.serial_no:
            return

        try:
            serial_no = int(self.name.rsplit("-", 1)[-1])
        except (ValueError, IndexError):
            return

        self.db_set(
            "serial_no",
            serial_no,
            update_modified=False,
        )

        self.serial_no = serial_no


    def validate_operation_number_rules(
        self,
    ):
        blocked = bool(
            cint(
                self.is_blocked_operation
            )
        )

        allow_duplicate = bool(
            cint(
                self.allow_duplicate_operation_no
            )
        )


        # ========================================================
        # Blocked operation
        # ========================================================

        if blocked:

            self.operation_no = None

            self.operation_no_normalized = (
                None
            )

            self.operation_no_uniqueness_key = (
                None
            )

            self.allow_duplicate_operation_no = (
                0
            )

            return


        # ========================================================
        # Normal operation requires operation number
        # ========================================================

        operation_no = cstr(
            self.operation_no
        ).strip()


        if not operation_no:
            frappe.throw(
                _(
                    "رقم العملية مطلوب، "
                    "إلا إذا كانت العملية محضورة."
                )
            )


        normalized = (
            normalize_operation_no(
                operation_no
            )
        )


        if not normalized:
            frappe.throw(
                _("رقم العملية غير صالح.")
            )


        self.operation_no = (
            operation_no
        )

        self.operation_no_normalized = (
            normalized
        )


        # ========================================================
        # Check existing operation number
        # ========================================================

        filters = [
            [
                "Archive Operation",
                "operation_no_normalized",
                "=",
                normalized,
            ]
        ]


        if self.name:
            filters.append(
                [
                    "Archive Operation",
                    "name",
                    "!=",
                    self.name,
                ]
            )


        existing = frappe.get_all(
            "Archive Operation",
            filters=filters,
            fields=[
                "name",
                "operation_no",
            ],
            limit=1,
        )


        # ========================================================
        # Duplicate not explicitly allowed
        # ========================================================

        if (
            existing
            and
            not allow_duplicate
        ):
            frappe.throw(
                _(
                    "رقم العملية {0} مستخدم بالفعل "
                    "في العملية {1}. "
                    "إذا كان التكرار مقصودًا فعّل "
                    "\"السماح بتكرار رقم العملية\"."
                ).format(
                    frappe.bold(
                        operation_no
                    ),
                    frappe.bold(
                        existing[0].name
                    ),
                )
            )


        # ========================================================
        # DB-level uniqueness protection
        # ========================================================

        digest = (
            make_operation_no_hash(
                normalized
            )
        )


        if allow_duplicate:

            duplicate_prefix = (
                f"D:{digest}:"
            )


            current_key = cstr(
                self.operation_no_uniqueness_key
            )


            # نحافظ على نفس المفتاح إذا كان السجل
            # بالفعل Duplicate لنفس الرقم.
            if current_key.startswith(
                duplicate_prefix
            ):
                return


            self.operation_no_uniqueness_key = (
                duplicate_prefix
                +
                frappe.generate_hash(
                    length=16
                )
            )

        else:

            # كل العمليات العادية لنفس الرقم
            # تنتج نفس المفتاح.
            # unique=1 يمنع Race Condition.
            self.operation_no_uniqueness_key = (
                f"N:{digest}"
            )

    def validate(self):
        self.validate_blocked_creation_mode()
        self.validate_blocked_operation_permission()
        self.validate_operation_number_rules()
        self.validate_status()
        self.sync_extraction_source()
        self.validate_attachments()
        self.set_attachment_names()


    def validate_blocked_creation_mode(
        self,
    ):
        if self.is_new():
            return


        old_doc = (
            self.get_doc_before_save()
        )


        if not old_doc:
            return


        old_value = bool(
            cint(
                old_doc.is_blocked_operation
            )
        )

        new_value = bool(
            cint(
                self.is_blocked_operation
            )
        )


        if old_value != new_value:
            frappe.throw(
                _(
                    "\"عملية محضورة\" متاح عند "
                    "إنشاء العملية فقط. "
                    "بعد الإنشاء استخدم إجراءات الحالة."
                )
            )

    def validate_blocked_operation_permission(
        self,
    ):
        if not self.is_new():
            return


        if not cint(
            self.is_blocked_operation
        ):
            return


        if (
            frappe.session.user
            == "Administrator"
        ):
            return


        allowed = frappe.has_permission(
            "Archive Operation",
            ptype=
                "change_advanced_status",
            user=
                frappe.session.user,
        )


        if not allowed:
            frappe.throw(
                _(
                    "ليس لديك صلاحية إنشاء "
                    "عملية محضورة."
                ),
                frappe.PermissionError,
            )



    def validate_status(self):
        if self.status not in self.VALID_STATUSES:
            frappe.throw(
                _("حالة العملية غير صحيحة: {0}").format(
                    self.status
                )
            )

        if (
            not self.is_new()
            and self.has_value_changed("status")
            and not getattr(
                self.flags,
                "allow_status_transition",
                False,
            )
        ):
            frappe.throw(
                _("لا يمكن تغيير حالة العملية مباشرة.")
            )

    def sync_extraction_source(self):
        if not self.extraction_source_file:
            for row in self.attachments or []:
                row.is_extraction_source = 0

            return

        source_found = False

        for row in self.attachments or []:
            is_source = (
                row.file == self.extraction_source_file
            )

            row.is_extraction_source = (
                1 if is_source else 0
            )

            if is_source:
                source_found = True

        if not source_found:
            self.append(
                "attachments",
                {
                    "file": self.extraction_source_file,
                    "file_name": os.path.basename(
                        self.extraction_source_file
                    ),
                    "is_extraction_source": 1,
                },
            )

    def validate_attachments(self):
        if (
            not self.attachments
            and not getattr(frappe.flags, "in_import", False)
        ):
            frappe.throw(
                _(
                    "يجب إضافة مرفق واحد على الأقل "
                    "قبل حفظ العملية."
                )
            )

        seen_files = set()

        for row in self.attachments:
            if not row.file:
                frappe.throw(
                    _("يوجد صف مرفق بدون ملف.")
                )

            if row.file in seen_files:
                frappe.throw(
                    _("يوجد مرفق مكرر في العملية.")
                )

            seen_files.add(row.file)

            if not frappe.db.exists(
                "File",
                {"file_url": row.file},
            ):
                frappe.throw(
                    _("الملف غير موجود: {0}").format(
                        row.file
                    )
                )

    def set_attachment_names(self):
        for row in self.attachments or []:
            if row.file and not row.file_name:
                row.file_name = os.path.basename(
                    row.file
                )