import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr


class ArchiveOperationGroup(Document):
    """
    الكيان الذي يمثل العملية التجارية الأصلية داخل السنة المالية.

    قد تحتوي المجموعة على:
    - جزء واحد فقط.
    - عدة أجزاء تحمل نفس رقم العملية في نفس السنة المالية.
    """

    def validate(self):
        self.fiscal_year = cstr(self.fiscal_year).strip() or None
        self.operation_no = cstr(self.operation_no).strip() or None
        self.operation_no_normalized = (
            cstr(self.operation_no_normalized).strip() or None
        )

        if not self.fiscal_year:
            frappe.throw(
                _("السنة المالية مطلوبة لمجموعة العملية.")
            )


def on_doctype_update():
    if not frappe.db.table_exists("Archive Operation Group"):
        return
    if not frappe.db.has_column("Archive Operation Group", "fiscal_year"):
        return

    # تحويل القيم الفارغة إلى NULL لضمان عدم تعارض المجموعات المحظورة
    frappe.db.sql(
        """
        UPDATE `tabArchive Operation Group`
        SET `operation_no_normalized` = NULL
        WHERE `operation_no_normalized` = ''
        """
    )

    if frappe.db.table_exists("Archive Operation") and frappe.db.has_column(
        "Archive Operation", "fiscal_year"
    ):
        # تهيئة السنة المالية للمجموعات القائمة التي تنتمي عملياتها لسنة مالية واحدة فقط
        frappe.db.sql(
            """
            UPDATE `tabArchive Operation Group` g
            INNER JOIN (
                SELECT
                    `operation_group`,
                    MIN(`fiscal_year`) AS `single_fy`,
                    COUNT(DISTINCT `fiscal_year`) AS `fy_count`
                FROM `tabArchive Operation`
                WHERE IFNULL(`operation_group`, '') != ''
                  AND IFNULL(`fiscal_year`, '') != ''
                GROUP BY `operation_group`
                HAVING `fy_count` = 1
            ) op_fy ON op_fy.`operation_group` = g.`name`
            SET g.`fiscal_year` = op_fy.`single_fy`
            WHERE IFNULL(g.`fiscal_year`, '') = ''
            """
        )

    conflicts = frappe.db.sql(
        """
        SELECT `fiscal_year`, `operation_no_normalized`, COUNT(*) AS `cnt`
        FROM `tabArchive Operation Group`
        WHERE `fiscal_year` IS NOT NULL
          AND `operation_no_normalized` IS NOT NULL
        GROUP BY `fiscal_year`, `operation_no_normalized`
        HAVING `cnt` > 1
        LIMIT 1
        """,
        as_dict=True,
    )
    if conflicts:
        # إذا كان هناك تعارض قبل تشغيل الباتش، نؤجل إنشاء الفهرس الفريد المركب إلى الباتش المخصص
        if getattr(frappe.flags, "in_migrate", False) or getattr(
            frappe.flags, "in_patch", False
        ):
            return
        frappe.throw(
            _(
                "يوجد تعارض في مجموعات العمليات لنفس السنة المالية ورقم العملية الموحد: {0} / {1}"
            ).format(
                conflicts[0].get("fiscal_year"),
                conflicts[0].get("operation_no_normalized"),
            )
        )

    unmigrated_groups = frappe.db.sql(
        """
        SELECT `name`
        FROM `tabArchive Operation Group`
        WHERE IFNULL(`fiscal_year`, '') = ''
          AND IFNULL(`operation_no_normalized`, '') != ''
        LIMIT 1
        """,
        as_dict=True,
    )
    if unmigrated_groups and (
        getattr(frappe.flags, "in_migrate", False)
        or getattr(frappe.flags, "in_patch", False)
    ):
        # نؤجل إنشاء الفهرس المركب وإسقاط الفهرس القديم حتى يكتمل ترحيل جميع المجموعات في الباتش
        return

    ensure_operation_group_indexes()


def ensure_operation_group_indexes():
    composite_index_name = "uniq_archive_op_group_fy_norm"
    has_composite_unique = frappe.db.sql(
        """
        SHOW INDEX FROM `tabArchive Operation Group`
        WHERE Key_name = %s
        """,
        (composite_index_name,),
    )
    if not has_composite_unique:
        frappe.db.sql_ddl(
            f"""
            ALTER TABLE `tabArchive Operation Group`
            ADD UNIQUE INDEX `{composite_index_name}` (`fiscal_year`, `operation_no_normalized`)
            """
        )

    # حذف الفهرس الفريد القديم الأحادي فقط بعد التأكد من وجود الفهرس الفريد المركب الجديد
    has_composite_verified = frappe.db.sql(
        """
        SHOW INDEX FROM `tabArchive Operation Group`
        WHERE Key_name = %s
        """,
        (composite_index_name,),
    )
    if has_composite_verified:
        legacy_unique_indexes = frappe.db.sql(
            """
            SELECT DISTINCT INDEX_NAME AS Key_name
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabArchive Operation Group'
              AND NON_UNIQUE = 0
              AND INDEX_NAME != 'PRIMARY'
              AND INDEX_NAME != %s
              AND COLUMN_NAME = 'operation_no_normalized'
            """,
            (composite_index_name,),
            as_dict=True,
        )
        for row in legacy_unique_indexes:
            key_name = row.get("Key_name")
            if key_name:
                frappe.db.sql_ddl(
                    f"""
                    ALTER TABLE `tabArchive Operation Group`
                    DROP INDEX `{key_name}`
                    """
                )
                # الإبقاء على فهرس بحث عادي على operation_no_normalized
                has_search_idx = frappe.db.sql(
                    """
                    SHOW INDEX FROM `tabArchive Operation Group`
                    WHERE Key_name IN ('operation_no_normalized_idx', 'operation_no_normalized_index')
                    """
                )
                if not has_search_idx:
                    frappe.db.sql_ddl(
                        """
                        ALTER TABLE `tabArchive Operation Group`
                        ADD INDEX `operation_no_normalized_idx` (`operation_no_normalized`)
                        """
                    )
