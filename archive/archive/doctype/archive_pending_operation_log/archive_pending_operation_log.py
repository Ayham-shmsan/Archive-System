import frappe
from frappe import _
from frappe.model.document import Document


class ArchivePendingOperationLog(Document):
    """
    سجل Business Timeline مستقل للمعلقات.

    ينشئه كود النظام فقط، وبعد الإنشاء لا يسمح بتعديله أو حذفه.
    """

    def validate(self) -> None:
        self._validate_required_values()

        if not self.is_new():
            frappe.throw(
                _(
                    "لا يمكن تعديل سجل مسار العملية المعلقة "
                    "بعد إنشائه."
                )
            )

    def _validate_required_values(self) -> None:
        if not self.pending_operation:
            frappe.throw(
                _("العملية المعلقة مطلوبة.")
            )

        if not self.event_type:
            frappe.throw(
                _("نوع الحدث مطلوب.")
            )

        if not self.event_title:
            frappe.throw(
                _("عنوان الحدث مطلوب.")
            )

        if not self.event_datetime:
            frappe.throw(
                _("تاريخ ووقت الحدث مطلوب.")
            )

        if not self.event_user:
            frappe.throw(
                _("المستخدم مطلوب.")
            )

        if not self.event_source:
            frappe.throw(
                _("مصدر الحدث مطلوب.")
            )

    def on_trash(self) -> None:
        frappe.throw(
            _(
                "لا يمكن حذف سجل مسار العملية المعلقة "
                "بعد إنشائه."
            )
        )