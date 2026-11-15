# Copyright (c) 2026, Ayham-shmsan and Contributors
# See license.txt

from __future__ import annotations

from unittest.mock import patch

import frappe
from frappe.tests import UnitTestCase
from frappe.utils import cint, cstr

from archive.api.operation_documents import (
    get_operation_number_context,
    get_operation_number_suggestions,
    lookup_operation_numbers,
)
from archive.api.operations import (
    _build_operation_number_change_plan,
    change_operation_number,
    create_operation,
    get_operations_context,
    save_operation_view_changes,
)
from archive.archive.doctype.archive_operation.archive_operation import (
    make_operation_no_hash,
)
from archive.archive.doctype.archive_operation_group.archive_operation_group import (
    ensure_operation_group_indexes,
)
from archive.patches.v1_0.migrate_operations_to_fiscal_year_groups import (
    COMPOSITE_INDEX_NAME,
    inspect_preflight,
    run_migration,
)

EXTRA_TEST_RECORD_DEPENDENCIES = []
IGNORE_TEST_RECORD_DEPENDENCIES = ["Archive Operation", "User", "Country", "Currency"]


class TestArchiveOperation(UnitTestCase):
    """
    Tests for ArchiveOperation fiscal-year-scoped operation numbers and groups.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.set_user("Administrator")
        cls._orig_fy_states = {}
        cls._class_perms = []
        for year in ("2025", "2026", "2027"):
            cls._ensure_test_fiscal_year(year)
            cls._ensure_admin_fy_perm(year)
        cls._cleanup_leftover_test_records()
        frappe.db.commit()

    @classmethod
    def tearDownClass(cls):
        frappe.set_user("Administrator")
        for perm_name in getattr(cls, "_class_perms", []):
            if frappe.db.exists("Archive User Fiscal Permission", perm_name):
                frappe.db.sql(
                    "DELETE FROM `tabArchive User Fiscal Permission` WHERE name = %s",
                    (perm_name,),
                )
        for year, state in getattr(cls, "_orig_fy_states", {}).items():
            if state is None:
                if (
                    frappe.db.exists("Archive Fiscal Year", year)
                    and frappe.db.count("Archive Operation", {"fiscal_year": year}) == 0
                ):
                    frappe.db.sql(
                        "DELETE FROM `tabArchive Fiscal Year` WHERE name = %s",
                        (year,),
                    )
            else:
                frappe.db.set_value(
                    "Archive Fiscal Year",
                    year,
                    state,
                    update_modified=False,
                )
        frappe.db.commit()
        super().tearDownClass()

    @classmethod
    def _cleanup_leftover_test_records(cls) -> None:
        leftover_ops = frappe.get_all(
            "Archive Operation",
            or_filters=[
                ["operation_no", "like", "T-%"],
                ["operation_no", "like", "t -%"],
                ["sender_name", "in", ["شركة اختبار", "شركة تزامن", "مرسل 2026", "مرسل 2025 جزء 2"]],
            ],
            fields=["name", "operation_group"],
        )
        groups = set()
        for row in leftover_ops:
            if row.operation_group:
                groups.add(row.operation_group)
            frappe.db.sql("DELETE FROM `tabArchive Operation` WHERE name = %s", (row.name,))
        for g in groups:
            if frappe.db.count("Archive Operation", {"operation_group": g}) == 0:
                frappe.db.sql("DELETE FROM `tabArchive Operation Document` WHERE operation_group = %s", (g,))
                frappe.db.sql("DELETE FROM `tabArchive Operation Group` WHERE name = %s", (g,))
        frappe.db.sql("DELETE FROM `tabArchive Operation Group` WHERE operation_no LIKE 'T-%' OR operation_no LIKE 't -%'")
        from archive.archive.doctype.archive_operation_group.archive_operation_group import (
            ensure_operation_group_indexes,
        )

        ensure_operation_group_indexes()
        frappe.db.sql(
            """
            UPDATE `tabArchive Operation Group`
            SET operation_no_normalized = operation_no
            WHERE operation_no_normalized LIKE '__TMP_DUP_%'
            """
        )

    @classmethod
    def _ensure_admin_fy_perm(cls, year: str) -> None:
        existing = frappe.db.get_value(
            "Archive User Fiscal Permission",
            {"parent_user": "Administrator", "fiscal_year": year},
            "name",
        )
        if not existing:
            p = frappe.get_doc(
                {
                    "doctype": "Archive User Fiscal Permission",
                    "parent_user": "Administrator",
                    "fiscal_year": year,
                    "can_view": 1,
                    "can_add": 1,
                    "can_edit": 1,
                    "can_delete": 1,
                    "can_export": 1,
                }
            ).insert(ignore_permissions=True)
            cls._class_perms.append(p.name)

    @classmethod
    def _ensure_test_fiscal_year(cls, year: str) -> None:
        if not frappe.db.exists("Archive Fiscal Year", year):
            cls._orig_fy_states[year] = None
            doc = frappe.new_doc("Archive Fiscal Year")
            doc.year_name = year
            doc.start_date = f"{year}-01-01"
            doc.end_date = f"{year}-12-31"
            doc.is_closed = 0
            doc.insert(ignore_permissions=True)
        else:
            current = frappe.db.get_value(
                "Archive Fiscal Year",
                year,
                ["is_closed"],
                as_dict=True,
            )
            cls._orig_fy_states[year] = current
            frappe.db.set_value(
                "Archive Fiscal Year",
                year,
                {"is_closed": 0},
                update_modified=False,
            )

    def setUp(self):
        super().setUp()
        frappe.set_user("Administrator")
        self._created_ops: list[str] = []
        self._created_groups: list[str] = []
        self._created_docs: list[str] = []
        self._created_files: list[str] = []
        self._created_users: list[str] = []
        self._created_perms: list[str] = []

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.flags.in_import = False
        for doc_name in reversed(self._created_docs):
            if frappe.db.exists("Archive Operation Document", doc_name):
                frappe.db.sql(
                    "DELETE FROM `tabArchive Operation Document` WHERE name = %s",
                    (doc_name,),
                )
        for op_name in reversed(self._created_ops):
            if frappe.db.exists("Archive Operation", op_name):
                op_group = frappe.db.get_value(
                    "Archive Operation", op_name, "operation_group"
                )
                if op_group and op_group not in self._created_groups:
                    self._created_groups.append(op_group)
                frappe.db.sql(
                    "DELETE FROM `tabArchive Operation` WHERE name = %s",
                    (op_name,),
                )
        for grp_name in reversed(self._created_groups):
            if frappe.db.exists("Archive Operation Group", grp_name):
                rem_ops = frappe.db.count(
                    "Archive Operation", {"operation_group": grp_name}
                )
                if rem_ops == 0:
                    frappe.db.sql(
                        "DELETE FROM `tabArchive Operation Document` WHERE operation_group = %s",
                        (grp_name,),
                    )
                    frappe.db.sql(
                        "DELETE FROM `tabArchive Operation Group` WHERE name = %s",
                        (grp_name,),
                    )
        for file_name in reversed(self._created_files):
            if frappe.db.exists("File", file_name):
                frappe.db.sql("DELETE FROM `tabFile` WHERE name = %s", (file_name,))
        for perm_name in reversed(self._created_perms):
            if frappe.db.exists("Archive User Fiscal Permission", perm_name):
                frappe.db.sql(
                    "DELETE FROM `tabArchive User Fiscal Permission` WHERE name = %s",
                    (perm_name,),
                )
        for user_name in reversed(self._created_users):
            if frappe.db.exists("User", user_name):
                frappe.delete_doc("User", user_name, ignore_permissions=True, force=True)
        super().tearDown()

    def _make_operation(
        self,
        *,
        fiscal_year: str,
        operation_no: str | None = None,
        allow_duplicate_operation_no: int = 0,
        is_blocked_operation: int = 0,
        is_incomplete_invoice: int = 0,
        request_date: str = "2026-01-15",
        sender_name: str = "شركة اختبار",
        beneficiary_name: str = "مستفيد اختبار",
        amount: float = 1000.0,
    ):
        doc = frappe.new_doc("Archive Operation")
        doc.fiscal_year = fiscal_year
        doc.is_blocked_operation = is_blocked_operation
        if not is_blocked_operation:
            doc.operation_no = operation_no
            doc.allow_duplicate_operation_no = allow_duplicate_operation_no
        doc.is_incomplete_invoice = is_incomplete_invoice
        doc.request_date = request_date
        doc.sender_name = sender_name
        doc.beneficiary_name = beneficiary_name
        doc.transfer_currency = "دولار"
        doc.amount = amount
        doc.equivalent_amount_usd = amount
        doc.customer_rate_currency = "سعودي"
        doc.customer_rate = "530"
        doc.insert(ignore_permissions=True)
        self._created_ops.append(doc.name)
        if doc.operation_group and doc.operation_group not in self._created_groups:
            self._created_groups.append(doc.operation_group)
        return doc

    def _make_shared_doc(
        self,
        *,
        operation,
        role: str = "shared_attachment",
        content: bytes = b"test-image-content",
        file_name: str = "test_doc.png",
    ):
        file_doc = frappe.get_doc(
            {
                "doctype": "File",
                "file_name": file_name,
                "is_private": 1,
                "content": content,
            }
        ).insert(ignore_permissions=True)
        self._created_files.append(file_doc.name)

        op_doc = frappe.new_doc("Archive Operation Document")
        op_doc.operation_group = operation.operation_group
        op_doc.source_operation = operation.name
        op_doc.document_role = role
        op_doc.file = file_doc.file_url
        op_doc.insert(ignore_permissions=True)
        self._created_docs.append(op_doc.name)
        return op_doc

    def test_01_to_06_core_fiscal_year_isolation_and_duplicates(self):
        op_2025 = self._make_operation(
            fiscal_year="2025",
            operation_no="T-7850",
            allow_duplicate_operation_no=0,
            request_date="2025-03-10",
            is_incomplete_invoice=1,
        )
        op_2026 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-7850",
            allow_duplicate_operation_no=0,
            request_date="2026-04-20",
            is_incomplete_invoice=0,
        )

        self.assertTrue(op_2025.operation_group)
        self.assertTrue(op_2026.operation_group)
        self.assertNotEqual(op_2025.operation_group, op_2026.operation_group)
        self.assertEqual(
            frappe.db.get_value(
                "Archive Operation Group", op_2025.operation_group, "fiscal_year"
            ),
            "2025",
        )
        self.assertEqual(
            frappe.db.get_value(
                "Archive Operation Group", op_2026.operation_group, "fiscal_year"
            ),
            "2026",
        )

        with self.assertRaises(frappe.ValidationError):
            self._make_operation(
                fiscal_year="2026",
                operation_no="T-7850",
                allow_duplicate_operation_no=0,
            )

        op_2026_part2 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-7850",
            allow_duplicate_operation_no=1,
        )
        self.assertEqual(op_2026_part2.operation_group, op_2026.operation_group)
        self.assertNotEqual(op_2026_part2.operation_group, op_2025.operation_group)

        with self.assertRaises(frappe.ValidationError):
            self._make_operation(
                fiscal_year="2026",
                operation_no="t - ٧٨٥٠",
                allow_duplicate_operation_no=0,
            )

        op_2027_norm = self._make_operation(
            fiscal_year="2027",
            operation_no="t - ٧٨٥٠",
            allow_duplicate_operation_no=0,
        )
        self.assertNotEqual(op_2027_norm.operation_group, op_2026.operation_group)
        self.assertNotEqual(op_2027_norm.operation_group, op_2025.operation_group)

    def test_07_to_10_inheritance_documents_and_lookup_isolation(self):
        op_2025 = self._make_operation(
            fiscal_year="2025",
            operation_no="T-8801",
            request_date="2025-02-01",
            is_incomplete_invoice=1,
        )
        doc_2025 = self._make_shared_doc(
            operation=op_2025,
            role="invoice",
            content=b"invoice-2025-8801",
            file_name="inv_2025.png",
        )

        res_2026 = create_operation(
            values={
                "fiscal_year": "2026",
                "operation_no": "T-8801",
                "allow_duplicate_operation_no": 0,
                "is_blocked_operation": 0,
                "is_incomplete_invoice": 0,
                "request_date": "2026-06-15",
                "sender_name": "مرسل 2026",
                "beneficiary_name": "مستفيد 2026",
                "transfer_currency": "دولار",
                "amount": 2500,
                "equivalent_amount_usd": 2500,
                "customer_rate_currency": "سعودي",
                "customer_rate": "535",
            }
        )
        op_2026_name = res_2026["name"]
        self._created_ops.append(op_2026_name)
        op_2026 = frappe.get_doc("Archive Operation", op_2026_name)
        self._created_groups.append(op_2026.operation_group)

        self.assertEqual(cstr(op_2026.request_date), "2026-06-15")
        self.assertEqual(cint(op_2026.is_incomplete_invoice), 0)
        self.assertEqual(cint(op_2026.allow_duplicate_operation_no), 0)
        self.assertNotEqual(op_2026.operation_group, op_2025.operation_group)

        res_2025_p2 = create_operation(
            values={
                "fiscal_year": "2025",
                "operation_no": "T-8801",
                "allow_duplicate_operation_no": 1,
                "is_blocked_operation": 0,
                "is_incomplete_invoice": 0,
                "request_date": "2025-11-11",
                "sender_name": "مرسل 2025 جزء 2",
                "beneficiary_name": "مستفيد 2025",
                "transfer_currency": "دولار",
                "amount": 500,
                "equivalent_amount_usd": 500,
                "customer_rate_currency": "سعودي",
                "customer_rate": "530",
            }
        )
        op_2025_p2_name = res_2025_p2["name"]
        self._created_ops.append(op_2025_p2_name)
        op_2025_p2 = frappe.get_doc("Archive Operation", op_2025_p2_name)
        self.assertEqual(cstr(op_2025_p2.request_date), "2025-02-01")
        self.assertEqual(cint(op_2025_p2.is_incomplete_invoice), 1)
        self.assertEqual(op_2025_p2.operation_group, op_2025.operation_group)

        lookup_2025 = lookup_operation_numbers(query="T-8801", fiscal_year="2025")
        lookup_2026 = lookup_operation_numbers(query="T-8801", fiscal_year="2026")
        lookup_2027 = lookup_operation_numbers(query="T-8801", fiscal_year="2027")

        self.assertEqual(lookup_2025["fiscal_year"], "2025")
        self.assertIsNotNone(lookup_2025["exact"])
        self.assertEqual(lookup_2025["exact"]["operation_group"], op_2025.operation_group)
        self.assertEqual(lookup_2025["exact"]["parts_count"], 2)
        self.assertEqual(lookup_2025["exact"]["documents_count"], 1)
        self.assertEqual(cstr(lookup_2025["exact"]["request_date"]), "2025-02-01")

        self.assertEqual(lookup_2026["fiscal_year"], "2026")
        self.assertIsNotNone(lookup_2026["exact"])
        self.assertEqual(lookup_2026["exact"]["operation_group"], op_2026.operation_group)
        self.assertEqual(lookup_2026["exact"]["parts_count"], 1)
        self.assertEqual(lookup_2026["exact"]["documents_count"], 0)
        self.assertEqual(cstr(lookup_2026["exact"]["request_date"]), "2026-06-15")

        self.assertIsNone(lookup_2027["exact"])
        self.assertEqual(lookup_2027["suggestions"], [])

        ctx_2025 = get_operation_number_context(operation_no="T-8801", fiscal_year="2025")
        ctx_2026 = get_operation_number_context(operation_no="T-8801", fiscal_year="2026")
        ctx_2027 = get_operation_number_context(operation_no="T-8801", fiscal_year="2027")
        self.assertTrue(ctx_2025["exists"])
        self.assertEqual(ctx_2025["documents_count"], 1)
        self.assertEqual(ctx_2025["documents"][0]["name"], doc_2025.name)
        self.assertTrue(ctx_2026["exists"])
        self.assertEqual(ctx_2026["documents_count"], 0)
        self.assertFalse(ctx_2027["exists"])

        sugg_2025 = get_operation_number_suggestions(query="T-8801", fiscal_year="2025")
        sugg_2027 = get_operation_number_suggestions(query="T-8801", fiscal_year="2027")
        self.assertEqual(len(sugg_2025), 1)
        self.assertEqual(sugg_2025[0]["operation_group"], op_2025.operation_group)
        self.assertEqual(len(sugg_2027), 0)

        for invalid_fy in ("all", "*", "جميع السنوات"):
            with self.assertRaises(frappe.ValidationError):
                lookup_operation_numbers(query="T-8801", fiscal_year=invalid_fy)

    def test_11_and_12_dialog_fiscal_year_switch_and_out_of_order_async_guard(self):
        import pathlib

        js_path = (
            pathlib.Path(frappe.get_app_path("archive"))
            / "public/js/archive_operations/operation_dialog.js"
        )
        js_code = js_path.read_text(encoding="utf-8")

        self.assertIn("build_operation_number_cache_key", js_code)
        self.assertIn("`${fy}::${norm}`", js_code)
        self.assertIn("handle_fiscal_year_change()", js_code)
        self.assertIn("clear_pending: false", js_code)
        self.assertIn("preserve_manual_request_date: true", js_code)
        self.assertIn("fiscal_year !== this.get_selected_fiscal_year()", js_code)
        self.assertIn("String(result.fiscal_year).trim() !== fiscal_year", js_code)

    def test_13_to_15_change_operation_number_and_save_view_changes(self):
        op_2025_9901 = self._make_operation(
            fiscal_year="2025",
            operation_no="T-9901",
            request_date="2025-01-10",
        )
        op_2026_9900 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-9900",
            request_date="2026-05-01",
        )
        doc_2026 = self._make_shared_doc(
            operation=op_2026_9900,
            role="invoice",
            content=b"inv-2026-9900",
            file_name="inv_9900.png",
        )

        plan = _build_operation_number_change_plan(op_2026_9900, "T-9901")
        self.assertFalse(plan["target_exists"])
        self.assertTrue(plan["reuse_source_group"])

        save_operation_view_changes(
            operation_name=op_2026_9900.name,
            values={"operation_no": "T-9901"},
        )
        op_2026_9900.reload()
        self.assertEqual(op_2026_9900.operation_no, "T-9901")
        self.assertEqual(cint(op_2026_9900.allow_duplicate_operation_no), 0)
        self.assertNotEqual(op_2026_9900.operation_group, op_2025_9901.operation_group)
        self.assertEqual(cstr(op_2026_9900.request_date), "2026-05-01")

        op_2026_9902 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-9902",
            request_date="2026-07-07",
        )
        change_operation_number(
            operation_name=op_2026_9900.name,
            new_operation_no="T-9902",
        )
        op_2026_9900.reload()
        doc_2026.reload()
        self.assertEqual(op_2026_9900.operation_group, op_2026_9902.operation_group)
        self.assertEqual(cint(op_2026_9900.allow_duplicate_operation_no), 1)
        self.assertEqual(cstr(op_2026_9900.request_date), "2026-07-07")
        self.assertEqual(doc_2026.operation_group, op_2026_9902.operation_group)
        self.assertEqual(
            doc_2026.uniqueness_key, f"invoice:{op_2026_9902.operation_group}"
        )

        doc_2026.save(ignore_permissions=True)

        save_operation_view_changes(
            operation_name=op_2026_9902.name,
            values={"operation_no": "T-9903"},
        )
        op_2026_9902.reload()
        op_2026_9900.reload()
        if op_2026_9902.operation_group not in self._created_groups:
            self._created_groups.append(op_2026_9902.operation_group)

        self.assertEqual(op_2026_9902.operation_no, "T-9903")
        self.assertEqual(cint(op_2026_9900.allow_duplicate_operation_no), 0)
        expected_key = "N:" + make_operation_no_hash("T-9902", "2026")
        self.assertEqual(op_2026_9900.operation_no_uniqueness_key, expected_key)

    def test_16_and_17_data_import_and_blocked_operations(self):
        self._make_operation(
            fiscal_year="2025",
            operation_no="T-IMP-7850",
            allow_duplicate_operation_no=0,
        )

        frappe.flags.in_import = True
        try:
            imp_2026_1 = self._make_operation(
                fiscal_year="2026",
                operation_no="T-IMP-7850",
                allow_duplicate_operation_no=0,
            )
            imp_2026_2 = self._make_operation(
                fiscal_year="2026",
                operation_no="T-IMP-7850",
                allow_duplicate_operation_no=0,
            )
        finally:
            frappe.flags.in_import = False

        self.assertEqual(cint(imp_2026_1.allow_duplicate_operation_no), 0)
        self.assertTrue(cstr(imp_2026_1.operation_no_uniqueness_key).startswith("N:"))
        self.assertEqual(cint(imp_2026_2.allow_duplicate_operation_no), 1)
        self.assertTrue(cstr(imp_2026_2.operation_no_uniqueness_key).startswith("D:"))
        self.assertEqual(imp_2026_1.operation_group, imp_2026_2.operation_group)

        blk_1 = self._make_operation(
            fiscal_year="2026",
            is_blocked_operation=1,
        )
        blk_2 = self._make_operation(
            fiscal_year="2026",
            is_blocked_operation=1,
        )
        self.assertTrue(blk_1.operation_group)
        self.assertTrue(blk_2.operation_group)
        self.assertNotEqual(blk_1.operation_group, blk_2.operation_group)
        self.assertIsNone(
            frappe.db.get_value(
                "Archive Operation Group",
                blk_1.operation_group,
                "operation_no_normalized",
            )
        )
        self.assertIsNone(
            frappe.db.get_value(
                "Archive Operation Group",
                blk_2.operation_group,
                "operation_no_normalized",
            )
        )

    def test_18_concurrency_same_year_and_number(self):
        op1 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-CONC-100",
            allow_duplicate_operation_no=0,
        )

        op_race_disallow = frappe.new_doc("Archive Operation")
        op_race_disallow.fiscal_year = "2026"
        op_race_disallow.operation_no = "T-CONC-100"
        op_race_disallow.operation_no_normalized = "T-CONC-100"
        op_race_disallow.allow_duplicate_operation_no = 0
        op_race_disallow.operation_no_uniqueness_key = op1.operation_no_uniqueness_key
        op_race_disallow.name = "OP-RACE-TEST-1"
        with patch(
            "frappe.model.document.Document.db_insert",
            side_effect=frappe.DuplicateEntryError,
        ):
            with self.assertRaises(frappe.ValidationError):
                op_race_disallow.db_insert()

        call_count = {"n": 0}
        orig_db_insert = frappe.model.document.Document.db_insert

        def flaky_insert(doc_self, *a, **kw):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise frappe.DuplicateEntryError("Simulated concurrent insert")
            return orig_db_insert(doc_self, *a, **kw)

        op_race_allow = frappe.new_doc("Archive Operation")
        op_race_allow.fiscal_year = "2026"
        op_race_allow.operation_no = "T-CONC-100"
        op_race_allow.allow_duplicate_operation_no = 1
        op_race_allow.request_date = "2026-01-15"
        op_race_allow.sender_name = "شركة تزامن"
        op_race_allow.beneficiary_name = "مستفيد تزامن"
        op_race_allow.transfer_currency = "دولار"
        op_race_allow.amount = 900
        op_race_allow.equivalent_amount_usd = 900
        op_race_allow.customer_rate_currency = "سعودي"
        op_race_allow.customer_rate = "530"

        with patch.object(frappe.model.document.Document, "db_insert", flaky_insert):
            op_race_allow.insert(ignore_permissions=True)
            self._created_ops.append(op_race_allow.name)

        self.assertEqual(op_race_allow.operation_group, op1.operation_group)
        self.assertTrue(cstr(op_race_allow.operation_no_uniqueness_key).startswith("D:"))

    def test_19_and_20_fiscal_year_permissions_and_all_years_display(self):
        self._make_operation(
            fiscal_year="2025",
            operation_no="T-ALL-5500",
            request_date="2025-05-05",
        )
        self._make_operation(
            fiscal_year="2026",
            operation_no="T-ALL-5500",
            request_date="2026-05-05",
        )

        ctx_all = get_operations_context(fiscal_year="all")
        rows = ctx_all.get("records") or ctx_all.get("operations") or []
        ops_by_fy = {
            row["fiscal_year"]: row
            for row in rows
            if row.get("operation_no") == "T-ALL-5500"
        }
        self.assertIn("2025", ops_by_fy)
        self.assertIn("2026", ops_by_fy)
        self.assertEqual(ops_by_fy["2025"]["operation_no_duplicate_count"], 1)
        self.assertEqual(ops_by_fy["2025"]["operation_no_duplicate_index"], 1)
        self.assertEqual(ops_by_fy["2026"]["operation_no_duplicate_count"], 1)
        self.assertEqual(ops_by_fy["2026"]["operation_no_duplicate_index"], 1)

        test_email = "test_fy_lookup_perm@example.com"
        if not frappe.db.exists("User", test_email):
            u = frappe.get_doc(
                {
                    "doctype": "User",
                    "email": test_email,
                    "first_name": "Test",
                    "last_name": "FiscalPerm",
                    "enabled": 1,
                    "user_type": "System User",
                }
            ).insert(ignore_permissions=True)
            u.add_roles("System Manager", "صلاحية الوصول إلى شاشة العمليات")
            self._created_users.append(test_email)

        perm_2026 = frappe.get_doc(
            {
                "doctype": "Archive User Fiscal Permission",
                "parent_user": test_email,
                "fiscal_year": "2026",
                "can_view": 0,
                "can_add": 1,
                "can_edit": 0,
                "can_delete": 0,
                "can_export": 0,
            }
        ).insert(ignore_permissions=True)
        self._created_perms.append(perm_2026.name)

        frappe.set_user(test_email)
        try:
            with self.assertRaises(frappe.PermissionError):
                lookup_operation_numbers(query="T-ALL-5500", fiscal_year="2026")

            with self.assertRaises(frappe.PermissionError):
                get_operation_number_context(
                    operation_no="T-ALL-5500", fiscal_year="2026"
                )

            with self.assertRaises(frappe.PermissionError):
                get_operation_number_suggestions(
                    query="T-ALL-5500", fiscal_year="2026"
                )

            with self.assertRaises(frappe.PermissionError):
                lookup_operation_numbers(query="T-ALL-5500", fiscal_year="2025")
        finally:
            frappe.set_user("Administrator")

    def test_21_migration_patch_all_15_scenarios_including_legacy_schema(self):
        """
        Comprehensive test of migrate_operations_to_fiscal_year_groups covering all 15 required scenarios:
        1. Legacy single-year group without fiscal_year populated.
        2. Two operations with the same number in two different fiscal years.
        3. Legacy mixed-year group (2025 & 2026) without documents -> split safely, keeping old group ID for one year.
        4. Legacy mixed-year group (2025 & 2026) with shared documents whose source_operation clearly identifies ownership -> split & move documents + update uniqueness_key.
        5. Legacy mixed-year group with ambiguous document (no source_operation) -> preflight & migration stop safely before modifying any data.
        6. Legacy operation without operation_group (operation_group = NULL) -> linked to its fiscal year's group.
        7. Orphan group (0 operations) -> preserved without deletion and normalized safely.
        8. Duplicate operations within the same fiscal year -> primary preserved (allow_duplicate=0, N:<fy_hash>), parts get D:<fy_hash>:<name>.
        9. Blocked operations -> remain without operation_no, each with an independent group carrying fiscal_year and NULL operation_no_normalized (even if legacy data had two blocked ops sharing a group).
        10. Shared document whose source_operation moved to another group earlier (within same fiscal year) -> preserved without false error.
        11. Legacy uniqueness_key conflicts (old sha256(normalized) without fiscal_year) -> rebuilt cleanly via two-phase MIG:<name> transition.
        12. Idempotency: running migration a second time produces 0 issues and 0 diffs.
        13. Zero loss of Archive Operation, Archive Operation Document, or File records.
        14. Creating new operations with the same number in two different years after migration succeeds.
        15. Changing an old migrated operation's number after migration preserves its group/documents in its fiscal year.
        + First-time upgrade from legacy schema (legacy single-column unique index on operation_no_normalized, no composite index yet).
        """
        # Create test records for all legacy scenarios
        # (A) Scenario 1: Single-year group (2025) with legacy NULL fiscal_year and legacy uniqueness_key
        op_s1 = self._make_operation(
            fiscal_year="2025",
            operation_no="T-MIG-101",
            request_date="2025-02-10",
        )
        grp_s1 = op_s1.operation_group
        frappe.db.sql(
            "UPDATE `tabArchive Operation Group` SET fiscal_year = NULL WHERE name = %s",
            (grp_s1,),
        )
        frappe.db.sql(
            "UPDATE `tabArchive Operation` SET operation_no_uniqueness_key = %s WHERE name = %s",
            ("N:" + make_operation_no_hash("T-MIG-101"), op_s1.name),
        )

        # (B) Scenario 2 & 3: Mixed-year group (2025 & 2026) without documents sharing one legacy group
        op_s3_2025 = self._make_operation(
            fiscal_year="2025",
            operation_no="T-MIG-103",
            request_date="2025-03-01",
        )
        op_s3_2026 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-MIG-103",
            request_date="2026-03-01",
        )
        legacy_mixed_no_docs_grp = op_s3_2025.operation_group
        unused_grp_s3 = op_s3_2026.operation_group
        frappe.db.sql(
            "UPDATE `tabArchive Operation` SET operation_group = %s, allow_duplicate_operation_no = 1 WHERE name = %s",
            (legacy_mixed_no_docs_grp, op_s3_2026.name),
        )
        frappe.db.sql(
            "DELETE FROM `tabArchive Operation Group` WHERE name = %s",
            (unused_grp_s3,),
        )
        frappe.db.sql(
            "UPDATE `tabArchive Operation Group` SET fiscal_year = NULL WHERE name = %s",
            (legacy_mixed_no_docs_grp,),
        )

        # (C) Scenario 4: Mixed-year group (2025 & 2026) WITH clear shared documents for both years
        op_s4_2025 = self._make_operation(
            fiscal_year="2025",
            operation_no="T-MIG-104",
            request_date="2025-04-01",
        )
        doc_s4_2025 = self._make_shared_doc(
            operation=op_s4_2025,
            role="invoice",
            content=b"mig-s4-2025-invoice",
            file_name="s4_2025.png",
        )
        op_s4_2026 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-MIG-104",
            request_date="2026-04-01",
        )
        doc_s4_2026 = self._make_shared_doc(
            operation=op_s4_2026,
            role="shared_attachment",
            content=b"mig-s4-2026-attachment",
            file_name="s4_2026.png",
        )
        legacy_mixed_with_docs_grp = op_s4_2025.operation_group
        unused_grp_s4 = op_s4_2026.operation_group
        # Point both operations and both documents to legacy_mixed_with_docs_grp
        frappe.db.sql(
            "UPDATE `tabArchive Operation` SET operation_group = %s, allow_duplicate_operation_no = 1 WHERE name = %s",
            (legacy_mixed_with_docs_grp, op_s4_2026.name),
        )
        frappe.db.sql(
            "UPDATE `tabArchive Operation Document` SET operation_group = %s, uniqueness_key = %s WHERE name = %s",
            (
                legacy_mixed_with_docs_grp,
                f"attachment:{legacy_mixed_with_docs_grp}:{doc_s4_2026.content_hash}",
                doc_s4_2026.name,
            ),
        )
        frappe.db.sql(
            "DELETE FROM `tabArchive Operation Group` WHERE name = %s",
            (unused_grp_s4,),
        )
        frappe.db.sql(
            "UPDATE `tabArchive Operation Group` SET fiscal_year = NULL WHERE name = %s",
            (legacy_mixed_with_docs_grp,),
        )

        # (D) Scenario 6 & 8: Ungrouped operations + duplicate operations in same year (2026)
        op_s6_1 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-MIG-106",
            request_date="2026-06-01",
        )
        op_s6_2 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-MIG-106",
            allow_duplicate_operation_no=1,
            request_date="2026-06-01",
        )
        grp_s6 = op_s6_1.operation_group
        frappe.db.sql(
            "UPDATE `tabArchive Operation` SET operation_group = NULL, operation_no_uniqueness_key = %s WHERE name = %s",
            ("N:" + make_operation_no_hash("T-MIG-106"), op_s6_1.name),
        )
        frappe.db.sql(
            "UPDATE `tabArchive Operation` SET operation_group = NULL, operation_no_uniqueness_key = %s WHERE name = %s",
            ("D:" + make_operation_no_hash("T-MIG-106") + ":legacy", op_s6_2.name),
        )
        frappe.db.sql(
            "DELETE FROM `tabArchive Operation Group` WHERE name = %s",
            (grp_s6,),
        )

        # (E) Scenario 7: Orphan group
        orphan_grp = frappe.new_doc("Archive Operation Group")
        orphan_grp.fiscal_year = "2025"
        orphan_grp.operation_no = "T-MIG-ORPHAN"
        orphan_grp.operation_no_normalized = "T-MIG-ORPHAN"
        orphan_grp.insert(ignore_permissions=True)
        self._created_groups.append(orphan_grp.name)
        frappe.db.sql(
            "UPDATE `tabArchive Operation Group` SET fiscal_year = NULL WHERE name = %s",
            (orphan_grp.name,),
        )

        # (F) Scenario 9: Blocked operations (including two blocked ops sharing one legacy group)
        blk_1 = self._make_operation(fiscal_year="2025", is_blocked_operation=1)
        blk_2 = self._make_operation(fiscal_year="2026", is_blocked_operation=1)
        unused_blk_grp = blk_2.operation_group
        frappe.db.sql(
            "UPDATE `tabArchive Operation` SET operation_group = %s WHERE name = %s",
            (blk_1.operation_group, blk_2.name),
        )
        frappe.db.sql(
            "DELETE FROM `tabArchive Operation Group` WHERE name = %s",
            (unused_blk_grp,),
        )
        frappe.db.sql(
            "UPDATE `tabArchive Operation Group` SET fiscal_year = NULL, operation_no_normalized = '' WHERE name = %s",
            (blk_1.operation_group,),
        )

        # (G) Scenario 10: Shared document whose source_operation moved to another group in the same year
        op_s10_a = self._make_operation(
            fiscal_year="2026",
            operation_no="T-MIG-110A",
            request_date="2026-08-01",
        )
        op_s10_b = self._make_operation(
            fiscal_year="2026",
            operation_no="T-MIG-110B",
            request_date="2026-08-02",
        )
        doc_s10 = self._make_shared_doc(
            operation=op_s10_a,
            role="shared_attachment",
            content=b"mig-s10-moved-doc",
            file_name="s10_moved.png",
        )
        # Simulate that doc_s10 was moved to op_s10_b's group while keeping source_operation = op_s10_a
        frappe.db.sql(
            "UPDATE `tabArchive Operation Document` SET operation_group = %s, uniqueness_key = %s WHERE name = %s",
            (
                op_s10_b.operation_group,
                f"attachment:{op_s10_b.operation_group}:{doc_s10.content_hash}",
                doc_s10.name,
            ),
        )

        # (H) Simulate legacy index state on Archive Operation Group:
        # Restore any leftover __TMP_DUP_ from a previous interrupted run
        frappe.db.sql(
            """
            UPDATE `tabArchive Operation Group`
            SET operation_no_normalized = operation_no
            WHERE operation_no_normalized LIKE '__TMP_DUP_%'
            """
        )

        # Temporarily move any existing cross-year duplicate group numbers to unique temp values so the legacy single-column unique index can be created, then restore or let migration split mixed groups
        cross_year_dups = frappe.db.sql(
            """
            SELECT name, operation_no_normalized
            FROM `tabArchive Operation Group`
            WHERE operation_no_normalized IN (
                SELECT operation_no_normalized
                FROM `tabArchive Operation Group`
                WHERE operation_no_normalized IS NOT NULL
                GROUP BY operation_no_normalized
                HAVING COUNT(*) > 1
            )
            ORDER BY creation ASC, name ASC
            """,
            as_dict=True,
        )
        seen_norms = set()
        saved_dup_norms = {}
        for row in cross_year_dups:
            if row.operation_no_normalized in seen_norms:
                saved_dup_norms[row.name] = row.operation_no_normalized
                frappe.db.sql(
                    "UPDATE `tabArchive Operation Group` SET operation_no_normalized = %s WHERE name = %s",
                    (f"__TMP_DUP_{row.name}", row.name),
                )
            else:
                seen_norms.add(row.operation_no_normalized)

        try:
            EnsureIdx = frappe.db.sql(
                "SHOW INDEX FROM `tabArchive Operation Group` WHERE Key_name = 'operation_no_normalized'",
                as_dict=True,
            )
            if not EnsureIdx:
                frappe.db.sql_ddl(
                    "ALTER TABLE `tabArchive Operation Group` ADD UNIQUE INDEX `operation_no_normalized` (`operation_no_normalized`)"
                )
            HasCompIdx = frappe.db.sql(
                f"SHOW INDEX FROM `tabArchive Operation Group` WHERE Key_name = '{COMPOSITE_INDEX_NAME}'",
                as_dict=True,
            )
            if HasCompIdx:
                frappe.db.sql_ddl(
                    f"ALTER TABLE `tabArchive Operation Group` DROP INDEX `{COMPOSITE_INDEX_NAME}`"
                )

            # (I) Scenario 5: Inject an ambiguous document into legacy_mixed_no_docs_grp (source_operation = NULL)
            # Verify that preflight & run_migration STOP safely before changing anything!
            ambig_file = frappe.get_doc(
                {
                    "doctype": "File",
                    "file_name": "ambig.png",
                    "is_private": 1,
                    "content": b"ambiguous-doc-content",
                }
            ).insert(ignore_permissions=True)
            self._created_files.append(ambig_file.name)
            ambig_doc = frappe.new_doc("Archive Operation Document")
            ambig_doc.operation_group = legacy_mixed_no_docs_grp
            ambig_doc.source_operation = op_s3_2025.name
            ambig_doc.document_role = "shared_attachment"
            ambig_doc.file = ambig_file.file_url
            ambig_doc.insert(ignore_permissions=True)
            self._created_docs.append(ambig_doc.name)
            frappe.db.sql(
                "UPDATE `tabArchive Operation Document` SET source_operation = NULL WHERE name = %s",
                (ambig_doc.name,),
            )

            preflight_blocked = inspect_preflight()
            self.assertFalse(preflight_blocked["can_proceed_safely"])
            self.assertTrue(
                any(
                    r["type"] == "ambiguous_documents"
                    for r in preflight_blocked["blocking_reasons"]
                )
            )
            with self.assertRaises(frappe.ValidationError):
                run_migration(dry_run=False)

            # Remove the ambiguous document so safe migration can proceed
            frappe.db.sql(
                "DELETE FROM `tabArchive Operation Document` WHERE name = %s",
                (ambig_doc.name,),
            )

            # Record counts before migration (Scenario 13)
            ops_count_before = frappe.db.count("Archive Operation")
            docs_count_before = frappe.db.count("Archive Operation Document")
            files_count_before = frappe.db.count("File")
            groups_count_before = frappe.db.count("Archive Operation Group")

            # Verify dry-run does not modify anything
            dry_res = run_migration(dry_run=True)
            self.assertTrue(dry_res["dry_run"])
            self.assertTrue(dry_res["preflight"]["can_proceed_safely"])
            self.assertTrue(
                dry_res["preflight"]["indexes"]["legacy_single_unique_indexes"]
            )
            self.assertFalse(
                dry_res["preflight"]["indexes"]["has_composite_unique_index"]
            )

            # Execute the actual migration on the legacy schema state
            mig_res = run_migration(dry_run=False)
        finally:
            ensure_operation_group_indexes()
            for grp_name, orig_norm in saved_dup_norms.items():
                frappe.db.sql(
                    "UPDATE `tabArchive Operation Group` SET operation_no_normalized = %s WHERE name = %s",
                    (orig_norm, grp_name),
                )
        self.assertFalse(mig_res["dry_run"])
        post = mig_res["post_validation"]
        self.assertTrue(post["can_proceed_safely"])
        self.assertEqual(post["mixed_year_groups"], [])
        self.assertEqual(post["ungrouped_operations"], [])
        self.assertEqual(post["uniqueness_key_issues_count"], 0)
        self.assertTrue(post["indexes"]["has_composite_unique_index"])
        self.assertEqual(post["indexes"]["legacy_single_unique_indexes"], [])

        # Scenario 13: Verify zero loss of operations, documents, or files (and groups count only increased for split/ungrouped)
        self.assertEqual(frappe.db.count("Archive Operation"), ops_count_before)
        self.assertEqual(
            frappe.db.count("Archive Operation Document"), docs_count_before
        )
        self.assertEqual(frappe.db.count("File"), files_count_before)
        self.assertGreaterEqual(
            frappe.db.count("Archive Operation Group"), groups_count_before
        )
        self.assertTrue(
            frappe.db.exists("Archive Operation Group", orphan_grp.name)
        )

        # Verify Scenario 3 & 4: Mixed groups were split by fiscal_year, old group ID preserved for one year, documents moved to matching year's group
        op_s3_2025.reload()
        op_s3_2026.reload()
        self.assertNotEqual(op_s3_2025.operation_group, op_s3_2026.operation_group)
        self.assertIn(
            legacy_mixed_no_docs_grp,
            {op_s3_2025.operation_group, op_s3_2026.operation_group},
        )
        self._created_groups.extend(
            [op_s3_2025.operation_group, op_s3_2026.operation_group]
        )

        op_s4_2025.reload()
        op_s4_2026.reload()
        doc_s4_2025.reload()
        doc_s4_2026.reload()
        self.assertNotEqual(op_s4_2025.operation_group, op_s4_2026.operation_group)
        self.assertEqual(doc_s4_2025.operation_group, op_s4_2025.operation_group)
        self.assertEqual(doc_s4_2026.operation_group, op_s4_2026.operation_group)
        self.assertEqual(
            doc_s4_2025.uniqueness_key, f"invoice:{op_s4_2025.operation_group}"
        )
        self.assertEqual(
            doc_s4_2026.uniqueness_key,
            f"attachment:{op_s4_2026.operation_group}:{doc_s4_2026.content_hash}",
        )
        self._created_groups.extend(
            [op_s4_2025.operation_group, op_s4_2026.operation_group]
        )

        # Verify Scenario 6 & 8: Ungrouped operations linked to same 2026 group, primary & duplicate flags/keys preserved
        op_s6_1.reload()
        op_s6_2.reload()
        self.assertTrue(op_s6_1.operation_group)
        self.assertEqual(op_s6_1.operation_group, op_s6_2.operation_group)
        self.assertEqual(cint(op_s6_1.allow_duplicate_operation_no), 0)
        self.assertEqual(cint(op_s6_2.allow_duplicate_operation_no), 1)
        self.assertEqual(
            op_s6_1.operation_no_uniqueness_key,
            "N:" + make_operation_no_hash("T-MIG-106", "2026"),
        )
        self.assertTrue(
            cstr(op_s6_2.operation_no_uniqueness_key).startswith(
                "D:" + make_operation_no_hash("T-MIG-106", "2026") + ":"
            )
        )
        self._created_groups.append(op_s6_1.operation_group)

        # Verify Scenario 9: Blocked operations separated into independent groups with NULL operation_no_normalized
        blk_1.reload()
        blk_2.reload()
        self.assertNotEqual(blk_1.operation_group, blk_2.operation_group)
        self.assertIsNone(
            frappe.db.get_value(
                "Archive Operation Group",
                blk_1.operation_group,
                "operation_no_normalized",
            )
        )
        self.assertIsNone(
            frappe.db.get_value(
                "Archive Operation Group",
                blk_2.operation_group,
                "operation_no_normalized",
            )
        )
        self._created_groups.extend([blk_1.operation_group, blk_2.operation_group])

        # Verify Scenario 12: Idempotency (re-running migration produces 0 issues and changes nothing)
        mig_res_second = run_migration(dry_run=False)
        self.assertEqual(
            mig_res_second["preflight"]["uniqueness_key_issues_count"], 0
        )
        self.assertEqual(mig_res_second["preflight"]["ungrouped_operations"], [])
        self.assertEqual(mig_res_second["preflight"]["mixed_year_groups"], [])

        # Verify Scenario 14: Creating a new operation number after migration in two different years succeeds
        op_post_2025 = self._make_operation(
            fiscal_year="2025",
            operation_no="T-MIG-POST-1",
            request_date="2025-09-01",
        )
        op_post_2026 = self._make_operation(
            fiscal_year="2026",
            operation_no="T-MIG-POST-1",
            request_date="2026-09-01",
        )
        self.assertNotEqual(
            op_post_2025.operation_group, op_post_2026.operation_group
        )

        # Verify Scenario 15: Changing an old migrated operation's number after migration preserves its group and documents
        old_grp_s4_2025 = op_s4_2025.operation_group
        save_operation_view_changes(
            operation_name=op_s4_2025.name,
            values={"operation_no": "T-MIG-104-RENAMED"},
        )
        op_s4_2025.reload()
        doc_s4_2025.reload()
        self.assertEqual(op_s4_2025.operation_no, "T-MIG-104-RENAMED")
        self.assertEqual(op_s4_2025.operation_group, old_grp_s4_2025)
        self.assertEqual(doc_s4_2025.operation_group, old_grp_s4_2025)

    def test_22_migration_patch_default_fiscal_year_rules_from_archive_settings(self):
        """
        Verify all 8 mandatory rules for fiscal year resolution in migrate_operations_to_fiscal_year_groups:
        1. Operation with fiscal_year 2025 keeps 2025 (even if 2025 is closed).
        2. Operation with fiscal_year 2026 keeps 2026.
        3. Operation without fiscal_year takes Archive Settings.default_fiscal_year.
        4. Operation with request_date in 2025 and fiscal_year 2026 stays in 2026.
        5. Operation with request_date in 2025 and no fiscal_year takes Archive Settings.default_fiscal_year even if 2027.
        6. Missing/invalid default_fiscal_year in Archive Settings (or invalid recorded fiscal_year on operation) stops safely before modifying any data.
        7. Different ERPNext / System default fiscal_year does not affect the result.
        8. Existing valid fiscal_year, request_date, serial_no, and fiscal_sequence are never altered.
        """
        orig_default_fy = frappe.db.get_single_value(
            "Archive Settings", "default_fiscal_year"
        )
        orig_2025_closed = frappe.db.get_value(
            "Archive Fiscal Year", "2025", "is_closed"
        )

        try:
            # 1 & 2 & 4: Create operations in 2025, 2026, and request_date in 2025 with fiscal_year=2026
            op_2025 = self._make_operation(
                fiscal_year="2025",
                operation_no="T-FY-RULE-2025",
                request_date="2025-05-10",
            )
            op_2026 = self._make_operation(
                fiscal_year="2026",
                operation_no="T-FY-RULE-2026",
                request_date="2026-05-10",
            )
            op_req2025_fy2026 = self._make_operation(
                fiscal_year="2026",
                operation_no="T-FY-RULE-MIXDATE",
                request_date="2025-11-15",
            )

            # 3 & 5: Create operations that will lose their fiscal_year in DB (simulating legacy NULL/empty fiscal_year)
            op_missing_fy_1 = self._make_operation(
                fiscal_year="2026",
                operation_no="T-FY-RULE-MISSING-1",
                request_date="2026-03-20",
            )
            op_missing_fy_req2025 = self._make_operation(
                fiscal_year="2025",
                operation_no="T-FY-RULE-MISSING-2",
                request_date="2025-01-15",
            )
            # Clear fiscal_year and group on the two missing-FY operations to simulate legacy unmigrated records
            for op_missing in (op_missing_fy_1, op_missing_fy_req2025):
                old_grp = op_missing.operation_group
                frappe.db.sql(
                    """
                    UPDATE `tabArchive Operation`
                    SET fiscal_year = NULL,
                        operation_group = NULL,
                        operation_no_uniqueness_key = %s
                    WHERE name = %s
                    """,
                    (
                        "N:" + make_operation_no_hash(op_missing.operation_no),
                        op_missing.name,
                    ),
                )
                if old_grp:
                    frappe.db.sql(
                        "DELETE FROM `tabArchive Operation Group` WHERE name = %s",
                        (old_grp,),
                    )

            # Close 2025 to verify rule 8 (closed fiscal year is preserved and not auto-opened)
            frappe.db.set_value(
                "Archive Fiscal Year", "2025", "is_closed", 1, update_modified=False
            )

            # Snapshot fields that must never change on valid operations (Rule 8)
            snapshots_before = {}
            for valid_op in (op_2025, op_2026, op_req2025_fy2026):
                valid_op.reload()
                snapshots_before[valid_op.name] = {
                    "fiscal_year": valid_op.fiscal_year,
                    "request_date": cstr(valid_op.request_date),
                    "serial_no": valid_op.serial_no,
                    "fiscal_sequence": valid_op.fiscal_sequence,
                }

            # Rule 6a: Missing Archive Settings.default_fiscal_year -> stops safely before any modification
            frappe.db.set_single_value(
                "Archive Settings",
                "default_fiscal_year",
                "",
                update_modified=False,
            )
            preflight_no_default = inspect_preflight()
            self.assertFalse(preflight_no_default["can_proceed_safely"])
            self.assertFalse(preflight_no_default["default_fiscal_year_valid"])
            self.assertIsNone(preflight_no_default["default_fiscal_year"])
            self.assertEqual(
                preflight_no_default["operations_without_fiscal_year_count"], 2
            )
            self.assertEqual(
                preflight_no_default["operations_assigned_default_fiscal_year_count"], 0
            )
            with self.assertRaises(frappe.ValidationError):
                run_migration(dry_run=False)
            # Confirm database was not touched
            self.assertFalse(
                frappe.db.get_value(
                    "Archive Operation", op_missing_fy_1.name, "fiscal_year"
                )
            )

            # Rule 6b: Set Archive Settings.default_fiscal_year = "2027", and test invalid recorded fiscal_year ("2099") -> stops safely
            frappe.db.set_single_value(
                "Archive Settings",
                "default_fiscal_year",
                "2027",
                update_modified=False,
            )
            frappe.db.sql(
                "UPDATE `tabArchive Operation` SET fiscal_year = '2099' WHERE name = %s",
                (op_2026.name,),
            )
            preflight_invalid_rec = inspect_preflight()
            self.assertFalse(preflight_invalid_rec["can_proceed_safely"])
            self.assertEqual(
                preflight_invalid_rec["invalid_fiscal_year_records_count"], 1
            )
            with self.assertRaises(frappe.ValidationError):
                run_migration(dry_run=False)
            # Restore op_2026 fiscal_year to "2026"
            frappe.db.sql(
                "UPDATE `tabArchive Operation` SET fiscal_year = '2026' WHERE name = %s",
                (op_2026.name,),
            )

            # Rule 7: Simulate ERPNext / user default fiscal_year = "2025" while Archive Settings.default_fiscal_year = "2027"
            frappe.defaults.set_user_default("fiscal_year", "2025")

            # Verify dry-run is read-only and reports expected assignment to "2027"
            dry_res = run_migration(dry_run=True)
            self.assertTrue(dry_res["dry_run"])
            self.assertTrue(dry_res["preflight"]["can_proceed_safely"])
            self.assertEqual(dry_res["preflight"]["default_fiscal_year"], "2027")
            self.assertTrue(dry_res["preflight"]["default_fiscal_year_valid"])
            self.assertEqual(
                dry_res["preflight"]["operations_without_fiscal_year_count"], 2
            )
            self.assertEqual(
                dry_res["preflight"]["operations_assigned_default_fiscal_year_count"], 2
            )
            self.assertGreaterEqual(
                dry_res["preflight"]["operations_with_fiscal_year_count"], 3
            )
            self.assertEqual(
                dry_res["preflight"]["invalid_fiscal_year_records_count"], 0
            )
            # Confirm dry-run did not modify the missing fiscal_year in DB
            self.assertFalse(
                frappe.db.get_value(
                    "Archive Operation", op_missing_fy_1.name, "fiscal_year"
                )
            )
            self.assertFalse(
                frappe.db.get_value(
                    "Archive Operation", op_missing_fy_req2025.name, "fiscal_year"
                )
            )

            # Execute actual migration
            mig_res = run_migration(dry_run=False)
            self.assertFalse(mig_res["dry_run"])
            self.assertEqual(
                mig_res["post_validation"]["operations_without_fiscal_year_count"], 0
            )

            # Verify Rules 1, 2, 4, 8 on existing valid operations
            for valid_op in (op_2025, op_2026, op_req2025_fy2026):
                valid_op.reload()
                before = snapshots_before[valid_op.name]
                self.assertEqual(valid_op.fiscal_year, before["fiscal_year"])
                self.assertEqual(cstr(valid_op.request_date), before["request_date"])
                self.assertEqual(valid_op.serial_no, before["serial_no"])
                self.assertEqual(valid_op.fiscal_sequence, before["fiscal_sequence"])

            # Verify 2025 remained closed (Rule 8)
            self.assertEqual(
                cint(
                    frappe.db.get_value("Archive Fiscal Year", "2025", "is_closed")
                ),
                1,
            )

            # Verify Rules 3, 5, 7, 9 on operations that had missing fiscal_year -> assigned "2027"
            for op_missing, expected_norm in (
                (op_missing_fy_1, "T-FY-RULE-MISSING-1"),
                (op_missing_fy_req2025, "T-FY-RULE-MISSING-2"),
            ):
                op_missing.reload()
                self.assertEqual(op_missing.fiscal_year, "2027")
                self.assertTrue(op_missing.operation_group)
                self._created_groups.append(op_missing.operation_group)
                grp_fy = frappe.db.get_value(
                    "Archive Operation Group",
                    op_missing.operation_group,
                    "fiscal_year",
                )
                self.assertEqual(grp_fy, "2027")
                self.assertEqual(
                    op_missing.operation_no_uniqueness_key,
                    "N:" + make_operation_no_hash(expected_norm, "2027"),
                )
        finally:
            frappe.db.set_single_value(
                "Archive Settings",
                "default_fiscal_year",
                orig_default_fy or "2026",
                update_modified=False,
            )
            if orig_2025_closed is not None:
                frappe.db.set_value(
                    "Archive Fiscal Year",
                    "2025",
                    "is_closed",
                    orig_2025_closed,
                    update_modified=False,
                )
            frappe.defaults.clear_default("fiscal_year")

    def test_23_multi_select_fiscal_years_across_three_screens(self):
        """
        Focused test covering all 16 mandatory scenarios for Multi-Select Fiscal Year filtering
        across Archive Operations, Archive Pending Operation, and Archive Document Authenticity Check.
        """
        from pathlib import Path
        from archive.api.document_authenticity import get_check_history
        from archive.api.operations import get_operations
        from archive.api.pending_operations import get_pending_operations_context
        from archive.services.fiscal_year_permissions import (
            resolve_fiscal_year_filter,
            resolve_target_fiscal_year_for_create,
        )

        from archive.services.pending_ledger import PENDING_CURRENCY

        created_pendings: list[str] = []
        created_checks: list[str] = []

        def _make_pending(fy: str, note_tag: str):
            p = frappe.get_doc(
                {
                    "doctype": "Archive Pending Operation",
                    "fiscal_year": fy,
                    "bank": "بنك الاختبار",
                    "card_name": "بطاقة اختبار",
                    "account_number": "ACC-MS-1",
                    "card_number": "1234",
                    "operation_datetime": f"{fy}-06-10 10:00:00",
                    "suspended_note": note_tag,
                    "region": "صنعاء",
                    "currency": PENDING_CURRENCY,
                    "ledger_entries": [
                        {
                            "suspended_amount": 500,
                            "returned_amount": 0,
                        }
                    ],
                }
            ).insert(ignore_permissions=True, ignore_links=True, ignore_mandatory=True)
            created_pendings.append(p.name)
            return p

        def _make_check(fy: str, file_tag: str):
            c = frappe.get_doc(
                {
                    "doctype": "Archive Document Authenticity Check",
                    "fiscal_year": fy,
                    "file_name": file_tag,
                    "file_type": "PNG",
                    "status": "صحيح",
                    "confidence_level": "منخفض",
                    "checked_by": "Administrator",
                    "checked_at": f"{fy}-06-10 11:00:00",
                    "summary": "فحص اختبار متعدد السنوات",
                }
            ).insert(ignore_permissions=True, ignore_links=True, ignore_mandatory=True)
            created_checks.append(c.name)
            return c

        try:
            # Create records in 2025, 2026, 2027 across all 3 screens
            #Including same operation_no T-MS-7850 in 2025 (with a duplicate part) and 2026 (Scenario 12)
            op_2025_a = self._make_operation(
                fiscal_year="2025",
                operation_no="T-MS-7850",
                request_date="2025-04-01",
            )
            op_2025_b = self._make_operation(
                fiscal_year="2025",
                operation_no="T-MS-7850",
                allow_duplicate_operation_no=1,
                request_date="2025-04-02",
            )
            op_2026 = self._make_operation(
                fiscal_year="2026",
                operation_no="T-MS-7850",
                request_date="2026-04-01",
            )
            op_2027 = self._make_operation(
                fiscal_year="2027",
                operation_no="T-MS-7851",
                request_date="2027-04-01",
            )

            pend_2025 = _make_pending("2025", "T-MS-PEND-2025")
            pend_2026 = _make_pending("2026", "T-MS-PEND-2026")
            pend_2027 = _make_pending("2027", "T-MS-PEND-2027")

            chk_2025 = _make_check("2025", "T-MS-CHK-2025.png")
            chk_2026 = _make_check("2026", "T-MS-CHK-2026.png")
            chk_2027 = _make_check("2027", "T-MS-CHK-2027.png")

            # Scenarios 1, 2, 3, 7, 8: 1 year, 2 years, 3 years across all 3 screens (list, JSON string, CSV string, single string)
            # Operations Context
            res_op_1 = get_operations_context(fiscal_year="2025")
            names_op_1 = {r["name"] for r in res_op_1["records"]}
            self.assertIn(op_2025_a.name, names_op_1)
            self.assertNotIn(op_2026.name, names_op_1)
            self.assertNotIn(op_2027.name, names_op_1)

            res_op_2 = get_operations_context(fiscal_year=["2025", "2026"])
            names_op_2 = {r["name"] for r in res_op_2["records"]}
            self.assertIn(op_2025_a.name, names_op_2)
            self.assertIn(op_2026.name, names_op_2)
            self.assertNotIn(op_2027.name, names_op_2)

            res_op_3 = get_operations_context(fiscal_year='["2025", "2026", "2027"]')
            names_op_3 = {r["name"] for r in res_op_3["records"]}
            self.assertTrue({op_2025_a.name, op_2025_b.name, op_2026.name, op_2027.name}.issubset(names_op_3))

            # Scenario 12: Equal operation_no across years is NOT merged into duplicate count across years
            rows_by_name = {r["name"]: r for r in res_op_3["records"]}
            self.assertEqual(rows_by_name[op_2025_a.name]["operation_no_duplicate_count"], 2)
            self.assertEqual(rows_by_name[op_2025_b.name]["operation_no_duplicate_count"], 2)
            self.assertEqual(rows_by_name[op_2026.name]["operation_no_duplicate_count"], 1)
            self.assertEqual(rows_by_name[op_2026.name]["operation_no_duplicate_index"], 1)

            # Scenario 11: get_operations search, counts, pagination within selected years
            res_search_2 = get_operations(search="T-MS-785", fiscal_year="2025,2026", start=0, page_length=10)
            search_names_2 = {r["name"] for r in res_search_2["operations"]}
            self.assertEqual(search_names_2, {op_2025_a.name, op_2025_b.name, op_2026.name})
            self.assertEqual(res_search_2["total"], 3)
            self.assertEqual(res_search_2["counts"]["all"], 3)

            # Pending Operations: 1 year, 2 years, 3 years
            res_pend_1 = get_pending_operations_context(fiscal_year="2025")
            p_names_1 = {r["name"] for r in res_pend_1["operations"]}
            self.assertIn(pend_2025.name, p_names_1)
            self.assertNotIn(pend_2026.name, p_names_1)

            res_pend_2 = get_pending_operations_context(fiscal_year=["2025", "2026"])
            p_names_2 = {r["name"] for r in res_pend_2["operations"]}
            self.assertTrue({pend_2025.name, pend_2026.name}.issubset(p_names_2))
            self.assertNotIn(pend_2027.name, p_names_2)

            res_pend_3 = get_pending_operations_context(fiscal_year='["2025", "2026", "2027"]')
            p_names_3 = {r["name"] for r in res_pend_3["operations"]}
            self.assertTrue({pend_2025.name, pend_2026.name, pend_2027.name}.issubset(p_names_3))

            # Document Authenticity Checks: 1 year, 2 years, 3 years + search & pagination
            res_chk_1 = get_check_history(search="T-MS-CHK-", fiscal_year="2025")
            c_names_1 = {r["name"] for r in res_chk_1["rows"]}
            self.assertEqual(c_names_1, {chk_2025.name})

            res_chk_2 = get_check_history(search="T-MS-CHK-", fiscal_year=["2025", "2026"])
            c_names_2 = {r["name"] for r in res_chk_2["rows"]}
            self.assertEqual(c_names_2, {chk_2025.name, chk_2026.name})
            self.assertEqual(res_chk_2["total"], 2)

            res_chk_3 = get_check_history(search="T-MS-CHK-", fiscal_year='["2025", "2026", "2027"]')
            c_names_3 = {r["name"] for r in res_chk_3["rows"]}
            self.assertEqual(c_names_3, {chk_2025.name, chk_2026.name, chk_2027.name})
            self.assertEqual(res_chk_3["total"], 3)

            # Scenarios 5 & 10: Deselecting all years / passing empty list [], "[]", "", "__none__" returns 0 records (never all years)
            for empty_val in ([], "[]", "", "__none__"):
                self.assertEqual(resolve_fiscal_year_filter(empty_val), [])
                self.assertEqual(get_operations_context(fiscal_year=empty_val)["records"], [])
                self.assertEqual(get_operations(fiscal_year=empty_val)["operations"], [])
                self.assertEqual(get_pending_operations_context(fiscal_year=empty_val)["operations"], [])
                self.assertEqual(get_check_history(fiscal_year=empty_val)["rows"], [])

            # Scenarios 4 & 9: Permissions enforcement for multi-select and "all"
            test_email = "test_fy_multiselect_perm@example.com"
            if not frappe.db.exists("User", test_email):
                u = frappe.get_doc(
                    {
                        "doctype": "User",
                        "email": test_email,
                        "first_name": "Test",
                        "last_name": "MultiSelectPerm",
                        "enabled": 1,
                        "user_type": "System User",
                    }
                ).insert(ignore_permissions=True)
                u.add_roles("System Manager", "صلاحية الوصول إلى شاشة العمليات")
                self._created_users.append(test_email)

            # Grant view permission ONLY for 2025 and 2026 (NOT 2027)
            for yr_perm in ("2025", "2026"):
                p_doc = frappe.get_doc(
                    {
                        "doctype": "Archive User Fiscal Permission",
                        "parent_user": test_email,
                        "fiscal_year": yr_perm,
                        "can_view": 1,
                        "can_add": 1,
                        "can_edit": 0,
                        "can_delete": 0,
                        "can_export": 0,
                    }
                ).insert(ignore_permissions=True)
                self._created_perms.append(p_doc.name)

            frappe.set_user(test_email)
            try:
                # Scenario 4: "all" returns ONLY permitted years (2025, 2026), never 2027
                self.assertEqual(sorted(resolve_fiscal_year_filter("all")), ["2025", "2026"])
                all_ops_user = get_operations_context(fiscal_year="all")["records"]
                self.assertTrue(all(r["fiscal_year"] in ("2025", "2026") for r in all_ops_user))

                # Scenario 9: Passing unauthorized year 2027 (alone or inside a multi-year list) raises PermissionError
                with self.assertRaises(frappe.PermissionError):
                    get_operations_context(fiscal_year=["2025", "2027"])
                with self.assertRaises(frappe.PermissionError):
                    get_pending_operations_context(fiscal_year='["2026", "2027"]')
                with self.assertRaises(frappe.PermissionError):
                    get_check_history(fiscal_year="2025,2027")
            finally:
                frappe.set_user("Administrator")

            # Scenarios 13, 14, 15, 16: Separation of view filter from creation year + Pending->Operation conversion + immutability
            with self.assertRaises(frappe.ValidationError):
                resolve_target_fiscal_year_for_create(["2025", "2026"])
            with self.assertRaises(frappe.ValidationError):
                resolve_target_fiscal_year_for_create("2025,2026")

            # Convert pend_2025 to an Archive Operation while multi-year view is active
            res_conv = create_operation(
                values={
                    "fiscal_year": "2027",  # Should be ignored in favor of pending operation's own fiscal_year (2025)
                    "operation_no": "T-MS-FROM-PEND-1",
                    "allow_duplicate_operation_no": 0,
                    "is_blocked_operation": 0,
                    "is_incomplete_invoice": 0,
                    "request_date": "2025-06-15",
                    "sender_name": "مرسل معلق اختبار",
                    "beneficiary_name": "مستفيد من معلقة",
                    "transfer_currency": "دولار",
                    "amount": 500,
                    "equivalent_amount_usd": 500,
                    "customer_rate_currency": "سعودي",
                    "customer_rate": "535",
                    "source_pending_operation": pend_2025.name,
                }
            )
            conv_op_name = res_conv["name"]
            self._created_ops.append(conv_op_name)
            conv_op = frappe.get_doc("Archive Operation", conv_op_name)
            if conv_op.operation_group:
                self._created_groups.append(conv_op.operation_group)
            self.assertEqual(conv_op.fiscal_year, "2025")

            # Scenario 6: Verify async request_id guard and multi-select UI wiring in the 3 JS files
            base_page_dir = Path(frappe.get_app_path("archive", "archive", "page"))
            ops_js = (base_page_dir / "archive_operations" / "archive_operations.js").read_text(encoding="utf-8")
            pend_js = (base_page_dir / "archive_pending_operations" / "archive_pending_operations.js").read_text(encoding="utf-8")
            auth_js = (base_page_dir / "document_authenticity" / "document_authenticity.js").read_text(encoding="utf-8")

            for js_src in (ops_js, pend_js, auth_js):
                self.assertIn("archive-fy-multiselect", js_src)
                self.assertIn("archive-fy-select-all", js_src)
                self.assertIn("archive-fy-clear-all", js_src)
                self.assertIn("archive-fy-checkbox", js_src)
            self.assertIn("request_id !== this._load_request_id", ops_js)
            self.assertIn("request_id !== this._load_request_id", pend_js)
            self.assertIn("request_id\n                    !== state.history.request_id", auth_js)
        finally:
            for p_name in created_pendings:
                frappe.db.sql("DELETE FROM `tabArchive Pending Operation` WHERE name = %s", (p_name,))
            for c_name in created_checks:
                frappe.db.sql("DELETE FROM `tabArchive Document Authenticity Check` WHERE name = %s", (c_name,))




