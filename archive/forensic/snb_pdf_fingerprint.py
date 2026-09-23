from __future__ import annotations

import hashlib
import re
import unicodedata

from pathlib import Path
from typing import Any

from pypdf import PdfReader

from pypdf.generic import (
    ArrayObject,
    ContentStream,
    IndirectObject,
)


# ============================================================
# Fingerprint engine version
# ============================================================

FINGERPRINT_ENGINE_VERSION = "1.0.0"


# ============================================================
# PDF operators
# ============================================================

TEXT_OPERATORS = {
    "BT",
    "ET",
    "Tf",
    "Tj",
    "TJ",
    "'",
    '"',
    "Td",
    "TD",
    "Tm",
    "T*",
    "Tc",
    "Tw",
    "Tz",
    "TL",
    "Tr",
    "Ts",
}


DRAWING_OPERATORS = {
    "q",
    "Q",
    "cm",
    "w",
    "J",
    "j",
    "M",
    "d",
    "ri",
    "i",
    "gs",
    "m",
    "l",
    "c",
    "v",
    "y",
    "h",
    "re",
    "S",
    "s",
    "f",
    "F",
    "f*",
    "B",
    "B*",
    "b",
    "b*",
    "n",
    "W",
    "W*",
    "Do",
}


# ============================================================
# Known technical markers
#
# هذه ليست قواعد حكم.
# فقط بصمات نجمع وجودها أو غيابها.
# ============================================================

FORENSIC_MARKERS = (
    "PD4ML",
    "398fx1",
    "userspace",
    "disable hyperlinks",
    "/resources/common/fonts",
)


# ============================================================
# Helpers
# ============================================================

def _sha256_bytes(
    data: bytes,
) -> str:

    return hashlib.sha256(
        data
    ).hexdigest()


def _resolve(
    value,
):
    if isinstance(
        value,
        IndirectObject,
    ):
        try:
            return (
                value.get_object()
            )

        except Exception:
            return None

    return value


def _object_ref(
    value,
) -> dict[str, int] | None:

    if not isinstance(
        value,
        IndirectObject,
    ):
        return None

    return {
        "idnum":
            int(
                value.idnum
            ),

        "generation":
            int(
                value.generation
            ),
    }


def _scalar(
    value,
):
    if value is None:
        return None

    if isinstance(
        value,
        (
            str,
            int,
            float,
            bool,
        ),
    ):
        return value

    try:
        return str(
            value
        )

    except Exception:
        return None


# ============================================================
# Page content references
# ============================================================

def _get_page_content_refs(
    page,
) -> list[Any]:

    try:
        raw_contents = (
            page.raw_get(
                "/Contents"
            )
        )

    except Exception:
        raw_contents = (
            page.get(
                "/Contents"
            )
        )

    if raw_contents is None:
        return []

    if isinstance(
        raw_contents,
        ArrayObject,
    ):
        return list(
            raw_contents
        )

    return [
        raw_contents
    ]


# ============================================================
# Embedded font program fingerprints
# ============================================================

def _extract_embedded_font_programs(
    font,
) -> list[dict[str, Any]]:

    descriptors = []


    descriptor_ref = (
        font.get(
            "/FontDescriptor"
        )
        if font
        else None
    )


    if descriptor_ref:

        descriptor = (
            _resolve(
                descriptor_ref
            )
        )

        if descriptor:
            descriptors.append(
                descriptor
            )


    descendant_fonts = (
        _resolve(
            font.get(
                "/DescendantFonts"
            )
        )
        if (
            font
            and
            font.get(
                "/DescendantFonts"
            )
        )
        else None
    )


    if isinstance(
        descendant_fonts,
        ArrayObject,
    ):

        for descendant_ref in (
            descendant_fonts
        ):

            descendant = (
                _resolve(
                    descendant_ref
                )
            )

            if not descendant:
                continue


            descendant_descriptor_ref = (
                descendant.get(
                    "/FontDescriptor"
                )
            )

            if not (
                descendant_descriptor_ref
            ):
                continue


            descendant_descriptor = (
                _resolve(
                    descendant_descriptor_ref
                )
            )

            if descendant_descriptor:
                descriptors.append(
                    descendant_descriptor
                )


    programs = []

    seen = set()


    for descriptor in descriptors:

        for key in (
            "/FontFile",
            "/FontFile2",
            "/FontFile3",
        ):

            program_ref = (
                descriptor.get(
                    key
                )
            )

            if not program_ref:
                continue


            program = (
                _resolve(
                    program_ref
                )
            )


            if not (
                program
                and
                hasattr(
                    program,
                    "get_data",
                )
            ):
                continue


            try:
                data = (
                    program.get_data()
                )

            except Exception:
                continue


            fingerprint = (
                key,
                _sha256_bytes(
                    data
                ),
            )


            if fingerprint in seen:
                continue


            seen.add(
                fingerprint
            )


            programs.append(
                {
                    "kind":
                        key,

                    "object":
                        _object_ref(
                            program_ref
                        ),

                    "decoded_length":
                        len(
                            data
                        ),

                    "decoded_sha256":
                        _sha256_bytes(
                            data
                        ),
                }
            )


    return programs


# ============================================================
# Language hint
#
# هذا مجرد تحديد للقالب المتوقع لاحقاً.
# ليس حكماً على الأصالة.
# ============================================================

def _classify_language(
    text: str,
) -> str:

    normalized = (
        unicodedata.normalize(
            "NFKC",
            text or "",
        )
    )


    if (
        "International Transfer"
        in normalized
    ):
        return "English"


    if (
        "الحوالات الدولية"
        in normalized
    ):
        return "Arabic"


    return "Unknown"


# ============================================================
# Operator sequence fingerprint
# ============================================================

def _operator_fingerprint(
    operators: list[str],
) -> dict[str, Any]:

    payload = (
        "\n".join(
            operators
        )
        .encode(
            "utf-8"
        )
    )


    return {
        "count":
            len(
                operators
            ),

        "sha256":
            _sha256_bytes(
                payload
            ),
    }


# ============================================================
# Main fingerprint extractor
# ============================================================

def extract_snb_pdf_fingerprint(
    file_path: str,
) -> dict[str, Any]:
    """
    استخراج البصمة الجنائية لملف PDF.

    مهم:
    هذه الدالة لا تقول إن الملف أصلي أو مزور.

    وظيفتها فقط:
    - قراءة البنية.
    - استخراج Metadata.
    - تحليل Content Streams.
    - استخراج الخطوط.
    - استخراج الصور.
    - حساب Hashes.
    - تحليل PDF operators.
    - جمع العلامات الفنية.

    الحكم سيتم في محرك مستقل لاحقاً.
    """

    path = Path(
        file_path
    )


    if not path.exists():

        raise FileNotFoundError(
            str(
                path
            )
        )


    raw_bytes = (
        path.read_bytes()
    )


    if not raw_bytes.startswith(
        b"%PDF-"
    ):

        raise ValueError(
            "الملف ليس PDF صالحاً."
        )


    reader = PdfReader(
        str(
            path
        ),
        strict=False,
    )


    header_match = re.match(
        br"%PDF-(\d\.\d)",
        raw_bytes[
            :20
        ],
    )


    metadata = (
        reader.metadata
        or {}
    )


    catalog = (
        _resolve(
            reader.trailer.get(
                "/Root"
            )
        )
        or {}
    )


    names = (
        _resolve(
            catalog.get(
                "/Names"
            )
        )
        or {}
    )


    # ========================================================
    # Basic structure
    # ========================================================

    result: dict[
        str,
        Any,
    ] = {

        "fingerprint_engine_version":
            FINGERPRINT_ENGINE_VERSION,


        "file": {

            "size":
                len(
                    raw_bytes
                ),

            "sha256":
                _sha256_bytes(
                    raw_bytes
                ),
        },


        "pdf": {

            "version":
                (
                    header_match
                    .group(1)
                    .decode(
                        "ascii"
                    )
                    if header_match
                    else None
                ),


            "page_count":
                len(
                    reader.pages
                ),


            "trailer_size":
                int(
                    reader.trailer.get(
                        "/Size",
                        0,
                    )
                    or 0
                ),


            "eof_count":
                len(
                    re.findall(
                        br"%%EOF",
                        raw_bytes,
                    )
                ),


            "startxref_count":
                len(
                    re.findall(
                        br"\bstartxref\b",
                        raw_bytes,
                    )
                ),


            "has_prev":
                (
                    b"/Prev"
                    in raw_bytes
                ),


            # ملاحظة:
            # هذا عدد obj declarations الظاهرة مباشرة فقط.
            # لا نسميه total object count لأن PDF 1.5+
            # قد يستخدم Object Streams.
            "plain_object_declaration_count":
                len(
                    re.findall(
                        (
                            br"(?m)"
                            br"^\s*"
                            br"\d+\s+\d+\s+obj\b"
                        ),
                        raw_bytes,
                    )
                ),


            "has_xref_stream_marker":
                (
                    b"/Type/XRef"
                    in raw_bytes
                    or
                    b"/Type /XRef"
                    in raw_bytes
                ),


            "has_object_stream_marker":
                (
                    b"/ObjStm"
                    in raw_bytes
                ),
        },


        # ====================================================
        # Metadata
        # ====================================================

        "metadata": {

            (
                str(
                    key
                )
                .lstrip(
                    "/"
                )
            ):
                _scalar(
                    value
                )

            for (
                key,
                value,
            )
            in metadata.items()
        },


        # ====================================================
        # Catalog-level features
        # ====================================================

        "catalog": {

            "has_metadata":
                bool(
                    catalog.get(
                        "/Metadata"
                    )
                ),


            "has_acroform":
                bool(
                    catalog.get(
                        "/AcroForm"
                    )
                ),


            "has_names":
                bool(
                    catalog.get(
                        "/Names"
                    )
                ),


            "has_open_action":
                bool(
                    catalog.get(
                        "/OpenAction"
                    )
                ),


            "has_embedded_files":
                bool(
                    names.get(
                        "/EmbeddedFiles"
                    )
                ),


            "has_javascript":
                (
                    bool(
                        names.get(
                            "/JavaScript"
                        )
                    )
                    or
                    (
                        b"/JavaScript"
                        in raw_bytes
                    )
                ),


            "has_signature_marker":
                (
                    b"/ByteRange"
                    in raw_bytes
                )
                or
                (
                    b"/Type/Sig"
                    in raw_bytes
                )
                or
                (
                    b"/Type /Sig"
                    in raw_bytes
                ),
        },


        # ====================================================
        # Template hint
        # ====================================================

        "document_hint": {

            "language":
                "Unknown",

            "template":
                "Unknown",
        },


        "pages":
            [],


        "content_streams":
            [],


        "operators":
            {},


        "fonts":
            [],


        "images":
            [],


        "forensic_markers":
            {},
    }


    # ========================================================
    # Aggregates
    # ========================================================

    all_operators: list[
        str
    ] = []

    text_operators: list[
        str
    ] = []

    drawing_operators: list[
        str
    ] = []


    decoded_content_blobs: list[
        bytes
    ] = []


    all_text_parts: list[
        str
    ] = []


    seen_fonts = set()

    seen_images = set()


    # ========================================================
    # Pages
    # ========================================================

    for (
        page_index,
        page,
    ) in enumerate(
        reader.pages,
        start=1,
    ):

        media_box = (
            page.mediabox
        )


        content_refs = (
            _get_page_content_refs(
                page
            )
        )


        result[
            "pages"
        ].append(
            {

                "page":
                    page_index,


                "width":
                    float(
                        media_box.width
                    ),


                "height":
                    float(
                        media_box.height
                    ),


                "rotation":
                    int(
                        page.get(
                            "/Rotate",
                            0,
                        )
                        or 0
                    ),


                "content_stream_count":
                    len(
                        content_refs
                    ),
            }
        )


        # ====================================================
        # Content streams
        # ====================================================

        for content_ref in (
            content_refs
        ):

            content = (
                _resolve(
                    content_ref
                )
            )


            if not (
                content
                and
                hasattr(
                    content,
                    "get_data",
                )
            ):
                continue


            try:

                content_data = (
                    content.get_data()
                )

            except Exception:
                continue


            decoded_content_blobs.append(
                content_data
            )


            result[
                "content_streams"
            ].append(
                {

                    "page":
                        page_index,


                    "object":
                        _object_ref(
                            content_ref
                        ),


                    "decoded_length":
                        len(
                            content_data
                        ),


                    "decoded_sha256":
                        _sha256_bytes(
                            content_data
                        ),
                }
            )


        # ====================================================
        # Operator sequence
        # ====================================================

        try:

            content_stream = (
                ContentStream(
                    page.get_contents(),
                    reader,
                )
            )


            page_operators = [

                (
                    operator.decode(
                        "latin1"
                    )

                    if isinstance(
                        operator,
                        bytes,
                    )

                    else str(
                        operator
                    )
                )

                for (
                    _operands,
                    operator,
                )
                in (
                    content_stream
                    .operations
                )
            ]


        except Exception:

            page_operators = []


        all_operators.extend(
            page_operators
        )


        text_operators.extend(

            operator

            for operator
            in page_operators

            if operator
            in TEXT_OPERATORS
        )


        drawing_operators.extend(

            operator

            for operator
            in page_operators

            if operator
            in DRAWING_OPERATORS
        )


        # ====================================================
        # Text hint
        # ====================================================

        try:

            page_text = (
                page.extract_text()
                or ""
            )

        except Exception:

            page_text = ""


        all_text_parts.append(
            page_text
        )


        # ====================================================
        # Resources
        # ====================================================

        resources = (
            _resolve(
                page.get(
                    "/Resources"
                )
            )
            or {}
        )


        # ====================================================
        # Fonts
        # ====================================================

        fonts = (
            _resolve(
                resources.get(
                    "/Font"
                )
            )
            or {}
        )


        for (
            resource_name,
            font_ref,
        ) in fonts.items():


            font_identity = (

                getattr(
                    font_ref,
                    "idnum",
                    None,
                ),

                str(
                    resource_name
                ),
            )


            if (
                font_identity
                in seen_fonts
            ):
                continue


            seen_fonts.add(
                font_identity
            )


            font = (
                _resolve(
                    font_ref
                )
                or {}
            )


            result[
                "fonts"
            ].append(
                {

                    "resource_name":
                        str(
                            resource_name
                        ),


                    "object":
                        _object_ref(
                            font_ref
                        ),


                    "subtype":
                        _scalar(
                            font.get(
                                "/Subtype"
                            )
                        ),


                    "base_font":
                        _scalar(
                            font.get(
                                "/BaseFont"
                            )
                        ),


                    "encoding":
                        _scalar(
                            font.get(
                                "/Encoding"
                            )
                        ),


                    "embedded_programs":
                        _extract_embedded_font_programs(
                            font
                        ),
                }
            )


        # ====================================================
        # Images / XObjects
        # ====================================================

        xobjects = (
            _resolve(
                resources.get(
                    "/XObject"
                )
            )
            or {}
        )


        for (
            resource_name,
            xobject_ref,
        ) in xobjects.items():


            xobject = (
                _resolve(
                    xobject_ref
                )
                or {}
            )


            if (
                _scalar(
                    xobject.get(
                        "/Subtype"
                    )
                )
                != "/Image"
            ):
                continue


            image_identity = (

                getattr(
                    xobject_ref,
                    "idnum",
                    None,
                ),

                str(
                    resource_name
                ),
            )


            if (
                image_identity
                in seen_images
            ):
                continue


            seen_images.add(
                image_identity
            )


            try:

                image_data = (
                    xobject.get_data()
                )

            except Exception:

                image_data = b""


            result[
                "images"
            ].append(
                {

                    "resource_name":
                        str(
                            resource_name
                        ),


                    "object":
                        _object_ref(
                            xobject_ref
                        ),


                    "width":
                        int(
                            xobject.get(
                                "/Width",
                                0,
                            )
                            or 0
                        ),


                    "height":
                        int(
                            xobject.get(
                                "/Height",
                                0,
                            )
                            or 0
                        ),


                    "color_space":
                        _scalar(
                            xobject.get(
                                "/ColorSpace"
                            )
                        ),


                    "filter":
                        _scalar(
                            xobject.get(
                                "/Filter"
                            )
                        ),


                    "decoded_length":
                        len(
                            image_data
                        ),


                    "decoded_sha256":
                        (
                            _sha256_bytes(
                                image_data
                            )

                            if image_data

                            else None
                        ),
                }
            )


    # ========================================================
    # Operator fingerprints
    # ========================================================

    result[
        "operators"
    ] = {

        "all":
            _operator_fingerprint(
                all_operators
            ),


        "text":
            _operator_fingerprint(
                text_operators
            ),


        "drawing":
            _operator_fingerprint(
                drawing_operators
            ),
    }


    # ========================================================
    # Document hint
    # ========================================================

    complete_text = (
        "\n".join(
            all_text_parts
        )
    )


    language = (
        _classify_language(
            complete_text
        )
    )


    result[
        "document_hint"
    ] = {

        "language":
            language,


        "template":
            (
                "SNB International Transfer"

                if language
                in {
                    "Arabic",
                    "English",
                }

                else "Unknown"
            ),
    }


    # ========================================================
    # PD4ML / technical markers
    #
    # نبحث في raw PDF وكذلك Content Streams بعد فك الضغط.
    # ========================================================

    marker_haystack = (

        raw_bytes

        +

        b"\n"

        +

        b"\n".join(
            decoded_content_blobs
        )
    )


    result[
        "forensic_markers"
    ] = {

        marker:
            (
                marker.encode(
                    "utf-8"
                )
                in marker_haystack
            )

        for marker
        in FORENSIC_MARKERS
    }


    return result