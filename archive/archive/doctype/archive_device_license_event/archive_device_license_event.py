import frappe

from frappe import _
from frappe.model.document import Document


SERVICE_FLAG = (
    "archive_device_license_service"
)


class ArchiveDeviceLicenseEvent(
    Document
):

    def validate(
        self
    ):

        if not getattr(
            frappe.flags,
            SERVICE_FLAG,
            False,
        ):

            frappe.throw(
                _(
                    "سجل أحداث الترخيص "
                    "للقراءة فقط."
                )
            )