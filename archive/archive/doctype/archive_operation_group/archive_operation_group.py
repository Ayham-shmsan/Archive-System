from frappe.model.document import Document


class ArchiveOperationGroup(Document):
    """
    الكيان الذي يمثل العملية التجارية الأصلية.

    قد تحتوي المجموعة على:
    - جزء واحد فقط.
    - عدة أجزاء تحمل نفس رقم العملية.
    """

    pass