from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Any

import frappe
import pdfplumber
from frappe import _
from pypdf import PdfReader


ACCOUNT_FROM_LABELS = {
    "Account From",
    "من حساب",
}

BENEFICIARY_ACCOUNT_LABELS = {
    "Beneficiary Account",
    "حساب المستفيد",
}

AMOUNT_LABELS = {
    "Amount",
    "المبلغ",
}

RATE_LABELS = {
    "Currency Conversion Rate",
    "سعر تحويل العملة",
}

BENEFICIARY_NAME_LABELS = {
    "Beneficiary Name",
    "اسم المستفيد",
    "إسم المستفيد",
}

BENEFICIARY_BANK_LABELS = {
    "Beneficiary Bank ID",
    "رمز بنك المستفيد",
}


def _normalize_text(text: str | None) -> str:
    """
    توحيد Unicode مهم جداً لأن PDF العربي
    يحتوي على Arabic Presentation Forms.
    """

    text = unicodedata.normalize(
        "NFKC",
        text or "",
    )

    text = (
        text
        .replace("\u200f", " ")
        .replace("\u200e", " ")
        .replace("\xa0", " ")
    )

    text = re.sub(
        r"[ \t]+",
        " ",
        text,
    )

    text = re.sub(
        r"\r\n?",
        "\n",
        text,
    )

    text = re.sub(
        r"\n{2,}",
        "\n",
        text,
    )

    return text.strip()


def _get_lines(text: str) -> list[str]:
    return [
        line.strip()
        for line in _normalize_text(text).splitlines()
        if line.strip()
    ]


def _value_after_label(
    text: str,
    labels: set[str],
) -> str | None:
    lines = _get_lines(text)

    for index, line in enumerate(lines):
        if line in labels:
            if index + 1 < len(lines):
                return lines[index + 1].strip()

    return None


def _extract_pypdf_text(
    file_path: str,
) -> str:
    reader = PdfReader(file_path)

    pages: list[str] = []

    for page in reader.pages:
        pages.append(
            page.extract_text() or ""
        )

    return _normalize_text(
        "\n".join(pages)
    )


def _extract_pdfplumber_text(
    file_path: str,
) -> str:
    pages: list[str] = []

    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            pages.append(
                page.extract_text() or ""
            )

    return "\n".join(pages)


def _parse_amount(
    value: str | None,
) -> tuple[float | None, str | None]:
    if not value:
        return None, None

    currency_match = re.search(
        r"\b([A-Z]{3})\b",
        value,
    )

    amount_match = re.search(
        r"(?<!\d)(\d[\d,]*\.\d+)",
        value,
    )

    currency = (
        currency_match.group(1)
        if currency_match
        else None
    )

    amount = None

    if amount_match:
        amount = float(
            amount_match
            .group(1)
            .replace(",", "")
        )

    return amount, currency


def _parse_conversion_rate(
    value: str | None,
) -> float | None:
    if not value:
        return None

    # نريد الجزء بعد =
    # مثال:
    # 1 USD = 3.7,765
    value = value.split(
        "=",
        1,
    )[-1]

    match = re.search(
        r"(\d[\d,.]*)",
        value,
    )

    if not match:
        return None

    normalized = (
        match.group(1)
        .replace(",", "")
    )

    try:
        return float(normalized)
    except ValueError:
        return None


def _extract_sender_name(
    text: str,
) -> str | None:
    """
    الإنجليزية:
    Company Name شركة تاج الشراع Date: ...

    العربية:
    اسم العميل مؤسسة ... التاريخ ...
    """

    text = _normalize_text(text)

    pattern = (
        r"(?:Company Name|اسم العميل|إسم العميل)"
        r"\s*(.+?)"
        r"(?=\s*Date:|\s*التاريخ)"
    )

    match = re.search(
        pattern,
        text,
        flags=re.DOTALL,
    )

    if not match:
        return None

    value = match.group(1).strip()

    return value or None


def _extract_execution_datetime_and_remarks(
    text: str,
) -> tuple[str | None, str | None]:
    """
    استخراج تاريخ تنفيذ العملية والملاحظات
    من قسم Transaction Route / مسار العملية فقط.

    الملاحظات قد تكون:
    - بعد التاريخ والوقت في نفس السطر
    - أو في سطر/أسطر لاحقة داخل نفس القسم
    """

    text = _normalize_text(text)

    # بداية قسم مسار العملية
    starts = [
        index
        for index in (
            text.find("Transaction Route"),
            text.find("مسار العملية"),
        )
        if index >= 0
    ]

    if not starts:
        return None, None

    section = text[min(starts):]

    # نهاية قسم مسار العملية
    ends = [
        index
        for marker in (
            "NEXT STEPS",
            "الخطوة التالية",
        )
        if (index := section.find(marker)) > 0
    ]

    if ends:
        section = section[:min(ends)]

    # ندعم الترتيبين:
    # 03/09/2026 16:07
    # 16:07 03/09/2026
    patterns = [
        re.compile(
            r"(?P<date>\d{2}/\d{2}/\d{4})"
            r"\s+"
            r"(?P<time>\d{2}:\d{2})"
        ),
        re.compile(
            r"(?P<time>\d{2}:\d{2})"
            r"\s+"
            r"(?P<date>\d{2}/\d{2}/\d{4})"
        ),
    ]

    match = None

    for pattern in patterns:
        match = pattern.search(section)

        if match:
            break

    if not match:
        return None, None

    parsed = datetime.strptime(
        f"{match.group('date')} {match.group('time')}",
        "%d/%m/%Y %H:%M",
    )

    execution_datetime = parsed.strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    # كل ما يأتي بعد تاريخ/وقت الصف وقبل NEXT STEPS
    # يعتبر محتوى Remarks.
    remarks = section[match.end():]

    remarks = re.sub(
        r"^(?:Remarks|ملاحظات)\s*:?\s*",
        "",
        remarks.strip(),
        flags=re.IGNORECASE,
    )

    # إذا كانت الملاحظة ملتفة على أكثر من سطر
    # نجمعها كنص واحد.
    remarks = re.sub(
        r"\s+",
        " ",
        remarks,
    ).strip()

    return (
        execution_datetime,
        remarks or None,
    )

# def _extract_execution_datetime_and_remarks(
#     text: str,
# ) -> tuple[str | None, str | None]:
#     """
#     لا نأخذ التاريخ الموجود في رأس المستند.

#     نبدأ البحث فقط بعد:
#     Transaction Route
#     أو
#     مسار العملية
#     """

#     text = _normalize_text(text)

#     indexes = [
#         index
#         for index in (
#             text.find("Transaction Route"),
#             text.find("مسار العملية"),
#         )
#         if index >= 0
#     ]

#     if indexes:
#         text = text[min(indexes):]

#     pattern = re.compile(
#         r"(\d{2}/\d{2}/\d{4})"
#         r"\s+"
#         r"(\d{2}:\d{2})"
#         r"(?:\s+(.*))?$"
#     )

#     for line in text.splitlines():
#         line = line.strip()

#         match = pattern.search(line)

#         if not match:
#             continue

#         raw_date = match.group(1)
#         raw_time = match.group(2)

#         parsed = datetime.strptime(
#             f"{raw_date} {raw_time}",
#             "%d/%m/%Y %H:%M",
#         )

#         remarks = (
#             match.group(3) or ""
#         ).strip()

#         return (
#             parsed.strftime(
#                 "%Y-%m-%d %H:%M:%S"
#             ),
#             remarks or None,
#         )

#     return None, None




# def _extract_reference_number(
#     logical_text: str,
#     visual_text: str,
# ) -> str | None:
#     """
#     الإنجليزية يمكن قراءتها مباشرة من:
#     unique transaction number

#     النسخة العربية تحتاج fallback لأن اتجاه
#     النص في PDF يعكس مقطعي الحروف حول الرقم.
#     """

#     logical_text = _normalize_text(
#         logical_text
#     )

#     english_match = re.search(
#         r"unique transaction number"
#         r"\s+([A-Z0-9]+)",
#         logical_text,
#         flags=re.IGNORECASE,
#     )

#     if english_match:
#         return english_match.group(1)

#     arabic_logical_match = re.search(
#         r"رقم حوالة\s+([A-Z0-9]+)",
#         logical_text,
#     )

#     if arabic_logical_match:
#         return arabic_logical_match.group(1)

#     # fallback للنسخة العربية
#     candidates = re.findall(
#         r"\b("
#         r"[A-Z]{2,6}"
#         r"\d{5,}"
#         r"[A-Z]{2,6}"
#         r")\b",
#         visual_text,
#     )

#     if not candidates:
#         return None

#     candidate = candidates[0]

#     parts = re.fullmatch(
#         r"([A-Z]+)"
#         r"(\d+)"
#         r"([A-Z]+)",
#         candidate,
#     )

#     if not parts:
#         return candidate

#     # مثال القراءة المرئية:
#     # NCBK82426246BAJN
#     #
#     # القيمة الحقيقية:
#     # BAJN82426246NCBK

#     return (
#         parts.group(3)
#         + parts.group(2)
#         + parts.group(1)
#     )
def _extract_reference_number(
    logical_text: str,
    visual_text: str,
) -> str | None:
    """
    استخراج رقم الحوالة / unique transaction number.

    في النسخة العربية نعتمد الترتيب المرئي
    كما يظهر في المستند ولا نعكس أجزاء الرقم.
    """

    logical_text = _normalize_text(
        logical_text
    )

    # النسخة الإنجليزية
    english_match = re.search(
        r"unique transaction number"
        r"\s+([A-Z0-9]+)",
        logical_text,
        flags=re.IGNORECASE,
    )

    if english_match:
        return english_match.group(1)

    # النسخة العربية:
    # نأخذ الكود كما يظهر بصرياً في PDF.
    candidates = re.findall(
        r"\b[A-Z]{2,6}\d{5,}[A-Z]{2,6}\b",
        visual_text,
    )

    if candidates:
        return candidates[0]

    # fallback أخير فقط
    arabic_match = re.search(
        r"رقم حوالة\s+([A-Z0-9]+)",
        logical_text,
    )

    if arabic_match:
        return arabic_match.group(1)

    return None

def _get_file_doc(
    file_url: str,
):
    file_name = frappe.db.get_value(
        "File",
        {"file_url": file_url},
        "name",
    )

    if not file_name:
        frappe.throw(
            _("الملف غير موجود.")
        )

    file_doc = frappe.get_doc(
        "File",
        file_name,
    )

    user = frappe.session.user

    is_system_manager = (
        "System Manager"
        in frappe.get_roles(user)
    )

    if (
        file_doc.owner != user
        and not is_system_manager
        and user != "Administrator"
    ):
        frappe.throw(
            _("لا تملك صلاحية قراءة هذا الملف.")
        )

    if not (
        file_doc.file_name or ""
    ).lower().endswith(".pdf"):
        frappe.throw(
            _("ملف استخراج البيانات يجب أن يكون PDF.")
        )

    return file_doc


def _parse_operation_pdf(
    file_path: str,
) -> dict[str, Any]:
    logical_text = _extract_pypdf_text(
        file_path
    )

    visual_text = _extract_pdfplumber_text(
        file_path
    )

    amount_value = _value_after_label(
        logical_text,
        AMOUNT_LABELS,
    )

    amount, currency = _parse_amount(
        amount_value
    )

    execution_datetime, remarks = (
        _extract_execution_datetime_and_remarks(
            logical_text
        )
    )

    result: dict[str, Any] = {
        "sender_account":
            _value_after_label(
                logical_text,
                ACCOUNT_FROM_LABELS,
            ),

        "beneficiary_account":
            _value_after_label(
                logical_text,
                BENEFICIARY_ACCOUNT_LABELS,
            ),

        "amount":
            amount,

        "currency":
            currency,

        "bank_transfer_rate":
            _parse_conversion_rate(
                _value_after_label(
                    logical_text,
                    RATE_LABELS,
                )
            ),

        "beneficiary_name":
            _value_after_label(
                logical_text,
                BENEFICIARY_NAME_LABELS,
            ),

        "beneficiary_bank":
            _value_after_label(
                logical_text,
                BENEFICIARY_BANK_LABELS,
            ),

        "execution_datetime":
            execution_datetime,

        "reference_no":
            _extract_reference_number(
                logical_text,
                visual_text,
            ),

        "sender_name":
            _extract_sender_name(
                logical_text
            ),

        "notes":
            remarks,
    }

    # لا نرسل حقولاً فارغة للواجهة حتى لا نمسح
    # قيمة قد كتبها الموظف يدوياً قبل الاستخراج.
    return {
        key: value
        for key, value in result.items()
        if value not in (
            None,
            "",
        )
    }


@frappe.whitelist(methods=["POST"])
def extract_operation_data(
    file_url: str,
) -> dict[str, Any]:
    file_doc = _get_file_doc(
        file_url
    )

    file_path = file_doc.get_full_path()

    try:
        data = _parse_operation_pdf(
            file_path
        )
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Archive PDF Extraction",
        )

        frappe.throw(
            _(
                "تعذر قراءة بيانات ملف PDF. "
                "تأكد أن الملف من قالب الحوالات المعتمد."
            )
        )

    return {
        "file_url": file_url,
        "data": data,
    }