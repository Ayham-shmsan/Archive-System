from __future__ import annotations

import time
import unittest

import frappe
from frappe.utils import add_days, cint, cstr, flt, today

from archive.api.deposits import (
	ROLE_DEPOSITS_APPROVE,
	ROLE_DEPOSITS_EDIT_FUTURE,
	ROLE_DEPOSITS_EDIT_PAST,
	ROLE_DEPOSITS_EDIT_TODAY,
	ROLE_DEPOSITS_SCREEN_ACCESS as ROLE_DEPOSITS_ACCESS,
	ROLE_DEPOSITS_STOPPED_REASON,
	USER_FUTURE_APPROVAL_DAYS_FIELD,
	USER_FUTURE_DAYS_FIELD,
	USER_FUTURE_STOPPED_REASON_DAYS_FIELD,
	USER_PAST_APPROVAL_DAYS_FIELD,
	USER_PAST_DAYS_FIELD,
	USER_PAST_STOPPED_REASON_DAYS_FIELD,
	_compute_day_stats,
	_load_period_dataset,
	_sort_items,
	approve_deposit,
	get_deposits_context,
	has_deposit_approval_role,
	has_deposit_stopped_reason_role,
	save_daily_deposits,
	unapprove_deposit,
)
from archive.services.card_audit import rebuild_all_cards_state_spans


class TestArchiveCardDeposit(unittest.TestCase):
	def setUp(self) -> None:
		frappe.set_user("Administrator")
		frappe.db.savepoint("test_archive_deposits_sp")
		rebuild_all_cards_state_spans()

	def tearDown(self) -> None:
		frappe.set_user("Administrator")
		frappe.db.rollback(save_point="test_archive_deposits_sp")
		frappe.clear_cache(user="Administrator")

	def _grant_admin_new_deposit_roles(self, past_days: int = 30, future_days: int = 30) -> None:
		for r_name in (ROLE_DEPOSITS_APPROVE, ROLE_DEPOSITS_STOPPED_REASON):
			if not frappe.db.exists(
				"Has Role",
				{"parent": "Administrator", "parenttype": "User", "role": r_name},
			):
				frappe.get_doc(
					{
						"doctype": "Has Role",
						"parent": "Administrator",
						"parenttype": "User",
						"parentfield": "roles",
						"role": r_name,
					}
				).insert(ignore_permissions=True)
		frappe.db.set_value(
			"User",
			"Administrator",
			{
				USER_PAST_DAYS_FIELD: past_days,
				USER_FUTURE_DAYS_FIELD: future_days,
				USER_PAST_APPROVAL_DAYS_FIELD: past_days,
				USER_FUTURE_APPROVAL_DAYS_FIELD: future_days,
				USER_PAST_STOPPED_REASON_DAYS_FIELD: past_days,
				USER_FUTURE_STOPPED_REASON_DAYS_FIELD: future_days,
			},
			update_modified=False,
		)
		frappe.clear_cache(user="Administrator")

	def test_01_historical_spans_reconstruction_accuracy(self) -> None:
		"""Verify CRD-00023 and CRD-00009 historical state spans match actual audit logs."""
		spans_23 = frappe.db.sql(
			"""
			SELECT valid_from, valid_to, status, is_deleted, daily_limit
			FROM `tabArchive Card State Span`
			WHERE card = 'CRD-00023'
			ORDER BY valid_from ASC
			""",
			as_dict=True,
		)
		self.assertEqual(len(spans_23), 3)
		self.assertEqual(cstr(spans_23[0].valid_from), "2026-11-04")
		self.assertEqual(cstr(spans_23[0].valid_to), "2026-11-05")
		self.assertEqual(cstr(spans_23[0].status), "نشطة")
		self.assertEqual(flt(spans_23[0].daily_limit), 520000.0)

		self.assertEqual(cstr(spans_23[1].valid_from), "2026-11-06")
		self.assertEqual(cstr(spans_23[1].valid_to), "2026-11-06")
		self.assertEqual(cstr(spans_23[1].status), "موقفة نهائياً")

		self.assertEqual(cstr(spans_23[2].valid_from), "2026-11-07")
		self.assertEqual(cstr(spans_23[2].status), "نشطة")
		self.assertEqual(flt(spans_23[2].daily_limit), 100000.0)

		# Verify CRD-00009 spans (daily_limit and region transfer history)
		spans_9 = frappe.db.sql(
			"""
			SELECT valid_from, valid_to, daily_limit, region_name
			FROM `tabArchive Card State Span`
			WHERE card = 'CRD-00009'
			ORDER BY valid_from ASC
			""",
			as_dict=True,
		)
		self.assertEqual(len(spans_9), 4)
		self.assertEqual(flt(spans_9[0].daily_limit), 123000.0)
		self.assertEqual(cstr(spans_9[0].region_name), "العزيزية")
		self.assertEqual(flt(spans_9[1].daily_limit), 90000.0)
		self.assertEqual(cstr(spans_9[1].region_name), "العزيزية")
		self.assertEqual(flt(spans_9[2].daily_limit), 90000.0)
		self.assertEqual(cstr(spans_9[2].region_name), "سكاكا")
		self.assertEqual(flt(spans_9[3].daily_limit), 100000.0)
		self.assertEqual(cstr(spans_9[3].region_name), "سكاكا")

		ctx_nov6_c9 = get_deposits_context(deposit_date="2026-11-06", period_mode="day", page_size="all")
		row_nov6_c9 = next((r for r in ctx_nov6_c9["rows"] if r["card"] == "CRD-00009"), None)
		self.assertIsNotNone(row_nov6_c9)
		self.assertEqual(cstr(row_nov6_c9["region_name"]), "العزيزية")

		ctx_nov8_c9 = get_deposits_context(deposit_date="2026-11-08", period_mode="day", page_size="all")
		row_nov8_c9 = next((r for r in ctx_nov8_c9["rows"] if r["card"] == "CRD-00009"), None)
		self.assertIsNotNone(row_nov8_c9)
		self.assertEqual(cstr(row_nov8_c9["region_name"]), "سكاكا")

		# Verify get_deposits_context on 2026-11-05 includes CRD-00023 as active
		ctx_nov5 = get_deposits_context(deposit_date="2026-11-05", period_mode="day", page_size="all")
		row_nov5 = next((r for r in ctx_nov5["rows"] if r["card"] == "CRD-00023"), None)
		self.assertIsNotNone(row_nov5)
		self.assertFalse(row_nov5["is_historical_inactive"])

		# Verify get_deposits_context on 2026-11-06 hides CRD-00023 when only a zeroed deposit exists,
		# and preserves CRD-00023 as read-only when a meaningful historical deposit (> 0) exists
		ctx_nov6_zero = get_deposits_context(deposit_date="2026-11-06", period_mode="day", page_size="all")
		row_nov6_zero = next((r for r in ctx_nov6_zero["rows"] if r["card"] == "CRD-00023"), None)
		self.assertIsNone(row_nov6_zero)

		frappe.db.set_value(
			"Archive Card Deposit",
			{"card": "CRD-00023", "deposit_date": "2026-11-06"},
			"deposit_amount",
			20000.0,
			update_modified=False,
		)
		ctx_nov6_with_dep = get_deposits_context(deposit_date="2026-11-06", period_mode="day", page_size="all")
		row_nov6_with_dep = next((r for r in ctx_nov6_with_dep["rows"] if r["card"] == "CRD-00023"), None)
		self.assertIsNotNone(row_nov6_with_dep)
		self.assertTrue(row_nov6_with_dep["is_historical_inactive"])
		self.assertFalse(row_nov6_with_dep["row_permissions"]["can_edit_amount"])
		self.assertFalse(row_nov6_with_dep["row_permissions"]["can_approve"])
		self.assertEqual(flt(row_nov6_with_dep["daily_limit"]), 520000.0)

		frappe.db.delete("Archive Card Deposit", {"card": "CRD-00023", "deposit_date": "2026-11-06"})
		ctx_nov6 = get_deposits_context(deposit_date="2026-11-06", period_mode="day", page_size="all")
		row_nov6 = next((r for r in ctx_nov6["rows"] if r["card"] == "CRD-00023"), None)
		self.assertIsNone(row_nov6)

		# Verify get_deposits_context on 2026-11-08 shows CRD-00023 as active with 100,000 limit
		ctx_nov8 = get_deposits_context(deposit_date="2026-11-08", period_mode="day", page_size="all")
		row_nov8 = next((r for r in ctx_nov8["rows"] if r["card"] == "CRD-00023"), None)
		self.assertIsNotNone(row_nov8)
		self.assertEqual(flt(row_nov8["daily_limit"]), 100000.0)

	def test_02_period_modes_month_year_range_include_future_days(self) -> None:
		"""Verify month, year, and range modes include all days in the period (including future days)."""
		ctx_month = get_deposits_context(
			period_mode="month",
			period_month=11,
			period_year=2026,
			page_size="all",
		)
		self.assertEqual(ctx_month["period_mode"], "month")
		self.assertEqual(ctx_month["start_date"], "2026-11-01")
		self.assertEqual(ctx_month["end_date"], "2026-11-30")
		month_dates = sorted({r["deposit_date"] for r in ctx_month["rows"]})
		self.assertIn("2026-11-01", month_dates)
		self.assertIn("2026-11-30", month_dates)

		ctx_year = get_deposits_context(
			period_mode="year",
			period_year=2026,
			page_size="all",
		)
		self.assertEqual(ctx_year["period_mode"], "year")
		self.assertEqual(ctx_year["start_date"], "2026-01-01")
		self.assertEqual(ctx_year["end_date"], "2026-12-31")
		year_dates = sorted({r["deposit_date"] for r in ctx_year["rows"]})
		self.assertIn("2026-12-31", year_dates)
		self.assertGreater(ctx_year["pagination"]["total_count"], 1400)

		ctx_range = get_deposits_context(
			period_mode="range",
			date_from="2026-11-04",
			date_to="2026-11-07",
			page_size="all",
		)
		self.assertEqual(ctx_range["period_mode"], "range")
		self.assertEqual(ctx_range["start_date"], "2026-11-04")
		self.assertEqual(ctx_range["end_date"], "2026-11-07")
		distinct_dates = sorted({r["deposit_date"] for r in ctx_range["rows"]})
		self.assertEqual(
			distinct_dates,
			["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"],
		)

		with self.assertRaises(frappe.ValidationError):
			get_deposits_context(
				period_mode="range",
				date_from="2026-11-10",
				date_to="2026-11-05",
			)

	def test_03_six_stat_cards_and_target_freezing_rules(self) -> None:
		"""Verify the 6 KPI cards identity and that target freezes ONLY on representative or region filter."""
		d_str = cstr(today())
		ctx_all = get_deposits_context(deposit_date=d_str, period_mode="day")
		stats = ctx_all["stats"]
		self.assertEqual(
			stats["total_cards"],
			stats["deposited_count"] + stats["not_deposited_count"] + stats["stopped_for_reason_count"],
		)
		self.assertFalse(stats["target_is_frozen"])
		full_target = flt(stats["total_daily_target"])
		self.assertGreater(full_target, 0)

		# Bank filter must NOT freeze target
		sample_bank = ctx_all["rows"][0]["bank"]
		ctx_bank = get_deposits_context(deposit_date=d_str, period_mode="day", bank=sample_bank)
		self.assertFalse(ctx_bank["stats"]["target_is_frozen"])

		# Search filter must NOT freeze target
		ctx_search = get_deposits_context(deposit_date=d_str, period_mode="day", search="الحامدي")
		self.assertFalse(ctx_search["stats"]["target_is_frozen"])

		# Representative filter MUST freeze target visually while keeping numeric value intact
		sample_rep = ctx_all["rows"][0]["representative"]
		ctx_rep = get_deposits_context(deposit_date=d_str, period_mode="day", representative=sample_rep)
		self.assertTrue(ctx_rep["stats"]["target_is_frozen"])
		self.assertGreater(flt(ctx_rep["stats"]["total_daily_target"]), 0)

		# Region filter MUST freeze target visually
		sample_reg = ctx_all["rows"][0]["region"]
		ctx_reg = get_deposits_context(deposit_date=d_str, period_mode="day", region=sample_reg)
		self.assertTrue(ctx_reg["stats"]["target_is_frozen"])

	def test_04_stopped_for_reason_and_two_step_exemption_rule(self) -> None:
		"""Verify stopped_for_reason creation without prior deposit, and mandatory 2-step exemption when deposit > 0."""
		# First verify that without explicit role grant, even Administrator does not have stopped_for_reason role by default
		frappe.db.delete(
			"Has Role",
			{"parent": "Administrator", "role": ("in", [ROLE_DEPOSITS_APPROVE, ROLE_DEPOSITS_STOPPED_REASON])},
		)
		frappe.clear_cache(user="Administrator")
		self.assertFalse(has_deposit_stopped_reason_role("Administrator"))
		self._grant_admin_new_deposit_roles(past_days=30, future_days=30)
		self.assertTrue(has_deposit_stopped_reason_role("Administrator"))

		d_str = "2026-11-12"
		card_id = "CRD-00023"

		# Ensure no deposit exists on 2026-11-12 for CRD-00023
		frappe.db.delete("Archive Card Deposit", {"card": card_id, "deposit_date": d_str})

		# 1. Enabling stopped_for_reason directly when no deposit exists succeeds and creates a record
		res1 = save_daily_deposits(
			deposit_date=d_str,
			items=[{"card": card_id, "deposit_date": d_str, "amount": 0, "stopped_for_reason": 1}],
		)
		self.assertEqual(res1["created_count"], 1)

		ctx1 = get_deposits_context(deposit_date=d_str, period_mode="day", page_size="all")
		row1 = next(r for r in ctx1["rows"] if r["card"] == card_id)
		self.assertTrue(row1["stopped_for_reason"])
		self.assertEqual(row1["status"], "stopped_for_reason")
		self.assertEqual(ctx1["stats"]["stopped_for_reason_count"], 1)

		# Status filter "stopped_for_reason" returns only that row
		ctx_filtered = get_deposits_context(
			deposit_date=d_str,
			period_mode="day",
			status_filter="stopped_for_reason",
		)
		self.assertEqual(len(ctx_filtered["rows"]), 1)
		self.assertEqual(ctx_filtered["rows"][0]["card"], card_id)

		# 2. Uncheck stopped_for_reason and save
		save_daily_deposits(
			deposit_date=d_str,
			items=[{"card": card_id, "deposit_date": d_str, "amount": 0, "stopped_for_reason": 0}],
		)

		# 3. Save a positive deposit (25,000)
		save_daily_deposits(
			deposit_date=d_str,
			items=[{"card": card_id, "deposit_date": d_str, "amount": 25000, "stopped_for_reason": 0}],
		)

		# 4. Attempt to enable stopped_for_reason while saved deposit > 0 (even if sending amount=0 in same call) MUST fail!
		with self.assertRaises(frappe.ValidationError):
			save_daily_deposits(
				deposit_date=d_str,
				items=[{"card": card_id, "deposit_date": d_str, "amount": 0, "stopped_for_reason": 1}],
			)

		# 5. Mandatory 2-step flow: Step A -> zero amount and save; Step B -> enable stopped_for_reason and save
		save_daily_deposits(
			deposit_date=d_str,
			items=[{"card": card_id, "deposit_date": d_str, "amount": 0, "stopped_for_reason": 0}],
		)
		save_daily_deposits(
			deposit_date=d_str,
			items=[{"card": card_id, "deposit_date": d_str, "amount": 0, "stopped_for_reason": 1}],
		)
		dep_row = frappe.db.get_value(
			"Archive Card Deposit",
			{"card": card_id, "deposit_date": d_str},
			["deposit_amount", "stopped_for_reason", "stopped_reason_by"],
			as_dict=True,
		)
		self.assertEqual(flt(dep_row.deposit_amount), 0.0)
		self.assertEqual(cint(dep_row.stopped_for_reason), 1)
		self.assertEqual(cstr(dep_row.stopped_reason_by), "Administrator")

	def test_05_approval_and_unapproval_lifecycle_and_server_lock(self) -> None:
		"""Verify approve_deposit, server lock against any modification, and unapprove_deposit."""
		frappe.db.delete(
			"Has Role",
			{"parent": "Administrator", "role": ("in", [ROLE_DEPOSITS_APPROVE, ROLE_DEPOSITS_STOPPED_REASON])},
		)
		frappe.clear_cache(user="Administrator")
		self.assertFalse(has_deposit_approval_role("Administrator"))
		self._grant_admin_new_deposit_roles(past_days=30, future_days=30)
		self.assertTrue(has_deposit_approval_role("Administrator"))

		d_str = "2026-11-13"
		card_id = "CRD-00023"
		frappe.db.delete("Archive Card Deposit", {"card": card_id, "deposit_date": d_str})

		# Cannot approve before saving a positive deposit
		with self.assertRaises(frappe.ValidationError):
			approve_deposit(card=card_id, deposit_date=d_str)

		# Save positive deposit
		save_daily_deposits(
			deposit_date=d_str,
			items=[{"card": card_id, "deposit_date": d_str, "amount": 40000}],
		)

		# Cannot approve if expected_amount differs from saved amount (simulating unsaved UI edit)
		with self.assertRaises(frappe.ValidationError):
			approve_deposit(card=card_id, deposit_date=d_str, expected_amount=45000)

		# Approve succeeds when saved amount matches
		app_res = approve_deposit(card=card_id, deposit_date=d_str, expected_amount=40000)
		self.assertTrue(app_res["is_approved"])
		self.assertEqual(flt(app_res["approved_amount"]), 40000.0)
		self.assertEqual(app_res["audit"]["approved_by"], "Administrator")

		# Server lock: save_daily_deposits cannot modify amount or stopped_for_reason while approved
		with self.assertRaises(frappe.ValidationError):
			save_daily_deposits(
				deposit_date=d_str,
				items=[{"card": card_id, "deposit_date": d_str, "amount": 50000}],
			)
		with self.assertRaises(frappe.ValidationError):
			save_daily_deposits(
				deposit_date=d_str,
				items=[{"card": card_id, "deposit_date": d_str, "amount": 0, "stopped_for_reason": 1}],
			)

		# Unapprove succeeds and unlocks editing
		unapp_res = unapprove_deposit(card=card_id, deposit_date=d_str)
		self.assertFalse(unapp_res["is_approved"])
		self.assertEqual(unapp_res["audit"]["unapproved_by"], "Administrator")

		# Editing after unapproval succeeds
		save_daily_deposits(
			deposit_date=d_str,
			items=[{"card": card_id, "deposit_date": d_str, "amount": 50000}],
		)
		new_amt = frappe.db.get_value(
			"Archive Card Deposit",
			{"card": card_id, "deposit_date": d_str},
			"deposit_amount",
		)
		self.assertEqual(flt(new_amt), 50000.0)

	def test_06_multi_day_atomic_save_and_rollback(self) -> None:
		"""Verify saving across multiple dates in a single batch commits atomically and rolls back all dates on any error."""
		self._grant_admin_new_deposit_roles(past_days=30, future_days=30)
		d1 = "2026-11-11"
		d2 = "2026-11-12"
		card_id = "CRD-00023"
		frappe.db.delete("Archive Card Deposit", {"card": card_id, "deposit_date": ("in", [d1, d2])})

		# 1. Valid multi-day batch save succeeds across both dates
		res = save_daily_deposits(
			deposit_date=d1,
			items=[
				{"card": card_id, "deposit_date": d1, "amount": 15000},
				{"card": card_id, "deposit_date": d2, "amount": 20000},
			],
		)
		self.assertEqual(res["saved_count"], 2)
		self.assertEqual(
			flt(frappe.db.get_value("Archive Card Deposit", {"card": card_id, "deposit_date": d1}, "deposit_amount")),
			15000.0,
		)
		self.assertEqual(
			flt(frappe.db.get_value("Archive Card Deposit", {"card": card_id, "deposit_date": d2}, "deposit_amount")),
			20000.0,
		)

		# 2. Batch where d1 is valid (30,000) but d2 exceeds daily_limit (999,999,999) MUST roll back d1 as well!
		with self.assertRaises(frappe.ValidationError):
			save_daily_deposits(
				deposit_date=d1,
				items=[
					{"card": card_id, "deposit_date": d1, "amount": 30000},
					{"card": card_id, "deposit_date": d2, "amount": 999999999},
				],
			)

		# d1 must still be 15,000.0!
		self.assertEqual(
			flt(frappe.db.get_value("Archive Card Deposit", {"card": card_id, "deposit_date": d1}, "deposit_amount")),
			15000.0,
		)

	def test_07_independent_permissions_and_day_windows(self) -> None:
		"""Verify independent roles and past/future day windows for amount edit, stopped_for_reason, and approval."""
		test_email = "nashwan@gmail.com"
		if not frappe.db.exists("User", test_email):
			return

		today_str = cstr(today())
		yesterday_str = cstr(add_days(today_str, -1))
		three_days_ago_str = cstr(add_days(today_str, -3))
		card_id = "CRD-00023"

		frappe.db.delete(
			"Has Role",
			{
				"parent": test_email,
				"role": (
					"in",
					[
						ROLE_DEPOSITS_ACCESS,
						ROLE_DEPOSITS_EDIT_TODAY,
						ROLE_DEPOSITS_EDIT_PAST,
						ROLE_DEPOSITS_EDIT_FUTURE,
						ROLE_DEPOSITS_APPROVE,
						ROLE_DEPOSITS_STOPPED_REASON,
					],
				),
			},
		)

		for r_name in (ROLE_DEPOSITS_ACCESS, ROLE_DEPOSITS_EDIT_TODAY):
			frappe.get_doc(
				{
					"doctype": "Has Role",
					"parent": test_email,
					"parenttype": "User",
					"parentfield": "roles",
					"role": r_name,
				}
			).insert(ignore_permissions=True)

		frappe.db.set_value(
			"User",
			test_email,
			{
				USER_PAST_DAYS_FIELD: 0,
				USER_FUTURE_DAYS_FIELD: 0,
				USER_PAST_APPROVAL_DAYS_FIELD: 1,
				USER_FUTURE_APPROVAL_DAYS_FIELD: 0,
				USER_PAST_STOPPED_REASON_DAYS_FIELD: 1,
				USER_FUTURE_STOPPED_REASON_DAYS_FIELD: 0,
			},
			update_modified=False,
		)
		frappe.clear_cache(user=test_email)

		frappe.set_user(test_email)
		try:
			# User lacks ROLE_DEPOSITS_STOPPED_REASON -> cannot toggle stopped_for_reason on today
			with self.assertRaises(frappe.PermissionError):
				save_daily_deposits(
					deposit_date=today_str,
					items=[{"card": card_id, "deposit_date": today_str, "stopped_for_reason": 1}],
				)

			# Grant ROLE_DEPOSITS_STOPPED_REASON and ROLE_DEPOSITS_APPROVE
			frappe.set_user("Administrator")
			for r_name in (ROLE_DEPOSITS_STOPPED_REASON, ROLE_DEPOSITS_APPROVE):
				frappe.get_doc(
					{
						"doctype": "Has Role",
						"parent": test_email,
						"parenttype": "User",
						"parentfield": "roles",
						"role": r_name,
					}
				).insert(ignore_permissions=True)
			frappe.clear_cache(user=test_email)
			frappe.set_user(test_email)

			# Now user can toggle stopped_for_reason on yesterday (within 1-day past window), even without ROLE_DEPOSITS_EDIT_PAST!
			frappe.db.delete("Archive Card Deposit", {"card": card_id, "deposit_date": yesterday_str})
			res_y = save_daily_deposits(
				deposit_date=yesterday_str,
				items=[{"card": card_id, "deposit_date": yesterday_str, "stopped_for_reason": 1}],
			)
			self.assertEqual(res_y["created_count"], 1)

			# But 3 days ago is outside the 1-day stopped_for_reason window -> PermissionError
			with self.assertRaises(frappe.PermissionError):
				save_daily_deposits(
					deposit_date=three_days_ago_str,
					items=[{"card": card_id, "deposit_date": three_days_ago_str, "stopped_for_reason": 1}],
				)
		finally:
			frappe.set_user("Administrator")

	def test_08_performance_365_days_x_100_cards_benchmark(self) -> None:
		"""Benchmark full year (365 days) with 100 active cards = 36,500 rows."""
		for i in range(100):
			synth_card = f"CRD-BENCH-{i + 1:04d}"
			frappe.db.sql(
				"""
				INSERT INTO `tabArchive Card State Span`
				(`name`, `creation`, `modified`, `modified_by`, `owner`, `docstatus`, `idx`,
				 `card`, `valid_from`, `valid_to`, `status`, `is_active`, `is_deleted`, `daily_limit`,
				 `card_type`, `base_card_name`, `copy_no`, `card_name`,
				 `card_number`, `account_number`, `account_number_normalized`,
				 `bank`, `bank_name`, `representative`, `representative_name`,
				 `region`, `region_name`, `group_key`, `search_norm`)
				VALUES
				(%(name)s, NOW(), NOW(), 'Administrator', 'Administrator', 0, 1,
				 %(card)s, '2026-01-01', '9999-12-31', 'نشطة', 1, 0, 100000.0,
				 'أعمال', %(base_name)s, 1, %(base_name)s,
				 %(card_num)s, %(acc_num)s, %(acc_num)s,
				 'البنك الأهلي السعودي', 'البنك الأهلي السعودي', 'REP-00135', 'علي البحيري',
				 'REGION-00134', 'سكاكا', %(group_key)s, %(search_norm)s)
				""",
				{
					"name": f"SPAN-BENCH-{i + 1:04d}",
					"card": synth_card,
					"base_name": f"بطاقة قياس الأداء {i + 1}",
					"card_num": f"9900{i + 1:04d}",
					"acc_num": f"8800{i + 1:04d}",
					"group_key": f"بطاقه قياس الاداء {i + 1}|8800{i + 1:04d}|البنك الأهلي السعودي",
					"search_norm": f"بطاقه قياس الاداء {i + 1} 9900{i + 1:04d} 8800{i + 1:04d} البنك الاهلي السعودي علي البحيري سكاكا",
				},
			)

		t0 = time.perf_counter()
		items = _load_period_dataset(
			start_date="2026-01-01",
			end_date="2026-12-31",
			hydrate_all_audits=False,
			allowed_fiscal_years={"2026"},
		)
		stats = _compute_day_stats(items, items, freeze_target=False)
		sorted_items = _sort_items(items, sort_by="serial_no", sort_order="desc")
		elapsed = time.perf_counter() - t0

		self.assertGreaterEqual(len(sorted_items), 36500)
		self.assertEqual(stats["total_cards"], len(sorted_items))
		# Must complete well under 2.5 seconds for 36,500+ rows
		self.assertLess(elapsed, 2.5, f"36,500-row period dataset took {elapsed:.3f}s")

	def test_09_card_eligibility_historical_protection_and_reactivation(self) -> None:
		"""Verify all 5 target cards (CRD-00002, CRD-00015, CRD-00023, CRD-00027, CRD-00024) and read-only/reactivation rules."""
		self._grant_admin_new_deposit_roles(past_days=30, future_days=30)

		# 1. CRD-00002 and CRD-00015 must have 0 active spans and 0 rows in Nov 2026 (since they have no valid deposits)
		ctx_nov = get_deposits_context(
			period_mode="month",
			period_month=11,
			period_year=2026,
			page_size="all",
		)
		nov_rows_c2 = [r for r in ctx_nov["rows"] if r["card"] == "CRD-00002"]
		nov_rows_c15 = [r for r in ctx_nov["rows"] if r["card"] == "CRD-00015"]
		self.assertEqual(len(nov_rows_c2), 0)
		self.assertEqual(len(nov_rows_c15), 0)

		# 2. Zeroed or pre-creation deposits on CRD-00023 (2026-11-06), CRD-00027 (2026-11-07), CRD-00024 (2026-11-06) must NOT show
		self.assertFalse(
			any(r["card"] == "CRD-00023" and r["deposit_date"] == "2026-11-06" for r in ctx_nov["rows"])
		)
		self.assertFalse(
			any(r["card"] == "CRD-00027" and r["deposit_date"] == "2026-11-07" for r in ctx_nov["rows"])
		)
		self.assertFalse(
			any(r["card"] == "CRD-00024" and r["deposit_date"] == "2026-11-06" for r in ctx_nov["rows"])
		)

		# 3. Active card CRD-00023 on active date 2026-11-11: save deposit 35,000, then stop the card currently
		frappe.db.delete("Archive Card Deposit", {"card": "CRD-00023", "deposit_date": "2026-11-11"})
		save_daily_deposits(
			deposit_date="2026-11-11",
			items=[{"card": "CRD-00023", "deposit_date": "2026-11-11", "amount": 35000}],
		)

		# Stop CRD-00023 currently (e.g. temporary stop on 2026-11-12)
		from archive.api.cards import change_card_status

		change_card_status(
			"CRD-00023",
			"موقفة مؤقتاً",
			reason="اختبار إيقاف مؤقت",
			event_date="2026-11-12",
		)

		# On 2026-11-11, CRD-00023 MUST still appear because it has a saved historical deposit (35,000),
		# AND because its CURRENT status is stopped, the row MUST be completely Read-Only!
		ctx_nov11_stopped = get_deposits_context(
			deposit_date="2026-11-11",
			period_mode="day",
			page_size="all",
		)
		row_nov11_stopped = next((r for r in ctx_nov11_stopped["rows"] if r["card"] == "CRD-00023"), None)
		self.assertIsNotNone(row_nov11_stopped)
		self.assertEqual(flt(row_nov11_stopped["deposit_amount"]), 35000.0)
		self.assertFalse(row_nov11_stopped["is_currently_active"])
		for perm_k in (
			"can_edit_date",
			"can_edit_amount",
			"can_toggle_stopped_date",
			"can_toggle_stopped_reason",
			"can_approve_date",
			"can_approve",
			"can_unapprove",
		):
			self.assertFalse(
				row_nov11_stopped["row_permissions"][perm_k],
				f"Permission {perm_k} must be False while card is currently stopped",
			)

		# Server MUST reject modifying amount, stopped_for_reason, or approving while card is currently stopped
		with self.assertRaises(frappe.ValidationError):
			save_daily_deposits(
				deposit_date="2026-11-11",
				items=[{"card": "CRD-00023", "deposit_date": "2026-11-11", "amount": 40000}],
			)
		with self.assertRaises(frappe.ValidationError):
			approve_deposit(card="CRD-00023", deposit_date="2026-11-11", expected_amount=35000)

		# On 2026-11-10 (when CRD-00023 was historically active, but has no deposit > 0),
		# while CRD-00023 is currently stopped, it must NOT appear at all (even if stopped_for_reason=1 with 0.00)
		frappe.db.delete("Archive Card Deposit", {"card": "CRD-00023", "deposit_date": "2026-11-10"})
		ctx_nov10_stopped = get_deposits_context(
			deposit_date="2026-11-10",
			period_mode="day",
			page_size="all",
		)
		self.assertIsNone(next((r for r in ctx_nov10_stopped["rows"] if r["card"] == "CRD-00023"), None))

		# And in range 2026-11-10..2026-11-13 while CRD-00023 is stopped, it appears ONLY on 2026-11-11 (where deposit_amount > 0)
		frappe.db.delete("Archive Card Deposit", {"card": "CRD-00023", "deposit_date": ("in", ["2026-11-12", "2026-11-13"])})
		ctx_range_stopped = get_deposits_context(
			period_mode="range",
			date_from="2026-11-10",
			date_to="2026-11-13",
			page_size="all",
		)
		c23_dates_while_stopped = [
			r["deposit_date"] for r in ctx_range_stopped["rows"] if r["card"] == "CRD-00023"
		]
		self.assertEqual(c23_dates_while_stopped, ["2026-11-11"])

		# On 2026-11-13 (during stopped period with no deposit), CRD-00023 must NOT appear
		ctx_nov13_stopped = get_deposits_context(
			deposit_date="2026-11-13",
			period_mode="day",
			page_size="all",
		)
		self.assertIsNone(next((r for r in ctx_nov13_stopped["rows"] if r["card"] == "CRD-00023"), None))

		# 4. Reactivate CRD-00023 on 2026-11-14
		change_card_status(
			"CRD-00023",
			"نشطة",
			event_date="2026-11-14",
		)

		# Stopped period (2026-11-12..2026-11-13) still has no rows generated
		ctx_nov13_after = get_deposits_context(
			deposit_date="2026-11-13",
			period_mode="day",
			page_size="all",
		)
		self.assertIsNone(next((r for r in ctx_nov13_after["rows"] if r["card"] == "CRD-00023"), None))

		# Reactivated date (2026-11-14) shows CRD-00023 as active and editable
		ctx_nov14_after = get_deposits_context(
			deposit_date="2026-11-14",
			period_mode="day",
			page_size="all",
		)
		row_nov14 = next((r for r in ctx_nov14_after["rows"] if r["card"] == "CRD-00023"), None)
		self.assertIsNotNone(row_nov14)
		self.assertTrue(row_nov14["is_currently_active"])
		self.assertTrue(row_nov14["row_permissions"]["can_edit_amount"])

		# Historical active date (2026-11-11) is now editable and approvable again!
		ctx_nov11_reactivated = get_deposits_context(
			deposit_date="2026-11-11",
			period_mode="day",
			page_size="all",
		)
		row_nov11_reactivated = next(
			(r for r in ctx_nov11_reactivated["rows"] if r["card"] == "CRD-00023"), None
		)
		self.assertIsNotNone(row_nov11_reactivated)
		self.assertTrue(row_nov11_reactivated["is_currently_active"])
		self.assertTrue(row_nov11_reactivated["row_permissions"]["can_edit_amount"])
		self.assertTrue(row_nov11_reactivated["row_permissions"]["can_approve"])

		app_res = approve_deposit(card="CRD-00023", deposit_date="2026-11-11", expected_amount=35000)
		self.assertTrue(app_res["is_approved"])
		unapp_res = unapprove_deposit(card="CRD-00023", deposit_date="2026-11-11")
		self.assertFalse(unapp_res["is_approved"])

	def test_10_total_deposited_amount_counts_only_approved_deposits(self) -> None:
		"""Verify total_deposited_amount sums ONLY approved deposits across all 4 period modes, filters, pagination, and historical stopped cards."""
		self._grant_admin_new_deposit_roles(past_days=30, future_days=30)

		d1 = "2026-11-14"
		d2 = "2026-11-15"
		frappe.db.delete("Archive Card Deposit", {"deposit_date": ("in", [d1, d2])})

		# 1. Save two deposits on d1: CRD-00023 (40,000) and CRD-00009 (25,000), both initially unapproved
		save_res = save_daily_deposits(
			deposit_date=d1,
			items=[
				{"card": "CRD-00023", "deposit_date": d1, "amount": 40000},
				{"card": "CRD-00009", "deposit_date": d1, "amount": 25000},
			],
		)
		# Neither is approved yet -> total_deposited_amount MUST be 0.0 (while deposited_count is 2)
		self.assertEqual(flt(save_res["stats"]["total_deposited_amount"]), 0.0)
		self.assertEqual(cint(save_res["stats"]["deposited_count"]), 2)

		ctx_d1 = get_deposits_context(deposit_date=d1, period_mode="day", page_size=1)
		self.assertEqual(flt(ctx_d1["stats"]["total_deposited_amount"]), 0.0)

		# 2. Editing an unapproved deposit (CRD-00009 from 25,000 to 30,000) keeps total_deposited_amount at 0.0
		save_res_edit = save_daily_deposits(
			deposit_date=d1,
			items=[{"card": "CRD-00009", "deposit_date": d1, "amount": 30000}],
		)
		self.assertEqual(flt(save_res_edit["stats"]["total_deposited_amount"]), 0.0)

		# 3. Approve CRD-00023 (40,000) -> total_deposited_amount becomes 40,000.0 (CRD-00009's 30,000 is still excluded)
		approve_deposit(card="CRD-00023", deposit_date=d1, expected_amount=40000)
		ctx_after_one = get_deposits_context(deposit_date=d1, period_mode="day", page_size=1)
		self.assertEqual(flt(ctx_after_one["stats"]["total_deposited_amount"]), 40000.0)

		# 4. Save and approve a deposit on d2 for CRD-00009 (35,000)
		save_daily_deposits(
			deposit_date=d2,
			items=[{"card": "CRD-00009", "deposit_date": d2, "amount": 35000}],
		)
		approve_deposit(card="CRD-00009", deposit_date=d2, expected_amount=35000)

		# Verify range (d1..d2) sums ONLY approved deposits across both days: 40,000 + 35,000 = 75,000 (excluding unapproved 30,000 on d1)
		ctx_range = get_deposits_context(
			period_mode="range",
			date_from=d1,
			date_to=d2,
			page_size=1,
		)
		self.assertEqual(flt(ctx_range["stats"]["total_deposited_amount"]), 75000.0)

		# Verify month and year modes include only approved deposits as well
		ctx_month = get_deposits_context(
			period_mode="month",
			period_month=11,
			period_year=2026,
			search="CRD-00023",
			page_size=1,
		)
		expected_c23_approved_nov = sum(
			flt(r["deposit_amount"], 2)
			for r in get_deposits_context(
				period_mode="month",
				period_month=11,
				period_year=2026,
				search="CRD-00023",
				page_size="all",
			)["rows"]
			if r.get("is_approved")
		)
		self.assertEqual(flt(ctx_month["stats"]["total_deposited_amount"]), flt(expected_c23_approved_nov, 2))

		# 5. Unapprove CRD-00009 on d2 -> range total immediately drops from 75,000 to 40,000
		unapprove_deposit(card="CRD-00009", deposit_date=d2)
		ctx_range_after_unapprove = get_deposits_context(
			period_mode="range",
			date_from=d1,
			date_to=d2,
			page_size=1,
		)
		self.assertEqual(flt(ctx_range_after_unapprove["stats"]["total_deposited_amount"]), 40000.0)

		# 6. Historical approved deposit on CRD-00023 (d1 = 40,000) stays counted even if CRD-00023 is later stopped!
		from archive.api.cards import change_card_status

		change_card_status(
			"CRD-00023",
			"موقفة مؤقتاً",
			reason="اختبار احتساب المعتمد التاريخي بعد الإيقاف",
			event_date=d2,
		)
		ctx_d1_after_stop = get_deposits_context(deposit_date=d1, period_mode="day", page_size=1)
		self.assertEqual(flt(ctx_d1_after_stop["stats"]["total_deposited_amount"]), 40000.0)
