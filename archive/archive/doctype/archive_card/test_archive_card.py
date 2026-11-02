# Copyright (c) 2026, Ayham-shmsan and contributors
# See license.txt

from __future__ import annotations

import io
import uuid

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import cint
from PIL import Image

from archive.api.card_family import (
	build_account_change_plan,
	change_card_account_number,
	rename_card_family_base_name,
)
from archive.api.card_timeline import get_card_activity_timeline, get_card_transfer_timeline
from archive.api.cards import (
	change_card_status,
	create_card,
	delete_card,
	get_card_details,
	get_card_family_lookups,
	get_card_image,
	get_card_preview,
	get_cards_context,
	reveal_card_pin,
	transfer_card,
	update_card,
)
from archive.patches.v1_0.setup_card_roles_and_permissions import (
	 execute as setup_card_roles_and_permissions,
)
from archive.services.card_images import stage_uploaded_card_image
from archive.services.card_permissions import (
	ROLE_CARD_IMAGE_PREVIEW,
	ROLE_CARD_MANAGER,
	ROLE_CARD_OFFICER,
	ROLE_CARD_READER,
	has_card_permission,
)
from archive.services.card_security import has_file_permission, is_archive_card_file_doc

FAKE_JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"

test_records = []

IGNORE_TEST_RECORD_DEPENDENCIES = [
	"Archive Account",
	"Archive Card Family",
	"Archive Bank",
	"Archive Region",
	"Archive Representative",
	"User",
	"File",
]


class TestArchiveCard(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		setup_card_roles_and_permissions()
		cls._ensure_test_masters()
		cls._ensure_test_users()

	@classmethod
	def _ensure_test_masters(cls):
		if not frappe.db.exists("Archive Bank", "BNK-CARD-TEST-1"):
			doc = frappe.get_doc(
				{
					"doctype": "Archive Bank",
					"bank_name": "بنك اختبار البطاقات 1",
					"is_active": 1,
				}
			)
			doc.insert(ignore_permissions=True)
			cls.bank_1 = doc.name
		else:
			cls.bank_1 = "BNK-CARD-TEST-1"

		banks = frappe.get_all("Archive Bank", limit=3, pluck="name")
		while len(banks) < 3:
			b = frappe.get_doc(
				{
					"doctype": "Archive Bank",
					"bank_name": f"بنك اختبار البطاقات {uuid.uuid4().hex[:6]}",
					"is_active": 1,
				}
			).insert(ignore_permissions=True)
			banks.append(b.name)
		cls.bank_1, cls.bank_2, cls.bank_3 = banks[0], banks[1], banks[2]

		regions = frappe.get_all("Archive Region", limit=2, pluck="name")
		while len(regions) < 2:
			r = frappe.get_doc(
				{
					"doctype": "Archive Region",
					"region_name": f"منطقة بطاقات {uuid.uuid4().hex[:6]}",
					"is_active": 1,
				}
			).insert(ignore_permissions=True)
			regions.append(r.name)
		cls.region_1, cls.region_2 = regions[0], regions[1]

		reps = frappe.get_all("Archive Representative", limit=2, pluck="name")
		while len(reps) < 2:
			rep = frappe.get_doc(
				{
					"doctype": "Archive Representative",
					"representative_name": f"مندوب بطاقات {uuid.uuid4().hex[:6]}",
					"is_active": 1,
				}
			).insert(ignore_permissions=True)
			reps.append(rep.name)
		cls.rep_1, cls.rep_2 = reps[0], reps[1]

		owners = frappe.get_all("Archive Account", limit=1, pluck="name")
		if not owners:
			acc = frappe.get_doc(
				{
					"doctype": "Archive Account",
					"account_name": f"مالك بطاقات {uuid.uuid4().hex[:6]}",
					"is_active": 1,
				}
			).insert(ignore_permissions=True)
			owners = [acc.name]
		cls.owner_1 = owners[0]

	@classmethod
	def _ensure_test_users(cls):
		cls.manager_user = "card_manager_test@example.com"
		cls.officer_user = "card_officer_test@example.com"
		cls.reader_user = "card_reader_test@example.com"

		for email, first_name, role in (
			(cls.manager_user, "CardManager", ROLE_CARD_MANAGER),
			(cls.officer_user, "CardOfficer", ROLE_CARD_OFFICER),
			(cls.reader_user, "CardReader", ROLE_CARD_READER),
		):
			if not frappe.db.exists("User", email):
				u = frappe.get_doc(
					{
						"doctype": "User",
						"email": email,
						"first_name": first_name,
						"enabled": 1,
						"user_type": "System User",
						"send_welcome_email": 0,
					}
				)
				u.insert(ignore_permissions=True)
			u_doc = frappe.get_doc("User", email)
			u_doc.roles = []
			u_doc.append("roles", {"role": role})
			u_doc.save(ignore_permissions=True)

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def _stage_pair(self) -> tuple[str, str]:
		tag = uuid.uuid4().hex[:8]
		c1_rgb = (uuid.uuid4().int % 250, uuid.uuid4().int % 250, uuid.uuid4().int % 250)
		c2_rgb = (uuid.uuid4().int % 250, uuid.uuid4().int % 250, uuid.uuid4().int % 250)

		buf1 = io.BytesIO()
		Image.new("RGB", (16, 10), color=c1_rgb).save(buf1, format="JPEG")

		buf2 = io.BytesIO()
		Image.new("RGB", (16, 10), color=c2_rgb).save(buf2, format="JPEG")

		front = stage_uploaded_card_image(
			filename=f"front_{tag}.jpg",
			content=buf1.getvalue(),
			content_type="image/jpeg",
			side="front",
		)
		back = stage_uploaded_card_image(
			filename=f"back_{tag}.jpg",
			content=buf2.getvalue(),
			content_type="image/jpeg",
			side="back",
		)
		return front["file_id"], back["file_id"]

	def _make_card(
		self,
		account_number: str | None = None,
		base_card_name: str = "بطاقة الراجحي الذهبية",
		card_number: str | None = None,
		bank: str | None = None,
		pin: str = "4829",
		daily_limit: float | str | None = 50000.0,
		allow_duplicate_account: bool = False,
	) -> dict:
		front_id, back_id = self._stage_pair()
		acc = account_number or f"ACC-{uuid.uuid4().hex[:10].upper()}"
		cnum = card_number or f"4000{uuid.uuid4().int % 10**12:012d}"
		res = create_card(
			{
				"account_number": acc,
				"base_card_name": base_card_name,
				"card_number": cnum,
				"bank": bank or self.bank_1,
				"card_owner": self.owner_1,
				"region": self.region_1,
				"representative": self.rep_1,
				"received_date": "2026-10-01",
				"daily_limit": daily_limit,
				"pin": pin,
				"front_image": front_id,
				"back_image": back_id,
				"status": "نشطة",
				"allow_duplicate_account": 1 if allow_duplicate_account else 0,
			}
		)
		return res["card"]

	def test_01_family_copies_and_monotonic_sequence(self):
		acc = f"SA-FAM-{uuid.uuid4().hex[:8].upper()}"
		c1 = self._make_card(account_number=acc, base_card_name="بطاقة التميز")
		self.assertEqual(c1["copy_no"], 1)
		self.assertEqual(c1["card_name"], "بطاقة التميز")

		# Duplicate without confirmation must fail
		with self.assertRaises(frappe.DuplicateEntryError):
			self._make_card(
				account_number=acc,
				base_card_name="بطاقة التميز",
				allow_duplicate_account=False,
			)

		# Duplicate with confirmation becomes copy 2
		c2 = self._make_card(
			account_number=acc,
			base_card_name="بطاقة التميز",
			allow_duplicate_account=True,
		)
		self.assertEqual(c2["copy_no"], 2)
		self.assertEqual(c2["card_name"], "بطاقة التميز 2")
		self.assertEqual(c2["card_family"], c1["card_family"])

		# Soft-delete copy 2 -> does not reserve copy 2; expected_copy_no and next card must be copy 2
		delete_card(c2["name"], reason="تبديل بطاقة تالفة")
		from archive.api.cards import check_duplicate_account

		dup_info = check_duplicate_account(
			account_number=acc, base_card_name="بطاقة التميز", bank=self.bank_1
		)
		self.assertEqual(dup_info["expected_copy_no"], 2)

		c3 = self._make_card(
			account_number=acc,
			base_card_name="بطاقة التميز",
			allow_duplicate_account=True,
		)
		self.assertEqual(c3["copy_no"], 2)
		self.assertEqual(c3["card_name"], "بطاقة التميز 2")
		# Soft-deleted c2 remains untouched
		self.assertEqual(cint(frappe.db.get_value("Archive Card", c2["name"], "copy_no")), 2)
		self.assertEqual(cint(frappe.db.get_value("Archive Card", c2["name"], "is_deleted")), 1)

	def test_02_family_base_name_rename_updates_active_only(self):
		acc = f"SA-REN-{uuid.uuid4().hex[:8].upper()}"
		c1 = self._make_card(account_number=acc, base_card_name="بطاقة النخبة")
		c2 = self._make_card(
			account_number=acc,
			base_card_name="بطاقة النخبة",
			allow_duplicate_account=True,
		)
		c3 = self._make_card(
			account_number=acc,
			base_card_name="بطاقة النخبة",
			allow_duplicate_account=True,
		)

		# Soft delete c2 before rename
		delete_card(c2["name"], reason="إيقاف النسخة الثانية")

		rename_res = rename_card_family_base_name(
			card=c1["name"],
			new_base_card_name="بطاقة الأعمال",
			remarks="توحيد مسمى العائلة",
		)
		self.assertTrue(rename_res["changed"])

		c1_after = frappe.db.get_value(
			"Archive Card", c1["name"], ["base_card_name", "card_name"], as_dict=True
		)
		c2_after = frappe.db.get_value(
			"Archive Card", c2["name"], ["base_card_name", "card_name"], as_dict=True
		)
		c3_after = frappe.db.get_value(
			"Archive Card", c3["name"], ["base_card_name", "card_name"], as_dict=True
		)

		self.assertEqual(c1_after.card_name, "بطاقة الأعمال")
		self.assertEqual(c3_after.card_name, "بطاقة الأعمال 3")
		# Soft-deleted card c2 must preserve its historical snapshot
		self.assertEqual(c2_after.card_name, "بطاقة النخبة 2")

	def test_03_account_number_transitions_all_cases(self):
		# 1. A -> new B moves Card to new Family and leaves Family A existing
		acc_a = f"SA-FAM-A-{uuid.uuid4().hex[:8].upper()}"
		acc_b = f"SA-FAM-B-{uuid.uuid4().hex[:8].upper()}"
		c_a = self._make_card(account_number=acc_a, base_card_name="بطاقة الحساب أ")
		fam_a_name = c_a["card_family"]

		plan_a_to_b = build_account_change_plan(c_a["name"], acc_b)
		self.assertEqual(plan_a_to_b["case"], "NEW_TARGET_FAMILY")
		self.assertEqual(plan_a_to_b["recommended_mode"], "move_card_to_new_family")

		res_move_b = change_card_account_number(
			card=c_a["name"],
			new_account_number=acc_b,
			transition_mode="move_card_to_new_family",
		)
		self.assertEqual(res_move_b["copy_no"], 1)
		self.assertEqual(res_move_b["account_number"], acc_b)
		self.assertNotEqual(res_move_b["card_family"], fam_a_name)
		# Family A must remain intact with its original normalized account and highest_copy_no = 1
		self.assertTrue(frappe.db.exists("Archive Card Family", fam_a_name))
		self.assertEqual(
			cint(frappe.db.get_value("Archive Card Family", fam_a_name, "highest_copy_no")), 1
		)

		# 2. After last Card leaves A, creating a new card for A reuses Family A and allocates next monotonic copy (#2)
		c_a_return = self._make_card(
			account_number=acc_a,
			base_card_name="بطاقة الحساب أ",
			allow_duplicate_account=True,
		)
		self.assertEqual(c_a_return["card_family"], fam_a_name)
		self.assertEqual(c_a_return["copy_no"], 2)
		self.assertEqual(c_a_return["card_name"], "بطاقة الحساب أ 2")

		# 3. Existing target family join allocates next copy correctly when triplet matches
		acc_target = f"SA-TRG-{uuid.uuid4().hex[:8].upper()}"
		c_target = self._make_card(account_number=acc_target, base_card_name="عائلة مستهدفة")
		plan_join = build_account_change_plan(
			c_a["name"], acc_target, new_base_card_name="عائلة مستهدفة"
		)
		self.assertEqual(plan_join["case"], "TARGET_FAMILY_EXISTS")
		self.assertEqual(plan_join["expected_copy_no"], 2)

		res_join = change_card_account_number(
			card=c_a["name"],
			new_account_number=acc_target,
			new_base_card_name="عائلة مستهدفة",
			transition_mode="move_card_to_target_family",
		)
		self.assertEqual(res_join["card_family"], c_target["card_family"])
		self.assertEqual(res_join["copy_no"], 2)
		self.assertEqual(res_join["card_name"], "عائلة مستهدفة 2")

		# 4. Same-normalized / raw-changed updates Family raw representation + active card caches without moving the card
		raw_formatted = f"{acc_target[:2]} - {acc_target[2:]}"
		# Soft-delete c_target (#1) first to verify deleted snapshots are untouched
		delete_card(c_target["name"], reason="حذف النسخة الأولى قبل تعديل تنسيق الحساب")

		plan_same_norm = build_account_change_plan(c_a["name"], raw_formatted)
		self.assertEqual(plan_same_norm["case"], "SAME_NORMALIZED")
		self.assertFalse(plan_same_norm["no_change"])

		upd_raw = update_card(c_a["name"], {"account_number": raw_formatted})
		self.assertEqual(upd_raw["card"]["card_family"], c_target["card_family"])
		self.assertEqual(upd_raw["card"]["copy_no"], 2)
		self.assertEqual(upd_raw["card"]["account_number"], raw_formatted)
		self.assertEqual(
			frappe.db.get_value("Archive Card Family", c_target["card_family"], "account_number"),
			raw_formatted,
		)
		# Soft-deleted c_target retains its old raw account_number snapshot
		self.assertEqual(
			frappe.db.get_value("Archive Card", c_target["name"], "account_number"),
			acc_target,
		)

	def test_04_status_transitions_and_audit_log(self):
		c = self._make_card(base_card_name="بطاقة حالات")
		self.assertEqual(c["status"], "نشطة")

		# Permanent stop without reason must fail
		with self.assertRaises(frappe.ValidationError):
			change_card_status(c["name"], "موقفة نهائياً", reason="")

		# Temporary stop ignores/clears status_reason
		st1 = change_card_status(c["name"], "موقفة مؤقتاً", reason="ملاحظة مؤقتة")
		self.assertEqual(st1["card"]["status"], "موقفة مؤقتاً")
		self.assertFalse(st1["card"]["status_reason"])

		# Permanent stop with reason saves status_reason
		st2 = change_card_status(c["name"], "موقفة نهائياً", reason="انتهاء صلاحية الحساب")
		self.assertEqual(st2["card"]["status"], "موقفة نهائياً")
		self.assertEqual(st2["card"]["status_reason"], "انتهاء صلاحية الحساب")

		# Calling permanent stop again without reason (even when already موقفة نهائياً) must fail before no-op
		with self.assertRaises(frappe.ValidationError):
			change_card_status(c["name"], "موقفة نهائياً", reason="   ")

		# Transitioning out of permanent stop clears status_reason to None
		st3 = change_card_status(c["name"], "نشطة", reason="")
		self.assertEqual(st3["card"]["status"], "نشطة")
		self.assertIsNone(frappe.db.get_value("Archive Card", c["name"], "status_reason"))

		timeline = get_card_activity_timeline(c["name"])
		status_events = [e for e in timeline["events"] if e["event_type"] == "status_change"]
		self.assertEqual(len(status_events), 3)

	def test_05_custody_transfer_vs_manual_edit(self):
		c = self._make_card(base_card_name="بطاقة عهدة")
		tr_initial = get_card_transfer_timeline(c["name"])
		self.assertEqual(len(tr_initial["stations"]), 1)
		self.assertEqual(tr_initial["stations"][0]["event_type"], "initial_assignment")
		self.assertEqual(tr_initial["stations"][0]["sequence"], 1)
		self.assertTrue(tr_initial["custody_matches_last_station"])
		self.assertEqual(tr_initial["stations"][0]["badge_label"], "العهدة الحالية")

		# Transferring to the same representative is forbidden even if region differs
		with self.assertRaises(frappe.ValidationError):
			transfer_card(
				card=c["name"],
				to_region=self.region_2,
				to_representative=self.rep_1,
				new_received_date="2026-10-14",
				transfer_note="محاولة نقل لنفس المندوب",
			)

		# Formal transfer adds station #2 (even if region is the same or different, as long as representative differs)
		transfer_card(
			card=c["name"],
			to_region=self.region_2,
			to_representative=self.rep_2,
			new_received_date="2026-10-15",
			transfer_note="نقل عهدة رسمي للمندوب الثاني",
		)
		tr_after = get_card_transfer_timeline(c["name"])
		self.assertEqual(len(tr_after["stations"]), 2)
		self.assertEqual(tr_after["stations"][1]["sequence"], 2)
		self.assertEqual(tr_after["stations"][1]["event_type"], "formal_transfer")
		self.assertEqual(tr_after["stations"][1]["to_representative"], self.rep_2)
		self.assertTrue(tr_after["custody_matches_last_station"])
		self.assertTrue(tr_after["stations"][1]["is_current"])
		self.assertEqual(tr_after["stations"][1]["badge_label"], "العهدة الحالية")

		# Manual edit of received_date inside update_card must NOT add a transfer station,
		# and timeline must distinguish آخر عهدة رسمية مسجلة from current card custody
		update_card(c["name"], {"received_date": "2026-10-16"})
		tr_manual = get_card_transfer_timeline(c["name"])
		self.assertEqual(len(tr_manual["stations"]), 2)
		self.assertFalse(tr_manual["custody_matches_last_station"])
		self.assertTrue(tr_manual["stations"][1]["is_last_formal"])
		self.assertFalse(tr_manual["stations"][1]["is_current"])
		self.assertEqual(tr_manual["stations"][1]["badge_label"], "آخر عهدة رسمية مسجلة")
		self.assertEqual(tr_manual["card"]["current_received_date"], "2026-10-16")
		self.assertEqual(
			tr_manual["formal_transfer_note"],
			"مسار النقل يوثق عمليات النقل الرسمية فقط.",
		)

	def test_06_pin_and_image_permissions_and_scoped_file_guard(self):
		# 1. Create PIN = 4 digits (including leading-zero PIN like 0007) -> succeeds
		c = self._make_card(base_card_name="بطاقة أمان", pin="0007", daily_limit=75000)
		self.assertIsNone(c.get("pin"))
		self.assertEqual(c["daily_limit"], 75000.0)
		self.assertEqual(c["daily_limit_formatted"], "75,000.00")

		# 2, 3, 4. Create PIN fewer than 4, more than 4, or non-numeric chars -> fails
		for bad_pin in ("123", "12", "12345", "123456", "12A4", "12-4", " 1234", "12 4"):
			with self.assertRaises(frappe.ValidationError):
				self._make_card(base_card_name="بطاقة خطأ", pin=bad_pin)

		# 10. Normal card serializers do not contain PIN
		self.assertNotIn("pin", get_card_details(c["name"])["card"])
		self.assertNotIn("pin", get_card_preview(c["name"])["card"])
		ctx_rows = get_cards_context(search=c["card_number"])["rows"]
		self.assertTrue(len(ctx_rows) >= 1)
		self.assertNotIn("pin", ctx_rows[0])

		# 5 & 8. Authorized user with view_card_pin can reveal leading-zero PIN,
		# and PIN survives subsequent card_doc.save() mutations (update_card, status change)
		frappe.set_user(self.manager_user)
		self.assertEqual(reveal_card_pin(c["name"])["pin"], "0007")
		update_card(c["name"], {"daily_limit": 80000})
		change_card_status(c["name"], "موقفة مؤقتاً")
		self.assertEqual(reveal_card_pin(c["name"])["pin"], "0007")

		# 6 & 7. Update saved PIN: 4 digits succeeds, invalid PIN fails
		self.assertTrue(has_card_permission("view_card_images"))
		for bad_upd_pin in ("123", "12345", "12A4", "12-4", " 5544"):
			with self.assertRaises(frappe.ValidationError):
				update_card(c["name"], {"new_pin": bad_upd_pin})
		update_card(c["name"], {"new_pin": "5544"})
		self.assertEqual(reveal_card_pin(c["name"])["pin"], "5544")

		# 9. User without view_card_pin cannot reveal PIN, cannot update saved PIN, and cannot delete card
		frappe.set_user(self.officer_user)
		with self.assertRaises(frappe.PermissionError):
			reveal_card_pin(c["name"])
		with self.assertRaises(frappe.PermissionError):
			update_card(c["name"], {"new_pin": "7788"})
		with self.assertRaises(frappe.PermissionError):
			delete_card(c["name"], reason="محاولة غير مصرحة")

		# Verify PIN remained 5544 after officer's rejected attempt
		frappe.set_user(self.manager_user)
		self.assertEqual(reveal_card_pin(c["name"])["pin"], "5544")

		# Reader cannot view images, cannot reveal PIN, cannot edit
		frappe.set_user(self.reader_user)
		self.assertFalse(has_card_permission("view_card_images"))
		self.assertFalse(has_card_permission("edit_card_images"))
		preview = get_card_preview(c["name"])["card"]
		self.assertIsNone(preview["front_image_url"])
		self.assertIsNone(preview["back_image_url"])

		with self.assertRaises(frappe.PermissionError):
			get_card_image(c["name"], "front")

		# Verify File.is_downloadable() is blocked for Reader on Card files
		frappe.set_user("Administrator")
		front_url = frappe.db.get_value("Archive Card", c["name"], "front_image")
		file_name = frappe.db.get_value("File", {"file_url": front_url}, "name")
		file_doc = frappe.get_doc("File", file_name)
		self.assertTrue(is_archive_card_file_doc(file_doc))

		frappe.set_user(self.reader_user)
		self.assertFalse(file_doc.is_downloadable())

	def test_07_direct_crud_and_physical_delete_blocked(self):
		c = self._make_card(base_card_name="بطاقة حماية")
		with self.assertRaises(frappe.PermissionError):
			frappe.delete_doc("Archive Card", c["name"], force=True)

		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc(
				{
					"doctype": "Archive Card",
					"card_family": c["card_family"],
					"copy_no": 99,
					"card_name": "اختراق",
					"account_number": "123",
					"account_number_normalized": "123",
					"base_card_name": "اختراق",
					"card_number": "123",
					"bank": self.bank_1,
					"card_owner": self.owner_1,
					"region": self.region_1,
					"representative": self.rep_1,
					"received_date": "2026-10-01",
					"front_image": "/private/files/x.jpg",
					"back_image": "/private/files/y.jpg",
					"status": "نشطة",
				}
			).insert()

		# Soft delete without reason must fail
		with self.assertRaises(frappe.ValidationError):
			delete_card(c["name"], reason="   ")

		# Soft delete with reason hides from context and clears search_text
		delete_card(c["name"], reason="حذف اختباري")
		ctx = get_cards_context(search=c["name"])
		found_names = [r["name"] for r in ctx["rows"]]
		self.assertNotIn(c["name"], found_names)
		self.assertEqual(cint(frappe.db.get_value("Archive Card", c["name"], "is_deleted")), 1)
		self.assertEqual(frappe.db.get_value("Archive Card", c["name"], "search_text") or "", "")

	def test_08_daily_limit_validation_and_non_card_file_isolation(self):
		# Missing, empty, zero, or negative daily_limit is rejected on create
		with self.assertRaises(frappe.ValidationError):
			self._make_card(base_card_name="بطاقة بدون حد", daily_limit=None)
		with self.assertRaises(frappe.ValidationError):
			self._make_card(base_card_name="بطاقة حد فارغ", daily_limit="")
		with self.assertRaises(frappe.ValidationError):
			self._make_card(base_card_name="بطاقة حد صفري", daily_limit=0)
		with self.assertRaises(frappe.ValidationError):
			self._make_card(base_card_name="بطاقة حد سالب", daily_limit=-500)

		c = self._make_card(base_card_name="بطاقة حد يومي", daily_limit="75,000.00")
		self.assertEqual(c["daily_limit"], 75000.0)
		self.assertEqual(c["daily_limit_formatted"], "75,000.00")

		# Updating daily_limit logs daily_limit_changed; clearing it is rejected
		upd1 = update_card(c["name"], {"daily_limit": "125,000.50"})
		self.assertEqual(upd1["card"]["daily_limit"], 125000.5)
		self.assertEqual(upd1["card"]["daily_limit_formatted"], "125,000.50")

		with self.assertRaises(frappe.ValidationError):
			update_card(c["name"], {"daily_limit": ""})
		with self.assertRaises(frappe.ValidationError):
			update_card(c["name"], {"daily_limit": None})
		with self.assertRaises(frappe.ValidationError):
			update_card(c["name"], {"daily_limit": 0})

		# Non-card File document is NOT affected by card file guard
		buf = io.BytesIO()
		Image.new("RGB", (8, 8), color=(120, 40, 90)).save(buf, format="JPEG")
		from frappe.utils.file_manager import save_file

		other_file = save_file(
			fname=f"pending_test_{uuid.uuid4().hex[:6]}.jpg",
			content=buf.getvalue(),
			dt=None,
			dn=None,
			is_private=1,
		)
		self.assertFalse(is_archive_card_file_doc(other_file))
		self.assertTrue(other_file.is_downloadable())

	def test_09_card_names_preserve_trailing_numbers(self):
		acc1 = f"SA-NUM1-{uuid.uuid4().hex[:8].upper()}"
		c1 = self._make_card(account_number=acc1, base_card_name="شركة 2020")
		self.assertEqual(c1["base_card_name"], "شركة 2020")
		self.assertEqual(c1["card_name"], "شركة 2020")

		c1_copy2 = self._make_card(
			account_number=acc1,
			base_card_name="شركة 2020",
			allow_duplicate_account=True,
		)
		self.assertEqual(c1_copy2["card_name"], "شركة 2020 2")

		acc2 = f"SA-NUM2-{uuid.uuid4().hex[:8].upper()}"
		c2 = self._make_card(account_number=acc2, base_card_name="فرع 2")
		self.assertEqual(c2["base_card_name"], "فرع 2")
		self.assertEqual(c2["card_name"], "فرع 2")

	def test_10_safe_image_replacement_rollback_preserves_old_file(self):
		c = self._make_card(base_card_name="بطاقة صور آمنة")
		old_front_url = frappe.db.get_value("Archive Card", c["name"], "front_image")
		old_file_name = frappe.db.get_value("File", {"file_url": old_front_url}, "name")
		old_file_doc = frappe.get_doc("File", old_file_name)
		old_full_path = old_file_doc.get_full_path()

		new_front_id, _ = self._stage_pair()

		# Force a failure during update_card (e.g. invalid PIN alongside staged front_image)
		with self.assertRaises(frappe.ValidationError):
			update_card(c["name"], {"front_image": new_front_id, "new_pin": "INVALID-PIN"})

		# Also test failure mid-transaction (e.g. mocked log_card_event failure)
		from unittest.mock import patch

		with patch("archive.api.cards.log_card_event", side_effect=RuntimeError("Simulated DB error")):
			with self.assertRaises(RuntimeError):
				update_card(c["name"], {"front_image": new_front_id})

		# Old image pointer, File doc, and physical file on disk must all remain intact
		current_front_url = frappe.db.get_value("Archive Card", c["name"], "front_image")
		self.assertEqual(current_front_url, old_front_url)
		self.assertTrue(frappe.db.exists("File", old_file_name))
		import os

		self.assertTrue(os.path.exists(old_full_path))

	def test_11_front_image_required_and_back_image_optional(self):
		front_id, back_id = self._stage_pair()
		acc = f"ACC-OPT-{uuid.uuid4().hex[:8].upper()}"
		cnum = f"4000{uuid.uuid4().int % 10**12:012d}"

		# Missing front_image must fail
		with self.assertRaises(frappe.ValidationError):
			create_card(
				{
					"account_number": acc,
					"base_card_name": "بطاقة بدون أمامي",
					"card_number": cnum,
					"bank": self.bank_1,
					"card_owner": self.owner_1,
					"region": self.region_1,
					"representative": self.rep_1,
					"received_date": "2026-10-12",
					"daily_limit": "25000.00",
					"pin": "1234",
					"front_image": "",
					"back_image": back_id,
					"status": "نشطة",
				}
			)

		# front_image only (without back_image) must succeed
		created = create_card(
			{
				"account_number": acc,
				"base_card_name": "بطاقة وجه أمامي فقط",
				"card_number": cnum,
				"bank": self.bank_1,
				"card_owner": self.owner_1,
				"region": self.region_1,
				"representative": self.rep_1,
				"received_date": "2026-10-12",
				"daily_limit": "25000.00",
				"pin": "1234",
				"front_image": front_id,
				"back_image": "",
				"status": "نشطة",
			}
		)["card"]
		self.assertEqual(created["has_front_image"], 1)
		self.assertEqual(created["has_back_image"], 0)
		self.assertIsNone(created["back_image_url"])

		# Adding back_image later via update_card must succeed
		upd = update_card(created["name"], {"back_image": back_id})["card"]
		self.assertEqual(upd["has_back_image"], 1)
		self.assertTrue(bool(upd["back_image_url"]))

	def test_12_card_family_lookups_unique_without_copy_suffix(self):
		acc = f"ACC-LKP-{uuid.uuid4().hex[:8].upper()}"
		base_name = f"بطاقة اقتراحات {uuid.uuid4().hex[:4]}"
		c1 = self._make_card(account_number=acc, base_card_name=base_name, bank=self.bank_1)
		c2 = self._make_card(
			account_number=acc,
			base_card_name=base_name,
			bank=self.bank_1,
			allow_duplicate_account=True,
		)
		c3 = self._make_card(
			account_number=acc,
			base_card_name=base_name,
			bank=self.bank_1,
			allow_duplicate_account=True,
		)
		self.assertEqual(c2["card_name"], f"{base_name} 2")
		self.assertEqual(c3["card_name"], f"{base_name} 3")

		# Same base_card_name in two other banks/accounts creates separate families at Copy 1
		multi_name = f"مؤسسة الأيهم {uuid.uuid4().hex[:4]}"
		acc_b1 = f"ACC-B1-{uuid.uuid4().hex[:8].upper()}"
		acc_b2 = f"ACC-B2-{uuid.uuid4().hex[:8].upper()}"
		acc_b3 = f"ACC-B3-{uuid.uuid4().hex[:8].upper()}"
		m1 = self._make_card(account_number=acc_b1, base_card_name=multi_name, bank=self.bank_1)
		m2 = self._make_card(account_number=acc_b2, base_card_name=multi_name, bank=self.bank_2)
		m3 = self._make_card(account_number=acc_b3, base_card_name=multi_name, bank=self.bank_3)
		self.assertEqual(m1["copy_no"], 1)
		self.assertEqual(m2["copy_no"], 1)
		self.assertEqual(m3["copy_no"], 1)
		self.assertEqual(len({m1["card_family"], m2["card_family"], m3["card_family"]}), 3)

		# Same base_card_name + same account_number + DIFFERENT bank -> new family, copy 1
		m1_diff_bank = self._make_card(
			account_number=acc_b1, base_card_name=multi_name, bank=self.bank_2
		)
		self.assertEqual(m1_diff_bank["copy_no"], 1)
		self.assertNotEqual(m1_diff_bank["card_family"], m1["card_family"])

		# Editing bank on c3 moves it to a new family at Copy 1 while c1 and c2 stay in their family
		upd_c3 = update_card(c3["name"], {"bank": self.bank_2})["card"]
		self.assertEqual(upd_c3["copy_no"], 1)
		self.assertEqual(upd_c3["bank"], self.bank_2)
		self.assertNotEqual(upd_c3["card_family"], c1["card_family"])

		lookups = get_card_family_lookups()["families"]
		matching_c1 = [
			f for f in lookups if f["account_number"] == acc and f["bank"] == self.bank_1
		]
		self.assertEqual(len(matching_c1), 1)
		self.assertEqual(matching_c1[0]["base_card_name"], base_name)
		self.assertEqual(matching_c1[0]["family_name"], c1["card_family"])
		self.assertEqual(matching_c1[0]["active_count"], 2)

		matching_multi = [f for f in lookups if f["base_card_name"] == multi_name]
		self.assertEqual(len(matching_multi), 4)
		# Derived copy names (2, 3) must never appear in family base_card_name lookups
		all_base_names = {f["base_card_name"] for f in lookups}
		self.assertIn(base_name, all_base_names)
		self.assertNotIn(f"{base_name} 2", all_base_names)
		self.assertNotIn(f"{base_name} 3", all_base_names)

	def test_13_create_with_duplicate_card_number_rejected(self):
		cnum = f"4999{uuid.uuid4().int % 10**12:012d}"
		self._make_card(base_card_name="بطاقة أصلية", card_number=cnum)

		with self.assertRaises(frappe.ValidationError):
			self._make_card(base_card_name="بطاقة أخرى بنفس الرقم", card_number=cnum)

	def test_14_edit_to_existing_card_number_rejected(self):
		c1 = self._make_card(base_card_name="بطاقة أولى")
		c2 = self._make_card(base_card_name="بطاقة ثانية")

		# Keeping current card_number on edit is allowed
		same_res = update_card(c2["name"], {"card_number": c2["card_number"], "daily_limit": 60000})[
			"card"
		]
		self.assertEqual(same_res["card_number"], c2["card_number"])

		# Changing card_number to another card's card_number is rejected
		with self.assertRaises(frappe.ValidationError):
			update_card(c2["name"], {"card_number": c1["card_number"]})

	def test_15_card_image_editor_original_processed_and_metadata_lifecycle(self):
		def _stage_one(label: str, color: tuple[int, int, int]) -> dict:
			buf = io.BytesIO()
			Image.new("RGB", (64, 40), color=color).save(buf, format="JPEG")
			return stage_uploaded_card_image(
				filename=f"{label}_{uuid.uuid4().hex[:8]}.jpg",
				content=buf.getvalue(),
				content_type="image/jpeg",
				side="front",
			)

		orig_front = _stage_one("front_orig", (20, 60, 120))
		proc_front_1 = _stage_one("front_proc_1", (30, 80, 150))
		meta_1 = {"angle": 3.5, "quarter_turns": 1, "zoom": 1.35, "pan_x": 0.04, "pan_y": -0.02}

		res = create_card(
			{
				"account_number": f"ACC-IMG-{uuid.uuid4().hex[:8].upper()}",
				"base_card_name": "بطاقة اختبار المحرر",
				"card_number": f"4777{uuid.uuid4().int % 10**12:012d}",
				"bank": self.bank_1,
				"card_owner": self.owner_1,
				"daily_limit": 45000,
				"region": self.region_1,
				"representative": self.rep_1,
				"received_date": "2026-11-01",
				"pin": "1234",
				"status": "نشطة",
				"front_image": proc_front_1["file_id"],
				"front_original_image": orig_front["file_id"],
				"front_edit_meta": meta_1,
			}
		)
		card = res["card"]
		self.assertEqual(card["front_edit_meta"], meta_1)
		self.assertIn("original=1", card["front_original_image_url"])

		db_row = frappe.db.get_value(
			"Archive Card",
			card["name"],
			["front_image", "front_original_image", "front_edit_meta"],
			as_dict=True,
		)
		self.assertEqual(db_row.front_image, proc_front_1["file_url"])
		self.assertEqual(db_row.front_original_image, orig_front["file_url"])
		self.assertTrue(is_archive_card_file_doc(orig_front["file_id"]))
		self.assertTrue(is_archive_card_file_doc(proc_front_1["file_id"]))

		# User A uploads an image, then User B (`officer_user`) uploads the exact same image byte-for-byte
		shared_buf = io.BytesIO()
		Image.new("RGB", (64, 40), color=(111, 222, 133)).save(shared_buf, format="JPEG")
		identical_bytes = shared_buf.getvalue()

		frappe.set_user("Administrator")
		staged_user_a = stage_uploaded_card_image(
			filename="identical_card_scan.jpg",
			content=identical_bytes,
			content_type="image/jpeg",
			side="front",
		)

		frappe.set_user(self.officer_user)
		staged_user_b = stage_uploaded_card_image(
			filename="identical_card_scan.jpg",
			content=identical_bytes,
			content_type="image/jpeg",
			side="front",
		)
		self.assertNotEqual(staged_user_a["file_id"], staged_user_b["file_id"])
		self.assertNotEqual(staged_user_a["file_url"], staged_user_b["file_url"])
		self.assertEqual(
			frappe.db.get_value("File", staged_user_b["file_id"], "owner"),
			self.officer_user,
		)
		frappe.set_user("Administrator")

		# Re-editing existing image preserves original image and updates processed + metadata
		proc_front_2 = _stage_one("front_proc_2", (40, 100, 180))
		meta_2 = {"angle": -2.0, "quarter_turns": 2, "zoom": 1.8, "pan_x": -0.05, "pan_y": 0.03}
		upd_1 = update_card(
			card["name"],
			{
				"front_image": proc_front_2["file_id"],
				"front_edit_meta": meta_2,
			},
		)["card"]
		self.assertEqual(upd_1["front_edit_meta"], meta_2)
		db_row_2 = frappe.db.get_value(
			"Archive Card",
			card["name"],
			["front_image", "front_original_image"],
			as_dict=True,
		)
		self.assertEqual(db_row_2.front_image, proc_front_2["file_url"])
		self.assertEqual(db_row_2.front_original_image, orig_front["file_url"])
		self.assertTrue(frappe.db.exists("File", orig_front["file_id"]))

		# Replacing with a brand-new image file updates original and clears edit_meta
		new_orig_front = _stage_one("front_new_orig", (90, 30, 60))
		upd_2 = update_card(
			card["name"],
			{
				"front_image": new_orig_front["file_id"],
				"front_original_image": new_orig_front["file_id"],
				"front_edit_meta": None,
			},
		)["card"]
		self.assertIsNone(upd_2["front_edit_meta"])
		db_row_3 = frappe.db.get_value(
			"Archive Card",
			card["name"],
			["front_image", "front_original_image", "front_edit_meta"],
			as_dict=True,
		)
		self.assertEqual(db_row_3.front_image, new_orig_front["file_url"])
		self.assertEqual(db_row_3.front_original_image, new_orig_front["file_url"])
		self.assertFalse(db_row_3.front_edit_meta)

		# Role-based control for `صلاحية معاينة البطائق`
		self.assertTrue(frappe.db.exists("Role", ROLE_CARD_IMAGE_PREVIEW))
		frappe.set_user("Administrator")
		admin_details = get_card_details(card["name"])
		self.assertTrue(admin_details["permissions"]["can_preview_card_images"])

		# System Manager without `صلاحية معاينة البطائق` does NOT get preview permission
		sys_mgr_email = "card_sysmgr_test@example.com"
		if not frappe.db.exists("User", sys_mgr_email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": sys_mgr_email,
					"first_name": "CardSysMgr",
					"enabled": 1,
					"user_type": "System User",
					"roles": [{"role": "System Manager"}],
				}
			).insert(ignore_permissions=True)
		else:
			sm_doc = frappe.get_doc("User", sys_mgr_email)
			sm_doc.roles = [{"role": "System Manager"}]
			sm_doc.save(ignore_permissions=True)

		frappe.set_user(sys_mgr_email)
		sysmgr_details = get_card_details(card["name"])
		self.assertFalse(sysmgr_details["permissions"]["can_preview_card_images"])

		frappe.set_user(self.officer_user)
		details_no_role = get_card_details(card["name"])
		self.assertFalse(details_no_role["permissions"]["can_preview_card_images"])
		self.assertIsNone(details_no_role["card"]["front_original_image_url"])

		officer_proc = _stage_one("officer_proc", (60, 70, 80))
		with self.assertRaises(frappe.PermissionError):
			update_card(
				card["name"],
				{
					"front_image": officer_proc["file_id"],
					"front_edit_meta": meta_1,
				},
			)
		with self.assertRaises(frappe.PermissionError):
			get_card_image(card=card["name"], side="front", original=1)

		# Grant `صلاحية معاينة البطائق` to officer_user -> allowed in active & paused states
		frappe.set_user("Administrator")
		u_doc = frappe.get_doc("User", self.officer_user)
		u_doc.append("roles", {"role": ROLE_CARD_IMAGE_PREVIEW})
		u_doc.save(ignore_permissions=True)

		frappe.set_user(self.officer_user)
		details_with_role = get_card_details(card["name"])
		self.assertTrue(details_with_role["permissions"]["can_preview_card_images"])
		self.assertIn("original=1", details_with_role["card"]["front_original_image_url"])
		get_card_image(card=card["name"], side="front", original=1)

		# `صلاحية معاينة البطائق` does NOT grant general File permission on card files via `has_file_permission`
		frappe.set_user("Administrator")
		reader_doc = frappe.get_doc("User", self.reader_user)
		reader_doc.append("roles", {"role": ROLE_CARD_IMAGE_PREVIEW})
		reader_doc.save(ignore_permissions=True)
		orig_file_doc = frappe.get_doc("File", new_orig_front["file_id"])
		self.assertFalse(has_file_permission(orig_file_doc, ptype="read", user=self.reader_user))
		frappe.set_user(self.reader_user)
		reader_details = get_card_details(card["name"])
		self.assertFalse(reader_details["permissions"]["can_view_images"])
		self.assertTrue(reader_details["permissions"]["can_preview_card_images"])
		# Even without `view_card_images`, a user with `صلاحية معاينة البطائق` can stage an identical byte-for-byte image and use `original=1`
		staged_reader_same = stage_uploaded_card_image(
			filename="identical_card_scan.jpg",
			content=identical_bytes,
			content_type="image/jpeg",
			side="front",
		)
		self.assertNotEqual(staged_user_a["file_id"], staged_reader_same["file_id"])
		self.assertNotEqual(staged_user_a["file_url"], staged_reader_same["file_url"])
		get_card_image(card=card["name"], side="front", original=1)
		frappe.set_user("Administrator")
		reader_doc = frappe.get_doc("User", self.reader_user)
		reader_doc.roles = [r for r in reader_doc.roles if r.role != ROLE_CARD_IMAGE_PREVIEW]
		reader_doc.save(ignore_permissions=True)
		frappe.set_user(self.officer_user)

		# Allowed when card is temporarily paused (`موقفة مؤقتاً`)
		change_card_status(card["name"], "موقفة مؤقتاً")
		officer_proc_2 = _stage_one("officer_proc_2", (70, 90, 110))
		upd_paused = update_card(
			card["name"],
			{
				"front_image": officer_proc_2["file_id"],
				"front_edit_meta": meta_1,
			},
		)["card"]
		self.assertEqual(upd_paused["front_edit_meta"], meta_1)

		# Forbidden when card is permanently stopped (`موقفة نهائياً`) even with the role
		change_card_status(card["name"], "موقفة نهائياً", reason="إيقاف نهائي للاختبار")
		stopped_details = get_card_details(card["name"])
		self.assertIsNone(stopped_details["card"]["front_original_image_url"])
		with self.assertRaises(frappe.ValidationError):
			get_card_image(card=card["name"], side="front", original=1)
		officer_proc_3 = _stage_one("officer_proc_3", (80, 100, 120))
		with self.assertRaises(frappe.ValidationError):
			update_card(
				card["name"],
				{
					"front_image": officer_proc_3["file_id"],
					"front_edit_meta": meta_2,
				},
			)

		# Clean up test role assignment on officer_user
		frappe.set_user("Administrator")
		u_doc = frappe.get_doc("User", self.officer_user)
		u_doc.roles = [r for r in u_doc.roles if r.role != ROLE_CARD_IMAGE_PREVIEW]
		u_doc.save(ignore_permissions=True)





