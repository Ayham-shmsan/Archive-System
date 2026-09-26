from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import (
    IntegrationTestCase,
    UnitTestCase,
)
from frappe.utils import (
    get_datetime,
    now_datetime,
)

import archive.api.pending_lookups as pending_lookups
import archive.services.pending_operation_permissions as pending_permissions

from archive.api.operation_search import (
    normalize_search_text,
)
from archive.api.pending_lookups import (
    get_pending_related_fields,
    get_pending_suggestions,
)
from archive.api.pending_operation_search import (
    build_pending_search_text,
    get_pending_context_rows,
)
from archive.api.pending_operation_timeline import (
    get_pending_operation_timeline,
)
from archive.api.pending_operations import (
    add_pending_return,
    correct_pending_ledger,
    create_pending_operation,
    get_pending_operation_details,
    update_pending_operation,
)
from archive.services.pending_operation_attachments import (
    add_uploaded_pending_attachment,
    delete_pending_attachment as delete_pending_attachment_service,
    stage_pending_attachment_file,
)

# هذه الـSuite تنشئ كل بياناتها المطلوبة بنفسها داخل setUp().
#
# لا نريد من Frappe إنشاء dependency test records تلقائيًا؛
# لأن ذلك يسحب شجرة ERPNext كاملة عبر User -> Email Account
# -> Company ويؤدي إلى Bootstrap غير مطلوب لهذا الاختبار.
test_records = []


IGNORE_TEST_RECORD_DEPENDENCIES = [
    "Archive Card Owner",
    "Currency",
    "Archive Bank",
    "Archive Region",
    "Archive Representative",
    "User",
    "File",
]
PENDING_DOCTYPE = (
    "Archive Pending Operation"
)


class TestArchivePendingOperation(
    IntegrationTestCase
):
    
    def setUp(self):
        super().setUp()

        frappe.set_user(
            "Administrator"
        )

        self.suffix = (
            uuid4()
            .hex[:8]
            .upper()
        )

        self.operation_names = set()
        self.file_ids = set()

        self.card_owner = (
            self._make_master(
                "Archive Card Owner",
                "card_owner_name",
                f"TEST OWNER {self.suffix}",
            )
        )

        self.bank = (
            self._make_master(
                "Archive Bank",
                "bank_name",
                f"TEST BANK {self.suffix}",
            )
        )

        self.region = (
            self._make_master(
                "Archive Region",
                "region_name",
                f"TEST REGION {self.suffix}",
            )
        )

        self.representative = (
            self._make_master(
                "Archive Representative",
                "representative_name",
                f"TEST REP {self.suffix}",
            )
        )

        self.currency = (
            self._get_test_currency()
        )

    def test_stale_ledger_correction_is_rejected(
        self,
    ):
        created = self._create()

        name = created[
            "name"
        ]

        details = (
            get_pending_operation_details(
                name
            )
        )

        old_modified = (
            details[
                "operation"
            ][
                "modified"
            ]
        )

        update_pending_operation(
            name,
            {
                "notes":
                    (
                        "MODIFIED AFTER "
                        "CORRECTION DIALOG OPENED"
                    ),
            },
            expected_modified=
                old_modified,
        )

        current_doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        correction_rows = [
            {
                "name":
                    row.name,

                "suspended_amount":
                    (
                        1100
                        if row.idx == 1
                        else
                        row.suspended_amount
                    ),

                "returned_amount":
                    row.returned_amount,

                "return_datetime":
                    row.return_datetime,
            }

            for row in (
                current_doc
                    .ledger_entries
            )
        ]

        with self.assertRaisesRegex(
            frappe.ValidationError,
            "تم تعديل العملية بعد فتح شاشة التصحيح",
        ):
            correct_pending_ledger(
                name,
                {
                    "reason":
                        (
                            "STALE CORRECTION "
                            f"{self.suffix}"
                        ),

                    "expected_modified":
                        old_modified,

                    "ledger_entries":
                        correction_rows,
                },
            )
        current_doc.reload()

        self.assertEqual(
            current_doc
                .total_suspended,
            1000,
        )

        self.assertEqual(
            current_doc
                .ledger_entries[0]
                .suspended_amount,
            1000,
        )

    def test_ledger_correction_accepts_current_modified_token(
        self,
    ):
        created = self._create()

        name = created[
            "name"
        ]

        details = (
            get_pending_operation_details(
                name
            )
        )

        expected_modified = (
            details[
                "operation"
            ][
                "modified"
            ]
        )

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        correction_rows = [
            {
                "name":
                    row.name,

                "suspended_amount":
                    (
                        1100
                        if row.idx == 1
                        else
                        row.suspended_amount
                    ),

                "returned_amount":
                    row.returned_amount,

                "return_datetime":
                    row.return_datetime,
            }

            for row in (
                doc.ledger_entries
            )
        ]

        corrected = (
            correct_pending_ledger(
                name,
                {
                    "reason":
                        (
                            "CURRENT TOKEN CORRECTION "
                            f"{self.suffix}"
                        ),

                    "expected_modified":
                        expected_modified,

                    "ledger_entries":
                        correction_rows,
                },
            )
        )

        self.assertEqual(
            corrected[
                "total_suspended"
            ],
            1100,
        )

        self.assertEqual(
            corrected[
                "total_returned"
            ],
            0,
        )

        self.assertEqual(
            corrected[
                "remaining_amount"
            ],
            1100,
        )
        
    def tearDown(self):
        frappe.set_user(
            "Administrator"
        )

        self._cleanup_test_files()

        frappe.db.rollback()

        super().tearDown()

    def _make_master(
        self,
        doctype,
        fieldname,
        value,
    ):
        data = {
            "doctype":
                doctype,

            fieldname:
                value,
        }

        meta = frappe.get_meta(
            doctype
        )

        if meta.get_field(
            "disabled"
        ):
            data["disabled"] = 0

        if meta.get_field(
            "notes"
        ):
            data["notes"] = (
                "AUTOMATED TEST"
            )

        doc = frappe.get_doc(
            data
        )

        doc.insert(
            ignore_permissions=True
        )

        return doc.name

    def _get_test_currency(
        self,
    ):
        if frappe.db.exists(
            "Currency",
            "USD",
        ):
            return "USD"

        currencies = frappe.get_all(
            "Currency",
            pluck="name",
            limit=1,
        )

        self.assertTrue(
            currencies,
            "No Currency records exist.",
        )

        return currencies[0]

    def _get_other_currency(
        self,
    ):
        currencies = frappe.get_all(
            "Currency",
            filters={
                "name": [
                    "!=",
                    self.currency,
                ],
            },
            pluck="name",
            limit=1,
        )

        return (
            currencies[0]
            if currencies
            else None
        )

    def _payload(
        self,
        *,
        card_number=None,
        ledger_entries=None,
        **overrides,
    ):
        payload = {
            "card_name":
                (
                    "AUTOMATED PENDING "
                    f"{self.suffix}"
                ),

            "card_number":
                (
                    card_number
                    or
                    "0000000000001234"
                ),

            "operation_datetime":
                now_datetime(),

            "card_owner":
                self.card_owner,

            "currency":
                self.currency,

            "bank":
                self.bank,

            "region":
                self.region,

            "machine_location":
                (
                    "AUTOMATED LOCATION "
                    f"{self.suffix}"
                ),

            "machine_no":
                (
                    "ATM-"
                    f"{self.suffix}"
                ),

            "branch_no":
                (
                    "BR-"
                    f"{self.suffix}"
                ),

            "representative":
                self.representative,

            "ledger_entries":
                (
                    ledger_entries
                    or [
                        {
                            "suspended_amount":
                                1000,

                            "returned_amount":
                                0,
                        }
                    ]
                ),

            "notes":
                (
                    "AUTOMATED TEST "
                    f"{self.suffix}"
                ),
        }

        payload.update(
            overrides
        )

        return payload

    def _create(
        self,
        **payload_overrides,
    ):
        result = (
            create_pending_operation(
                self._payload(
                    **payload_overrides
                )
            )
        )

        self.operation_names.add(
            result["name"]
        )

        return result

    def _remember_file(
        self,
        file_id,
    ):
        if file_id:
            self.file_ids.add(
                file_id
            )

        return file_id

    def _cleanup_test_files(
        self,
    ):
        for operation_name in list(
            self.operation_names
        ):
            if not frappe.db.exists(
                PENDING_DOCTYPE,
                operation_name,
            ):
                continue

            try:
                doc = frappe.get_doc(
                    PENDING_DOCTYPE,
                    operation_name,
                )

                for attachment in list(
                    doc.attachments
                    or []
                ):
                    file_id = (
                        attachment.file_id
                    )

                    if not file_id:
                        continue

                    try:
                        delete_pending_attachment_service(
                            operation_name=
                                operation_name,

                            file_id=
                                file_id,
                        )

                        self.file_ids.discard(
                            file_id
                        )

                    except Exception:
                        pass

            except Exception:
                pass

        for file_id in list(
            self.file_ids
        ):
            if not frappe.db.exists(
                "File",
                file_id,
            ):
                continue

            try:
                frappe.delete_doc(
                    "File",
                    file_id,
                    ignore_permissions=True,
                )

            except Exception:
                pass

        self.file_ids.clear()

    # =========================================================
    # Financial engine
    # =========================================================

    def test_create_recalculates_financials_and_preserves_card_number(
        self,
    ):
        card_number = (
            "0000000000007001"
        )

        result = self._create(
            card_number=
                card_number,

            ledger_entries=[
                {
                    "suspended_amount":
                        1000,

                    "returned_amount":
                        0,
                },
                {
                    "suspended_amount":
                        0,

                    "returned_amount":
                        250,

                    "return_datetime":
                        now_datetime(),
                },
            ],
        )

        self.assertEqual(
            result["total_suspended"],
            1000,
        )

        self.assertEqual(
            result["total_returned"],
            250,
        )

        self.assertEqual(
            result["remaining_amount"],
            750,
        )

        self.assertEqual(
            result["status"],
            "مرتجعة غير مكتملة",
        )

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            result["name"],
        )

        self.assertEqual(
            doc.card_number,
            card_number,
        )

        self.assertEqual(
            len(
                doc.ledger_entries
            ),
            2,
        )

        self.assertEqual(
            doc.ledger_entries[0]
                .remaining_amount,
            1000,
        )

        self.assertEqual(
            doc.ledger_entries[1]
                .remaining_amount,
            750,
        )

        for row in (
            doc.ledger_entries
        ):
            self.assertTrue(
                row.entered_by
            )

            self.assertTrue(
                row.entered_at
            )

            self.assertEqual(
                row.currency,
                self.currency,
            )

        events = frappe.get_all(
            "Archive Pending Operation Log",
            filters={
                "pending_operation":
                    doc.name,
            },
            pluck="event_type",
        )

        self.assertIn(
            "created",
            events,
        )

    def test_invalid_ledger_rows_are_rejected(
        self,
    ):
        invalid_ledgers = [
            [
                {
                    "suspended_amount":
                        0,

                    "returned_amount":
                        0,
                }
            ],
            [
                {
                    "suspended_amount":
                        -1,

                    "returned_amount":
                        0,
                }
            ],
            [
                {
                    "suspended_amount":
                        100,

                    "returned_amount":
                        200,

                    "return_datetime":
                        now_datetime(),
                }
            ],
            [
                {
                    "suspended_amount":
                        100,

                    "returned_amount":
                        50,
                }
            ],
        ]

        for index, ledger in enumerate(
            invalid_ledgers,
            start=1,
        ):
            with self.subTest(
                ledger=index
            ):
                payload = self._payload(
                    card_number=(
                        "800000000000"
                        f"{index:04d}"
                    ),

                    card_name=(
                        "INVALID LEDGER "
                        f"{self.suffix} "
                        f"{index}"
                    ),

                    ledger_entries=
                        ledger,
                )

                with self.assertRaises(
                    frappe.ValidationError
                ):
                    create_pending_operation(
                        payload
                    )

    def test_returns_are_append_only_and_over_return_is_rejected(
        self,
    ):
        created = self._create()

        name = created[
            "name"
        ]

        original = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        original_row_name = (
            original
            .ledger_entries[0]
            .name
        )

        first_return = (
            add_pending_return(
                name,
                {
                    "returned_amount":
                        300,
                },
            )
        )

        self.assertEqual(
            first_return[
                "remaining_amount"
            ],
            700,
        )

        self.assertEqual(
            first_return["status"],
            "مرتجعة غير مكتملة",
        )

        completed = (
            add_pending_return(
                name,
                {
                    "returned_amount":
                        700,
                },
            )
        )

        self.assertEqual(
            completed[
                "total_returned"
            ],
            1000,
        )

        self.assertEqual(
            completed[
                "remaining_amount"
            ],
            0,
        )

        self.assertEqual(
            completed["status"],
            "مرتجعة مكتملة",
        )

        with self.assertRaises(
            frappe.ValidationError
        ):
            add_pending_return(
                name,
                {
                    "returned_amount":
                        1,
                },
            )

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        self.assertEqual(
            len(
                doc.ledger_entries
            ),
            3,
        )

        self.assertEqual(
            doc.ledger_entries[0]
                .name,
            original_row_name,
        )

        self.assertEqual(
            doc.ledger_entries[1]
                .suspended_amount,
            0,
        )

        self.assertEqual(
            doc.ledger_entries[2]
                .suspended_amount,
            0,
        )

        details = (
            get_pending_operation_details(
                name
            )
        )

        self.assertFalse(
            details[
                "capabilities"
            ][
                "can_add_return"
            ]
        )

    def test_direct_historical_ledger_mutation_is_rejected(
        self,
    ):
        created = self._create()

        name = created[
            "name"
        ]

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        doc.ledger_entries[0] \
            .suspended_amount = 1500

        with self.assertRaises(
            frappe.PermissionError
        ):
            doc.save(
                ignore_permissions=True
            )

        doc.reload()

        self.assertEqual(
            doc.total_suspended,
            1000,
        )

        self.assertEqual(
            doc.ledger_entries[0]
                .suspended_amount,
            1000,
        )

    def test_operation_currency_is_immutable_after_creation(
        self,
    ):
        other_currency = (
            self._get_other_currency()
        )

        if not other_currency:
            self.skipTest(
                "Only one Currency exists."
            )

        created = self._create()

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            created["name"],
        )

        doc.currency = (
            other_currency
        )

        with self.assertRaises(
            frappe.ValidationError
        ):
            doc.save(
                ignore_permissions=True
            )

        doc.reload()

        self.assertEqual(
            doc.currency,
            self.currency,
        )

    def test_explicit_ledger_correction_recalculates_and_audits(
        self,
    ):
        created = self._create()

        name = created[
            "name"
        ]

        add_pending_return(
            name,
            {
                "returned_amount":
                    300,
            },
        )

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        corrected_rows = []

        for row in (
            doc.ledger_entries
        ):
            corrected_rows.append(
                {
                    "name":
                        row.name,

                    "suspended_amount":
                        (
                            1200
                            if row.idx == 1
                            else
                            row.suspended_amount
                        ),

                    "returned_amount":
                        row.returned_amount,

                    "return_datetime":
                        row.return_datetime,
                }
            )

        corrected = (
            correct_pending_ledger(
                name,
                {
                    "reason":
                        (
                            "AUTOMATED CORRECTION "
                            f"{self.suffix}"
                        ),

                    "ledger_entries":
                        corrected_rows,
                },
            )
        )

        self.assertEqual(
            corrected[
                "total_suspended"
            ],
            1200,
        )

        self.assertEqual(
            corrected[
                "total_returned"
            ],
            300,
        )

        self.assertEqual(
            corrected[
                "remaining_amount"
            ],
            900,
        )

        logs = frappe.get_all(
            "Archive Pending Operation Log",
            filters={
                "pending_operation":
                    name,

                "event_type":
                    "ledger_corrected",
            },
            fields=[
                "remarks",
            ],
        )

        self.assertTrue(
            logs
        )

        self.assertIn(
            "AUTOMATED CORRECTION",
            logs[-1].remarks,
        )

    # =========================================================
    # Metadata / optimistic concurrency
    # =========================================================

    def test_metadata_edit_does_not_modify_financial_history(
        self,
    ):
        created = self._create()

        name = created[
            "name"
        ]

        before = (
            get_pending_operation_details(
                name
            )
        )

        old_modified = (
            before[
                "operation"
            ][
                "modified"
            ]
        )

        ledger_before = [
            (
                row[
                    "name"
                ],
                row[
                    "suspended_amount"
                ],
                row[
                    "returned_amount"
                ],
                row[
                    "remaining_amount"
                ],
            )
            for row in (
                before[
                    "ledger_entries"
                ]
            )
        ]

        updated = (
            update_pending_operation(
                name,
                {
                    "machine_location":
                        (
                            "UPDATED LOCATION "
                            f"{self.suffix}"
                        ),

                    "notes":
                        (
                            "UPDATED NOTES "
                            f"{self.suffix}"
                        ),
                },
                expected_modified=
                    old_modified,
            )
        )

        self.assertEqual(
            updated[
                "operation"
            ][
                "machine_location"
            ],
            (
                "UPDATED LOCATION "
                f"{self.suffix}"
            ),
        )

        with self.assertRaises(
            frappe.ValidationError
        ):
            update_pending_operation(
                name,
                {
                    "notes":
                        "STALE WRITE",
                },
                expected_modified=
                    old_modified,
            )

        after = (
            get_pending_operation_details(
                name
            )
        )

        ledger_after = [
            (
                row[
                    "name"
                ],
                row[
                    "suspended_amount"
                ],
                row[
                    "returned_amount"
                ],
                row[
                    "remaining_amount"
                ],
            )
            for row in (
                after[
                    "ledger_entries"
                ]
            )
        ]

        self.assertEqual(
            ledger_before,
            ledger_after,
        )

        self.assertEqual(
            after[
                "operation"
            ][
                "total_suspended"
            ],
            1000,
        )

        events = frappe.get_all(
            "Archive Pending Operation Log",
            filters={
                "pending_operation":
                    name,
            },
            pluck="event_type",
        )

        self.assertIn(
            "manual_edit",
            events,
        )

    # =========================================================
    # Search / context
    # =========================================================

    def test_context_scope_is_server_side_and_rows_are_lightweight(
        self,
    ):
        first = self._create(
            card_number=
                "0000000000009101",
        )

        second = self._create(
            card_number=
                "0000000000009102",

            card_name=
                (
                    "OTHER OWNER "
                    f"{self.suffix}"
                ),
        )

        frappe.db.set_value(
            PENDING_DOCTYPE,
            second["name"],
            "owner",
            "Guest",
            update_modified=False,
        )

        own_rows = (
            get_pending_context_rows(
                user=
                    "Administrator",

                scope=
                    "own",
            )
        )

        all_rows = (
            get_pending_context_rows(
                user=
                    "Administrator",

                scope=
                    "all",
            )
        )

        own_names = {
            row.name
            for row
            in own_rows
        }

        all_names = {
            row.name
            for row
            in all_rows
        }

        self.assertIn(
            first["name"],
            own_names,
        )

        self.assertNotIn(
            second["name"],
            own_names,
        )

        self.assertIn(
            first["name"],
            all_names,
        )

        self.assertIn(
            second["name"],
            all_names,
        )

        first_row = next(
            row
            for row
            in own_rows
            if row.name
            == first["name"]
        )

        self.assertNotIn(
            "ledger_entries",
            first_row,
        )

        self.assertNotIn(
            "attachments",
            first_row,
        )

        self.assertNotIn(
            "notes",
            first_row,
        )

        self.assertIn(
            "search_text",
            first_row,
        )

    def test_shared_arabic_search_normalizer_is_used(
        self,
    ):
        sample = (
            build_pending_search_text(
                {
                    "bank_name":
                        "البنك الأهلي",

                    "region_name":
                        "صنعاء",

                    "machine_no":
                        "١٢٣٤",
                }
            )
        )

        expected = (
            normalize_search_text(
                "البنك الأهلي صنعاء ١٢٣٤"
            )
        )

        self.assertEqual(
            sample,
            expected,
        )

        self.assertIn(
            "1234",
            sample,
        )

    # =========================================================
    # Smart autocomplete
    # =========================================================

    def test_smart_lookup_ranking_related_values_and_conflicts(
        self,
    ):
        location = (
            "SMART NORTH "
            f"{self.suffix}"
        )

        machine = (
            "ATM-SMART-"
            f"{self.suffix}"
        )

        branch = (
            "BR-SMART-"
            f"{self.suffix}"
        )

        for index in range(
            1,
            4,
        ):
            self._create(
                card_number=(
                    "920000000000"
                    f"{index:04d}"
                ),

                card_name=(
                    "SMART TEST "
                    f"{self.suffix} "
                    f"{index}"
                ),

                machine_location=
                    location,

                machine_no=
                    machine,

                branch_no=
                    branch,
            )

        suggestion_result = (
            get_pending_suggestions(
                fieldname=
                    "machine_no",

                query=
                    machine,

                context={
                    "bank":
                        self.bank,

                    "region":
                        self.region,

                    "machine_location":
                        location,
                },

                limit=10,
            )
        )

        values = [
            item[
                "value"
            ]
            for item
            in suggestion_result[
                "suggestions"
            ]
        ]

        self.assertIn(
            machine,
            values,
        )

        related = (
            get_pending_related_fields(
                fieldname=
                    "machine_no",

                value=
                    machine,

                context={
                    "bank":
                        self.bank,

                    "region":
                        self.region,

                    "machine_location":
                        location,
                },
            )
        )

        self.assertEqual(
            related[
                "related"
            ][
                "machine_location"
            ][
                "value"
            ],
            location,
        )

        self.assertEqual(
            related[
                "related"
            ][
                "branch_no"
            ][
                "value"
            ],
            branch,
        )

        self.assertEqual(
            related[
                "related"
            ][
                "branch_no"
            ][
                "confidence"
            ],
            "high",
        )

        conflict_branch = (
            "BR-CONFLICT-"
            f"{self.suffix}"
        )

        self._create(
            card_number=
                "9200000000009999",

            card_name=
                (
                    "SMART CONFLICT "
                    f"{self.suffix}"
                ),

            machine_location=
                location,

            machine_no=
                machine,

            branch_no=
                conflict_branch,
        )

        conflicted = (
            get_pending_related_fields(
                fieldname=
                    "machine_no",

                value=
                    machine,

                context={
                    "bank":
                        self.bank,

                    "region":
                        self.region,

                    "machine_location":
                        location,
                },
            )
        )

        self.assertNotIn(
            "branch_no",
            conflicted[
                "related"
            ],
        )

    def test_create_only_user_gets_no_historical_suggestions(
        self,
    ):
        with patch.object(
            pending_lookups,
            "get_pending_capabilities_service",
            return_value={
                "can_create":
                    True,

                "can_view":
                    False,

                "scope":
                    None,
            },
        ):
            result = (
                pending_lookups
                .get_pending_suggestions(
                    fieldname=
                        "machine_no",

                    query=
                        "ATM",

                    context={},
                )
            )

        self.assertEqual(
            result[
                "suggestions"
            ],
            [],
        )

        self.assertIsNone(
            result["scope"]
        )

    # =========================================================
    # Timeline
    # =========================================================

    def test_business_timeline_contains_expected_events_in_descending_order(
        self,
    ):
        created = self._create()

        name = created[
            "name"
        ]

        details = (
            get_pending_operation_details(
                name
            )
        )

        update_pending_operation(
            name,
            {
                "notes":
                    (
                        "TIMELINE EDIT "
                        f"{self.suffix}"
                    ),
            },
            expected_modified=(
                details[
                    "operation"
                ][
                    "modified"
                ]
            ),
        )

        add_pending_return(
            name,
            {
                "returned_amount":
                    250,
            },
        )

        timeline = (
            get_pending_operation_timeline(
                name
            )
        )

        event_types = [
            event[
                "event_type"
            ]
            for event
            in timeline[
                "events"
            ]
        ]

        self.assertIn(
            "created",
            event_types,
        )

        self.assertIn(
            "manual_edit",
            event_types,
        )

        self.assertIn(
            "return_added",
            event_types,
        )

        self.assertIn(
            "status_change",
            event_types,
        )

        times = [
            get_datetime(
                event[
                    "event_datetime"
                ]
            )
            for event
            in timeline[
                "events"
            ]
        ]

        for index in range(
            len(times) - 1
        ):
            self.assertGreaterEqual(
                times[index],
                times[index + 1],
            )

    # =========================================================
    # Attachments
    # =========================================================

    def test_attachment_identity_is_file_name_record_not_url_or_hash(
        self,
    ):
        content = (
            b"ARCHIVE PENDING "
            b"ATTACHMENT SAME CONTENT"
        )

        first = (
            stage_pending_attachment_file(
                filename=(
                    "first-"
                    f"{self.suffix}.txt"
                ),
                content=
                    content,
            )
        )

        first_file_id = (
            self._remember_file(
                first[
                    "file_id"
                ]
            )
        )

        created = self._create(
            card_number=
                "9300000000000001",

            attachments=[
                {
                    "file_id":
                        first_file_id,
                }
            ],
        )

        name = created[
            "name"
        ]

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        self.assertEqual(
            len(
                doc.attachments
            ),
            1,
        )

        self.assertEqual(
            doc.attachments[0]
                .file_id,
            first_file_id,
        )

        first_file = (
            frappe.db.get_value(
                "File",
                first_file_id,
                [
                    "attached_to_doctype",
                    "attached_to_name",
                ],
                as_dict=True,
            )
        )

        self.assertEqual(
            first_file
                .attached_to_doctype,
            PENDING_DOCTYPE,
        )

        self.assertEqual(
            first_file
                .attached_to_name,
            name,
        )

        second = (
            add_uploaded_pending_attachment(
                operation_name=
                    name,

                filename=(
                    "second-"
                    f"{self.suffix}.txt"
                ),

                # نفس المحتوى عمدًا.
                content=
                    content,
            )
        )

        second_file_id = (
            self._remember_file(
                second[
                    "attachment"
                ][
                    "file_id"
                ]
            )
        )

        self.assertNotEqual(
            first_file_id,
            second_file_id,
        )

        delete_pending_attachment_service(
            operation_name=
                name,

            file_id=
                second_file_id,
        )

        self.file_ids.discard(
            second_file_id
        )

        self.assertTrue(
            frappe.db.exists(
                "File",
                first_file_id,
            )
        )

        self.assertFalse(
            frappe.db.exists(
                "File",
                second_file_id,
            )
        )

        doc.reload()

        self.assertEqual(
            [
                row.file_id
                for row
                in doc.attachments
            ],
            [
                first_file_id
            ],
        )

        events = frappe.get_all(
            "Archive Pending Operation Log",
            filters={
                "pending_operation":
                    name,
            },
            pluck="event_type",
        )

        self.assertIn(
            "attachment_added",
            events,
        )

        self.assertIn(
            "attachment_deleted",
            events,
        )

        delete_pending_attachment_service(
            operation_name=
                name,

            file_id=
                first_file_id,
        )

        self.file_ids.discard(
            first_file_id
        )

        self.assertFalse(
            frappe.db.exists(
                "File",
                first_file_id,
            )
        )

    def test_file_attached_to_another_document_cannot_be_reused(
        self,
    ):
        staged = (
            stage_pending_attachment_file(
                filename=(
                    "foreign-"
                    f"{self.suffix}.txt"
                ),

                content=
                    b"FOREIGN FILE",
            )
        )

        file_id = (
            self._remember_file(
                staged[
                    "file_id"
                ]
            )
        )

        frappe.db.set_value(
            "File",
            file_id,
            {
                "attached_to_doctype":
                    "User",

                "attached_to_name":
                    "Administrator",
            },
            update_modified=False,
        )

        with self.assertRaises(
            frappe.ValidationError
        ):
            create_pending_operation(
                self._payload(
                    card_number=
                        "9300000000000002",

                    attachments=[
                        {
                            "file_id":
                                file_id,
                        }
                    ],
                )
            )


class TestPendingOperationPermissions(
    UnitTestCase
):
    def test_own_scope_is_intersection_with_actions(
        self,
    ):
        own_user = (
            "own@example.com"
        )

        other_user = (
            "other@example.com"
        )

        own_operation = (
            frappe._dict(
                owner=
                    own_user
            )
        )

        other_operation = (
            frappe._dict(
                owner=
                    other_user
            )
        )

        permissions = {
            "view_own_pending_operations":
                1,

            # حتى لو Edit All موجود:
            # View Scope يبقى own.
            "edit_all_pending_operations":
                1,

            "add_pending_return":
                1,

            "correct_pending_ledger":
                1,
        }

        with patch.object(
            pending_permissions,
            "_get_pending_role_permissions",
            return_value=
                permissions,
        ):
            self.assertEqual(
                pending_permissions
                    ._get_pending_scope(
                        own_user
                    ),
                "own",
            )

            self.assertTrue(
                pending_permissions
                    ._can_view_pending_operation(
                        own_operation,
                        user=
                            own_user,
                    )
            )

            self.assertFalse(
                pending_permissions
                    ._can_view_pending_operation(
                        other_operation,
                        user=
                            own_user,
                    )
            )

            self.assertTrue(
                pending_permissions
                    ._can_edit_pending_operation(
                        own_operation,
                        user=
                            own_user,
                    )
            )

            self.assertFalse(
                pending_permissions
                    ._can_edit_pending_operation(
                        other_operation,
                        user=
                            own_user,
                    )
            )

            self.assertTrue(
                pending_permissions
                    ._can_add_pending_return(
                        own_operation,
                        user=
                            own_user,
                    )
            )

            self.assertFalse(
                pending_permissions
                    ._can_add_pending_return(
                        other_operation,
                        user=
                            own_user,
                    )
            )

            self.assertTrue(
                pending_permissions
                    ._can_correct_pending_ledger(
                        own_operation,
                        user=
                            own_user,
                    )
            )

            self.assertFalse(
                pending_permissions
                    ._can_correct_pending_ledger(
                        other_operation,
                        user=
                            own_user,
                    )
            )

    def test_action_permissions_without_view_never_grant_access(
        self,
    ):
        user = (
            "action-only@example.com"
        )

        operation = (
            frappe._dict(
                owner=
                    user
            )
        )

        permissions = {
            "edit_all_pending_operations":
                1,

            "add_pending_return":
                1,

            "correct_pending_ledger":
                1,
        }

        with patch.object(
            pending_permissions,
            "_get_pending_role_permissions",
            return_value=
                permissions,
        ):
            self.assertIsNone(
                pending_permissions
                    ._get_pending_scope(
                        user,
                        throw=False,
                    )
            )

            self.assertFalse(
                pending_permissions
                    ._can_view_pending_operation(
                        operation,
                        user=
                            user,
                    )
            )

            self.assertFalse(
                pending_permissions
                    ._can_edit_pending_operation(
                        operation,
                        user=
                            user,
                    )
            )

            self.assertFalse(
                pending_permissions
                    ._can_add_pending_return(
                        operation,
                        user=
                            user,
                    )
            )

            self.assertFalse(
                pending_permissions
                    ._can_correct_pending_ledger(
                        operation,
                        user=
                            user,
                    )
            )

    def test_create_only_capabilities_have_no_view_scope(
        self,
    ):
        user = (
            "create-only@example.com"
        )

        permissions = {
            "create_pending_operation":
                1,
        }

        with patch.object(
            pending_permissions,
            "_get_pending_role_permissions",
            return_value=
                permissions,
        ):
            capabilities = (
                pending_permissions
                .get_pending_capabilities(
                    user
                )
            )

        self.assertTrue(
            capabilities[
                "can_create"
            ]
        )

        self.assertFalse(
            capabilities[
                "can_view"
            ]
        )

        self.assertIsNone(
            capabilities[
                "scope"
            ]
        )