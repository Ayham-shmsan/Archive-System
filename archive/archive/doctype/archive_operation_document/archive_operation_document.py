from hashlib import sha256
from pathlib import Path

import frappe

from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr


DOCUMENT_ROLE_SHARED_ATTACHMENT = (
    "shared_attachment"
)

DOCUMENT_ROLE_INVOICE = (
    "invoice"
)


VALID_DOCUMENT_ROLES = {
    DOCUMENT_ROLE_SHARED_ATTACHMENT,
    DOCUMENT_ROLE_INVOICE,
}


class ArchiveOperationDocument(Document):

    def before_insert(self):
        self.validate_operation_group()
        self.validate_source_operation()

        self.validate_document_role()

        self.load_file_metadata()

        self.set_uniqueness_key()

    def validate(self):
        self.validate_operation_group()
        self.validate_source_operation()

        self.validate_document_role()

        self.load_file_metadata()

        self.set_uniqueness_key()

    # ========================================================
    # Group
    # ========================================================

    def validate_operation_group(self):
        if not self.operation_group:
            frappe.throw(
                _("مجموعة العملية مطلوبة.")
            )

        if not frappe.db.exists(
            "Archive Operation Group",
            self.operation_group,
        ):
            frappe.throw(
                _("مجموعة العملية غير موجودة.")
            )

    # ========================================================
    # Source operation
    # ========================================================

    def validate_source_operation(self):
        if not self.source_operation:
            return

        operation_group = frappe.db.get_value(
            "Archive Operation",
            self.source_operation,
            "operation_group",
        )

        if (
            operation_group
            != self.operation_group
        ):
            frappe.throw(
                _(
                    "العملية التي تم الإرفاق منها "
                    "لا تنتمي إلى مجموعة العملية المحددة."
                )
            )

    # ========================================================
    # Role
    # ========================================================

    def validate_document_role(self):
        role = cstr(
            self.document_role
        ).strip()

        if role not in VALID_DOCUMENT_ROLES:
            frappe.throw(
                _("نوع المستند غير صالح.")
            )

        self.document_role = role

    # ========================================================
    # File metadata
    # ========================================================

    def load_file_metadata(self):
        file_url = cstr(
            self.file
        ).strip()

        if not file_url:
            frappe.throw(
                _("الملف مطلوب.")
            )

        file_data = frappe.db.get_value(
            "File",
            {
                "file_url": file_url,
            },
            [
                "name",
                "file_name",
                "file_size",
                "content_hash",
            ],
            as_dict=True,
        )

        if not file_data:
            frappe.throw(
                _(
                    "تعذر العثور على ملف Frappe "
                    "المرتبط بالمستند."
                )
            )

        file_name = cstr(
            file_data.file_name
        ).strip()

        extension = (
            Path(file_name)
            .suffix
            .lower()
        )

        self.file_name = file_name
        self.file_extension = (
            extension or None
        )

        self.file_size = (
            file_data.file_size or 0
        )

        self.content_hash = (
            cstr(
                file_data.content_hash
            ).strip()
            or self.make_file_fallback_hash(
                file_url
            )
        )

    @staticmethod
    def make_file_fallback_hash(
        file_url,
    ):
        return sha256(
            cstr(file_url)
            .encode("utf-8")
        ).hexdigest()

    # ========================================================
    # Uniqueness
    # ========================================================

    def set_uniqueness_key(self):
        """
        قواعد عدم التكرار:

        invoice:
            فاتورة واحدة فقط لكل Group.

        shared_attachment:
            نفس محتوى الملف لا يمكن إضافته
            مرتين لنفس Group.

        قاعدة البيانات نفسها تحمي القاعدة
        بواسطة unique index.
        """

        group_name = cstr(
            self.operation_group
        ).strip()

        if (
            self.document_role
            == DOCUMENT_ROLE_INVOICE
        ):
            self.uniqueness_key = (
                f"invoice:{group_name}"
            )

            return

        content_hash = cstr(
            self.content_hash
        ).strip()

        if not content_hash:
            frappe.throw(
                _(
                    "تعذر تحديد بصمة الملف."
                )
            )

        self.uniqueness_key = (
            "attachment:"
            f"{group_name}:"
            f"{content_hash}"
        )