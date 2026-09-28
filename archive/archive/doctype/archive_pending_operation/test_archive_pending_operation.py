from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

import frappe

from frappe.tests import (
    IntegrationTestCase,
    UnitTestCase,
)

from frappe.utils import (
    add_days,
    get_datetime,
    now_datetime,
    today,
)

import archive.api.pending_lookups as pending_lookups
import archive.api.pending_operations as pending_operations_api
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
    create_pending_operation,
    get_pending_operation_details,
    mark_pending_operation_failed,
    update_pending_operation,
)

from archive.services.pending_operation_attachments import (
    add_uploaded_pending_attachment,
    delete_pending_attachment as delete_pending_attachment_service,
    stage_pending_attachment_file,
)


test_records = []


IGNORE_TEST_RECORD_DEPENDENCIES = [
    "Archive Account",
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

PENDING_CURRENCY = (
    "SAR"
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

        self.assertTrue(
            frappe.db.exists(
                "Currency",
                PENDING_CURRENCY,
            ),
            "Currency SAR must exist.",
        )

        self.card_owner = (
            self._make_master(
                "Archive Account",
                "account_name",
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


    def _payload(
        self,
        *,
        card_number=None,
        ledger_entries=None,
        **overrides,
    ):
        payload = {
            "bank":
                self.bank,

            "card_name":
                (
                    "AUTOMATED PENDING "
                    f"{self.suffix}"
                ),

            "account_number":
                (
                    "ACC-"
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

            "suspended_note":
                (
                    "SUSPENDED NOTE "
                    f"{self.suffix}"
                ),

            "region":
                self.region,

            "machine_location":
                (
                    "AUTOMATED LOCATION "
                    f"{self.suffix}"
                ),

            "branch_no":
                (
                    "BR-"
                    f"{self.suffix}"
                ),

            "machine_no":
                (
                    "ATM-"
                    f"{self.suffix}"
                ),

            "representative":
                self.representative,

            "card_owner":
                self.card_owner,

            "ledger_entries":
                (
                    ledger_entries
                    or [
                        {
                            "suspended_amount":
                                1000,

                            "returned_amount":
                                0,

                            "return_date":
                                None,

                            "return_note":
                                "",
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
            result[
                "name"
            ]
        )

        return result


    def _current_ledger_payload(
        self,
        name,
        *,
        first_suspended=None,
    ):
        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        result = []

        for row in (
            doc.ledger_entries
        ):
            result.append(
                {
                    "name":
                        row.name,

                    "suspended_amount":
                        (
                            first_suspended
                            if (
                                row.idx == 1
                                and
                                first_suspended
                                is not None
                            )
                            else
                            row.suspended_amount
                        ),

                    "returned_amount":
                        row.returned_amount,

                    "return_date":
                        row.return_date,

                    "return_note":
                        (
                            row.return_note
                            or ""
                        ),
                }
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


    def _cleanup_test_files(self):
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
    # Optimistic concurrency / unified edit
    # =========================================================

    def test_stale_ledger_edit_is_rejected(
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
                        "EDIT DIALOG OPENED"
                    ),
            },
            expected_modified=
                old_modified,
        )

        correction_rows = (
            self._current_ledger_payload(
                name,
                first_suspended=1100,
            )
        )

        with self.assertRaisesRegex(
            frappe.ValidationError,
            "تم تعديل العملية من جلسة أخرى",
        ):
            update_pending_operation(
                name,
                {
                    "ledger_entries":
                        correction_rows,
                },
                expected_modified=
                    old_modified,
            )

        current_doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

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


    def test_ledger_edit_accepts_current_modified_token_without_reason(
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

        rows = (
            self._current_ledger_payload(
                name,
                first_suspended=1100,
            )
        )

        updated = (
            update_pending_operation(
                name,
                {
                    "ledger_entries":
                        rows,
                },
                expected_modified=
                    expected_modified,
            )
        )

        self.assertEqual(
            updated[
                "operation"
            ][
                "total_suspended"
            ],
            1100,
        )

        self.assertEqual(
            updated[
                "operation"
            ][
                "total_returned"
            ],
            0,
        )

        self.assertEqual(
            updated[
                "operation"
            ][
                "remaining_amount"
            ],
            1100,
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
                "event_title",
                "remarks",
                "details_json",
            ],
            order_by=
                "creation asc",
        )

        self.assertTrue(
            logs
        )

        self.assertEqual(
            logs[-1]
                .event_title,
            "تعديل الحركة المالية",
        )

        self.assertFalse(
            logs[-1]
                .remarks
        )


    # =========================================================
    # Financial engine / SAR
    # =========================================================

    def test_create_recalculates_financials_preserves_identifiers_and_forces_sar(
        self,
    ):
        card_number = (
            "0000000000007001"
        )

        account_number = (
            "000012340000"
            f"{self.suffix}"
        )

        result = self._create(
            card_number=
                card_number,

            account_number=
                account_number,

            operation_datetime=
                f"{today()} 10:30:00",

            ledger_entries=[
                {
                    "suspended_amount":
                        1000,

                    "returned_amount":
                        0,

                    "return_date":
                        None,

                    "return_note":
                        "",
                },
                {
                    "suspended_amount":
                        0,

                    "returned_amount":
                        250,

                    "return_date":
                        today(),

                    "return_note":
                        (
                            "INITIAL RETURN "
                            f"{self.suffix}"
                        ),
                },
            ],
        )

        self.assertEqual(
            result[
                "total_suspended"
            ],
            1000,
        )

        self.assertEqual(
            result[
                "total_returned"
            ],
            250,
        )

        self.assertEqual(
            result[
                "remaining_amount"
            ],
            750,
        )

        self.assertEqual(
            result[
                "status"
            ],
            "مرتجعة غير مكتملة",
        )

        self.assertEqual(
            result[
                "currency"
            ],
            PENDING_CURRENCY,
        )

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            result[
                "name"
            ],
        )

        self.assertEqual(
            doc.card_number,
            card_number,
        )

        self.assertEqual(
            doc.account_number,
            account_number,
        )

        self.assertEqual(
            doc.currency,
            PENDING_CURRENCY,
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

        self.assertEqual(
            doc.ledger_entries[1]
                .return_note,
            (
                "INITIAL RETURN "
                f"{self.suffix}"
            ),
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
                PENDING_CURRENCY,
            )

        events = frappe.get_all(
            "Archive Pending Operation Log",
            filters={
                "pending_operation":
                    doc.name,
            },
            pluck=
                "event_type",
        )

        self.assertIn(
            "created",
            events,
        )


    def test_invalid_ledger_rows_are_rejected(
        self,
    ):
        operation_datetime = (
            f"{today()} 12:00:00"
        )

        yesterday = (
            add_days(
                today(),
                -1,
            )
        )

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

                    "return_date":
                        today(),
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
            [
                {
                    "suspended_amount":
                        100,

                    "returned_amount":
                        50,

                    "return_date":
                        yesterday,
                }
            ],
            [
                {
                    "suspended_amount":
                        100,

                    "returned_amount":
                        0,

                    "return_note":
                        "NOTE WITHOUT RETURN",
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

                    operation_datetime=
                        operation_datetime,

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
        created = self._create(
            operation_datetime=
                f"{today()} 09:00:00"
        )

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

                    "return_date":
                        today(),

                    "return_note":
                        (
                            "FIRST RETURN "
                            f"{self.suffix}"
                        ),
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
            first_return[
                "status"
            ],
            "مرتجعة غير مكتملة",
        )

        completed = (
            add_pending_return(
                name,
                {
                    "returned_amount":
                        700,

                    "return_date":
                        today(),

                    "return_note":
                        (
                            "FINAL RETURN "
                            f"{self.suffix}"
                        ),
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
            completed[
                "status"
            ],
            "مرتجعة مكتملة",
        )
        with self.assertRaises(
            frappe.ValidationError
        ):
            mark_pending_operation_failed(
                name,
                {
                    "note":
                        "SHOULD NOT BE ALLOWED",
                },
            )

        completed_doc = (
            get_pending_operation_details(
                name
            )
        )

        self.assertEqual(
            completed_doc[
                "operation"
            ][
                "status"
            ],
            "مرتجعة مكتملة",
        )

        self.assertFalse(
            completed_doc[
                "operation"
            ][
                "is_failed"
            ]
        )

        with self.assertRaises(
            frappe.ValidationError
        ):
            add_pending_return(
                name,
                {
                    "returned_amount":
                        1,

                    "return_date":
                        today(),
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

        self.assertEqual(
            doc.ledger_entries[1]
                .return_note,
            (
                "FIRST RETURN "
                f"{self.suffix}"
            ),
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


    def test_return_date_cannot_precede_operation_date_and_note_is_stored(
        self,
    ):
        operation_date = (
            today()
        )

        created = self._create(
            operation_datetime=
                f"{operation_date} 18:45:00"
        )

        name = created[
            "name"
        ]

        with self.assertRaises(
            frappe.ValidationError
        ):
            add_pending_return(
                name,
                {
                    "returned_amount":
                        100,

                    "return_date":
                        add_days(
                            operation_date,
                            -1,
                        ),

                    "return_note":
                        "TOO EARLY",
                },
            )

        result = add_pending_return(
            name,
            {
                "returned_amount":
                    100,

                "return_date":
                    operation_date,

                "return_note":
                    (
                        "SAME DAY RETURN "
                        f"{self.suffix}"
                    ),
            },
        )

        self.assertEqual(
            result[
                "remaining_amount"
            ],
            900,
        )

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        last_row = (
            doc.ledger_entries[-1]
        )

        self.assertEqual(
            str(
                last_row.return_date
            ),
            operation_date,
        )

        self.assertEqual(
            last_row.return_note,
            (
                "SAME DAY RETURN "
                f"{self.suffix}"
            ),
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


    def test_currency_is_server_owned_sar_and_client_currency_is_rejected(
        self,
    ):
        created = self._create()

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            created[
                "name"
            ],
        )

        self.assertEqual(
            doc.currency,
            PENDING_CURRENCY,
        )

        self.assertTrue(
            all(
                row.currency
                == PENDING_CURRENCY

                for row
                in doc.ledger_entries
            )
        )

        with self.assertRaises(
            frappe.ValidationError
        ):
            create_pending_operation(
                self._payload(
                    card_number=
                        "8100000000000001",

                    currency=
                        "USD",
                )
            )

        details = (
            get_pending_operation_details(
                created[
                    "name"
                ]
            )
        )

        with self.assertRaises(
            frappe.ValidationError
        ):
            update_pending_operation(
                created[
                    "name"
                ],
                {
                    "currency":
                        "USD",
                },
                expected_modified=(
                    details[
                        "operation"
                    ][
                        "modified"
                    ]
                ),
            )


    def test_ledger_edit_recalculates_and_audits_without_reason(
        self,
    ):
        created = self._create(
            operation_datetime=
                f"{today()} 11:00:00"
        )

        name = created[
            "name"
        ]

        add_pending_return(
            name,
            {
                "returned_amount":
                    300,

                "return_date":
                    today(),

                "return_note":
                    (
                        "RETURN BEFORE EDIT "
                        f"{self.suffix}"
                    ),
            },
        )

        details = (
            get_pending_operation_details(
                name
            )
        )

        corrected_rows = (
            self._current_ledger_payload(
                name,
                first_suspended=1200,
            )
        )

        corrected = (
            update_pending_operation(
                name,
                {
                    "ledger_entries":
                        corrected_rows,
                },
                expected_modified=(
                    details[
                        "operation"
                    ][
                        "modified"
                    ]
                ),
            )
        )

        self.assertEqual(
            corrected[
                "operation"
            ][
                "total_suspended"
            ],
            1200,
        )

        self.assertEqual(
            corrected[
                "operation"
            ][
                "total_returned"
            ],
            300,
        )

        self.assertEqual(
            corrected[
                "operation"
            ][
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
                "details_json",
            ],
        )

        self.assertTrue(
            logs
        )

        self.assertFalse(
            logs[-1]
                .remarks
        )

        details_json = (
            frappe.parse_json(
                logs[-1]
                    .details_json
            )
        )

        self.assertIn(
            "ledger_diff",
            details_json,
        )

        self.assertIn(
            "before",
            details_json,
        )

        self.assertIn(
            "after",
            details_json,
        )


    # =========================================================
    # Metadata / atomic edit
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
                    "account_number":
                        (
                            "UPDATED-ACC-"
                            f"{self.suffix}"
                        ),

                    "machine_location":
                        (
                            "UPDATED LOCATION "
                            f"{self.suffix}"
                        ),

                    "suspended_note":
                        (
                            "UPDATED SUSPENDED NOTE "
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
                "account_number"
            ],
            (
                "UPDATED-ACC-"
                f"{self.suffix}"
            ),
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
            pluck=
                "event_type",
        )

        self.assertIn(
            "manual_edit",
            events,
        )


    def test_metadata_and_ledger_save_atomically_from_same_edit_request(
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

        rows = (
            self._current_ledger_payload(
                name,
                first_suspended=1500,
            )
        )

        updated = (
            update_pending_operation(
                name,
                {
                    "account_number":
                        (
                            "ATOMIC-ACC-"
                            f"{self.suffix}"
                        ),

                    "suspended_note":
                        (
                            "ATOMIC NOTE "
                            f"{self.suffix}"
                        ),

                    "ledger_entries":
                        rows,
                },
                expected_modified=(
                    details[
                        "operation"
                    ][
                        "modified"
                    ]
                ),
            )
        )

        self.assertEqual(
            updated[
                "operation"
            ][
                "account_number"
            ],
            (
                "ATOMIC-ACC-"
                f"{self.suffix}"
            ),
        )

        self.assertEqual(
            updated[
                "operation"
            ][
                "total_suspended"
            ],
            1500,
        )

        latest = (
            get_pending_operation_details(
                name
            )
        )

        invalid_rows = (
            self._current_ledger_payload(
                name,
                first_suspended=100,
            )
        )

        invalid_rows.append(
            {
                "suspended_amount":
                    0,

                "returned_amount":
                    200,

                "return_date":
                    today(),

                "return_note":
                    "INVALID OVER RETURN",
            }
        )

        with self.assertRaises(
            frappe.ValidationError
        ):
            update_pending_operation(
                name,
                {
                    "account_number":
                        "SHOULD-NOT-SAVE",

                    "ledger_entries":
                        invalid_rows,
                },
                expected_modified=(
                    latest[
                        "operation"
                    ][
                        "modified"
                    ]
                ),
            )

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            name,
        )

        self.assertEqual(
            doc.account_number,
            (
                "ATOMIC-ACC-"
                f"{self.suffix}"
            ),
        )

        self.assertEqual(
            doc.total_suspended,
            1500,
        )


    def test_correct_only_capability_can_enter_edit_mode_without_metadata_edit(
        self,
    ):
        created = self._create()

        with patch.object(
            pending_operations_api,
            "get_pending_record_permissions",
            return_value={
                "can_edit":
                    False,

                "can_correct_ledger":
                    True,

                "can_add_return":
                    False,
            },
        ):
            details = (
                get_pending_operation_details(
                    created[
                        "name"
                    ]
                )
            )

        capabilities = (
            details[
                "capabilities"
            ]
        )

        self.assertFalse(
            capabilities[
                "can_edit"
            ]
        )

        self.assertTrue(
            capabilities[
                "can_correct_ledger"
            ]
        )

        self.assertTrue(
            capabilities[
                "can_enter_edit_mode"
            ]
        )

        self.assertFalse(
            capabilities[
                "can_manage_attachments"
            ]
        )


    # =========================================================
    # Failed state
    # =========================================================

    def test_mark_failed_records_audit_blocks_returns_and_preserves_failed_status(
        self,
    ):
        created = self._create()

        name = created[
            "name"
        ]

        failed_note = (
            "FAILED TEST "
            f"{self.suffix}"
        )

        result = (
            mark_pending_operation_failed(
                name,
                {
                    "note":
                        failed_note,
                },
            )
        )

        operation = (
            result[
                "operation"
            ]
        )

        self.assertEqual(
            operation[
                "status"
            ],
            "معلقة فاشلة",
        )

        self.assertTrue(
            operation[
                "is_failed"
            ]
        )

        self.assertEqual(
            operation[
                "failed_note"
            ],
            failed_note,
        )

        self.assertTrue(
            operation[
                "failed_at"
            ]
        )

        self.assertTrue(
            operation[
                "failed_by"
            ]
        )

        self.assertFalse(
            result[
                "capabilities"
            ][
                "can_add_return"
            ]
        )

        with self.assertRaises(
            frappe.ValidationError
        ):
            add_pending_return(
                name,
                {
                    "returned_amount":
                        100,

                    "return_date":
                        today(),
                },
            )

        current = (
            get_pending_operation_details(
                name
            )
        )

        rows = (
            self._current_ledger_payload(
                name,
                first_suspended=1200,
            )
        )

        after_ledger_edit = (
            update_pending_operation(
                name,
                {
                    "ledger_entries":
                        rows,
                },
                expected_modified=(
                    current[
                        "operation"
                    ][
                        "modified"
                    ]
                ),
            )
        )

        self.assertEqual(
            after_ledger_edit[
                "operation"
            ][
                "status"
            ],
            "معلقة فاشلة",
        )

        events = frappe.get_all(
            "Archive Pending Operation Log",
            filters={
                "pending_operation":
                    name,
            },
            pluck=
                "event_type",
        )

        self.assertIn(
            "marked_failed",
            events,
        )

        self.assertIn(
            "status_change",
            events,
        )


    def test_failed_fields_cannot_be_mutated_directly(
        self,
    ):
        created = self._create()

        doc = frappe.get_doc(
            PENDING_DOCTYPE,
            created[
                "name"
            ],
        )

        doc.is_failed = 1

        doc.failed_note = (
            "DIRECT TAMPERING"
        )

        doc.failed_by = (
            "Administrator"
        )

        doc.failed_at = (
            now_datetime()
        )

        with self.assertRaises(
            frappe.PermissionError
        ):
            doc.save(
                ignore_permissions=True
            )

        doc.reload()

        self.assertFalse(
            doc.is_failed
        )

        self.assertNotEqual(
            doc.status,
            "معلقة فاشلة",
        )


    # =========================================================
    # Search / Context
    # =========================================================

    def test_context_scope_is_server_side_and_rows_are_lightweight(
        self,
    ):
        first = self._create(
            card_number=
                "0000000000009101",

            account_number=
                (
                    "GRID-ACC-"
                    f"{self.suffix}"
                ),

            suspended_note=
                (
                    "GRID NOTE "
                    f"{self.suffix}"
                ),
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
            second[
                "name"
            ],
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
            first[
                "name"
            ],
            own_names,
        )

        self.assertNotIn(
            second[
                "name"
            ],
            own_names,
        )

        self.assertIn(
            first[
                "name"
            ],
            all_names,
        )

        self.assertIn(
            second[
                "name"
            ],
            all_names,
        )

        first_row = next(
            row
            for row
            in own_rows
            if row.name
            == first[
                "name"
            ]
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
            "account_number",
            first_row,
        )

        self.assertIn(
            "suspended_note",
            first_row,
        )

        self.assertIn(
            "is_failed",
            first_row,
        )

        self.assertIn(
            "search_text",
            first_row,
        )

        self.assertEqual(
            first_row
                .account_number,
            (
                "GRID-ACC-"
                f"{self.suffix}"
            ),
        )

        self.assertEqual(
            first_row
                .suspended_note,
            (
                "GRID NOTE "
                f"{self.suffix}"
            ),
        )


    def test_context_search_text_contains_new_fields_and_return_notes(
        self,
    ):
        account_number = (
            "SEARCH-ACC-"
            f"{self.suffix}"
        )

        suspended_note = (
            "SUSPENDED SEARCH NOTE "
            f"{self.suffix}"
        )

        return_note = (
            "RETURN SEARCH NOTE "
            f"{self.suffix}"
        )

        created = self._create(
            account_number=
                account_number,

            suspended_note=
                suspended_note,

            operation_datetime=
                f"{today()} 08:00:00",
        )

        add_pending_return(
            created[
                "name"
            ],
            {
                "returned_amount":
                    100,

                "return_date":
                    today(),

                "return_note":
                    return_note,
            },
        )

        rows = (
            get_pending_context_rows(
                user=
                    "Administrator",

                scope=
                    "all",
            )
        )

        row = next(
            item
            for item
            in rows
            if item.name
            == created[
                "name"
            ]
        )

        normalized_account = (
            normalize_search_text(
                account_number
            )
        )

        normalized_suspended_note = (
            normalize_search_text(
                suspended_note
            )
        )

        normalized_return_note = (
            normalize_search_text(
                return_note
            )
        )

        self.assertIn(
            normalized_account,
            row.search_text,
        )

        self.assertIn(
            normalized_suspended_note,
            row.search_text,
        )

        self.assertIn(
            normalized_return_note,
            row.search_text,
        )


    def test_shared_arabic_search_normalizer_is_used(
        self,
    ):
        sample = (
            build_pending_search_text(
                {
                    "account_number":
                        "ACC-١٢٣",

                    "bank_name":
                        "البنك الأهلي",

                    "region_name":
                        "صنعاء",

                    "machine_no":
                        "٤٥٦٧",

                    "suspended_note":
                        "ملاحظة معلقة",
                },

                ledger_return_notes=[
                    "إرجاع الفرع الرئيسي",
                ],
            )
        )

        expected = (
            normalize_search_text(
                (
                    "ACC-١٢٣ "
                    "البنك الأهلي "
                    "صنعاء "
                    "٤٥٦٧ "
                    "ملاحظة معلقة "
                    "إرجاع الفرع الرئيسي"
                )
            )
        )

        self.assertEqual(
            sample,
            expected,
        )

        self.assertIn(
            "123",
            sample,
        )

        self.assertIn(
            "4567",
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

                account_number=(
                    "SMART-ACC-"
                    f"{self.suffix}-"
                    f"{index}"
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

            account_number=
                (
                    "SMART-CONFLICT-ACC-"
                    f"{self.suffix}"
                ),

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
            result[
                "scope"
            ]
        )


    # =========================================================
    # Timeline
    # =========================================================

    def test_business_timeline_contains_new_events_and_return_note_in_descending_order(
        self,
    ):
        created = self._create(
            operation_datetime=
                f"{today()} 10:00:00"
        )

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

        return_note = (
            "TIMELINE RETURN "
            f"{self.suffix}"
        )

        add_pending_return(
            name,
            {
                "returned_amount":
                    250,

                "return_date":
                    today(),

                "return_note":
                    return_note,
            },
        )

        mark_pending_operation_failed(
            name,
            {
                "note":
                    (
                        "TIMELINE FAILED "
                        f"{self.suffix}"
                    ),
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

        self.assertIn(
            "marked_failed",
            event_types,
        )

        return_event = next(
            event
            for event
            in timeline[
                "events"
            ]
            if event[
                "event_type"
            ]
            == "return_added"
        )

        self.assertEqual(
            return_event[
                "details"
            ][
                "return_date"
            ],
            today(),
        )

        self.assertEqual(
            return_event[
                "details"
            ][
                "return_note"
            ],
            return_note,
        )

        failed_event = next(
            event
            for event
            in timeline[
                "events"
            ]
            if event[
                "event_type"
            ]
            == "marked_failed"
        )

        self.assertEqual(
            failed_event[
                "details"
            ][
                "failed_note"
            ],
            (
                "TIMELINE FAILED "
                f"{self.suffix}"
            ),
        )

        self.assertEqual(
            timeline[
                "operation"
            ][
                "account_number"
            ],
            (
                "ACC-"
                f"{self.suffix}"
            ),
        )

        self.assertEqual(
            timeline[
                "operation"
            ][
                "status"
            ],
            "معلقة فاشلة",
        )

        self.assertNotIn(
            "currency",
            timeline[
                "operation"
            ],
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
                times[
                    index + 1
                ],
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
            pluck=
                "event_type",
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