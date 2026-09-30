import frappe

from frappe import _
from frappe.model.document import Document


SERVICE_FLAG = (
    "archive_device_license_service"
)


PROTECTED_FIELDS = (
    "activation_code",
    "status",
    "installation_id",
    "device_name",
    "platform",
    "architecture",
    "interface_name",
    "first_seen",
    "last_seen",
    "initial_mac",
    "initial_reported_ip",
    "initial_observed_ip",
    "last_mac",
    "last_reported_ip",
    "last_observed_ip",
    "licensed_mac",
    "licensed_ip",
    "machine_id_hash",
    "device_fingerprint",
    "public_key_fingerprint",
    "public_key",
    "activated_at",
    "activated_by",
    "suspended_at",
    "suspended_reason",
    "revoked_at",
    "revoked_by",
)


class ArchiveDeviceLicense(
    Document
):

    def validate(
        self
    ):

        if getattr(
            frappe.flags,
            SERVICE_FLAG,
            False,
        ):
            return


        if self.is_new():

            frappe.throw(
                _(
                    "لا يمكن إنشاء ترخيص جهاز "
                    "يدويًا."
                )
            )


        previous = (
            self.get_doc_before_save()
        )


        if not previous:
            return


        for fieldname in (
            PROTECTED_FIELDS
        ):

            if (
                self.get(
                    fieldname
                )
                !=
                previous.get(
                    fieldname
                )
            ):

                frappe.throw(
                    _(
                        "لا يمكن تعديل بيانات "
                        "الترخيص المحمية مباشرة."
                    )
                )