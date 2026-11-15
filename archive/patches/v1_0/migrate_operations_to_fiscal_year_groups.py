from __future__ import annotations

from collections import defaultdict
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr

from archive.archive.doctype.archive_operation.archive_operation import (
    make_operation_no_hash,
    normalize_operation_no,
)
from archive.archive.doctype.archive_operation_group.archive_operation_group import (
    ensure_operation_group_indexes,
)

COMPOSITE_INDEX_NAME = "uniq_archive_op_group_fy_norm"


def _get_archive_default_fiscal_year() -> str:
    """
    قراءة السنة المالية الافتراضية من إعدادات الأرشيف (Archive Settings.default_fiscal_year) فقط.
    """
    return cstr(
        frappe.db.get_single_value("Archive Settings", "default_fiscal_year")
    ).strip()


def inspect_preflight(default_fiscal_year: str | None = None) -> dict[str, Any]:
    """
    فحص للقراءة فقط (Read-Only Preflight Check) قبل ترحيل العمليات والمجموعات والمستندات.
    لا ينفذ أي تعديل على قاعدة البيانات ولا يسجل بيانات حساسة للعملاء أو المرفقات.
    """
    default_fy = (
        _get_archive_default_fiscal_year()
        if default_fiscal_year is None
        else cstr(default_fiscal_year).strip()
    )
    has_group_fy_col = frappe.db.has_column("Archive Operation Group", "fiscal_year")
    has_op_fy_col = frappe.db.has_column("Archive Operation", "fiscal_year")

    group_fields = [
        "name",
        "operation_no",
        "operation_no_normalized",
        "is_incomplete_invoice",
        "creation",
    ]
    if has_group_fy_col:
        group_fields.append("fiscal_year")

    groups = frappe.get_all(
        "Archive Operation Group",
        fields=group_fields,
        order_by="creation asc, name asc",
        limit_page_length=0,
    )
    groups_by_name = {g.name: g for g in groups}

    op_fields = [
        "name",
        "operation_no",
        "operation_no_normalized",
        "operation_no_uniqueness_key",
        "allow_duplicate_operation_no",
        "is_blocked_operation",
        "is_incomplete_invoice",
        "operation_group",
        "creation",
    ]
    if has_op_fy_col:
        op_fields.append("fiscal_year")

    operations = frappe.get_all(
        "Archive Operation",
        fields=op_fields,
        order_by="creation asc, name asc",
        limit_page_length=0,
    )
    ops_by_name = {op.name: op for op in operations}

    documents = frappe.get_all(
        "Archive Operation Document",
        fields=[
            "name",
            "operation_group",
            "source_operation",
            "document_role",
            "content_hash",
            "uniqueness_key",
            "file",
            "creation",
        ],
        order_by="creation asc, name asc",
        limit_page_length=0,
    )

    files_count = frappe.db.count("File")

    fiscal_years_present = sorted(
        {
            cstr(op.get("fiscal_year")).strip()
            for op in operations
            if cstr(op.get("fiscal_year")).strip()
        }
        | {
            cstr(g.get("fiscal_year")).strip()
            for g in groups
            if cstr(g.get("fiscal_year")).strip()
        }
    )

    existing_fiscal_year_docs = set(
        frappe.get_all("Archive Fiscal Year", pluck="name", limit_page_length=0)
    )
    default_fy_valid = bool(default_fy and default_fy in existing_fiscal_year_docs)

    operations_with_fiscal_year_count = 0
    missing_fiscal_year_operations: list[dict[str, Any]] = []
    operations_assigned_default_fiscal_year: list[dict[str, Any]] = []
    invalid_fiscal_year_operations: list[dict[str, Any]] = []
    invalid_fiscal_year_groups: list[dict[str, Any]] = []
    invalid_numbered_operations: list[dict[str, Any]] = []
    ungrouped_operations: list[dict[str, Any]] = []
    dangling_group_operations: list[dict[str, Any]] = []

    effective_fy_by_op: dict[str, str] = {}
    ops_by_group: dict[str, list[Any]] = defaultdict(list)

    for op in operations:
        recorded_fy = cstr(op.get("fiscal_year")).strip()
        blocked = bool(cint(op.get("is_blocked_operation")))
        raw_no = cstr(op.get("operation_no")).strip()
        norm_no = normalize_operation_no(raw_no) if not blocked else None
        grp_name = cstr(op.get("operation_group")).strip()

        if not recorded_fy:
            effective_fy = default_fy if default_fy_valid else ""
            missing_fiscal_year_operations.append(
                {
                    "operation": op.name,
                    "assigned_default_fiscal_year": effective_fy or None,
                    "reason": "السنة المالية مفقودة في السجل وسيتم إسناد السنة الافتراضية من إعدادات الأرشيف.",
                }
            )
            if default_fy_valid:
                operations_assigned_default_fiscal_year.append(
                    {
                        "operation": op.name,
                        "assigned_fiscal_year": default_fy,
                    }
                )
        elif recorded_fy not in existing_fiscal_year_docs:
            operations_with_fiscal_year_count += 1
            effective_fy = ""
            invalid_fiscal_year_operations.append(
                {
                    "operation": op.name,
                    "fiscal_year": recorded_fy,
                    "reason": "السنة المالية المسجلة غير موجودة في جدول السنوات المالية.",
                }
            )
        else:
            operations_with_fiscal_year_count += 1
            effective_fy = recorded_fy

        effective_fy_by_op[op.name] = effective_fy

        if not blocked and not norm_no:
            invalid_numbered_operations.append(
                {
                    "operation": op.name,
                    "reason": "عملية غير محضورة بدون رقم عملية صالح.",
                }
            )

        if not grp_name:
            ungrouped_operations.append(
                {
                    "operation": op.name,
                    "fiscal_year": effective_fy or recorded_fy,
                    "is_blocked_operation": int(blocked),
                    "operation_no_normalized": norm_no,
                }
            )
        elif grp_name not in groups_by_name:
            dangling_group_operations.append(
                {
                    "operation": op.name,
                    "missing_group": grp_name,
                    "fiscal_year": effective_fy or recorded_fy,
                    "operation_no_normalized": norm_no,
                }
            )
        else:
            ops_by_group[grp_name].append(op)

    docs_by_group: dict[str, list[Any]] = defaultdict(list)
    dangling_group_documents: list[dict[str, Any]] = []
    for doc in documents:
        grp_name = cstr(doc.get("operation_group")).strip()
        if not grp_name or grp_name not in groups_by_name:
            dangling_group_documents.append(
                {
                    "document": doc.name,
                    "operation_group": grp_name or None,
                    "source_operation": doc.get("source_operation"),
                    "reason": "المستند مرتبط بمجموعة غير موجودة.",
                }
            )
        else:
            docs_by_group[grp_name].append(doc)

    single_year_groups: list[dict[str, Any]] = []
    mixed_year_groups: list[dict[str, Any]] = []
    orphan_groups: list[dict[str, Any]] = []
    ambiguous_documents: list[dict[str, Any]] = []
    blocked_multi_op_groups: list[dict[str, Any]] = []

    for g in groups:
        grp_ops = ops_by_group.get(g.name, [])
        grp_docs = docs_by_group.get(g.name, [])
        grp_fy = cstr(g.get("fiscal_year")).strip()
        grp_norm = normalize_operation_no(g.get("operation_no_normalized") or g.get("operation_no"))

        if grp_fy and grp_fy not in existing_fiscal_year_docs:
            invalid_fiscal_year_groups.append(
                {
                    "group": g.name,
                    "fiscal_year": grp_fy,
                    "reason": "السنة المالية المسجلة للمجموعة غير موجودة في جدول السنوات المالية.",
                }
            )

        if not grp_ops:
            # مجموعة يتيمة بلا عمليات مرتبطة بها مباشرة
            inferred_doc_fys = set()
            unresolved_docs = []
            for d in grp_docs:
                src_op_name = cstr(d.get("source_operation")).strip()
                src_fy = effective_fy_by_op.get(src_op_name, "") if src_op_name else ""
                if src_fy:
                    inferred_doc_fys.add(src_fy)
                else:
                    unresolved_docs.append(d.name)

            orphan_entry = {
                "group": g.name,
                "fiscal_year": grp_fy or None,
                "operation_no_normalized": grp_norm or None,
                "documents_count": len(grp_docs),
                "inferred_document_fiscal_years": sorted(inferred_doc_fys),
                "unresolved_documents": unresolved_docs,
            }
            orphan_groups.append(orphan_entry)

            if not grp_fy and len(inferred_doc_fys) != 1 and grp_docs:
                for d in grp_docs:
                    ambiguous_documents.append(
                        {
                            "document": d.name,
                            "group": g.name,
                            "source_operation": d.get("source_operation"),
                            "reason": "مجموعة يتيمة بدون سنة مالية وتحتوي مستندات لا يمكن الجزم بسنتها المالية.",
                        }
                    )
            continue

        op_fys = sorted(
            {
                effective_fy_by_op.get(op.name, "")
                for op in grp_ops
                if effective_fy_by_op.get(op.name, "")
            }
        )
        has_blocked_ops = any(cint(op.get("is_blocked_operation")) for op in grp_ops)
        if has_blocked_ops and len(grp_ops) > 1:
            blocked_multi_op_groups.append(
                {
                    "group": g.name,
                    "operations": [op.name for op in grp_ops],
                    "fiscal_years": op_fys,
                }
            )

        if len(op_fys) == 1:
            target_fy = op_fys[0]
            # تحقق من عدم وجود تعارض مع مستندات تنتمي لعملية مصدر من سنة أخرى
            for d in grp_docs:
                src_op_name = cstr(d.get("source_operation")).strip()
                src_fy = effective_fy_by_op.get(src_op_name, "") if src_op_name else ""
                if src_fy and src_fy != target_fy:
                    ambiguous_documents.append(
                        {
                            "document": d.name,
                            "group": g.name,
                            "group_fiscal_year": target_fy,
                            "source_operation": src_op_name,
                            "source_fiscal_year": src_fy,
                            "reason": "المستند مرتبط بمجموعة أحادية السنة لكن عمليته المصدر تنتمي لسنة مالية مختلفة.",
                        }
                    )

            single_year_groups.append(
                {
                    "group": g.name,
                    "fiscal_year": target_fy,
                    "existing_group_fiscal_year": grp_fy or None,
                    "operation_no_normalized": grp_norm or None,
                    "operations_count": len(grp_ops),
                    "documents_count": len(grp_docs),
                }
            )
        elif len(op_fys) > 1:
            resolvable_docs = []
            unresolvable_docs = []
            for d in grp_docs:
                src_op_name = cstr(d.get("source_operation")).strip()
                src_op = ops_by_name.get(src_op_name) if src_op_name else None
                src_fy = effective_fy_by_op.get(src_op_name, "") if src_op else ""
                src_norm = (
                    normalize_operation_no(src_op.get("operation_no"))
                    if src_op and not cint(src_op.get("is_blocked_operation"))
                    else None
                )
                if not src_op or not src_fy or src_fy not in op_fys:
                    unresolvable_docs.append(d.name)
                    ambiguous_documents.append(
                        {
                            "document": d.name,
                            "group": g.name,
                            "source_operation": src_op_name or None,
                            "reason": "مستند داخل مجموعة مختلطة بين السنوات لا يملك عملية مصدر واضحة تنتمي لإحدى سنوات المجموعة.",
                        }
                    )
                elif grp_norm and src_norm and src_norm != grp_norm:
                    # العملية المصدر انتقلت إلى رقم آخر؛ لا نفترض خطأها ولكن داخل مجموعة مختلطة بين السنوات
                    # يجب التأكد من أن السنة المالية للعملية المصدر واضحة وموجودة ضمن سنوات المجموعة
                    resolvable_docs.append(
                        {
                            "document": d.name,
                            "target_fiscal_year": src_fy,
                            "source_operation": src_op_name,
                        }
                    )
                else:
                    resolvable_docs.append(
                        {
                            "document": d.name,
                            "target_fiscal_year": src_fy,
                            "source_operation": src_op_name,
                        }
                    )

            mixed_year_groups.append(
                {
                    "group": g.name,
                    "operation_no_normalized": grp_norm or None,
                    "fiscal_years": op_fys,
                    "operations": [op.name for op in grp_ops],
                    "documents_count": len(grp_docs),
                    "resolvable_documents": resolvable_docs,
                    "unresolvable_documents": unresolvable_docs,
                }
            )

    # فحص مفاتيح التفرد التي تحتاج إعادة بناء أو تتعارض مع الصيغة الجديدة
    uniqueness_key_issues: list[dict[str, Any]] = []
    ops_by_fy_norm: dict[tuple[str, str], list[Any]] = defaultdict(list)
    for op in operations:
        if cint(op.get("is_blocked_operation")):
            if op.get("operation_no_uniqueness_key"):
                uniqueness_key_issues.append(
                    {
                        "operation": op.name,
                        "issue": "blocked_operation_has_uniqueness_key",
                    }
                )
            continue
        fy = effective_fy_by_op.get(op.name, "")
        norm_no = normalize_operation_no(op.get("operation_no"))
        if fy and norm_no:
            ops_by_fy_norm[(fy, norm_no)].append(op)

    for (fy, norm_no), bucket in ops_by_fy_norm.items():
        expected_digest = make_operation_no_hash(norm_no, fy)
        expected_primary_key = f"N:{expected_digest}"
        primaries = [
            op for op in bucket if not cint(op.get("allow_duplicate_operation_no"))
        ]
        if len(primaries) != 1:
            uniqueness_key_issues.append(
                {
                    "fiscal_year": fy,
                    "operation_no_normalized": norm_no,
                    "operations": [op.name for op in bucket],
                    "primary_count": len(primaries),
                    "issue": "invalid_primary_count_for_fiscal_year_number",
                }
            )
        for op in bucket:
            current_key = cstr(op.get("operation_no_uniqueness_key")).strip()
            if not cint(op.get("allow_duplicate_operation_no")):
                if current_key != expected_primary_key:
                    uniqueness_key_issues.append(
                        {
                            "operation": op.name,
                            "fiscal_year": fy,
                            "operation_no_normalized": norm_no,
                            "issue": "primary_key_needs_fiscal_year_hash_rebuild",
                        }
                    )
            else:
                if not current_key.startswith(f"D:{expected_digest}:"):
                    uniqueness_key_issues.append(
                        {
                            "operation": op.name,
                            "fiscal_year": fy,
                            "operation_no_normalized": norm_no,
                            "issue": "duplicate_key_needs_fiscal_year_hash_rebuild",
                        }
                    )

    # فحص الفهارس الحالية على Archive Operation Group و Archive Operation
    group_indexes = frappe.db.sql(
        """
        SELECT INDEX_NAME AS key_name, NON_UNIQUE AS non_unique, COLUMN_NAME AS column_name, SEQ_IN_INDEX AS seq
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabArchive Operation Group'
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
        """,
        as_dict=True,
    )
    has_composite_unique_index = any(
        r.get("key_name") == COMPOSITE_INDEX_NAME and cint(r.get("non_unique")) == 0
        for r in group_indexes
    )
    legacy_single_unique_indexes = sorted(
        {
            r.get("key_name")
            for r in group_indexes
            if cint(r.get("non_unique")) == 0
            and r.get("key_name") not in ("PRIMARY", COMPOSITE_INDEX_NAME)
            and r.get("column_name") == "operation_no_normalized"
        }
    )

    blocking_reasons: list[dict[str, Any]] = []
    if not default_fy_valid:
        blocking_reasons.append(
            {
                "type": "invalid_or_missing_default_fiscal_year",
                "default_fiscal_year": default_fy or None,
                "reason": "السنة المالية الافتراضية في إعدادات الأرشيف (Archive Settings.default_fiscal_year) غير محددة أو لا تشير إلى سجل موجود في Archive Fiscal Year.",
            }
        )
    if invalid_fiscal_year_operations:
        blocking_reasons.append(
            {
                "type": "invalid_fiscal_year_operations",
                "records": invalid_fiscal_year_operations,
            }
        )
    if invalid_fiscal_year_groups:
        blocking_reasons.append(
            {
                "type": "invalid_fiscal_year_groups",
                "records": invalid_fiscal_year_groups,
            }
        )
    if invalid_numbered_operations:
        blocking_reasons.append(
            {
                "type": "invalid_numbered_operations",
                "records": invalid_numbered_operations,
            }
        )
    if dangling_group_documents:
        blocking_reasons.append(
            {
                "type": "dangling_group_documents",
                "records": dangling_group_documents,
            }
        )
    if ambiguous_documents:
        blocking_reasons.append(
            {
                "type": "ambiguous_documents",
                "records": ambiguous_documents,
            }
        )

    # فحص ما إذا كان نقل مستندات مجموعة مختلطة سيؤدي إلى تصادم في invoice داخل نفس السنة والرقم
    for mixed in mixed_year_groups:
        grp_name = mixed["group"]
        grp_norm = mixed["operation_no_normalized"]
        if not grp_norm:
            continue
        docs_per_fy: dict[str, list[Any]] = defaultdict(list)
        for doc_info in mixed["resolvable_documents"]:
            doc_obj = next(
                (d for d in docs_by_group[grp_name] if d.name == doc_info["document"]),
                None,
            )
            if doc_obj:
                docs_per_fy[doc_info["target_fiscal_year"]].append(doc_obj)

        for target_fy, moving_docs in docs_per_fy.items():
            # هل توجد مجموعة أخرى لنفس (target_fy, grp_norm) تملك مستندات قد تتصادم؟
            other_groups = [
                g.name
                for g in groups
                if g.name != grp_name
                and normalize_operation_no(
                    g.get("operation_no_normalized") or g.get("operation_no")
                )
                == grp_norm
                and (
                    cstr(g.get("fiscal_year")).strip() == target_fy
                    or {
                        effective_fy_by_op.get(op.name, "")
                        for op in ops_by_group.get(g.name, [])
                    }
                    == {target_fy}
                )
            ]
            existing_target_docs = []
            for og in other_groups:
                existing_target_docs.extend(docs_by_group.get(og, []))

            invoice_count = sum(
                1
                for d in (existing_target_docs + moving_docs)
                if cstr(d.get("document_role")).strip() == "invoice"
            )
            if invoice_count > 1:
                blocking_reasons.append(
                    {
                        "type": "conflicting_invoice_documents_on_merge",
                        "group": grp_name,
                        "fiscal_year": target_fy,
                        "operation_no_normalized": grp_norm,
                        "documents": [
                            d.name
                            for d in (existing_target_docs + moving_docs)
                            if cstr(d.get("document_role")).strip() == "invoice"
                        ],
                    }
                )

    return {
        "counts": {
            "operations": len(operations),
            "groups": len(groups),
            "documents": len(documents),
            "files": files_count,
        },
        "default_fiscal_year": default_fy or None,
        "default_fiscal_year_valid": default_fy_valid,
        "operations_with_fiscal_year_count": operations_with_fiscal_year_count,
        "operations_without_fiscal_year_count": len(missing_fiscal_year_operations),
        "operations_assigned_default_fiscal_year_count": len(
            operations_assigned_default_fiscal_year
        ),
        "operations_assigned_default_fiscal_year": operations_assigned_default_fiscal_year,
        "invalid_fiscal_year_records_count": len(invalid_fiscal_year_operations)
        + len(invalid_fiscal_year_groups),
        "fiscal_years": fiscal_years_present,
        "single_year_groups": single_year_groups,
        "mixed_year_groups": mixed_year_groups,
        "ungrouped_operations": ungrouped_operations,
        "dangling_group_operations": dangling_group_operations,
        "orphan_groups": orphan_groups,
        "ambiguous_documents": ambiguous_documents,
        "missing_fiscal_year_operations": missing_fiscal_year_operations,
        "invalid_fiscal_year_operations": invalid_fiscal_year_operations,
        "invalid_fiscal_year_groups": invalid_fiscal_year_groups,
        "invalid_numbered_operations": invalid_numbered_operations,
        "blocked_multi_op_groups": blocked_multi_op_groups,
        "uniqueness_key_issues_count": len(uniqueness_key_issues),
        "uniqueness_key_issues": uniqueness_key_issues,
        "indexes": {
            "has_composite_unique_index": has_composite_unique_index,
            "legacy_single_unique_indexes": legacy_single_unique_indexes,
        },
        "can_proceed_safely": len(blocking_reasons) == 0,
        "blocking_reasons": blocking_reasons,
    }


def _ensure_schema_columns_ready() -> None:
    """
    التأكد من وجود حقل fiscal_year في جدول Archive Operation Group قبل الترحيل،
    وإسقاط الفهرس الفريد الأحادي القديم عند الحاجة لتمكين فصل المجموعات المختلطة بأمان.
    """
    if not frappe.db.has_column("Archive Operation Group", "fiscal_year"):
        frappe.reload_doc("archive", "doctype", "archive_operation_group")


def _drop_legacy_single_unique_index_if_present() -> None:
    """
    إذا كان الفهرس الأحادي القديم على operation_no_normalized موجوداً،
    فإنه يمنع إنشاء مجموعة ثانية لنفس الرقم في سنة مالية أخرى أثناء فصل المجموعات المختلطة.
    لذلك ننشئ الفهرس المركب أولاً ثم نسقط الفهرس الأحادي القديم.
    """
    has_composite = frappe.db.sql(
        """
        SHOW INDEX FROM `tabArchive Operation Group`
        WHERE Key_name = %s
        """,
        (COMPOSITE_INDEX_NAME,),
    )
    if not has_composite:
        # تصفير الفارغ إلى NULL قبل إنشاء الفهرس المركب
        frappe.db.sql(
            """
            UPDATE `tabArchive Operation Group`
            SET `operation_no_normalized` = NULL
            WHERE `operation_no_normalized` = ''
            """
        )
        # فحص عدم وجود تعارض حالي يمنع إنشاء الفهرس المركب
        conflicts = frappe.db.sql(
            """
            SELECT `fiscal_year`, `operation_no_normalized`, COUNT(*) AS `cnt`
            FROM `tabArchive Operation Group`
            WHERE `fiscal_year` IS NOT NULL
              AND `fiscal_year` != ''
              AND `operation_no_normalized` IS NOT NULL
            GROUP BY `fiscal_year`, `operation_no_normalized`
            HAVING `cnt` > 1
            LIMIT 1
            """,
            as_dict=True,
        )
        if not conflicts:
            frappe.db.sql_ddl(
                f"""
                ALTER TABLE `tabArchive Operation Group`
                ADD UNIQUE INDEX `{COMPOSITE_INDEX_NAME}` (`fiscal_year`, `operation_no_normalized`)
                """
            )

    has_composite_now = frappe.db.sql(
        """
        SHOW INDEX FROM `tabArchive Operation Group`
        WHERE Key_name = %s
        """,
        (COMPOSITE_INDEX_NAME,),
    )
    if has_composite_now:
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
            (COMPOSITE_INDEX_NAME,),
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


def _insert_new_operation_group_row(
    *,
    fiscal_year: str,
    operation_no: str | None,
    operation_no_normalized: str | None,
    is_incomplete_invoice: int = 0,
) -> str:
    group = frappe.new_doc("Archive Operation Group")
    group.fiscal_year = cstr(fiscal_year).strip()
    group.operation_no = cstr(operation_no).strip() or None
    group.operation_no_normalized = cstr(operation_no_normalized).strip() or None
    group.is_incomplete_invoice = 1 if cint(is_incomplete_invoice) else 0
    group.insert(ignore_permissions=True)
    return group.name


def _move_document_to_group_safely(doc_row: Any, target_group: str) -> None:
    role = cstr(doc_row.get("document_role")).strip()
    content_hash = cstr(doc_row.get("content_hash")).strip()
    if role == "invoice":
        new_key = f"invoice:{target_group}"
    else:
        new_key = f"attachment:{target_group}:{content_hash}"

    existing_same_key = frappe.db.get_value(
        "Archive Operation Document",
        {
            "uniqueness_key": new_key,
            "name": ["!=", doc_row.name],
        },
        "name",
    )
    if existing_same_key:
        frappe.throw(
            _(
                "تعارض في مفتاح تفرد المستند المشترك {0} عند نقله إلى المجموعة {1} (يتعارض مع {2})."
            ).format(doc_row.name, target_group, existing_same_key)
        )

    frappe.db.set_value(
        "Archive Operation Document",
        doc_row.name,
        {
            "operation_group": target_group,
            "uniqueness_key": new_key,
        },
        update_modified=False,
    )


def run_migration(dry_run: bool = False) -> dict[str, Any]:
    """
    تنفيذ الترحيل الكامل أو فحص dry-run بدون تعديل البيانات.
    """
    if not dry_run:
        _ensure_schema_columns_ready()

    # قراءة السنة الافتراضية من إعدادات الأرشيف مرة واحدة في بداية الترحيل
    default_fy = _get_archive_default_fiscal_year()

    preflight = inspect_preflight(default_fiscal_year=default_fy)
    if not preflight["can_proceed_safely"]:
        frappe.throw(
            _(
                "تم إيقاف ترحيل مجموعات وأرقام العمليات قبل أي تعديل لوجود حالات غير حتمية تتطلب معالجة صريحة: {0}"
            ).format(frappe.as_json(preflight["blocking_reasons"]))
        )

    if dry_run:
        return {
            "dry_run": True,
            "preflight": preflight,
            "post_validation": None,
        }

    # 1. تجهيز الفهرس المركب وإزالة الفهرس الأحادي القديم لتمكين فصل المجموعات المختلطة
    _drop_legacy_single_unique_index_if_present()

    # 2. قراءة السجلات الحالية للعمل عليها بترتيب زمني حتمي
    groups = frappe.get_all(
        "Archive Operation Group",
        fields=[
            "name",
            "fiscal_year",
            "operation_no",
            "operation_no_normalized",
            "is_incomplete_invoice",
            "creation",
        ],
        order_by="creation asc, name asc",
        limit_page_length=0,
    )
    groups_by_name = {g.name: g for g in groups}

    operations = frappe.get_all(
        "Archive Operation",
        fields=[
            "name",
            "fiscal_year",
            "operation_no",
            "operation_no_normalized",
            "operation_no_uniqueness_key",
            "allow_duplicate_operation_no",
            "is_blocked_operation",
            "is_incomplete_invoice",
            "operation_group",
            "creation",
        ],
        order_by="creation asc, name asc",
        limit_page_length=0,
    )
    for op in operations:
        recorded_fy = cstr(op.get("fiscal_year")).strip()
        if not recorded_fy:
            frappe.db.set_value(
                "Archive Operation",
                op.name,
                "fiscal_year",
                default_fy,
                update_modified=False,
            )
            op["fiscal_year"] = default_fy

    ops_by_name = {op.name: op for op in operations}

    documents = frappe.get_all(
        "Archive Operation Document",
        fields=[
            "name",
            "operation_group",
            "source_operation",
            "document_role",
            "content_hash",
            "uniqueness_key",
            "creation",
        ],
        order_by="creation asc, name asc",
        limit_page_length=0,
    )

    ops_by_group: dict[str, list[Any]] = defaultdict(list)
    for op in operations:
        grp_name = cstr(op.get("operation_group")).strip()
        if grp_name and grp_name in groups_by_name:
            ops_by_group[grp_name].append(op)

    docs_by_group: dict[str, list[Any]] = defaultdict(list)
    for doc in documents:
        grp_name = cstr(doc.get("operation_group")).strip()
        if grp_name and grp_name in groups_by_name:
            docs_by_group[grp_name].append(doc)

    # خريطة المجموعات المرقمة المعتمدة حسب (fiscal_year, operation_no_normalized)
    numbered_group_registry: dict[tuple[str, str], str] = {}

    # 3. معالجة المجموعات القائمة (اليتيمة، أحادية السنة، المختلطة بين السنوات، المحظورة)
    for g in groups:
        grp_ops = ops_by_group.get(g.name, [])
        grp_docs = docs_by_group.get(g.name, [])
        grp_fy = cstr(g.get("fiscal_year")).strip()
        grp_raw_no = cstr(g.get("operation_no")).strip()
        grp_norm = normalize_operation_no(
            g.get("operation_no_normalized") or grp_raw_no
        )

        if not grp_ops:
            # مجموعة يتيمة: نحافظ عليها دون حذف، ونحدد سنتها إن كانت معروفة أو من مستنداتها أو من الرقم
            target_fy = grp_fy
            if not target_fy and grp_docs:
                doc_fys = {
                    cstr(ops_by_name[cstr(d.get("source_operation")).strip()].get("fiscal_year")).strip()
                    for d in grp_docs
                    if cstr(d.get("source_operation")).strip() in ops_by_name
                }
                if len(doc_fys) == 1:
                    target_fy = next(iter(doc_fys))

            if target_fy and grp_norm:
                key = (target_fy, grp_norm)
                if key not in numbered_group_registry:
                    numbered_group_registry[key] = g.name
                    frappe.db.set_value(
                        "Archive Operation Group",
                        g.name,
                        {
                            "fiscal_year": target_fy,
                            "operation_no": grp_raw_no or grp_norm,
                            "operation_no_normalized": grp_norm,
                        },
                        update_modified=False,
                    )
                else:
                    # يوجد بالفعل مجموعة لهذا (target_fy, grp_norm): ننقل مستندات اليتيمة إن وجدت ونفرغ رقم اليتيمة لمنع تعارض الفهرس دون حذف السجل
                    canonical_grp = numbered_group_registry[key]
                    for d in grp_docs:
                        _move_document_to_group_safely(d, canonical_grp)
                    frappe.db.set_value(
                        "Archive Operation Group",
                        g.name,
                        {
                            "fiscal_year": target_fy,
                            "operation_no": None,
                            "operation_no_normalized": None,
                        },
                        update_modified=False,
                    )
            else:
                # مجموعة يتيمة بلا عمليات ولا رقم يتعارض: نعتمد سنتها المسجلة أو السنة الافتراضية للأرشيف فقط
                fallback_fy = target_fy or default_fy
                if grp_norm and (fallback_fy, grp_norm) not in numbered_group_registry:
                    numbered_group_registry[(fallback_fy, grp_norm)] = g.name
                    frappe.db.set_value(
                        "Archive Operation Group",
                        g.name,
                        {
                            "fiscal_year": fallback_fy,
                            "operation_no": grp_raw_no or grp_norm,
                            "operation_no_normalized": grp_norm,
                        },
                        update_modified=False,
                    )
                else:
                    frappe.db.set_value(
                        "Archive Operation Group",
                        g.name,
                        {
                            "fiscal_year": fallback_fy,
                            "operation_no": None,
                            "operation_no_normalized": None,
                        },
                        update_modified=False,
                    )
            continue

        # التحقق مما إذا كانت المجموعة تحتوي عمليات محظورة
        all_blocked = all(cint(op.get("is_blocked_operation")) for op in grp_ops)
        if all_blocked:
            # العمليات المحظورة: كل عملية محضورة يجب أن تملك مجموعة مستقلة بسنتها المالية وبدون رقم
            first_op = grp_ops[0]
            first_fy = cstr(first_op.get("fiscal_year")).strip()
            frappe.db.set_value(
                "Archive Operation Group",
                g.name,
                {
                    "fiscal_year": first_fy,
                    "operation_no": None,
                    "operation_no_normalized": None,
                },
                update_modified=False,
            )
            for extra_op in grp_ops[1:]:
                extra_fy = cstr(extra_op.get("fiscal_year")).strip()
                new_blk_grp = _insert_new_operation_group_row(
                    fiscal_year=extra_fy,
                    operation_no=None,
                    operation_no_normalized=None,
                    is_incomplete_invoice=cint(extra_op.get("is_incomplete_invoice")),
                )
                frappe.db.set_value(
                    "Archive Operation",
                    extra_op.name,
                    "operation_group",
                    new_blk_grp,
                    update_modified=False,
                )
                extra_op["operation_group"] = new_blk_grp
                for d in grp_docs:
                    if cstr(d.get("source_operation")).strip() == extra_op.name:
                        _move_document_to_group_safely(d, new_blk_grp)
            continue

        # مجموعة مرقمة: نقسم عملياتها حسب (fiscal_year, normalized)
        ops_by_fy_bucket: dict[tuple[str, str], list[Any]] = defaultdict(list)
        for op in grp_ops:
            op_fy = cstr(op.get("fiscal_year")).strip()
            op_norm = normalize_operation_no(op.get("operation_no"))
            ops_by_fy_bucket[(op_fy, op_norm)].append(op)

        sorted_bucket_keys = sorted(
            ops_by_fy_bucket.keys(),
            key=lambda k: (
                0 if grp_fy and k[0] == grp_fy else 1,
                ops_by_fy_bucket[k][0].get("creation"),
                ops_by_fy_bucket[k][0].get("name"),
            ),
        )

        reused_original_group = False
        target_group_by_fy: dict[str, str] = {}

        for bucket_fy, bucket_norm in sorted_bucket_keys:
            bucket_ops = ops_by_fy_bucket[(bucket_fy, bucket_norm)]
            key = (bucket_fy, bucket_norm)
            rep_op_no = cstr(bucket_ops[0].get("operation_no")).strip() or grp_raw_no or bucket_norm
            incomplete_flag = (
                1
                if cint(g.get("is_incomplete_invoice"))
                or any(cint(o.get("is_incomplete_invoice")) for o in bucket_ops)
                else 0
            )

            if key in numbered_group_registry:
                target_grp_name = numbered_group_registry[key]
            elif not reused_original_group:
                reused_original_group = True
                target_grp_name = g.name
                numbered_group_registry[key] = target_grp_name
                frappe.db.set_value(
                    "Archive Operation Group",
                    target_grp_name,
                    {
                        "fiscal_year": bucket_fy,
                        "operation_no": rep_op_no,
                        "operation_no_normalized": bucket_norm,
                        "is_incomplete_invoice": incomplete_flag,
                    },
                    update_modified=False,
                )
            else:
                target_grp_name = _insert_new_operation_group_row(
                    fiscal_year=bucket_fy,
                    operation_no=rep_op_no,
                    operation_no_normalized=bucket_norm,
                    is_incomplete_invoice=incomplete_flag,
                )
                numbered_group_registry[key] = target_grp_name

            target_group_by_fy[bucket_fy] = target_grp_name

            for op in bucket_ops:
                if cstr(op.get("operation_group")).strip() != target_grp_name:
                    frappe.db.set_value(
                        "Archive Operation",
                        op.name,
                        "operation_group",
                        target_grp_name,
                        update_modified=False,
                    )
                    op["operation_group"] = target_grp_name

        # إذا لم يُعد استخدام المجموعة الأصلية (لأن جميع مفاتيحها كانت مسجلة مسبقاً في مجموعات أخرى)
        if not reused_original_group:
            fallback_fy = sorted_bucket_keys[0][0]
            frappe.db.set_value(
                "Archive Operation Group",
                g.name,
                {
                    "fiscal_year": fallback_fy,
                    "operation_no": None,
                    "operation_no_normalized": None,
                },
                update_modified=False,
            )

        # توزيع المستندات المشتركة للمجموعة (في حال انتقال المجموعة أو فصل مجموعة مختلطة)
        for d in grp_docs:
            if len(target_group_by_fy) == 1:
                only_target_grp = next(iter(target_group_by_fy.values()))
                if cstr(d.get("operation_group")).strip() != only_target_grp:
                    _move_document_to_group_safely(d, only_target_grp)
            else:
                src_op_name = cstr(d.get("source_operation")).strip()
                src_op = ops_by_name.get(src_op_name)
                src_fy = cstr(src_op.get("fiscal_year")).strip() if src_op else ""
                dest_grp = target_group_by_fy.get(src_fy)
                if not dest_grp:
                    frappe.throw(
                        _(
                            "تعذر تحديد المجموعة الهدف للمستند {0} أثناء فصل المجموعة المختلطة {1}."
                        ).format(d.name, g.name)
                    )
                if cstr(d.get("operation_group")).strip() != dest_grp:
                    _move_document_to_group_safely(d, dest_grp)

    # 4. ربط العمليات التي لا تملك مجموعة أو ترتبط بمجموعة غير موجودة
    for op in operations:
        grp_name = cstr(op.get("operation_group")).strip()
        if grp_name and frappe.db.exists("Archive Operation Group", grp_name):
            continue

        op_fy = cstr(op.get("fiscal_year")).strip()
        blocked = bool(cint(op.get("is_blocked_operation")))
        if blocked:
            new_blk_grp = _insert_new_operation_group_row(
                fiscal_year=op_fy,
                operation_no=None,
                operation_no_normalized=None,
                is_incomplete_invoice=cint(op.get("is_incomplete_invoice")),
            )
            frappe.db.set_value(
                "Archive Operation",
                op.name,
                "operation_group",
                new_blk_grp,
                update_modified=False,
            )
            op["operation_group"] = new_blk_grp
        else:
            op_raw_no = cstr(op.get("operation_no")).strip()
            op_norm = normalize_operation_no(op_raw_no)
            key = (op_fy, op_norm)
            target_grp_name = numbered_group_registry.get(key)
            if not target_grp_name:
                existing_grp = frappe.db.get_value(
                    "Archive Operation Group",
                    {
                        "fiscal_year": op_fy,
                        "operation_no_normalized": op_norm,
                    },
                    "name",
                )
                if existing_grp:
                    target_grp_name = existing_grp
                else:
                    target_grp_name = _insert_new_operation_group_row(
                        fiscal_year=op_fy,
                        operation_no=op_raw_no,
                        operation_no_normalized=op_norm,
                        is_incomplete_invoice=cint(op.get("is_incomplete_invoice")),
                    )
                numbered_group_registry[key] = target_grp_name

            frappe.db.set_value(
                "Archive Operation",
                op.name,
                "operation_group",
                target_grp_name,
                update_modified=False,
            )
            op["operation_group"] = target_grp_name

    # 5. إعادة بناء operation_no_uniqueness_key و allow_duplicate_operation_no على مرحلتين لمنع أي تصادم مؤقت
    refreshed_ops = frappe.get_all(
        "Archive Operation",
        fields=[
            "name",
            "fiscal_year",
            "operation_no",
            "operation_no_normalized",
            "operation_no_uniqueness_key",
            "allow_duplicate_operation_no",
            "is_blocked_operation",
            "operation_group",
            "creation",
        ],
        order_by="creation asc, name asc",
        limit_page_length=0,
    )

    ops_by_fy_norm: dict[tuple[str, str], list[Any]] = defaultdict(list)

    # المرحلة 5-أ: تصفير المحظورة ووضع مفاتيح مؤقتة MIG:<name> للسجلات التي ستتغير مفاتيحها
    for op in refreshed_ops:
        if cint(op.get("is_blocked_operation")):
            if (
                op.get("operation_no") is not None
                or op.get("operation_no_normalized") is not None
                or op.get("operation_no_uniqueness_key") is not None
                or cint(op.get("allow_duplicate_operation_no")) != 0
            ):
                frappe.db.set_value(
                    "Archive Operation",
                    op.name,
                    {
                        "operation_no": None,
                        "operation_no_normalized": None,
                        "operation_no_uniqueness_key": None,
                        "allow_duplicate_operation_no": 0,
                    },
                    update_modified=False,
                )
            continue

        op_fy = cstr(op.get("fiscal_year")).strip()
        op_norm = normalize_operation_no(op.get("operation_no"))
        ops_by_fy_norm[(op_fy, op_norm)].append(op)

    # تحديد الخطة النهائية لكل (fiscal_year, operation_no_normalized) مع احترام العملية الأساسية الحالية
    planned_op_updates: list[tuple[str, dict[str, Any]]] = []
    for (op_fy, op_norm), bucket in ops_by_fy_norm.items():
        digest = make_operation_no_hash(op_norm, op_fy)
        expected_primary_key = f"N:{digest}"

        # نحترم السجل المصنف حالياً كأساسي (allow_duplicate_operation_no == 0) إذا كان وحيداً؛
        # وإذا لم يوجد أو وجد أكثر من واحد بسبب فصل السنوات، نختار أول سجل أساسي أو أقدم سجل في هذه السنة.
        explicit_primaries = [
            o for o in bucket if cint(o.get("allow_duplicate_operation_no")) == 0
        ]
        if len(explicit_primaries) == 1:
            primary_op = explicit_primaries[0]
        elif len(explicit_primaries) > 1:
            # نفضل السجل الذي يحمل بالفعل مفتاح N: إن وجد، وإلا الأقدم بين الأساسيين
            n_key_primaries = [
                o
                for o in explicit_primaries
                if cstr(o.get("operation_no_uniqueness_key")).strip().startswith("N:")
            ]
            primary_op = (
                n_key_primaries[0] if n_key_primaries else explicit_primaries[0]
            )
        else:
            primary_op = bucket[0]

        for o in bucket:
            if o.name == primary_op.name:
                target_allow_dup = 0
                target_key = expected_primary_key
            else:
                target_allow_dup = 1
                curr_key = cstr(o.get("operation_no_uniqueness_key")).strip()
                if curr_key.startswith(f"D:{digest}:"):
                    target_key = curr_key
                else:
                    target_key = f"D:{digest}:{o.name}"

            if (
                cstr(o.get("operation_no_normalized")).strip() != op_norm
                or cint(o.get("allow_duplicate_operation_no")) != target_allow_dup
                or cstr(o.get("operation_no_uniqueness_key")).strip() != target_key
            ):
                planned_op_updates.append(
                    (
                        o.name,
                        {
                            "operation_no_normalized": op_norm,
                            "allow_duplicate_operation_no": target_allow_dup,
                            "operation_no_uniqueness_key": target_key,
                        },
                    )
                )

    # وضع مفاتيح مؤقتة أولاً لمنع التصادم أثناء التحديث
    for op_name, _update_vals in planned_op_updates:
        frappe.db.set_value(
            "Archive Operation",
            op_name,
            "operation_no_uniqueness_key",
            f"MIG:{op_name}",
            update_modified=False,
        )

    for op_name, update_vals in planned_op_updates:
        frappe.db.set_value(
            "Archive Operation",
            op_name,
            update_vals,
            update_modified=False,
        )

    # 6. تثبيت الفهرس المركب الفريد وإزالة أي فهرس فريد أحادي قديم متبقٍ
    ensure_operation_group_indexes()

    # 7. التحقق النهائي بعد الترحيل
    post_validation = inspect_preflight(default_fiscal_year=default_fy)
    if (
        not post_validation["can_proceed_safely"]
        or post_validation["operations_without_fiscal_year_count"] > 0
        or post_validation["mixed_year_groups"]
        or post_validation["ungrouped_operations"]
        or post_validation["dangling_group_operations"]
        or post_validation["uniqueness_key_issues_count"] > 0
        or not post_validation["indexes"]["has_composite_unique_index"]
        or post_validation["indexes"]["legacy_single_unique_indexes"]
    ):
        frappe.throw(
            _(
                "فشل التحقق بعد الترحيل: {0}"
            ).format(
                frappe.as_json(
                    {
                        "mixed_year_groups": post_validation["mixed_year_groups"],
                        "ungrouped_operations": post_validation["ungrouped_operations"],
                        "uniqueness_key_issues": post_validation["uniqueness_key_issues"],
                        "indexes": post_validation["indexes"],
                    }
                )
            )
        )

    return {
        "dry_run": False,
        "preflight": preflight,
        "post_validation": post_validation,
    }


def execute() -> None:
    run_migration(dry_run=False)
