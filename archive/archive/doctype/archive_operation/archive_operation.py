import os
import hashlib
import re
import frappe
from frappe import _
from frappe.model.document import Document
from archive.api.operation_search import (
    build_operation_search_text,
)
from frappe.utils import cint, cstr, getdate
from frappe.model.naming import getseries
from archive.domain.operation_group import (
    ensure_operation_group,
)


_OPERATION_NUMBER_DIGITS = str.maketrans(
    "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹",
    "01234567890123456789",
)

CUSTOMER_RATE_TYPES = {
    "له",
    "عليه",
    "بدون",
    "بدل حوالة مرتجعة"
}


CUSTOMER_RATE_CURRENCIES = {
    "دولار",
    "سعودي",
}




OPERATION_SERIAL_SERIES_KEY = (
    "ARCHIVE-OPERATION-SERIAL"
)

OPERATION_SERIAL_DIGITS = 10


def get_next_operation_serial() -> int:
    """
    عداد مستقل خاص بسجلات Archive Operation.

    لا يستخدمه:
    - File
    - AOD
    - OPG
    - Final Swift
    - أي DocType آخر
    """

    return int(
        getseries(
            OPERATION_SERIAL_SERIES_KEY,
            OPERATION_SERIAL_DIGITS,
        )
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

        allow_duplicate_operation_no: DF.Check
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
        customer_rate: DF.Data | None
        customer_rate_currency: DF.Literal["", "\u062f\u0648\u0644\u0627\u0631", "\u0633\u0639\u0648\u062f\u064a"]
        customer_rate_type: DF.Literal["", "\u0644\u0647", "\u0639\u0644\u064a\u0647", "\u0628\u062f\u0648\u0646"]
        execution_datetime: DF.Datetime | None
        extraction_source_file: DF.Attach | None
        final_swift_file: DF.Attach | None
        final_swift_uploaded_at: DF.Datetime | None
        final_swift_uploaded_by: DF.Link | None
        from_account: DF.Link | None
        is_blocked_operation: DF.Check
        legacy_import_key: DF.Data | None
        notes: DF.Data | None
        operation_group: DF.Link | None
        operation_no: DF.Data | None
        operation_no_normalized: DF.Data | None
        operation_no_uniqueness_key: DF.Data | None
        reference_no: DF.Data | None
        request_date: DF.Date | None
        search_text: DF.LongText | None
        sender_account: DF.Data | None
        sender_name: DF.Data | None
        serial_no: DF.Int
        status: DF.Literal["\u0645\u0639\u0644\u0642\u0629", "\u063a\u064a\u0631 \u0645\u0624\u0643\u062f\u0629", "\u0645\u0624\u0643\u062f\u0629", "\u0645\u0631\u062a\u062c\u0639\u0629", "\u0645\u062d\u0636\u0648\u0631\u0629"]
        status_changed_at: DF.Datetime | None
        status_changed_by: DF.Link | None
        status_effective_datetime: DF.Date | None
        status_history: DF.Table[ArchiveOperationStatusLog]
        swift_code: DF.Data | None
        transferring_bank: DF.Link | None
        user_notes: DF.Data | None
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
        if not cint(
            self.serial_no
        ):
            self.serial_no = (
                get_next_operation_serial()
            )
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

    
    def before_insert(self):
        self.serial_no = (
            get_next_operation_serial()
        )

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

                is_data_import = bool(
                    getattr(
                        frappe.flags,
                        "in_import",
                        False,
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
                        _(
                            "رقم العملية غير صالح."
                        )
                    )


                self.operation_no = (
                    operation_no
                )

                self.operation_no_normalized = (
                    normalized
                )


                # ========================================================
                # Existing document
                #
                # إذا كان المستند محفوظاً من قبل ورقم العملية
                # لم يتغير، فلا نعيد معاملته كتكرار جديد.
                # ========================================================

                old_doc = None


                if not self.is_new():

                    old_doc = (
                        self.get_doc_before_save()
                    )


                if old_doc:

                    old_normalized = (
                        normalize_operation_no(
                            old_doc.operation_no
                        )
                    )

                    old_allow_duplicate = bool(
                        cint(
                            old_doc
                                .allow_duplicate_operation_no
                        )
                    )


                    if (
                        old_normalized
                        == normalized
                    ):

                        existing_key = cstr(
                            old_doc
                                .operation_no_uniqueness_key
                        ).strip()


                        if existing_key:
                            self.operation_no_uniqueness_key = (
                                existing_key
                            )


                        # ====================================================
                        # المستخدم يحاول إلغاء السماح بالتكرار
                        # عن عملية مكررة بالفعل.
                        # ====================================================

                        if (
                            old_allow_duplicate
                            and
                            not allow_duplicate
                        ):

                            existing = frappe.get_all(
                                "Archive Operation",

                                filters=[
                                    [
                                        "Archive Operation",
                                        "operation_no_normalized",
                                        "=",
                                        normalized,
                                    ],
                                    [
                                        "Archive Operation",
                                        "name",
                                        "!=",
                                        self.name,
                                    ],
                                ],

                                fields=[
                                    "name",
                                ],

                                limit=1,
                            )


                            if existing:

                                frappe.throw(
                                    _(
                                        "لا يمكن إلغاء السماح "
                                        "بتكرار رقم العملية لأن "
                                        "الرقم {0} مستخدم في "
                                        "عمليات أخرى."
                                    ).format(
                                        frappe.bold(
                                            operation_no
                                        )
                                    )
                                )


                            # لم يعد هناك سجل آخر بنفس الرقم،
                            # لذلك يعود هذا السجل هو السجل الأساسي.
                            digest = (
                                make_operation_no_hash(
                                    normalized
                                )
                            )

                            self.operation_no_uniqueness_key = (
                                f"N:{digest}"
                            )


                        return


                # ========================================================
                # New operation OR operation number changed
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

                    filters=
                        filters,

                    fields=[
                        "name",
                        "operation_no",
                    ],

                    limit=1,
                )


                # ========================================================
                # Data Import
                #
                # البيانات التاريخية قد تحتوي تكرارات مشروعة.
                #
                # أول سجل:
                #   allow_duplicate = 0
                #   N:<hash>
                #
                # كل سجل تالٍ بنفس الرقم أثناء Data Import:
                #   allow_duplicate = 1
                #   D:<hash>:<random>
                # ========================================================

                if (
                    is_data_import
                    and
                    existing
                ):

                    self.allow_duplicate_operation_no = (
                        1
                    )

                    allow_duplicate = True


                # ========================================================
                # Manual / normal creation
                #
                # التكرار ممنوع ما لم يفعّله المستخدم صراحة.
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
                # DB uniqueness key
                # ========================================================

                digest = (
                    make_operation_no_hash(
                        normalized
                    )
                )


                if (
                    existing
                    and
                    allow_duplicate
                ):

                    self.operation_no_uniqueness_key = (
                        f"D:{digest}:"
                        +
                        frappe.generate_hash(
                            length=16
                        )
                    )


                else:

                    self.operation_no_uniqueness_key = (
                        f"N:{digest}"
                    )

    def validate_customer_rate_rules(
            self,
        ):

            rate_type = cstr(
                self.get(
                    "customer_rate_type"
                )
            ).strip()


            rate_currency = cstr(
                self.get(
                    "customer_rate_currency"
                )
            ).strip()


            rate_amount = self.get(
                "customer_rate_amount"
            )


            is_data_import = bool(
                getattr(
                    frappe.flags,
                    "in_import",
                    False,
                )
            )


            # ========================================================
            # Legacy existing operations
            # ========================================================

            if (
                not self.is_new()
                and
                not rate_type
                and
                not rate_currency
            ):
                return


            if (
                is_data_import
                and
                not rate_type
                and
                not rate_currency
            ):
                return


            # ========================================================
            # Currency
            # ========================================================

            if not rate_currency:

                frappe.throw(
                    _(
                        "عملة سعر العميل مطلوبة."
                    )
                )


            if (
                rate_currency
                not in CUSTOMER_RATE_CURRENCIES
            ):

                frappe.throw(
                    _(
                        "عملة سعر العميل غير صحيحة."
                    )
                )


            self.customer_rate_currency = (
                rate_currency
            )


            # ========================================================
            # Saudi
            #
            # السعر يدوي بالكامل.
            # لا نستخدم:
            # - customer_rate_type
            # - customer_rate_amount
            # ========================================================

            if (
                rate_currency
                ==
                "سعودي"
            ):

                self.customer_rate_type = (
                    None
                )


                self.customer_rate_amount = (
                    None
                )


                self.customer_rate = (
                    cstr(
                        self.customer_rate
                    ).strip()
                    or None
                )


                if not self.customer_rate:

                    frappe.throw(
                        _(
                            "سعر العميل مطلوب "
                            "عند اختيار العملة سعودي."
                        )
                    )


                return


            # ========================================================
            # Dollar
            # ========================================================

            if not rate_type:

                frappe.throw(
                    _(
                        "نوع العمولة مطلوب "
                        "عند اختيار الدولار."
                    )
                )


            if (
                rate_type
                not in CUSTOMER_RATE_TYPES
            ):

                frappe.throw(
                    _(
                        "نوع العمولة غير صحيح."
                    )
                )


            self.customer_rate_type = (
                rate_type
            )


            # ========================================================
            # Without commission
            # ========================================================

            if (
                rate_type
                ==
                "بدون"
            ):

                self.customer_rate_amount = (
                    None
                )


                self.customer_rate = (
                    "بدون عمولة"
                )


                return
            if (
                rate_type
                ==
                "بدل حوالة مرتجعة"
            ):

                self.customer_rate_amount = (
                    None
                )


                self.customer_rate = (
                    "بدل حوالة مرتجعة"
                )


                return


            # ========================================================
            # له / عليه
            #
            # مبلغ التسعير مطلوب ويصبح هو الرقم
            # الظاهر داخل customer_rate.
            # ========================================================

            try:

                amount = float(
                    rate_amount
                )

            except (
                TypeError,
                ValueError,
            ):

                frappe.throw(
                    _(
                        "مبلغ التسعير يجب أن يكون رقماً."
                    )
                )


            if amount <= 0:

                frappe.throw(
                    _(
                        "مبلغ التسعير يجب أن يكون أكبر من صفر."
                    )
                )


            amount = round(
                amount,
                6,
            )


            amount_text = (
                f"{amount:.6f}"
                .rstrip("0")
                .rstrip(".")
            )


            self.customer_rate_amount = (
                amount
            )


            self.customer_rate = (
                f"{rate_type} "
                f"{amount_text} "
                "$ بالألف"
            )
    # def validate_operation_dates(
    #         self,
    #     ):
    #         """
    #         قاعدة تواريخ العملية:

    #             تاريخ الطلب
    #             يجب أن يكون أقل من أو يساوي
    #             تاريخ تنفيذ العملية.

    #         execution_datetime يحتوي وقتاً،
    #         لكن المقارنة هنا على جزء التاريخ فقط.

    #         احتياط Legacy:
    #         إذا كان سجل قديم محفوظاً مسبقاً
    #         ومخالفاً لهذه القاعدة، فلا نمنع
    #         حفظ تعديل لا يمس التاريخين.

    #         بمجرد تعديل أحد التاريخين، يجب
    #         أن تصبح العلاقة بينهما صحيحة.
    #         """

    #         # ========================================================
    #         # Missing values
    #         #
    #         # الإلزام نفسه سيعالج في Required Fields.
    #         # هذه الدالة مسؤولة فقط عن العلاقة بين التاريخين.
    #         # ========================================================

    #         if (
    #             not self.request_date
    #             or
    #             not self.execution_datetime
    #         ):
    #             return


    #         request_date = getdate(
    #             self.request_date
    #         )

    #         execution_date = getdate(
    #             self.execution_datetime
    #         )


    #         # ========================================================
    #         # Valid relationship
    #         # ========================================================

    #         if (
    #             request_date
    #             <=
    #             execution_date
    #         ):
    #             return


    #         # ========================================================
    #         # Legacy compatibility
    #         #
    #         # سجل قديم مخالف أصلاً:
    #         #
    #         # إذا لم يغير المستخدم أي تاريخ،
    #         # لا نكسر عمليات مثل:
    #         # - تغيير الحالة
    #         # - إضافة Final Swift
    #         # - أي Save لا يتعلق بالتواريخ
    #         # ========================================================

    #         if not self.is_new():

    #             old_doc = (
    #                 self.get_doc_before_save()
    #             )


    #             if old_doc:

    #                 request_date_changed = (
    #                     cstr(
    #                         self.request_date
    #                     )
    #                     !=
    #                     cstr(
    #                         old_doc.request_date
    #                     )
    #                 )

    #                 execution_datetime_changed = (
    #                     cstr(
    #                         self.execution_datetime
    #                     )
    #                     !=
    #                     cstr(
    #                         old_doc.execution_datetime
    #                     )
    #                 )


    #                 if (
    #                     not request_date_changed
    #                     and
    #                     not execution_datetime_changed
    #                 ):
    #                     return


    #         # ========================================================
    #         # New record or dates were changed
    #         # ========================================================

    #         frappe.throw(
    #             _(
    #                 "تاريخ الطلب لا يمكن أن يكون "
    #                 "بعد تاريخ تنفيذ العملية."
    #             )
    #         )

    def validate_operation_dates(
        self,
    ):
        """
        تاريخ الطلب يجب أن يكون أقل من أو
        مساوياً لتاريخ تنفيذ العملية.

        execution_datetime يحتوي وقتاً،
        لذلك المقارنة تتم على التاريخ فقط.

        القاعدة صارمة على جميع عمليات الحفظ:
        لا يوجد استثناء للسجلات القديمة المخالفة.
        """

        if (
            not self.request_date
            or
            not self.execution_datetime
        ):
            return


        request_date = getdate(
            self.request_date
        )


        execution_date = getdate(
            self.execution_datetime
        )


        if (
            request_date
            <=
            execution_date
        ):
            return


        frappe.throw(
            _(
                "تاريخ الطلب لا يمكن أن يكون "
                "بعد تاريخ تنفيذ العملية."
            )
        )

    def validate(self):
        self.validate_blocked_creation_mode()
        self.validate_blocked_operation_permission()

        self.validate_customer_rate_rules()

        self.validate_operation_dates()
        
        self.validate_operation_number_rules()

        ensure_operation_group(
            self
        )
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
        """
        Archive Operation.attachments يحتوي فقط
        على الملفات الخاصة بهذا الجزء، مثل:

        - ملف الاستخراج
        - Final Swift

        أما المستندات المشتركة فتوجد في:
        Archive Operation Document.
        """

        seen_files = set()

        for row in self.attachments or []:

            if not row.file:
                frappe.throw(
                    _("يوجد صف مرفق بدون ملف.")
                )

            if row.file in seen_files:
                frappe.throw(
                    _("يوجد مرفق مكرر في العملية.")
                )

            seen_files.add(
                row.file
            )

            if not frappe.db.exists(
                "File",
                {
                    "file_url":
                        row.file,
                },
            ):
                frappe.throw(
                    _(
                        "الملف غير موجود: {0}"
                    ).format(
                        row.file
                    )
                )

    def set_attachment_names(self):
        for row in self.attachments or []:
            if row.file and not row.file_name:
                row.file_name = os.path.basename(
                    row.file
                )