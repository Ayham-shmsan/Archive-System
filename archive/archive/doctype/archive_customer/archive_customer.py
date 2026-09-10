from frappe.model.document import Document


class ArchiveCustomer(Document):
    # begin: auto-generated types
    # This code is auto-generated. Do not modify anything in this block.

    from typing import TYPE_CHECKING

    if TYPE_CHECKING:
        from frappe.types import DF

        customer_name: DF.Data
        disabled: DF.Check
        notes: DF.SmallText | None
    # end: auto-generated types

    pass
