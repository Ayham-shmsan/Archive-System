from __future__ import annotations

from typing import Any


# ============================================================
# Profile schema version
# ============================================================

PROFILE_SCHEMA_VERSION = "1.0.0"


# ============================================================
# Common SNB structure
#
# هذه القيم ثبتت في العينات الأصلية الحالية.
#
# لا يوجد هنا قرار Authentic / Forged.
# هذه مجرد مواصفات مرجعية يقارن بها Validator لاحقاً.
# ============================================================

SNB_COMMON_V1: dict[str, Any] = {

    "document_type":
        "SNB International Transfer",


    # ========================================================
    # Core PDF structure
    # ========================================================

    "pdf": {

        "version":
            "1.4",

        "page_count":
            1,

        "trailer_size":
            25,

        "eof_count":
            1,

        "startxref_count":
            1,

        "has_prev":
            False,

        "plain_object_declaration_count":
            24,

        "has_xref_stream_marker":
            False,

        "has_object_stream_marker":
            False,
    },


    # ========================================================
    # Page geometry
    # ========================================================

    "page": {

        "width":
            842.0,

        "height":
            595.0,

        "rotation":
            0,

        "content_stream_count":
            2,
    },


    # ========================================================
    # Generator metadata
    #
    # Creator / Producer مهمان،
    # لكن لن يكونا وحدهما سبباً كافياً للرفض.
    # ========================================================

    "metadata": {

        "creator":
            "PD4ML. HTML to PDF Converter for Java (398fx1)",

        "producer":
            "PD4ML. HTML to PDF Converter for Java (398fx1)",
    },


    # ========================================================
    # Catalog
    # ========================================================

    "catalog": {

        "has_metadata":
            False,

        "has_acroform":
            False,

        "has_open_action":
            False,

        "has_embedded_files":
            False,

        "has_javascript":
            False,

        "has_signature_marker":
            False,
    },


    # ========================================================
    # PD4ML internal markers
    #
    # هذه أقوى من Metadata فقط لأنها توجد أيضاً
    # داخل بنية/Content Streams الخاصة بالملف الأصلي.
    # ========================================================

    "forensic_markers": {

        "PD4ML":
            True,

        "398fx1":
            True,

        "userspace":
            True,

        "disable hyperlinks":
            True,

        "/resources/common/fonts":
            True,
    },


    # ========================================================
    # Expected font resources
    #
    # نقارن resource name + base font + object identity.
    #
    # لا نقارن Hash لكل NeoSans subset لأن الـsubset
    # يمكن أن يتغير حسب الأحرف المستخدمة في العملية.
    # ========================================================

    "fonts": [

        {
            "resource_name":
                "/FontNeoSansArabic_PDF_Subset0",

            "base_font":
                "/NeoSansArabic_PDF_Subset",

            "object_id":
                10,
        },

        {
            "resource_name":
                "/Fontcodeicons_PDF_Subset0",

            "base_font":
                "/codeicons_PDF_Subset",

            "object_id":
                15,
        },

        {
            "resource_name":
                "/FontTimes-Roman0",

            "base_font":
                "/Times-Roman",

            "object_id":
                16,
        },

        {
            "resource_name":
                "/FontNeoSansArabic_PDF_Subset1",

            "base_font":
                "/NeoSansArabic_PDF_Subset",

            "object_id":
                21,
        },
    ],


    # ========================================================
    # Fonts allowed in the known original template
    #
    # ظهور Arial / Helvetica كخط إضافي سيكون إشارة
    # قوية لاحقاً، لكنه سيحكم عليه Validator وليس Profile.
    # ========================================================

    "allowed_base_fonts": {

        "/NeoSansArabic_PDF_Subset",
        "/codeicons_PDF_Subset",
        "/Times-Roman",
    },


    # ========================================================
    # Logo / image resources
    # ========================================================

    "images": [

        {
            "resource_name":
                "/img0",

            "object_id":
                4,

            "width":
                125,

            "height":
                71,

            "color_space":
                "/DeviceRGB",

            "decoded_length":
                26625,

            "decoded_sha256":
                (
                    "e6b5ad0b920b9f4758237dc8ed87d1"
                    "d3263b6db37e249bbb6e1b93ff2dae75e9"
                ),
        },

        {
            "resource_name":
                "/img0Mask",

            "object_id":
                3,

            "width":
                125,

            "height":
                71,

            "color_space":
                "/DeviceGray",

            "decoded_length":
                8875,

            "decoded_sha256":
                (
                    "739fc857dbf405e800301f6e66a8c46e"
                    "5a3a457b06bec41a9bfa338b5330691d"
                ),
        },
    ],
}


# ============================================================
# English profile
# ============================================================

SNB_EN_V1: dict[str, Any] = {

    "profile_id":
        "SNB_EN_V1",

    "schema_version":
        PROFILE_SCHEMA_VERSION,

    "language":
        "English",

    "common":
        SNB_COMMON_V1,


    # ========================================================
    # Fixed second content stream
    #
    # الأول يتغير بسبب بيانات العملية.
    # الثاني ثبت أنه ثابت في العينات الإنجليزية الحالية.
    # ========================================================

    "fixed_content_streams": [

        {
            "object_id":
                2,

            "decoded_length":
                2789,

            "decoded_sha256":
                (
                    "fe5084929585934db525a4dba84ffb708"
                    "c6312b4accaacbbf0dbd10c1ccf0ccd"
                ),
        },
    ],


    # ========================================================
    # Known genuine operator signatures
    #
    # ليست Hard Requirement.
    #
    # وجود تطابق كامل = دليل إيجابي قوي.
    # عدم التطابق وحده لا يعني تزوير.
    # ========================================================

    "known_operator_signatures": [

        # ====================================================
        # Genuine English signature
        #
        # تم قياس هذه البصمة فعلياً بواسطة
        # snb_pdf_fingerprint.py الحالي على السيرفر.
        #
        # عدم التطابق معها لاحقاً لن يكون سبب رفض منفرداً.
        # ====================================================

        {
            "all": {
                "count":
                    1509,

                "sha256":
                    (
                        "1548a59ed50837518ad2bbe2fed7410e7"
                        "9d1137ea122a3945a29d8de915f08b5"
                    ),
            },

            "text": {
                "count":
                    409,

                "sha256":
                    (
                        "a20ece583f6d03a4538a9b75d3d62117"
                        "5ee35d8a6a37397f229ec6e2789f3dbf"
                    ),
            },

            "drawing": {
                "count":
                    368,

                "sha256":
                    (
                        "ecba057bff32d3eaacfcda02f238508b"
                        "39b1ede35523b6da82761744cb05a046"
                    ),
            },
        },
    ],
}


# ============================================================
# Arabic profile
# ============================================================
SNB_AR_V1: dict[str, Any] = {

    "profile_id":
        "SNB_AR_V1",

    "schema_version":
        PROFILE_SCHEMA_VERSION,

    "language":
        "Arabic",

    "common":
        SNB_COMMON_V1,


    # ========================================================
    # Arabic fixed content stream
    #
    # تم قياسه فعلياً من ملف عربي أصلي مؤكد
    # بواسطة snb_pdf_fingerprint.py الحالي.
    # ========================================================

    "fixed_content_streams": [

        {
            "object_id":
                2,

            "decoded_length":
                2633,

            "decoded_sha256":
                (
                    "8dca9797879a624f607e8d3b092614b26"
                    "f746a7b291957caa31d1eb1659e3e1e"
                ),
        },
    ],


    # ========================================================
    # Known genuine Arabic operator signatures
    #
    # هذه البصمة تم قياسها فعلياً من ملف عربي
    # أصلي مؤكد بنفس نسخة المحرك الحالية.
    #
    # عدم التطابق معها وحده لا يعني أن الملف معدل.
    # ========================================================

    "known_operator_signatures": [

        {
            "all": {
                "count":
                    1509,

                "sha256":
                    (
                        "df952215ae5d1e366dfc05ce93b871bd"
                        "c9d4e061c30971e034ec2f879383f5c0"
                    ),
            },

            "text": {
                "count":
                    409,

                "sha256":
                    (
                        "eaa15c9a95087dc31f02e0e7f992cfb0"
                        "c92ac541b55ea8a65be145c9253daae2"
                    ),
            },

            "drawing": {
                "count":
                    368,

                "sha256":
                    (
                        "d2846a394bc1c21abff04cb4e39f45ff"
                        "04674e7ce982782f85bf63bc9ad39d92"
                    ),
            },
        },
    ],
}


# ============================================================
# Registry
# ============================================================

SNB_PROFILES: dict[
    str,
    dict[str, Any],
] = {

    "English":
        SNB_EN_V1,

    "Arabic":
        SNB_AR_V1,
}


def get_snb_profile(
    language: str,
) -> dict[str, Any] | None:

    return SNB_PROFILES.get(
        language
    )