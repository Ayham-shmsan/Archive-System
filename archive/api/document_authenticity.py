from __future__ import annotations

import json
import os

import frappe
from frappe import _
from frappe.utils import now_datetime

from archive.forensic.snb_pdf_validator import validate_snb_pdf
from archive.forensic.snb_pdf_fingerprint import (
    FINGERPRINT_ENGINE_VERSION,
)

CHECK_DOCTYPE = "Archive Document Authenticity Check"

AUTHENTICITY_PERMISSION_TYPE = (
    "use_authenticity_checker"
)

def _require_authenticity_checker_permission() -> None:

    frappe.has_permission(
        CHECK_DOCTYPE,
        ptype=AUTHENTICITY_PERMISSION_TYPE,
        throw=True,
    )


@frappe.whitelist()
def check_pdf(file_id: str) -> dict:
    """
    يفحص ملف PDF موجود في DocType File،
    ثم ينشئ سجل فحص مستقل وغير قابل للتعديل.

    file_id يجب أن يكون File.name وليس اسم الملف الظاهر.
    """

    if frappe.session.user == "Guest":
        frappe.throw(
            _("يجب تسجيل الدخول لإجراء فحص المستند."),
            frappe.PermissionError,
        )
    _require_authenticity_checker_permission()
    file_id = (file_id or "").strip()

    if not file_id:
        frappe.throw(
            _("معرّف الملف مطلوب.")
        )

    file_doc = frappe.get_doc(
        "File",
        file_id,
    )

    file_doc.check_permission(
        "read"
    )

    _validate_pdf_file(
        file_doc
    )

    file_path = file_doc.get_full_path()

    if not os.path.isfile(file_path):
        frappe.throw(
            _("تعذر العثور على الملف على الخادم.")
        )

    result = validate_snb_pdf(
        file_path
    )

    fingerprint = (
        result.get("fingerprint")
        or {}
    )

    file_info = (
        fingerprint.get("file")
        or {}
    )

    language = (
        result.get("language")
        or "Unknown"
    )

    document_type = (
        result.get("document_type")
        or "Unknown"
    )

    profile = (
        result.get("profile")
        or "Unknown"
    )

    engine_version = _build_engine_version(
        result
    )

    check_doc = frappe.get_doc(
        {
            "doctype":
                CHECK_DOCTYPE,

            "source_file":
                file_doc.file_url,

            "file_name":
                file_doc.file_name,

            "file_sha256":
                file_info.get(
                    "sha256"
                )
                or "",

            "file_size":
                int(
                    file_info.get(
                        "size"
                    )
                    or 0
                ),

            "document_type":
                document_type,

            "language":
                language,

            "profile":
                profile,

            "status":
                result["status"],

            "risk_score":
                int(
                    result.get(
                        "risk_score"
                    )
                    or 0
                ),

            "summary":
                result.get(
                    "summary"
                )
                or "",

            "checked_by":
                frappe.session.user,

            "checked_at":
                now_datetime(),

            "engine_version":
                engine_version,

            "findings_json":
                _to_json(
                    result.get(
                        "findings"
                    )
                    or []
                ),

            "fingerprint_json":
                _to_json(
                    fingerprint
                ),
        }
    )

    # السجل Audit Record يتم إنشاؤه بواسطة النظام،
    # لذلك لا نعتمد على صلاحية Create اليدوية للـ DocType.
    check_doc.insert(
        ignore_permissions=True
    )

    _attach_file_if_unattached(
        file_doc=file_doc,
        check_name=check_doc.name,
    )

    return {
        "name":
            check_doc.name,

        "status":
            check_doc.status,

        "risk_score":
            check_doc.risk_score,

        "summary":
            check_doc.summary,

        "document_type":
            check_doc.document_type,

        "language":
            check_doc.language,

        "profile":
            check_doc.profile,

        "source_file":
            check_doc.source_file,

        "checked_by":
            check_doc.checked_by,

        "checked_at":
            check_doc.checked_at,

        "engine_version":
            check_doc.engine_version,

        "tamper_signals":
            int(
                result.get(
                    "tamper_signals"
                )
                or 0
            ),

        "findings":
            result.get(
                "findings"
            )
            or [],
    }



# @frappe.whitelist()
# def get_recent_checks(
#     limit: int = 20,
# ) -> list[dict]:
#     """
#     يعيد أحدث فحوصات المستندات الخاصة بالمستخدم الحالي.
#     """

#     if frappe.session.user == "Guest":
#         frappe.throw(
#             _("يجب تسجيل الدخول لعرض سجل الفحوصات."),
#             frappe.PermissionError,
#         )
#     _require_authenticity_checker_permission()
#     try:
#         limit = int(
#             limit
#             or 20
#         )
#     except (
#         TypeError,
#         ValueError,
#     ):
#         limit = 20

#     limit = max(
#         1,
#         min(
#             limit,
#             50,
#         ),
#     )

#     rows = frappe.get_all(
#         CHECK_DOCTYPE,
#         filters={
#             "checked_by":
#                 frappe.session.user,
#         },
#         fields=[
#             "name",
#             "file_name",
#             "source_file",
#             "status",
#             "risk_score",
#             "language",
#             "profile",
#             "summary",
#             "checked_by",
#             "checked_at",
#             "engine_version",
#         ],
#         order_by=(
#             "checked_at desc, "
#             "creation desc"
#         ),
#         limit=limit,
#     )

#     return rows
@frappe.whitelist()
def get_recent_checks(
    limit: int = 20,
) -> list[dict]:
    """
    يعيد أحدث فحوصات المستندات لجميع المستخدمين.
    الوصول إلى هذه الدالة محمي بصلاحية:
    use_authenticity_checker
    """

    if frappe.session.user == "Guest":
        frappe.throw(
            _("يجب تسجيل الدخول لعرض سجل الفحوصات."),
            frappe.PermissionError,
        )

    _require_authenticity_checker_permission()

    try:
        limit = int(
            limit
            or 20
        )
    except (
        TypeError,
        ValueError,
    ):
        limit = 20

    limit = max(
        1,
        min(
            limit,
            50,
        ),
    )

    rows = frappe.get_all(
        CHECK_DOCTYPE,
        fields=[
            "name",
            "file_name",
            "source_file",
            "status",
            "risk_score",
            "language",
            "profile",
            "summary",
            "checked_by",
            "checked_at",
            "engine_version",
        ],
        order_by=(
            "checked_at desc, "
            "creation desc"
        ),
        limit=limit,
    )

    user_names = list(
        {
            row.get("checked_by")
            for row in rows
            if row.get("checked_by")
        }
    )

    full_names = {}

    if user_names:
        users = frappe.get_all(
            "User",
            filters={
                "name": [
                    "in",
                    user_names,
                ],
            },
            fields=[
                "name",
                "full_name",
            ],
        )

        full_names = {
            user.name:
                (
                    user.full_name
                    or user.name
                )
            for user in users
        }

    for row in rows:
        checked_by = (
            row.get("checked_by")
            or ""
        )

        row["checked_by_full_name"] = (
            full_names.get(
                checked_by
            )
            or checked_by
        )

    return rows


def _validate_pdf_file(
    file_doc,
) -> None:

    if file_doc.is_folder:
        frappe.throw(
            _("المحدد ليس ملفًا.")
        )

    file_name = (
        file_doc.file_name
        or ""
    ).strip()

    if not file_name.lower().endswith(
        ".pdf"
    ):
        frappe.throw(
            _("يمكن فحص ملفات PDF فقط.")
        )

    if not file_doc.file_url:
        frappe.throw(
            _("ملف PDF لا يحتوي على مسار صالح.")
        )


def _attach_file_if_unattached(
    file_doc,
    check_name: str,
) -> None:
    """
    إذا كان الملف مرفوعًا من File Manager وغير مرتبط
    بمستند آخر، نربطه بسجل الفحص.

    إذا كان مرتبطًا أصلًا بمستند آخر فلا نغيّر ارتباطه.
    """

    if (
        file_doc.attached_to_doctype
        or file_doc.attached_to_name
    ):
        return

    frappe.db.set_value(
        "File",
        file_doc.name,
        {
            "attached_to_doctype":
                CHECK_DOCTYPE,

            "attached_to_name":
                check_name,

            "attached_to_field":
                "source_file",
        },
        update_modified=False,
    )

def _build_engine_version(
    result: dict,
) -> str:

    validator_version = (
        result.get(
            "validator_version"
        )
        or "Unknown"
    )

    return (
        f"validator:{validator_version}; "
        f"fingerprint:{FINGERPRINT_ENGINE_VERSION}"
    )

def _to_json(
    value,
) -> str:

    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(
            ",",
            ":",
        ),
    )


