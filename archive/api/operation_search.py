import re
import unicodedata

import frappe
from typing import Any


# ============================================================
# Searchable operation fields
# ============================================================

OPERATION_SEARCH_FIELDS = (
    "name",
    "serial_no",
    "operation_no",

    "customer",

    "amount",
    "currency",
    "customer_rate",

    "beneficiary_name",
    "beneficiary_account",
    "beneficiary_bank",
    "swift_code",
    "country",

    "sender_name",
    "sender_account",

    "execution_datetime",
    "transferring_bank",
    "request_date",

    "from_account",
    "reference_no",
    "bank_transfer_rate",

    "notes",
    "status",
)


# ============================================================
# Arabic / Persian digits
# ============================================================

DIGIT_TRANSLATION = str.maketrans(
    {
        "٠": "0",
        "١": "1",
        "٢": "2",
        "٣": "3",
        "٤": "4",
        "٥": "5",
        "٦": "6",
        "٧": "7",
        "٨": "8",
        "٩": "9",

        "۰": "0",
        "۱": "1",
        "۲": "2",
        "۳": "3",
        "۴": "4",
        "۵": "5",
        "۶": "6",
        "۷": "7",
        "۸": "8",
        "۹": "9",
    }
)


# ============================================================
# Arabic normalization
# ============================================================

ARABIC_TRANSLATION = str.maketrans(
    {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",

        "ى": "ي",

        "ؤ": "و",
        "ئ": "ي",

        "ة": "ه",

        "ـ": "",
    }
)


# ============================================================
# Normalize search text
# ============================================================

def normalize_search_text(
    value: Any,
) -> str:
    """
    توحيد النص للبحث.

    مثال:
        البنك الأهلي
        البنك الاهلي

    كلاهما يصبح:
        البنك الاهلي

    كذلك:
        ١٢٣٤
        1234

    يصبحان:
        1234
    """

    if (
        value is None
        or value == ""
    ):
        return ""


    text = str(
        value
    )


    # أرقام عربية / فارسية -> إنجليزية
    text = text.translate(
        DIGIT_TRANSLATION
    )


    # توحيد أشكال الحروف العربية
    text = text.translate(
        ARABIC_TRANSLATION
    )


    # إزالة الحركات العربية
    text = "".join(
        character
        for character in text
        if not unicodedata.combining(
            character
        )
    )


    # إزالة zero width characters
    text = (
        text
        .replace(
            "\u200b",
            ""
        )
        .replace(
            "\u200c",
            ""
        )
        .replace(
            "\u200d",
            ""
        )
        .replace(
            "\ufeff",
            ""
        )
    )


    text = text.lower()


    # أي رمز غير حرف أو رقم يتحول لمسافة.
    #
    # نحتفظ بالعربي والإنجليزي والأرقام.
    text = re.sub(
        r"[^0-9a-z\u0600-\u06ff]+",
        " ",
        text,
        flags=re.IGNORECASE,
    )


    # مسافات متعددة -> مسافة واحدة
    text = re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


    return text


# ============================================================
# Add value to search parts
# ============================================================

def _append_search_value(
    parts: list[str],
    value: Any,
) -> None:

    normalized = (
        normalize_search_text(
            value
        )
    )

    if not normalized:
        return

    parts.append(
        normalized
    )


# ============================================================
# Linked customer
# ============================================================

def _append_customer_values(
    parts: list[str],
    operation,
) -> None:

    if not operation.customer:
        return


    customer = frappe.db.get_value(
        "Archive Customer",
        operation.customer,
        [
            "customer_name",
        ],
        as_dict=True,
    )


    if not customer:
        return


    _append_search_value(
        parts,
        customer.customer_name,
    )


# ============================================================
# Linked account
# ============================================================

def _append_account_values(
    parts: list[str],
    operation,
) -> None:

    if not operation.from_account:
        return


    account = frappe.db.get_value(
        "Archive Account",
        operation.from_account,
        [
            "account_name",
        ],
        as_dict=True,
    )


    if not account:
        return


    _append_search_value(
        parts,
        account.account_name,
    )

    _append_search_value(
        parts,
        account.account_number,
    )

    _append_search_value(
        parts,
        account.bank_name,
    )

    _append_search_value(
        parts,
        account.currency,
    )


# ============================================================
# Attachments
# ============================================================

def _append_attachment_values(
    parts: list[str],
    operation,
) -> None:

    for row in (
        operation.attachments
        or []
    ):

        _append_search_value(
            parts,
            row.file_name,
        )

        _append_search_value(
            parts,
            row.file,
        )
# ============================================================
# Country values
# ============================================================

def _append_country_values(
    parts: list[str],
    operation,
) -> None:
    """
    إضافة اسم الدولة المخزن وترجمته العربية
    إلى فهرس البحث.

    مثال:
        Yemen
        اليمن

    كلاهما يصبحان قابلين للبحث.
    """

    country = (
        operation.country
        or ""
    ).strip()

    if not country:
        return


    # القيمة الأصلية المخزنة في Frappe.
    _append_search_value(
        parts,
        country,
    )


    # الترجمة العربية المستخدمة في الواجهة.
    arabic_country = frappe._(
        country,
        lang="ar",
    )


    if (
        arabic_country
        and arabic_country != country
    ):
        _append_search_value(
            parts,
            arabic_country,
        )

# ============================================================
# Build complete operation search text
# ============================================================

def build_operation_search_text(
    operation,
) -> str:
    """
    إنشاء فهرس بحث شامل للعملية.

    لا يعتمد البحث على عمود واحد.
    العملية كلها تتحول إلى نص بحث واحد.
    """

    parts = []


    # ========================================================
    # Direct fields
    # ========================================================

    for fieldname in (
        OPERATION_SEARCH_FIELDS
    ):

        _append_search_value(
            parts,
            operation.get(
                fieldname
            ),
        )


    # ========================================================
    # Linked document values
    # ========================================================

    _append_customer_values(
        parts,
        operation,
    )

    _append_account_values(
        parts,
        operation,
    )
    _append_country_values(
        parts,
        operation,
    )


    # ========================================================
    # Attachments
    # ========================================================

    _append_attachment_values(
        parts,
        operation,
    )


    # إزالة التكرارات مع المحافظة
    # على ترتيب القيم.
    unique_parts = list(
        dict.fromkeys(
            parts
        )
    )


    return " ".join(
        unique_parts
    )


# ============================================================
# Search query tokens
# ============================================================

def get_search_tokens(
    search: str | None,
) -> list[str]:

    normalized = (
        normalize_search_text(
            search
        )
    )


    if not normalized:
        return []


    tokens = [
        token
        for token in normalized.split()
        if token
    ]


    return list(
        dict.fromkeys(
            tokens
        )
    )


# ============================================================
# Search operation names
# ============================================================

def search_operation_names(
    search: str | None,
    base_filters=None,
) -> list[str]:
    """
    البحث القوي الأساسي.

    كل كلمة كتبها المستخدم يجب أن توجد
    داخل العملية، لكن ليس بالضرورة
    في نفس الحقل.

    مثال:
        "الاهلي محمد"

    يمكن أن تكون:
        الاهلي -> transferring_bank
        محمد   -> beneficiary_name

    وتظل العملية مطابقة.
    """

    tokens = get_search_tokens(
        search
    )


    filters = []


    # ========================================================
    # Base filters
    # ========================================================

    if isinstance(
        base_filters,
        dict,
    ):

        for (
            fieldname,
            value,
        ) in base_filters.items():

            filters.append(
                [
                    fieldname,
                    "="
                    if not isinstance(
                        value,
                        list,
                    )
                    else value[0],
                    value
                    if not isinstance(
                        value,
                        list,
                    )
                    else value[1],
                ]
            )


    elif isinstance(
        base_filters,
        list,
    ):

        filters.extend(
            base_filters
        )


    # ========================================================
    # Search tokens
    # ========================================================

    for token in tokens:

        filters.append(
            [
                "search_text",
                "like",
                f"%{token}%",
            ]
        )


    return frappe.get_list(
        "Archive Operation",

        filters=
            filters,

        pluck=
            "name",

        order_by=
            "creation desc",

        limit_page_length=
            0,
    )