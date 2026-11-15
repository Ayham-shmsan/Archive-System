import frappe
from frappe.utils import cint


PATCH_MARKER_DOCTYPE = "Archive Patch State"
PATCH_MARKER_FIELD = "final_swift_required_patch_v1_applied"


def _is_patch_marker_set() -> bool:
    val = frappe.db.sql(
        """
        SELECT `value`
        FROM `tabSingles`
        WHERE `doctype` = %s
          AND `field` = %s
        LIMIT 1
        """,
        (PATCH_MARKER_DOCTYPE, PATCH_MARKER_FIELD),
    )
    if val and cint(val[0][0]) == 1:
        return True

    patch_logged = frappe.db.sql(
        """
        SELECT 1
        FROM `tabPatch Log`
        WHERE `patch` LIKE 'archive.patches.v1_0.set_default_final_swift_required_for_existing_operations%%'
        LIMIT 1
        """
    )
    return bool(patch_logged)


def _set_patch_marker() -> None:
    exists = frappe.db.sql(
        """
        SELECT 1
        FROM `tabSingles`
        WHERE `doctype` = %s
          AND `field` = %s
        LIMIT 1
        """,
        (PATCH_MARKER_DOCTYPE, PATCH_MARKER_FIELD),
    )
    if exists:
        frappe.db.sql(
            """
            UPDATE `tabSingles`
            SET `value` = '1'
            WHERE `doctype` = %s
              AND `field` = %s
            """,
            (PATCH_MARKER_DOCTYPE, PATCH_MARKER_FIELD),
        )
    else:
        frappe.db.sql(
            """
            INSERT INTO `tabSingles` (`doctype`, `field`, `value`)
            VALUES (%s, %s, '1')
            """,
            (PATCH_MARKER_DOCTYPE, PATCH_MARKER_FIELD),
        )


def execute():
    """
    ترحيل جميع عمليات الإنتاج التاريخية الموجودة قبل الإطلاق إلى:
    final_swift_required = 1

    - يحترم ترتيب Frappe Schema Sync عبر reload_doc.
    - يعمل مرة واحدة فقط على العمليات التاريخية ولا يكتب فوق أي قيمة 0
      تم إدخالها بعد تطبيق الترحيل عند إعادة تشغيل الـPatch.
    - لا يغيّر السنوات المالية أو مجموعات العمليات أو الترقيم السنوي.
    """
    frappe.reload_doc("archive", "doctype", "archive_operation")

    if not frappe.db.has_column("Archive Operation", "final_swift_required"):
        return

    if _is_patch_marker_set():
        frappe.db.sql(
            """
            UPDATE `tabArchive Operation`
            SET `final_swift_required` = 1
            WHERE `final_swift_required` IS NULL
            """
        )
        return

    frappe.db.sql(
        """
        UPDATE `tabArchive Operation`
        SET `final_swift_required` = 1
        WHERE `final_swift_required` IS NULL
           OR `final_swift_required` != 1
        """
    )
    _set_patch_marker()
