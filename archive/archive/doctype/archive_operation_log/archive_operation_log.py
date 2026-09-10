import frappe
from frappe import _
from frappe.model.document import Document


class ArchiveOperationLog(
    Document
):
    """
    سجل تدقيق للعملية.

    يسمح بإنشاء السجل من كود النظام،
    لكنه لا يسمح بتعديل سجل موجود
    أو حذفه بعد إنشائه.
    """

    def validate(
        self,
    ):
        self._validate_required_values()

        if not self.is_new():
            frappe.throw(
                _(
                    "لا يمكن تعديل سجل "
                    "مسار العملية بعد إنشائه."
                )
            )


    def _validate_required_values(
        self,
    ):
        if not self.operation:
            frappe.throw(
                _("العملية مطلوبة.")
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
                _(
                    "تاريخ ووقت الحدث مطلوب."
                )
            )

        if not self.event_user:
            frappe.throw(
                _("المستخدم مطلوب.")
            )

        if not self.event_source:
            frappe.throw(
                _("مصدر الحدث مطلوب.")
            )


    def on_trash(
        self,
    ):
        frappe.throw(
            _(
                "لا يمكن حذف سجل "
                "مسار العملية بعد إنشائه."
            )
        )