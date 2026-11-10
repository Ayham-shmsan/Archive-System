from __future__ import annotations

import os
import frappe
from frappe.modules.import_file import import_file_by_path
from frappe.utils import cint, cstr

from archive.services.fiscal_year_permissions import (
	INITIAL_FISCAL_YEAR,
	ensure_fiscal_year_2026,
	sync_fiscal_series_counter,
)


BATCH_SIZE = 500


def execute() -> None:
	_import_fiscal_doctypes()
	ensure_fiscal_year_2026()
	_backfill_2026_records()
	_ensure_unique_constraints()
	_initialize_2026_user_permissions_once()
	frappe.db.commit()


def _import_fiscal_doctypes() -> None:
	app_root = frappe.get_app_path("archive", "archive", "doctype")
	rel_paths = [
		("archive_fiscal_year", "archive_fiscal_year.json"),
		("archive_user_fiscal_permission", "archive_user_fiscal_permission.json"),
		("archive_settings", "archive_settings.json"),
		("archive_operation", "archive_operation.json"),
		("archive_pending_operation", "archive_pending_operation.json"),
		("archive_card_deposit", "archive_card_deposit.json"),
		("archive_document_authenticity_check", "archive_document_authenticity_check.json"),
	]
	for folder, filename in rel_paths:
		full_path = os.path.join(app_root, folder, filename)
		if os.path.exists(full_path):
			import_file_by_path(full_path, force=True, ignore_version=True)


def _backfill_2026_records() -> None:
	# 1. Backfill missing fiscal_year = '2026' + sequential fiscal_sequence in a single pass for sequenced DocTypes
	sequenced_specs = [
		("Archive Operation", "COALESCE(`serial_no`, 0) ASC, `creation` ASC, `name` ASC"),
		("Archive Pending Operation", "COALESCE(`serial_no`, 0) ASC, `creation` ASC, `name` ASC"),
		("Archive Document Authenticity Check", "`checked_at` ASC, `creation` ASC, `name` ASC"),
	]

	for doctype, order_clause in sequenced_specs:
		if not frappe.db.table_exists(doctype) or not frappe.db.has_column(doctype, "fiscal_year"):
			continue

		max_row = frappe.db.sql(
			f"""
			SELECT COALESCE(MAX(`fiscal_sequence`), 0)
			FROM `tab{doctype}`
			WHERE `fiscal_year` = %s AND COALESCE(`fiscal_sequence`, 0) > 0
			""",
			(INITIAL_FISCAL_YEAR,),
		)
		current_seq = cint(max_row[0][0]) if max_row else 0

		while True:
			batch_names = frappe.db.sql_list(
				f"""
				SELECT `name`
				FROM `tab{doctype}`
				WHERE (`fiscal_year` IS NULL OR `fiscal_year` = '' OR `fiscal_year` = %s)
				  AND COALESCE(`fiscal_sequence`, 0) <= 0
				ORDER BY {order_clause}
				LIMIT {BATCH_SIZE}
				""",
				(INITIAL_FISCAL_YEAR,),
			)
			if not batch_names:
				break

			for doc_name in batch_names:
				current_seq += 1
				frappe.db.sql(
					f"""
					UPDATE `tab{doctype}`
					SET `fiscal_year` = CASE
						WHEN `fiscal_year` IS NULL OR `fiscal_year` = '' THEN %s
						ELSE `fiscal_year`
					END,
					    `fiscal_sequence` = %s
					WHERE `name` = %s AND COALESCE(`fiscal_sequence`, 0) <= 0
					""",
					(INITIAL_FISCAL_YEAR, current_seq, doc_name),
				)

		# Also ensure any remaining rows with fiscal_sequence > 0 but missing fiscal_year get '2026'
		frappe.db.sql(
			f"""
			UPDATE `tab{doctype}`
			SET `fiscal_year` = %s
			WHERE `fiscal_year` IS NULL OR `fiscal_year` = ''
			""",
			(INITIAL_FISCAL_YEAR,),
		)

		sync_fiscal_series_counter(doctype, INITIAL_FISCAL_YEAR)

	# 2. Backfill Archive Card Deposit (fiscal_year only, no fiscal_sequence)
	if frappe.db.table_exists("Archive Card Deposit") and frappe.db.has_column(
		"Archive Card Deposit", "fiscal_year"
	):
		_report_out_of_2026_deposits()
		while True:
			names = frappe.db.sql_list(
				f"""
				SELECT `name`
				FROM `tabArchive Card Deposit`
				WHERE `fiscal_year` IS NULL OR `fiscal_year` = ''
				LIMIT {BATCH_SIZE}
				"""
			)
			if not names:
				break
			placeholders = ", ".join(["%s"] * len(names))
			frappe.db.sql(
				f"""
				UPDATE `tabArchive Card Deposit`
				SET `fiscal_year` = %s
				WHERE `name` IN ({placeholders})
				  AND (`fiscal_year` IS NULL OR `fiscal_year` = '')
				""",
				tuple([INITIAL_FISCAL_YEAR] + list(names)),
			)


def _report_out_of_2026_deposits() -> None:
	rows = frappe.db.sql(
		"""
		SELECT `name`, `deposit_date`
		FROM `tabArchive Card Deposit`
		WHERE `deposit_date` IS NOT NULL
		  AND (`deposit_date` < '2026-01-01' OR `deposit_date` > '2026-12-31')
		LIMIT 20
		""",
		as_dict=True,
	)
	if rows:
		sample = ", ".join(f"{r.name} ({r.deposit_date})" for r in rows[:5])
		frappe.logger().warning(
			f"[Archive Fiscal Year 2026 Patch] Found {len(rows)} deposit records with deposit_date outside 2026 (kept as 2026 per owner policy without altering dates): {sample}"
		)


def _ensure_unique_constraints() -> None:
	constraints = [
		("Archive Operation", ["fiscal_year", "fiscal_sequence"], "uniq_archive_op_fy_seq"),
		("Archive Pending Operation", ["fiscal_year", "fiscal_sequence"], "uniq_archive_pend_fy_seq"),
		(
			"Archive Document Authenticity Check",
			["fiscal_year", "fiscal_sequence"],
			"uniq_archive_auth_fy_seq",
		),
		(
			"Archive User Fiscal Permission",
			["parent_user", "fiscal_year"],
			"uniq_archive_user_fiscal_perm",
		),
	]
	for doctype, fields, cname in constraints:
		if frappe.db.table_exists(doctype):
			try:
				frappe.db.add_unique(doctype, fields, constraint_name=cname)
			except Exception:
				pass


def _initialize_2026_user_permissions_once() -> None:
	"""
	تهيئة تأسيسية واحدة فقط لصلاحيات سنة 2026 للمستخدمين الحاليين انطلاقاً من أدوارهم الفعلية،
	دون استبدال أي سجل موجود مسبقاً لسنة 2026.
	"""
	if not frappe.db.table_exists("Archive User Fiscal Permission"):
		return

	view_roles = {
		"System Manager",
		"صلاحية الوصول إلى شاشة العمليات",
		"Archive Viewer",
		"صلاحية الوصول إلى شاشة المعلقات",
		"صلاحية عرض المعلقات الخاصة بالمستخدم",
		"صلاحية عرض جميع المعلقات",
		"صلاحية الوصول إلى شاشة الإيداعات",
		"صلاحية الوصول إلى شاشة فحص المستندات",
		"archive document authenticity history",
		"archive document authenticity all history",
		"archive document authenticity manager",
	}
	add_roles = {
		"System Manager",
		"Archive Creator",
		"صلاحية إضافة عملية معلقة",
		"صلاحية تعديل إيداعات اليوم",
		"صلاحية تعديل إيداعات الأيام السابقة",
		"صلاحية تعديل إيداعات الأيام القادمة",
		"archive document authenticity check",
		"archive document authenticity manager",
	}
	edit_roles = {
		"System Manager",
		"Archive Editor",
		"Archive Initial Status",
		"Archive Advanced Status",
		"Archive Attachment Manager",
		"Archive Final Swift",
		"صلاحية إرفاق الفاتورة غير المكتملة",
		"صلاحية تعديل المعلقات الخاصة بالمستخدم",
		"صلاحية تعديل جميع المعلقات",
		"صلاحية تغيير حالة الفشل في المعلقات",
		"صلاحية إنهاء وإعادة فتح المعلقات",
		"صلاحية إضافة إرجاع في المعلقات",
		"صلاحية تصحيح حركة المبلغ في المعلقات",
		"صلاحية تعديل إيداعات اليوم",
		"صلاحية تعديل إيداعات الأيام السابقة",
		"صلاحية تعديل إيداعات الأيام القادمة",
	}
	delete_roles = {"System Manager"}

	users = frappe.get_all(
		"User",
		filters={"enabled": 1, "name": ["not in", ["Guest"]]},
		pluck="name",
	)

	prev_flag = getattr(frappe.flags, "in_patch", False)
	try:
		frappe.flags.in_patch = True
		for user in users:
			if frappe.db.exists(
				"Archive User Fiscal Permission",
				{"parent_user": user, "fiscal_year": INITIAL_FISCAL_YEAR},
			):
				continue

			user_roles = set(
				frappe.get_all(
					"Has Role",
					filters={"parent": user, "parenttype": "User"},
					pluck="role",
				)
			)

			is_admin = user == "Administrator" or "System Manager" in user_roles
			can_view = 1 if (is_admin or bool(user_roles & view_roles)) else 0
			can_add = 1 if (is_admin or bool(user_roles & add_roles)) else 0
			can_edit = 1 if (is_admin or bool(user_roles & edit_roles)) else 0
			can_delete = 1 if (is_admin or bool(user_roles & delete_roles)) else 0
			can_export = 1 if (is_admin or can_view) else 0

			if any((can_view, can_add, can_edit, can_delete, can_export)):
				doc = frappe.get_doc(
					{
						"doctype": "Archive User Fiscal Permission",
						"parent_user": user,
						"fiscal_year": INITIAL_FISCAL_YEAR,
						"can_view": can_view,
						"can_add": can_add,
						"can_edit": can_edit,
						"can_delete": can_delete,
						"can_export": can_export,
					}
				)
				doc.insert(ignore_permissions=True)
	finally:
		frappe.flags.in_patch = prev_flag
