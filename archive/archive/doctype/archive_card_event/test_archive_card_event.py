# Copyright (c) 2026, Ayham-shmsan and contributors
# See license.txt

from __future__ import annotations

import io
import uuid

import frappe
from frappe.tests import IntegrationTestCase
from PIL import Image

from archive.api.card_timeline import get_card_events
from archive.api.cards import (
	change_card_status,
	create_card,
	transfer_card,
	update_card,
)
from archive.patches.v1_0.setup_card_roles_and_permissions import (
	execute as setup_card_roles_and_permissions,
)
from archive.services.card_images import stage_uploaded_card_image
from archive.services.card_permissions import (
	ROLE_CARD_EVENT_HISTORY,
	ROLE_CARD_MANAGER,
	ROLE_CARD_READER,
	ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD,
	get_card_permissions,
	has_card_event_history_role,
	has_reactivate_permanently_stopped_card_role,
)

test_records = []

IGNORE_TEST_RECORD_DEPENDENCIES = [
	"Archive Account",
	"Archive Card",
	"Archive Card Family",
	"Archive Bank",
	"Archive Region",
	"Archive Representative",
	"User",
	"File",
]


class TestArchiveCardEvent(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		setup_card_roles_and_permissions()
		cls._ensure_masters()
		cls._ensure_users()

	@classmethod
	def _ensure_masters(cls):
		banks = frappe.get_all("Archive Bank", limit=1, pluck="name")
		if not banks:
			b = frappe.get_doc(
				{
					"doctype": "Archive Bank",
					"bank_name": f"بنك سجل الأحداث {uuid.uuid4().hex[:6]}",
					"is_active": 1,
				}
			).insert(ignore_permissions=True)
			banks = [b.name]
		cls.bank_1 = banks[0]

		cls.region_sanaa = cls._get_or_create_region("صنعاء - اختبار سجل")
		cls.region_aden = cls._get_or_create_region("عدن - اختبار سجل")

		cls.rep_abu_hameed = cls._get_or_create_rep("أبو حميد - اختبار سجل")
		cls.rep_ali = cls._get_or_create_rep("علي - اختبار سجل")

		cls.owner_ahmed = cls._get_or_create_owner("أحمد - اختبار سجل")
		cls.owner_ayham = cls._get_or_create_owner("أيهم - اختبار سجل")

	@classmethod
	def _get_or_create_region(cls, region_name: str) -> str:
		existing = frappe.db.get_value("Archive Region", {"region_name": region_name}, "name")
		if existing:
			return existing
		doc = frappe.get_doc(
			{
				"doctype": "Archive Region",
				"region_name": region_name,
			}
		).insert(ignore_permissions=True)
		return doc.name

	@classmethod
	def _get_or_create_rep(cls, rep_name: str) -> str:
		existing = frappe.db.get_value(
			"Archive Representative", {"representative_name": rep_name}, "name"
		)
		if existing:
			return existing
		doc = frappe.get_doc(
			{
				"doctype": "Archive Representative",
				"representative_name": rep_name,
			}
		).insert(ignore_permissions=True)
		return doc.name

	@classmethod
	def _get_or_create_owner(cls, account_name: str) -> str:
		existing = frappe.db.get_value("Archive Account", {"account_name": account_name}, "name")
		if existing:
			return existing
		doc = frappe.get_doc(
			{
				"doctype": "Archive Account",
				"account_name": account_name,
			}
		).insert(ignore_permissions=True)
		return doc.name

	@classmethod
	def _ensure_users(cls):
		cls.no_role_user = "card_event_no_role@example.com"
		cls.with_role_user = "card_event_with_role@example.com"
		cls.sys_manager_only_user = "card_event_sysmgr_only@example.com"
		cls.with_reactivate_perm_user = "card_reactivate_perm_manager@example.com"
		cls.reader_with_reactivate_only_user = "card_reactivate_perm_reader@example.com"

		for email, first_name, roles in (
			(cls.no_role_user, "NoEventRoleUser", [ROLE_CARD_MANAGER]),
			(cls.with_role_user, "WithEventRoleUser", [ROLE_CARD_MANAGER, ROLE_CARD_EVENT_HISTORY]),
			(cls.sys_manager_only_user, "SysMgrOnlyUser", ["System Manager", ROLE_CARD_MANAGER]),
			(
				cls.with_reactivate_perm_user,
				"ReactivatePermManager",
				[ROLE_CARD_MANAGER, ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD, ROLE_CARD_EVENT_HISTORY],
			),
			(
				cls.reader_with_reactivate_only_user,
				"ReactivatePermReader",
				[ROLE_CARD_READER, ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD],
			),
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
			for r in roles:
				u_doc.append("roles", {"role": r})
			u_doc.save(ignore_permissions=True)

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def _make_card(
		self,
		card_owner: str | None = None,
		representative: str | None = None,
		region: str | None = None,
	) -> dict:
		tag = uuid.uuid4().hex[:8]
		buf = io.BytesIO()
		Image.new("RGB", (16, 10), color=(40, 80, 120)).save(buf, format="JPEG")
		front = stage_uploaded_card_image(
			filename=f"ev_front_{tag}.jpg",
			content=buf.getvalue(),
			content_type="image/jpeg",
			side="front",
		)
		res = create_card(
			{
				"account_number": f"ACC-EV-{uuid.uuid4().hex[:10].upper()}",
				"base_card_name": "بطاقة اختبار الأحداث",
				"card_number": f"4500{uuid.uuid4().int % 10**12:012d}",
				"bank": self.bank_1,
				"card_owner": card_owner or self.owner_ahmed,
				"region": region or self.region_sanaa,
				"representative": representative or self.rep_abu_hameed,
				"received_date": "2026-10-01",
				"daily_limit": 50000.0,
				"pin": "1234",
				"front_image": front["file_id"],
			}
		)
		return res["card"]

	def test_01_temporary_stop_without_date_rejected(self):
		card = self._make_card()
		with self.assertRaises(frappe.ValidationError):
			change_card_status(
				card["name"],
				"موقفة مؤقتاً",
				reason="توقيف للمراجعة",
				event_date="",
			)
		self.assertEqual(
			frappe.db.count("Archive Card Event", {"card": card["name"]}),
			0,
		)

	def test_02_temporary_stop_without_reason_rejected(self):
		card = self._make_card()
		with self.assertRaises(frappe.ValidationError):
			change_card_status(
				card["name"],
				"موقفة مؤقتاً",
				reason="   ",
				event_date="2026-10-05",
			)
		self.assertEqual(
			frappe.db.count("Archive Card Event", {"card": card["name"]}),
			0,
		)

	def test_03_valid_temporary_stop_creates_single_event(self):
		card = self._make_card()
		change_card_status(
			card["name"],
			"موقفة مؤقتاً",
			reason="تجاوز الحد التشغيلي المؤقت",
			event_date="2026-10-06",
		)
		frappe.set_user(self.with_role_user)
		res = get_card_events(card["name"])
		self.assertEqual(res["total_events"], 1)
		ev = res["events"][0]
		self.assertEqual(ev["event_type"], "temporary_stop")
		self.assertEqual(ev["previous_status"], "نشطة")
		self.assertEqual(ev["new_status"], "موقفة مؤقتاً")
		self.assertEqual(ev["event_date"], "2026-10-06")
		self.assertEqual(ev["reason"], "تجاوز الحد التشغيلي المؤقت")
		self.assertEqual(ev["card_owner_name"], "أحمد - اختبار سجل")
		self.assertEqual(ev["representative_name"], "أبو حميد - اختبار سجل")
		self.assertEqual(ev["region_name"], "صنعاء - اختبار سجل")

	def test_04_snapshot_preserved_after_card_data_changes(self):
		card = self._make_card(
			card_owner=self.owner_ahmed,
			representative=self.rep_abu_hameed,
			region=self.region_sanaa,
		)
		change_card_status(
			card["name"],
			"موقفة مؤقتاً",
			reason="إيقاف في صنعاء عند أحمد",
			event_date="2026-10-07",
		)

		# Later transfer card to عدن / المندوب علي and change card_owner to أيهم
		transfer_card(
			card=card["name"],
			to_region=self.region_aden,
			to_representative=self.rep_ali,
			new_received_date="2026-10-20",
			transfer_note="نقل إلى عدن",
		)
		update_card(card["name"], {"card_owner": self.owner_ayham})

		frappe.set_user(self.with_role_user)
		res = get_card_events(card["name"])
		self.assertEqual(len(res["events"]), 1)
		old_ev = res["events"][0]
		self.assertEqual(old_ev["card_owner"], self.owner_ahmed)
		self.assertEqual(old_ev["card_owner_name"], "أحمد - اختبار سجل")
		self.assertEqual(old_ev["representative"], self.rep_abu_hameed)
		self.assertEqual(old_ev["representative_name"], "أبو حميد - اختبار سجل")
		self.assertEqual(old_ev["region"], self.region_sanaa)
		self.assertEqual(old_ev["region_name"], "صنعاء - اختبار سجل")

	def test_05_reactivation_creates_independent_event(self):
		card = self._make_card(
			card_owner=self.owner_ahmed,
			representative=self.rep_abu_hameed,
			region=self.region_sanaa,
		)
		change_card_status(
			card["name"],
			"موقفة مؤقتاً",
			reason="توقيف قبل إعادة التنشيط",
			event_date="2026-10-05",
		)
		change_card_status(card["name"], "نشطة")

		frappe.set_user(self.with_role_user)
		res = get_card_events(card["name"])
		self.assertEqual(res["total_events"], 2)
		ev_reactivated, ev_stopped = res["events"]
		self.assertEqual(ev_reactivated["event_type"], "reactivated")
		self.assertEqual(ev_reactivated["previous_status"], "موقفة مؤقتاً")
		self.assertEqual(ev_reactivated["new_status"], "نشطة")
		self.assertEqual(ev_stopped["event_type"], "temporary_stop")

	def test_06_second_temporary_stop_preserves_first_event(self):
		card = self._make_card(
			card_owner=self.owner_ahmed,
			representative=self.rep_abu_hameed,
			region=self.region_sanaa,
		)
		change_card_status(
			card["name"],
			"موقفة مؤقتاً",
			reason="التوقيف المؤقت الأول",
			event_date="2026-10-05",
		)
		change_card_status(card["name"], "نشطة")

		transfer_card(
			card=card["name"],
			to_region=self.region_aden,
			to_representative=self.rep_ali,
			new_received_date="2026-10-12",
		)
		update_card(card["name"], {"card_owner": self.owner_ayham})

		change_card_status(
			card["name"],
			"موقفة مؤقتاً",
			reason="التوقيف المؤقت الثاني",
			event_date="2026-10-15",
		)

		frappe.set_user(self.with_role_user)
		res = get_card_events(card["name"])
		self.assertEqual(res["total_events"], 3)
		ev_second_stop, ev_reactivated, ev_first_stop = res["events"]

		self.assertEqual(ev_second_stop["event_type"], "temporary_stop")
		self.assertEqual(ev_second_stop["reason"], "التوقيف المؤقت الثاني")
		self.assertEqual(ev_second_stop["event_date"], "2026-10-15")
		self.assertEqual(ev_second_stop["card_owner_name"], "أيهم - اختبار سجل")
		self.assertEqual(ev_second_stop["representative_name"], "علي - اختبار سجل")
		self.assertEqual(ev_second_stop["region_name"], "عدن - اختبار سجل")

		self.assertEqual(ev_reactivated["event_type"], "reactivated")

		self.assertEqual(ev_first_stop["event_type"], "temporary_stop")
		self.assertEqual(ev_first_stop["reason"], "التوقيف المؤقت الأول")
		self.assertEqual(ev_first_stop["event_date"], "2026-10-05")
		self.assertEqual(ev_first_stop["card_owner_name"], "أحمد - اختبار سجل")
		self.assertEqual(ev_first_stop["representative_name"], "أبو حميد - اختبار سجل")
		self.assertEqual(ev_first_stop["region_name"], "صنعاء - اختبار سجل")

	def test_07_permanent_stop_without_date_or_reason_rejected(self):
		card = self._make_card()
		with self.assertRaises(frappe.ValidationError):
			change_card_status(
				card["name"],
				"موقفة نهائياً",
				reason="إتلاف البطاقة",
				event_date="",
			)
		with self.assertRaises(frappe.ValidationError):
			change_card_status(
				card["name"],
				"موقفة نهائياً",
				reason="",
				event_date="2026-10-25",
			)
		self.assertEqual(
			frappe.db.count("Archive Card Event", {"card": card["name"]}),
			0,
		)

	def test_08_valid_permanent_stop_creates_event(self):
		card = self._make_card()
		res_card = change_card_status(
			card["name"],
			"موقفة نهائياً",
			reason="إتلاف البطاقة لانتهاء الحساب",
			event_date="2026-10-25",
		)["card"]
		self.assertEqual(res_card["status"], "موقفة نهائياً")
		self.assertEqual(res_card["status_display"], "موقفة نهائياً (متلفة)")

		frappe.set_user(self.with_role_user)
		res = get_card_events(card["name"])
		self.assertEqual(res["total_events"], 1)
		ev = res["events"][0]
		self.assertEqual(ev["event_type"], "permanent_stop")
		self.assertEqual(ev["previous_status"], "نشطة")
		self.assertEqual(ev["new_status"], "موقفة نهائياً")
		self.assertEqual(ev["new_status_display"], "موقفة نهائياً (متلفة)")
		self.assertEqual(ev["event_date"], "2026-10-25")
		self.assertEqual(ev["reason"], "إتلاف البطاقة لانتهاء الحساب")

	def test_09_save_or_same_status_without_transition_creates_no_event(self):
		card = self._make_card()
		update_card(card["name"], {"daily_limit": 65000.0})
		change_card_status(card["name"], "نشطة")
		self.assertEqual(
			frappe.db.count("Archive Card Event", {"card": card["name"]}),
			0,
		)

	def test_10_user_without_role_rejected_by_backend(self):
		card = self._make_card()
		change_card_status(
			card["name"],
			"موقفة مؤقتاً",
			reason="اختبار رفض بدون صلاحية",
			event_date="2026-10-28",
		)
		frappe.set_user(self.no_role_user)
		self.assertFalse(has_card_event_history_role())
		self.assertFalse(get_card_permissions()["can_view_card_event_history"])
		with self.assertRaises(frappe.PermissionError):
			get_card_events(card["name"])

	def test_11_user_with_role_can_read_event_history(self):
		card = self._make_card()
		change_card_status(
			card["name"],
			"موقفة مؤقتاً",
			reason="اختبار قراءة بالصلاحية",
			event_date="2026-10-28",
		)
		frappe.set_user(self.with_role_user)
		self.assertTrue(has_card_event_history_role())
		self.assertTrue(get_card_permissions()["can_view_card_event_history"])
		res = get_card_events(card["name"])
		self.assertEqual(res["total_events"], 1)
		self.assertEqual(res["events"][0]["reason"], "اختبار قراءة بالصلاحية")

	def test_12_system_manager_alone_does_not_grant_event_history_access(self):
		card = self._make_card()
		change_card_status(
			card["name"],
			"موقفة مؤقتاً",
			reason="اختبار عدم تجاوز System Manager",
			event_date="2026-10-28",
		)
		frappe.set_user(self.sys_manager_only_user)
		self.assertFalse(has_card_event_history_role())
		self.assertFalse(get_card_permissions()["can_view_card_event_history"])
		with self.assertRaises(frappe.PermissionError):
			get_card_events(card["name"])

	def test_13_permanently_stopped_card_blocks_status_change_and_transfer_without_role(self):
		card = self._make_card()
		frappe.set_user(self.no_role_user)
		change_card_status(
			card["name"],
			"موقفة نهائياً",
			reason="إتلاف رسمي للبطاقة",
			event_date="2026-10-29",
		)
		self.assertFalse(has_reactivate_permanently_stopped_card_role())
		self.assertFalse(get_card_permissions()["can_reactivate_permanently_stopped_card"])

		with self.assertRaises(frappe.PermissionError):
			change_card_status(card["name"], "نشطة")

		with self.assertRaises(frappe.PermissionError):
			change_card_status(
				card["name"],
				"موقفة مؤقتاً",
				reason="محاولة تحويل إلى مؤقت",
				event_date="2026-10-30",
			)

		with self.assertRaises(frappe.PermissionError):
			transfer_card(
				card=card["name"],
				to_region=self.region_aden,
				to_representative=self.rep_ali,
				new_received_date="2026-10-30",
			)

	def test_14_administrator_without_explicit_role_cannot_bypass_permanently_stopped_lock(self):
		frappe.db.delete(
			"Has Role",
			{
				"parent": "Administrator",
				"parenttype": "User",
				"role": ROLE_REACTIVATE_PERMANENTLY_STOPPED_CARD,
			},
		)
		card = self._make_card()
		change_card_status(
			card["name"],
			"موقفة نهائياً",
			reason="إتلاف للاختبار",
			event_date="2026-10-29",
		)
		frappe.set_user("Administrator")
		self.assertFalse(has_reactivate_permanently_stopped_card_role("Administrator"))

		with self.assertRaises(frappe.PermissionError):
			change_card_status(card["name"], "نشطة")

		with self.assertRaises(frappe.PermissionError):
			transfer_card(
				card=card["name"],
				to_region=self.region_aden,
				to_representative=self.rep_ali,
				new_received_date="2026-10-30",
			)

	def test_15_authorized_user_with_both_roles_can_reactivate_and_transfer_permanently_stopped_card(self):
		card = self._make_card()
		change_card_status(
			card["name"],
			"موقفة نهائياً",
			reason="إتلاف ثم استثناء إداري",
			event_date="2026-10-29",
		)

		frappe.set_user(self.with_reactivate_perm_user)
		self.assertTrue(has_reactivate_permanently_stopped_card_role())
		self.assertTrue(get_card_permissions()["can_reactivate_permanently_stopped_card"])

		# Can transfer while permanently stopped if holding both transfer_card + new role
		transferred = transfer_card(
			card=card["name"],
			to_region=self.region_aden,
			to_representative=self.rep_ali,
			new_received_date="2026-10-30",
			transfer_note="نقل بموجب صلاحية خاصة",
		)["card"]
		self.assertEqual(transferred["representative"], self.rep_ali)

		# Can reactivate from موقفة نهائياً -> نشطة and append event without losing history
		reactivated = change_card_status(card["name"], "نشطة")["card"]
		self.assertEqual(reactivated["status"], "نشطة")

		ev_res = get_card_events(card["name"])
		self.assertEqual(ev_res["total_events"], 2)
		self.assertEqual(ev_res["events"][0]["event_type"], "reactivated")
		self.assertEqual(ev_res["events"][0]["previous_status"], "موقفة نهائياً")
		self.assertEqual(ev_res["events"][0]["new_status"], "نشطة")
		self.assertEqual(ev_res["events"][1]["event_type"], "permanent_stop")

	def test_16_reactivate_role_alone_does_not_grant_base_status_or_transfer_permission(self):
		card = self._make_card()
		change_card_status(
			card["name"],
			"موقفة نهائياً",
			reason="إتلاف لاختبار القارئ",
			event_date="2026-10-29",
		)

		frappe.set_user(self.reader_with_reactivate_only_user)
		self.assertTrue(has_reactivate_permanently_stopped_card_role())
		perms = get_card_permissions()
		self.assertFalse(perms["can_change_status"])
		self.assertFalse(perms["can_transfer"])

		with self.assertRaises(frappe.PermissionError):
			change_card_status(card["name"], "نشطة")

		with self.assertRaises(frappe.PermissionError):
			transfer_card(
				card=card["name"],
				to_region=self.region_aden,
				to_representative=self.rep_ali,
				new_received_date="2026-10-30",
			)
