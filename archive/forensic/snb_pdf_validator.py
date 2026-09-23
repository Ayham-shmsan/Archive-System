from __future__ import annotations

from typing import Any


from archive.forensic.snb_pdf_fingerprint import (
    extract_snb_pdf_fingerprint,
)

from archive.forensic.snb_pdf_profiles import (
    get_snb_profile,
)


# ============================================================
# Validator version
# ============================================================

VALIDATOR_VERSION = "1.0.0"


# ============================================================
# Result statuses
# ============================================================

STATUS_MATCHED = "صحيح"

STATUS_SUSPICIOUS = "مشتبه به"

STATUS_REJECTED = "مزور"

STATUS_UNKNOWN = "قالب غير معروف"


# ============================================================
# Helpers
# ============================================================

def _add_finding(
    findings: list[dict[str, Any]],
    *,
    code: str,
    label: str,
    status: str,
    weight: int = 0,
    actual=None,
    expected=None,
    message: str | None = None,
    tamper_signal: bool = False,
):
    """
    إضافة نتيجة فحص واحدة.

    status:
        pass
        warning
        fail

    weight:
        نقاط الخطورة التي تضاف عند warning/fail.

    tamper_signal:
        هل هذا الاختلاف يعتبر دليلاً تقنياً
        أقرب إلى إعادة كتابة/تعديل الملف؟
    """

    findings.append(
        {
            "code":
                code,

            "label":
                label,

            "status":
                status,

            "weight":
                int(
                    weight or 0
                ),

            "actual":
                actual,

            "expected":
                expected,

            "message":
                message,

            "tamper_signal":
                bool(
                    tamper_signal
                ),
        }
    )


def _compare_value(
    findings: list[dict[str, Any]],
    *,
    code: str,
    label: str,
    actual,
    expected,
    weight: int,
    severity: str = "fail",
    tamper_signal: bool = False,
):
    if actual == expected:

        _add_finding(
            findings,
            code=
                code,
            label=
                label,
            status=
                "pass",
            actual=
                actual,
            expected=
                expected,
        )

        return


    _add_finding(
        findings,
        code=
            code,
        label=
            label,
        status=
            severity,
        weight=
            weight,
        actual=
            actual,
        expected=
            expected,
        tamper_signal=
            tamper_signal,
    )


def _calculate_risk_score(
    findings: list[dict[str, Any]],
) -> int:

    score = 0


    for finding in findings:

        if finding.get(
            "status"
        ) not in {
            "warning",
            "fail",
        }:
            continue


        score += int(
            finding.get(
                "weight"
            )
            or 0
        )


    return min(
        100,
        max(
            0,
            score,
        ),
    )


def _count_tamper_signals(
    findings: list[dict[str, Any]],
) -> int:

    return sum(
        1

        for finding
        in findings

        if (
            finding.get(
                "tamper_signal"
            )
            and
            finding.get(
                "status"
            )
            in {
                "warning",
                "fail",
            }
        )
    )


def _count_structural_failures(
    findings: list[dict[str, Any]],
) -> int:

    structural_prefixes = (
        "pdf.",
        "page.",
        "font.",
        "image.",
        "stream.",
        "marker.",
        "catalog.",
    )


    return sum(
        1

        for finding
        in findings

        if (
            finding.get(
                "status"
            )
            == "fail"

            and

            str(
                finding.get(
                    "code"
                )
                or ""
            ).startswith(
                structural_prefixes
            )
        )
    )


# ============================================================
# PDF structure
# ============================================================

def _validate_pdf_structure(
    fingerprint: dict[str, Any],
    profile: dict[str, Any],
    findings: list[dict[str, Any]],
):

    actual_pdf = (
        fingerprint.get(
            "pdf"
        )
        or {}
    )


    expected_pdf = (
        profile[
            "common"
        ].get(
            "pdf"
        )
        or {}
    )


    rules = (
        (
            "version",
            "إصدار PDF",
            15,
            False,
        ),

        (
            "page_count",
            "عدد الصفحات",
            30,
            False,
        ),

        (
            "trailer_size",
            "حجم Trailer",
            15,
            False,
        ),

        (
            "eof_count",
            "عدد علامات نهاية PDF",
            10,
            True,
        ),

        (
            "startxref_count",
            "عدد مراجع XRef",
            10,
            True,
        ),

        (
            "has_prev",
            "وجود Incremental Update",
            25,
            True,
        ),

        (
            "plain_object_declaration_count",
            "عدد PDF Objects",
            15,
            False,
        ),

        (
            "has_xref_stream_marker",
            "استخدام XRef Stream",
            10,
            False,
        ),

        (
            "has_object_stream_marker",
            "استخدام Object Stream",
            10,
            False,
        ),
    )


    for (
        key,
        label,
        weight,
        tamper_signal,
    ) in rules:

        _compare_value(
            findings,
            code=
                f"pdf.{key}",
            label=
                label,
            actual=
                actual_pdf.get(
                    key
                ),
            expected=
                expected_pdf.get(
                    key
                ),
            weight=
                weight,
            tamper_signal=
                tamper_signal,
        )


# ============================================================
# Page geometry
# ============================================================

def _validate_page(
    fingerprint: dict[str, Any],
    profile: dict[str, Any],
    findings: list[dict[str, Any]],
):

    pages = (
        fingerprint.get(
            "pages"
        )
        or []
    )


    if not pages:

        _add_finding(
            findings,
            code=
                "page.missing",
            label=
                "صفحة المستند",
            status=
                "fail",
            weight=
                40,
            message=
                "لم يتم العثور على صفحة PDF قابلة للتحليل.",
        )

        return


    actual = pages[0]

    expected = (
        profile[
            "common"
        ][
            "page"
        ]
    )


    for (
        key,
        label,
        weight,
    ) in (
        (
            "width",
            "عرض الصفحة",
            10,
        ),

        (
            "height",
            "ارتفاع الصفحة",
            10,
        ),

        (
            "rotation",
            "دوران الصفحة",
            10,
        ),

        (
            "content_stream_count",
            "عدد Content Streams",
            20,
        ),
    ):

        _compare_value(
            findings,
            code=
                f"page.{key}",
            label=
                label,
            actual=
                actual.get(
                    key
                ),
            expected=
                expected.get(
                    key
                ),
            weight=
                weight,
            tamper_signal=
                (
                    key
                    == "content_stream_count"
                ),
        )


# ============================================================
# Metadata
# ============================================================

def _validate_metadata(
    fingerprint: dict[str, Any],
    profile: dict[str, Any],
    findings: list[dict[str, Any]],
):

    metadata = (
        fingerprint.get(
            "metadata"
        )
        or {}
    )


    expected = (
        profile[
            "common"
        ][
            "metadata"
        ]
    )


    _compare_value(
        findings,
        code=
            "metadata.creator",
        label=
            "منشئ PDF",
        actual=
            metadata.get(
                "Creator"
            ),
        expected=
            expected.get(
                "creator"
            ),
        weight=
            8,
        severity=
            "warning",
    )


    _compare_value(
        findings,
        code=
            "metadata.producer",
        label=
            "منتج PDF",
        actual=
            metadata.get(
                "Producer"
            ),
        expected=
            expected.get(
                "producer"
            ),
        weight=
            12,
        severity=
            "warning",
        tamper_signal=
            True,
    )


    modification_date = (
        metadata.get(
            "ModDate"
        )
    )


    if modification_date:

        _add_finding(
            findings,
            code=
                "metadata.modification_date",
            label=
                "تاريخ تعديل PDF",
            status=
                "warning",
            weight=
                12,
            actual=
                modification_date,
            expected=
                None,
            message=
                (
                    "الملفات الأصلية المرجعية الحالية "
                    "لا تحتوي ModDate."
                ),
            tamper_signal=
                True,
        )

    else:

        _add_finding(
            findings,
            code=
                "metadata.modification_date",
            label=
                "تاريخ تعديل PDF",
            status=
                "pass",
            actual=
                None,
            expected=
                None,
        )


# ============================================================
# Catalog
# ============================================================

def _validate_catalog(
    fingerprint: dict[str, Any],
    profile: dict[str, Any],
    findings: list[dict[str, Any]],
):

    actual = (
        fingerprint.get(
            "catalog"
        )
        or {}
    )


    expected = (
        profile[
            "common"
        ][
            "catalog"
        ]
    )


    weights = {
        "has_metadata":
            15,

        "has_acroform":
            10,

        "has_open_action":
            10,

        "has_embedded_files":
            15,

        "has_javascript":
            20,

        "has_signature_marker":
            5,
    }


    for (
        key,
        expected_value,
    ) in expected.items():

        _compare_value(
            findings,
            code=
                f"catalog.{key}",
            label=
                key,
            actual=
                actual.get(
                    key
                ),
            expected=
                expected_value,
            weight=
                weights.get(
                    key,
                    10,
                ),
            tamper_signal=
                (
                    key
                    in {
                        "has_metadata",
                        "has_embedded_files",
                        "has_javascript",
                    }
                ),
        )


# ============================================================
# PD4ML forensic markers
# ============================================================

def _validate_markers(
    fingerprint: dict[str, Any],
    profile: dict[str, Any],
    findings: list[dict[str, Any]],
):

    actual = (
        fingerprint.get(
            "forensic_markers"
        )
        or {}
    )


    expected = (
        profile[
            "common"
        ][
            "forensic_markers"
        ]
    )


    for (
        marker,
        expected_value,
    ) in expected.items():

        _compare_value(
            findings,
            code=
                f"marker.{marker}",
            label=
                f"البصمة الداخلية: {marker}",
            actual=
                actual.get(
                    marker
                ),
            expected=
                expected_value,
            weight=
                5,
            tamper_signal=
                True,
        )


# ============================================================
# Fonts
# ============================================================

def _validate_fonts(
    fingerprint: dict[str, Any],
    profile: dict[str, Any],
    findings: list[dict[str, Any]],
):

    actual_fonts = (
        fingerprint.get(
            "fonts"
        )
        or []
    )


    expected_fonts = (
        profile[
            "common"
        ][
            "fonts"
        ]
    )


    allowed_base_fonts = (
        profile[
            "common"
        ][
            "allowed_base_fonts"
        ]
    )


    # ========================================================
    # Foreign fonts
    # ========================================================

    foreign_fonts = []


    for font in actual_fonts:

        base_font = (
            font.get(
                "base_font"
            )
        )


        if (
            base_font
            and
            base_font
            not in allowed_base_fonts
        ):

            foreign_fonts.append(
                base_font
            )


    foreign_fonts = sorted(
        set(
            foreign_fonts
        )
    )


    if foreign_fonts:

        _add_finding(
            findings,
            code=
                "font.foreign_fonts",
            label=
                "خطوط دخيلة",
            status=
                "fail",
            weight=
                30,
            actual=
                foreign_fonts,
            expected=
                sorted(
                    allowed_base_fonts
                ),
            message=
                (
                    "تم العثور على خطوط غير موجودة "
                    "في القالب الأصلي المعروف."
                ),
            tamper_signal=
                True,
        )

    else:

        _add_finding(
            findings,
            code=
                "font.foreign_fonts",
            label=
                "خطوط دخيلة",
            status=
                "pass",
            actual=
                [],
            expected=
                [],
        )


    # ========================================================
    # Expected resources
    # ========================================================

    actual_by_resource = {

        font.get(
            "resource_name"
        ):
            font

        for font
        in actual_fonts
    }


    for expected_font in (
        expected_fonts
    ):

        resource_name = (
            expected_font[
                "resource_name"
            ]
        )


        actual_font = (
            actual_by_resource.get(
                resource_name
            )
        )


        if not actual_font:

            _add_finding(
                findings,
                code=
                    (
                        "font.resource."
                        f"{resource_name}"
                    ),
                label=
                    (
                        "مورد الخط "
                        f"{resource_name}"
                    ),
                status=
                    "fail",
                weight=
                    10,
                actual=
                    None,
                expected=
                    expected_font,
                tamper_signal=
                    True,
            )

            continue


        actual_object = (
            actual_font.get(
                "object"
            )
            or {}
        )


        object_id = (
            actual_object.get(
                "idnum"
            )
        )


        matches = (
            actual_font.get(
                "base_font"
            )
            ==
            expected_font.get(
                "base_font"
            )

            and

            object_id
            ==
            expected_font.get(
                "object_id"
            )
        )


        _add_finding(
            findings,
            code=
                (
                    "font.resource."
                    f"{resource_name}"
                ),
            label=
                (
                    "مورد الخط "
                    f"{resource_name}"
                ),
            status=
                (
                    "pass"
                    if matches
                    else "fail"
                ),
            weight=
                (
                    0
                    if matches
                    else 10
                ),
            actual={
                "base_font":
                    actual_font.get(
                        "base_font"
                    ),

                "object_id":
                    object_id,
            },
            expected={
                "base_font":
                    expected_font.get(
                        "base_font"
                    ),

                "object_id":
                    expected_font.get(
                        "object_id"
                    ),
            },
            tamper_signal=
                not matches,
        )


# ============================================================
# Images
# ============================================================

def _validate_images(
    fingerprint: dict[str, Any],
    profile: dict[str, Any],
    findings: list[dict[str, Any]],
):

    actual_images = (
        fingerprint.get(
            "images"
        )
        or []
    )


    expected_images = (
        profile[
            "common"
        ][
            "images"
        ]
    )


    actual_by_resource = {

        image.get(
            "resource_name"
        ):
            image

        for image
        in actual_images
    }


    for expected_image in (
        expected_images
    ):

        resource_name = (
            expected_image[
                "resource_name"
            ]
        )


        actual_image = (
            actual_by_resource.get(
                resource_name
            )
        )


        if not actual_image:

            _add_finding(
                findings,
                code=
                    (
                        "image.resource."
                        f"{resource_name}"
                    ),
                label=
                    (
                        "مورد الصورة "
                        f"{resource_name}"
                    ),
                status=
                    "fail",
                weight=
                    12,
                actual=
                    None,
                expected=
                    expected_image,
            )

            continue


        actual_object = (
            actual_image.get(
                "object"
            )
            or {}
        )


        actual_signature = {

            "object_id":
                actual_object.get(
                    "idnum"
                ),

            "width":
                actual_image.get(
                    "width"
                ),

            "height":
                actual_image.get(
                    "height"
                ),

            "color_space":
                actual_image.get(
                    "color_space"
                ),

            "decoded_length":
                actual_image.get(
                    "decoded_length"
                ),

            "decoded_sha256":
                actual_image.get(
                    "decoded_sha256"
                ),
        }


        expected_signature = {

            "object_id":
                expected_image.get(
                    "object_id"
                ),

            "width":
                expected_image.get(
                    "width"
                ),

            "height":
                expected_image.get(
                    "height"
                ),

            "color_space":
                expected_image.get(
                    "color_space"
                ),

            "decoded_length":
                expected_image.get(
                    "decoded_length"
                ),

            "decoded_sha256":
                expected_image.get(
                    "decoded_sha256"
                ),
        }


        matches = (
            actual_signature
            ==
            expected_signature
        )


        _add_finding(
            findings,
            code=
                (
                    "image.resource."
                    f"{resource_name}"
                ),
            label=
                (
                    "بصمة الصورة "
                    f"{resource_name}"
                ),
            status=
                (
                    "pass"
                    if matches
                    else "fail"
                ),
            weight=
                (
                    0
                    if matches
                    else 15
                ),
            actual=
                actual_signature,
            expected=
                expected_signature,
        )


# ============================================================
# Fixed content streams
# ============================================================

def _validate_fixed_streams(
    fingerprint: dict[str, Any],
    profile: dict[str, Any],
    findings: list[dict[str, Any]],
):

    expected_streams = (
        profile.get(
            "fixed_content_streams"
        )
        or []
    )


    if not expected_streams:
        return


    actual_streams = (
        fingerprint.get(
            "content_streams"
        )
        or []
    )


    actual_by_object = {}


    for stream in actual_streams:

        object_data = (
            stream.get(
                "object"
            )
            or {}
        )


        object_id = (
            object_data.get(
                "idnum"
            )
        )


        if object_id is not None:

            actual_by_object[
                object_id
            ] = stream


    for expected_stream in (
        expected_streams
    ):

        object_id = (
            expected_stream[
                "object_id"
            ]
        )


        actual_stream = (
            actual_by_object.get(
                object_id
            )
        )


        if not actual_stream:

            _add_finding(
                findings,
                code=
                    (
                        "stream.fixed."
                        f"{object_id}"
                    ),
                label=
                    (
                        "Content Stream ثابت "
                        f"#{object_id}"
                    ),
                status=
                    "fail",
                weight=
                    20,
                actual=
                    None,
                expected=
                    expected_stream,
                tamper_signal=
                    True,
            )

            continue


        actual_signature = {

            "decoded_length":
                actual_stream.get(
                    "decoded_length"
                ),

            "decoded_sha256":
                actual_stream.get(
                    "decoded_sha256"
                ),
        }


        expected_signature = {

            "decoded_length":
                expected_stream.get(
                    "decoded_length"
                ),

            "decoded_sha256":
                expected_stream.get(
                    "decoded_sha256"
                ),
        }


        matches = (
            actual_signature
            ==
            expected_signature
        )


        _add_finding(
            findings,
            code=
                (
                    "stream.fixed."
                    f"{object_id}"
                ),
            label=
                (
                    "Content Stream ثابت "
                    f"#{object_id}"
                ),
            status=
                (
                    "pass"
                    if matches
                    else "fail"
                ),
            weight=
                (
                    0
                    if matches
                    else 20
                ),
            actual=
                actual_signature,
            expected=
                expected_signature,
            tamper_signal=
                not matches,
        )


# ============================================================
# Operator signatures
# ============================================================

def _validate_operator_signature(
    fingerprint: dict[str, Any],
    profile: dict[str, Any],
    findings: list[dict[str, Any]],
):

    signatures = (
        profile.get(
            "known_operator_signatures"
        )
        or []
    )


    if not signatures:
        return


    actual = (
        fingerprint.get(
            "operators"
        )
        or {}
    )


    matched = any(
        actual
        ==
        signature

        for signature
        in signatures
    )


    _add_finding(
        findings,
        code=
            "operators.known_signature",
        label=
            "بصمة أوامر رسم PDF",
        status=
            (
                "pass"
                if matched
                else "warning"
            ),
        weight=
            0,
        actual=
            actual,
        expected=
            (
                "إحدى البصمات الأصلية المعروفة"
            ),
        message=
            (
                None
                if matched
                else
                (
                    "البصمة لا تطابق العينات المسجلة، "
                    "لكن هذا الاختلاف وحده لا يعني "
                    "أن المستند معدل."
                )
            ),
    )


# ============================================================
# Final decision
# ============================================================

def _make_decision(
    *,
    risk_score: int,
    findings: list[dict[str, Any]],
) -> str:

    tamper_signals = (
        _count_tamper_signals(
            findings
        )
    )


    structural_failures = (
        _count_structural_failures(
            findings
        )
    )


    # ========================================================
    # Strong evidence of rewriting / manipulation
    # ========================================================

    if (
        risk_score >= 60
        and
        tamper_signals >= 2
    ):
        return STATUS_REJECTED


    # ========================================================
    # Significant anomalies
    # ========================================================

    if risk_score >= 30:
        return STATUS_SUSPICIOUS


    # ========================================================
    # A large structural drift without clear manipulation
    #
    # قد يكون البنك غيّر القالب نفسه.
    # لا نسميه "غير مطابق" كتزوير مباشرة.
    # ========================================================

    if (
        structural_failures >= 4
        and
        tamper_signals == 0
    ):
        return STATUS_UNKNOWN


    return STATUS_MATCHED


def _build_summary(
    status: str,
) -> str:

    if status == STATUS_MATCHED:

        return (
            "المستند يطابق البنية الأصلية "
            "المعروفة لقالب البنك الأهلي."
        )


    if status == STATUS_SUSPICIOUS:

        return (
            "تم اكتشاف اختلافات فنية تحتاج "
            "إلى مراجعة قبل اعتماد المستند."
        )


    if status == STATUS_REJECTED:

        return (
            "تم اكتشاف مؤشرات فنية قوية تدل "
            "على أن ملف PDF لا يطابق البنية "
            "الأصلية غير المعدلة."
        )


    return (
        "المستند لا يطابق أي قالب أصلي معروف "
        "بدرجة كافية، وقد يكون إصداراً جديداً "
        "يحتاج إلى اعتماد."
    )


# ============================================================
# Public validator
# ============================================================

def validate_snb_pdf(
    file_path: str,
) -> dict[str, Any]:
    """
    فحص مستند حوالة البنك الأهلي.

    لا يتم هنا:
    - حفظ سجل في قاعدة البيانات.
    - إنشاء Archive Operation.
    - استخراج بيانات العملية.
    - تعديل الملف.

    النتيجة فقط:
    fingerprint + findings + decision.
    """

    fingerprint = (
        extract_snb_pdf_fingerprint(
            file_path
        )
    )


    document_hint = (
        fingerprint.get(
            "document_hint"
        )
        or {}
    )


    language = (
        document_hint.get(
            "language"
        )
        or "Unknown"
    )


    template = (
        document_hint.get(
            "template"
        )
        or "Unknown"
    )


    profile = (
        get_snb_profile(
            language
        )
    )


    # ========================================================
    # Unknown document / language
    # ========================================================

    if (
        template
        != "SNB International Transfer"
        or
        not profile
    ):

        return {
            "validator_version":
                VALIDATOR_VERSION,

            "status":
                STATUS_UNKNOWN,

            "risk_score":
                0,

            "summary":
                (
                    "لم يتم التعرف على المستند "
                    "كقالب حوالة دولية معروف "
                    "للبنك الأهلي."
                ),

            "document_type":
                template,

            "language":
                language,

            "profile":
                None,

            "tamper_signals":
                0,

            "findings":
                [],

            "fingerprint":
                fingerprint,
        }


    findings: list[
        dict[str, Any]
    ] = []


    # ========================================================
    # Validation layers
    # ========================================================

    _validate_pdf_structure(
        fingerprint,
        profile,
        findings,
    )


    _validate_page(
        fingerprint,
        profile,
        findings,
    )


    _validate_metadata(
        fingerprint,
        profile,
        findings,
    )


    _validate_catalog(
        fingerprint,
        profile,
        findings,
    )


    _validate_markers(
        fingerprint,
        profile,
        findings,
    )


    _validate_fonts(
        fingerprint,
        profile,
        findings,
    )


    _validate_images(
        fingerprint,
        profile,
        findings,
    )


    _validate_fixed_streams(
        fingerprint,
        profile,
        findings,
    )


    _validate_operator_signature(
        fingerprint,
        profile,
        findings,
    )


    # ========================================================
    # Decision
    # ========================================================

    risk_score = (
        _calculate_risk_score(
            findings
        )
    )


    status = (
        _make_decision(
            risk_score=
                risk_score,
            findings=
                findings,
        )
    )


    tamper_signals = (
        _count_tamper_signals(
            findings
        )
    )


    return {
        "validator_version":
            VALIDATOR_VERSION,

        "status":
            status,

        "risk_score":
            risk_score,

        "summary":
            _build_summary(
                status
            ),

        "document_type":
            profile[
                "common"
            ][
                "document_type"
            ],

        "language":
            language,

        "profile":
            profile[
                "profile_id"
            ],

        "tamper_signals":
            tamper_signals,

        "findings":
            findings,

        "fingerprint":
            fingerprint,
    }