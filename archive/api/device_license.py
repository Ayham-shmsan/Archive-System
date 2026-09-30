from __future__ import annotations


import hashlib
import ipaddress
import json
import re
import uuid


from contextlib import (
    contextmanager,
)

from typing import (
    Any,
)


import frappe

from frappe import _

from frappe.utils import (
    now_datetime,
)
from frappe.utils import (
    get_datetime,
    now_datetime,
)


from archive.security.device_license import (
    issue_challenge as issue_signed_challenge,
)

from archive.security.device_license import (
    verify_heartbeat as verify_signed_heartbeat,
)

# ============================================================
# Constants
# ============================================================

PROTOCOL_VERSION = 1


STATUS_PENDING = "Pending"
STATUS_ACTIVE = "Active"
STATUS_SUSPENDED = "Suspended"
STATUS_MISMATCH = "Mismatch"
STATUS_REVOKED = "Revoked"


VALID_STATUSES = {
    STATUS_PENDING,
    STATUS_ACTIVE,
    STATUS_SUSPENDED,
    STATUS_MISMATCH,
    STATUS_REVOKED,
}


SERVICE_FLAG = (
    "archive_device_license_service"
)


ACTIVATION_CODE_PATTERN = re.compile(
    r"^ARC-"
    r"(?:[0-9A-HJKMNP-TV-Z]{4}-){3}"
    r"[0-9A-HJKMNP-TV-Z]{4}$"
)


HEX_64_PATTERN = re.compile(
    r"^[0-9a-f]{64}$"
)


MAC_PATTERN = re.compile(
    r"^(?:[0-9A-F]{2}:){5}"
    r"[0-9A-F]{2}$"
)


CROCKFORD_ALPHABET = (
    "0123456789"
    "ABCDEFGHJKMNPQRSTVWXYZ"
)


# ============================================================
# Protected mutation context
# ============================================================

@contextmanager
def device_license_service_context():

    previous = getattr(
        frappe.flags,
        SERVICE_FLAG,
        False,
    )


    setattr(
        frappe.flags,
        SERVICE_FLAG,
        True,
    )


    try:
        yield

    finally:

        setattr(
            frappe.flags,
            SERVICE_FLAG,
            previous,
        )


# ============================================================
# Normalization
# ============================================================

def _clean_text(
    value: Any,
    *,
    max_length: int = 255,
) -> str:

    value = str(
        value or ""
    ).strip()


    if (
        len(value)
        >
        max_length
    ):
        frappe.throw(
            _(
                "إحدى قيم هوية الجهاز "
                "أطول من الحد المسموح."
            )
        )


    return value


def _normalize_activation_code(
    value: Any,
) -> str:

    value = (
        _clean_text(
            value,
            max_length=64,
        )
        .upper()
    )


    if not (
        ACTIVATION_CODE_PATTERN
        .fullmatch(
            value
        )
    ):

        frappe.throw(
            _(
                "كود تفعيل الجهاز "
                "غير صالح."
            )
        )


    return value


def _normalize_uuid(
    value: Any,
) -> str:

    value = _clean_text(
        value,
        max_length=64,
    )


    try:

        parsed = uuid.UUID(
            value
        )

    except (
        ValueError,
        TypeError,
        AttributeError,
    ):

        frappe.throw(
            _(
                "معرف تثبيت الجهاز "
                "غير صالح."
            )
        )


    return str(
        parsed
    )


def _normalize_hash(
    value: Any,
    label: str,
) -> str:

    value = (
        _clean_text(
            value,
            max_length=64,
        )
        .lower()
    )


    if not (
        HEX_64_PATTERN
        .fullmatch(
            value
        )
    ):

        frappe.throw(
            _(
                "{0} غير صالح."
            ).format(
                label
            )
        )


    return value


def _normalize_mac(
    value: Any,
) -> str:

    value = (
        _clean_text(
            value,
            max_length=32,
        )
        .replace(
            "-",
            ":",
        )
        .upper()
    )


    if not (
        MAC_PATTERN
        .fullmatch(
            value
        )
    ):

        frappe.throw(
            _(
                "عنوان MAC غير صالح."
            )
        )


    if (
        value
        ==
        "00:00:00:00:00:00"
    ):

        frappe.throw(
            _(
                "عنوان MAC غير صالح."
            )
        )


    return value


def _normalize_ip(
    value: Any,
    *,
    required: bool = True,
) -> str:

    value = _clean_text(
        value,
        max_length=64,
    )


    if not value:

        if required:
            frappe.throw(
                _(
                    "عنوان IP مطلوب."
                )
            )

        return ""


    try:

        parsed = (
            ipaddress
            .ip_address(
                value
            )
        )

    except ValueError:

        frappe.throw(
            _(
                "عنوان IP غير صالح."
            )
        )


    return str(
        parsed
    )


# ============================================================
# Activation code verification
# ============================================================

def _encode_crockford(
    data: bytes,
) -> str:

    bits = 0
    value = 0

    output = []


    for byte in data:

        value = (
            value << 8
        ) | byte

        bits += 8


        while (
            bits >= 5
        ):

            index = (
                value
                >>
                (
                    bits - 5
                )
            ) & 31


            output.append(
                CROCKFORD_ALPHABET[
                    index
                ]
            )


            bits -= 5


    if bits > 0:

        index = (
            value
            <<
            (
                5 - bits
            )
        ) & 31


        output.append(
            CROCKFORD_ALPHABET[
                index
            ]
        )


    return "".join(
        output
    )


def _build_activation_code(
    installation_id: str,
    public_key_fingerprint: str,
) -> str:

    raw = (
        "archive-activation:"
        "v1:"
        f"{installation_id}:"
        f"{public_key_fingerprint}"
    )


    digest = (
        hashlib
        .sha256(
            raw.encode(
                "utf-8"
            )
        )
        .digest()
    )


    encoded = (
        _encode_crockford(
            digest[:10]
        )
        [:16]
    )


    groups = [
        encoded[
            index:index + 4
        ]

        for index
        in range(
            0,
            16,
            4,
        )
    ]


    return (
        "ARC-"
        +
        "-".join(
            groups
        )
    )


# ============================================================
# Request IP
# ============================================================

def _get_request_ip() -> str:

    value = getattr(
        frappe.local,
        "request_ip",
        None,
    )


    if not value:

        request = getattr(
            frappe.local,
            "request",
            None,
        )


        value = getattr(
            request,
            "remote_addr",
            None,
        )


    value = str(
        value or ""
    ).strip()


    if "," in value:

        value = (
            value
            .split(
                ",",
                1,
            )[0]
            .strip()
        )


    if not value:
        return ""


    try:

        return str(
            ipaddress
            .ip_address(
                value
            )
        )

    except ValueError:

        return ""


# ============================================================
# Payload validation
# ============================================================

def _parse_payload(
    payload: str | dict[str, Any],
) -> dict[str, Any]:

    if isinstance(
        payload,
        str,
    ):

        try:

            payload = (
                json.loads(
                    payload
                )
            )

        except json.JSONDecodeError:

            frappe.throw(
                _(
                    "بيانات تسجيل الجهاز "
                    "غير صالحة."
                )
            )


    if not isinstance(
        payload,
        dict,
    ):

        frappe.throw(
            _(
                "بيانات تسجيل الجهاز "
                "غير صالحة."
            )
        )


    return payload


def _validate_registration_payload(
    payload: dict[str, Any],
) -> dict[str, Any]:

    protocol_version = int(
        payload.get(
            "protocol_version"
        )
        or 0
    )


    if (
        protocol_version
        !=
        PROTOCOL_VERSION
    ):

        frappe.throw(
            _(
                "إصدار بروتوكول الترخيص "
                "غير مدعوم."
            )
        )


    installation_id = (
        _normalize_uuid(
            payload.get(
                "installation_id"
            )
        )
    )


    raw_public_key = (
        payload.get(
            "public_key"
        )
    )


    if not isinstance(
        raw_public_key,
        str,
    ):

        frappe.throw(
            _(
                "المفتاح العام للجهاز "
                "غير صالح."
            )
        )


    if (
        not raw_public_key
        or
        len(
            raw_public_key
        ) > 4096
    ):

        frappe.throw(
            _(
                "المفتاح العام للجهاز "
                "غير صالح."
            )
        )


    # لا نستخدم _clean_text هنا.
    #
    # الـ Public Key مادة تشفيرية،
    # وأي تعديل في النص قبل حساب
    # SHA-256 يغيّر البصمة.
    #
    # PEM المولد من Node ينتهي عادةً
    # بسطر جديد، ويجب الحفاظ عليه.
    public_key = (
        raw_public_key
    )


    if (
        "-----BEGIN PUBLIC KEY-----"
        not in public_key
        or
        "-----END PUBLIC KEY-----"
        not in public_key
    ):

        frappe.throw(
            _(
                "المفتاح العام للجهاز "
                "غير صالح."
            )
        )


    supplied_public_key_hash = (
        _normalize_hash(
            payload.get(
                "public_key_fingerprint"
            ),
            "Public Key Fingerprint",
        )
    )


    calculated_public_key_hash = (
        hashlib
        .sha256(
            public_key.encode(
                "utf-8"
            )
        )
        .hexdigest()
    )


    supplied_public_key_hash = (
        _normalize_hash(
            payload.get(
                "public_key_fingerprint"
            ),
            "Public Key Fingerprint",
        )
    )


    calculated_public_key_hash = (
        hashlib
        .sha256(
            public_key.encode(
                "utf-8"
            )
        )
        .hexdigest()
    )


    if (
        supplied_public_key_hash
        !=
        calculated_public_key_hash
    ):

        frappe.throw(
            _(
                "بصمة المفتاح العام "
                "غير متطابقة."
            )
        )


    activation_code = (
        _normalize_activation_code(
            payload.get(
                "activation_code"
            )
        )
    )


    expected_code = (
        _build_activation_code(
            installation_id,
            supplied_public_key_hash,
        )
    )


    if (
        activation_code
        !=
        expected_code
    ):

        frappe.throw(
            _(
                "كود التفعيل لا يتطابق "
                "مع هوية هذا التثبيت."
            )
        )


    return {
        "activation_code":
            activation_code,

        "installation_id":
            installation_id,

        "device_name":
            _clean_text(
                payload.get(
                    "device_name"
                ),
                max_length=255,
            ),

        "platform":
            _clean_text(
                payload.get(
                    "platform"
                ),
                max_length=64,
            ),

        "architecture":
            _clean_text(
                payload.get(
                    "architecture"
                ),
                max_length=64,
            ),

        "machine_id_hash":
            _normalize_hash(
                payload.get(
                    "machine_id_hash"
                ),
                "Machine ID Hash",
            ),

        "mac":
            _normalize_mac(
                payload.get(
                    "mac"
                )
            ),

        "reported_ip":
            _normalize_ip(
                payload.get(
                    "ipv4"
                )
            ),

        "interface_name":
            _clean_text(
                payload.get(
                    "interface_name"
                ),
                max_length=255,
            ),

        "device_fingerprint":
            _normalize_hash(
                payload.get(
                    "fingerprint"
                ),
                "Device Fingerprint",
            ),

        "public_key":
            public_key,

        "public_key_fingerprint":
            supplied_public_key_hash,
    }


# ============================================================
# Events
# ============================================================

def _log_event(
    license_doc,
    event_type: str,
    *,
    details: dict[str, Any] | None = None,
):

    details = (
        details
        or {}
    )


    with (
        device_license_service_context()
    ):

        frappe.get_doc({
            "doctype":
                "Archive Device License Event",

            "license":
                license_doc.name,

            "activation_code":
                license_doc.activation_code,

            "event_type":
                event_type,

            "event_datetime":
                now_datetime(),

            "event_user":
                frappe.session.user
                or
                "Guest",

            "source_ip":
                _get_request_ip(),

            "details":
                frappe.as_json(
                    details
                ),
        }).insert(
            ignore_permissions=True
        )


# ============================================================
# Public response
# ============================================================

def _public_response(
    license_doc,
) -> dict[str, Any]:

    messages = {
        STATUS_PENDING:
            "الجهاز بانتظار اعتماد مسؤول النظام.",

        STATUS_ACTIVE:
            "تم تفعيل هذا الجهاز.",

        STATUS_SUSPENDED:
            "ترخيص الجهاز معلق.",

        STATUS_MISMATCH:
            "تم اكتشاف تغيير في هوية الجهاز أو الشبكة.",

        STATUS_REVOKED:
            "تم إلغاء ترخيص هذا الجهاز.",
    }


    return {
        "protocol_version":
            PROTOCOL_VERSION,

        "activation_code":
            license_doc
            .activation_code,

        "status":
            license_doc.status,

        "message":
            messages.get(
                license_doc.status,
                "حالة الترخيص غير معروفة.",
            ),

        "server_time":
            str(
                now_datetime()
            ),
    }


# ============================================================
# Guest registration
# ============================================================

@frappe.whitelist(
    allow_guest=True,
    methods=["POST"],
)
def register_device(
    payload: str | dict[str, Any],
) -> dict[str, Any]:

    payload = _parse_payload(
        payload
    )


    data = (
        _validate_registration_payload(
            payload
        )
    )


    observed_ip = (
        _get_request_ip()
        or
        data[
            "reported_ip"
        ]
    )


    existing_by_code = (
        frappe.db.get_value(
            "Archive Device License",

            {
                "activation_code":
                    data[
                        "activation_code"
                    ],
            },

            "name",
        )
    )


    existing_by_installation = (
        frappe.db.get_value(
            "Archive Device License",

            {
                "installation_id":
                    data[
                        "installation_id"
                    ],
            },

            [
                "name",
                "activation_code",
            ],

            as_dict=True,
        )
    )


    if (
        existing_by_installation
        and
        (
            not existing_by_code
            or
            existing_by_installation.name
            !=
            existing_by_code
        )
    ):

        frappe.throw(
            _(
                "تعذر تسجيل هوية الجهاز."
            )
        )


    now = now_datetime()


    if not existing_by_code:

        with (
            device_license_service_context()
        ):

            license_doc = (
                frappe.get_doc({
                    "doctype":
                        "Archive Device License",

                    "activation_code":
                        data[
                            "activation_code"
                        ],

                    "status":
                        STATUS_PENDING,

                    "installation_id":
                        data[
                            "installation_id"
                        ],

                    "device_name":
                        data[
                            "device_name"
                        ],

                    "platform":
                        data[
                            "platform"
                        ],

                    "architecture":
                        data[
                            "architecture"
                        ],

                    "interface_name":
                        data[
                            "interface_name"
                        ],

                    "first_seen":
                        now,

                    "last_seen":
                        now,

                    "initial_mac":
                        data[
                            "mac"
                        ],

                    "initial_reported_ip":
                        data[
                            "reported_ip"
                        ],

                    "initial_observed_ip":
                        observed_ip,

                    "last_mac":
                        data[
                            "mac"
                        ],

                    "last_reported_ip":
                        data[
                            "reported_ip"
                        ],

                    "last_observed_ip":
                        observed_ip,

                    "machine_id_hash":
                        data[
                            "machine_id_hash"
                        ],
                    "last_machine_id_hash":
                        data[
                            "machine_id_hash"
                        ],

                    "device_fingerprint":
                        data[
                            "device_fingerprint"
                        ],
                    "device_fingerprint":
                        data[
                            "device_fingerprint"
                        ],

                    "public_key":
                        data[
                            "public_key"
                        ],

                    "public_key_fingerprint":
                        data[
                            "public_key_fingerprint"
                        ],
                })
                .insert(
                    ignore_permissions=True
                )
            )


        _log_event(
            license_doc,
            "Registration Requested",

            details={
                "device_name":
                    data[
                        "device_name"
                    ],

                "mac":
                    data[
                        "mac"
                    ],

                "reported_ip":
                    data[
                        "reported_ip"
                    ],

                "observed_ip":
                    observed_ip,
            },
        )


        return (
            _public_response(
                license_doc
            )
        )


    license_doc = (
        frappe.get_doc(
            "Archive Device License",
            existing_by_code,
        )
    )


    if (
        license_doc
        .installation_id
        !=
        data[
            "installation_id"
        ]
        or
        license_doc
        .public_key_fingerprint
        !=
        data[
            "public_key_fingerprint"
        ]
    ):

        frappe.throw(
            _(
                "تعذر التحقق من "
                "هوية الجهاز."
            )
        )


    with (
        device_license_service_context()
    ):

        license_doc.device_name = (
            data[
                "device_name"
            ]
        )

        license_doc.platform = (
            data[
                "platform"
            ]
        )

        license_doc.architecture = (
            data[
                "architecture"
            ]
        )

        license_doc.interface_name = (
            data[
                "interface_name"
            ]
        )

        # license_doc.last_seen = (
        #     now
        # )

        # license_doc.last_mac = (
        #     data[
        #         "mac"
        #     ]
        # )

        # license_doc.last_reported_ip = (
        #     data[
        #         "reported_ip"
        #     ]
        # )

        # license_doc.last_observed_ip = (
        #     observed_ip
        # )

        # license_doc.device_fingerprint = (
        #     data[
        #         "device_fingerprint"
        #     ]
        # )
        changed = False


        descriptive_values = {
            "device_name":
                data[
                    "device_name"
                ],

            "platform":
                data[
                    "platform"
                ],

            "architecture":
                data[
                    "architecture"
                ],

            "interface_name":
                data[
                    "interface_name"
                ],
        }


        for (
            fieldname,
            value,
        ) in descriptive_values.items():

            if (
                license_doc.get(
                    fieldname
                )
                !=
                value
            ):

                license_doc.set(
                    fieldname,
                    value,
                )

                changed = True


        # /*
        # * قبل التفعيل يمكن Registration
        # * تحديث القيم المرشحة.
        # *
        # * بعد التفعيل لا نقبل Network Identity
        # * إلا من Signed Heartbeat.
        # */
        if (
            license_doc.status
            ==
            STATUS_PENDING
        ):

            pending_values = {
                "last_seen":
                    now,

                "last_mac":
                    data[
                        "mac"
                    ],

                "last_reported_ip":
                    data[
                        "reported_ip"
                    ],

                "last_observed_ip":
                    observed_ip,

                "last_machine_id_hash":
                    data[
                        "machine_id_hash"
                    ],

                "last_device_fingerprint":
                    data[
                        "device_fingerprint"
                    ],
            }


            for (
                fieldname,
                value,
            ) in pending_values.items():

                license_doc.set(
                    fieldname,
                    value,
                )


            changed = True


        if changed:

            with (
                device_license_service_context()
            ):

                license_doc.save(
                    ignore_permissions=True
                )


        license_doc.save(
            ignore_permissions=True
        )


    return (
        _public_response(
            license_doc
        )
    )


# ============================================================
# Guest status lookup
# ============================================================

@frappe.whitelist(
    allow_guest=True,
    methods=["GET"],
)
def get_device_registration_status(
    activation_code: str,
    installation_id: str,
    public_key_fingerprint: str,
) -> dict[str, Any]:

    activation_code = (
        _normalize_activation_code(
            activation_code
        )
    )


    installation_id = (
        _normalize_uuid(
            installation_id
        )
    )


    public_key_fingerprint = (
        _normalize_hash(
            public_key_fingerprint,
            "Public Key Fingerprint",
        )
    )


    name = frappe.db.get_value(
        "Archive Device License",

        {
            "activation_code":
                activation_code,
        },

        "name",
    )


    if not name:

        return {
            "protocol_version":
                PROTOCOL_VERSION,

            "activation_code":
                activation_code,

            "status":
                "Not Registered",

            "message":
                "الجهاز غير مسجل.",

            "server_time":
                str(
                    now_datetime()
                ),
        }


    license_doc = frappe.get_doc(
        "Archive Device License",
        name,
    )


    if (
        license_doc.installation_id
        !=
        installation_id
        or
        license_doc
        .public_key_fingerprint
        !=
        public_key_fingerprint
    ):

        frappe.throw(
            _(
                "تعذر التحقق من "
                "هوية الجهاز."
            )
        )


    return (
        _public_response(
            license_doc
        )
    )


# ============================================================
# Management permission
# ============================================================

def _require_manage_permission():

    user = (
        frappe.session.user
    )


    if (
        user
        ==
        "Administrator"
    ):
        return


    if not frappe.has_permission(
        "Archive Device License",
        ptype="write",
        user=user,
    ):

        frappe.throw(
            _(
                "ليس لديك صلاحية "
                "إدارة تراخيص الأجهزة."
            ),
            frappe.PermissionError,
        )


def _get_license(
    activation_code: str,
):

    activation_code = (
        _normalize_activation_code(
            activation_code
        )
    )


    if not frappe.db.exists(
        "Archive Device License",
        activation_code,
    ):

        frappe.throw(
            _(
                "ترخيص الجهاز غير موجود."
            )
        )


    return frappe.get_doc(
        "Archive Device License",
        activation_code,
    )


# ============================================================
# Secure challenge
# ============================================================

@frappe.whitelist(
    allow_guest=True,
    methods=["POST"],
)
def issue_device_challenge(
    activation_code: str,
    installation_id: str,
    public_key_fingerprint: str,
) -> dict[str, Any]:

    activation_code = (
        _normalize_activation_code(
            activation_code
        )
    )


    installation_id = (
        _normalize_uuid(
            installation_id
        )
    )


    public_key_fingerprint = (
        _normalize_hash(
            public_key_fingerprint,
            "Public Key Fingerprint",
        )
    )


    license_doc = _get_license(
        activation_code
    )


    if (
        license_doc.installation_id
        !=
        installation_id
        or
        license_doc
        .public_key_fingerprint
        !=
        public_key_fingerprint
    ):

        frappe.throw(
            _(
                "تعذر التحقق من "
                "هوية الجهاز."
            )
        )


    response = _public_response(
        license_doc
    )


    if (
        license_doc.status
        ==
        STATUS_REVOKED
    ):

        return response


    response[
        "challenge"
    ] = issue_signed_challenge(
        license_doc
    )


    return response



@frappe.whitelist(
    allow_guest=True,
    methods=["POST"],
)
def verify_device_heartbeat(
    payload: str | dict[str, Any],
) -> dict[str, Any]:

    payload = _parse_payload(
        payload
    )


    activation_code = (
        _normalize_activation_code(
            payload.get(
                "activation_code"
            )
        )
    )


    license_doc = _get_license(
        activation_code
    )


    if (
        license_doc.status
        ==
        STATUS_REVOKED
    ):

        return (
            _public_response(
                license_doc
            )
        )


    snapshot = (
        verify_signed_heartbeat(
            license_doc,
            payload,
        )
    )


    now = now_datetime()


    observed_ip = (
        _get_request_ip()
        or
        snapshot[
            "reported_ip"
        ]
    )


    previous_status = (
        license_doc.status
    )


    mismatch_fields = []


    if (
        license_doc.status
        ==
        STATUS_ACTIVE
    ):

        if (
            snapshot[
                "machine_id_hash"
            ]
            !=
            license_doc
            .machine_id_hash
        ):

            mismatch_fields.append(
                "Machine ID"
            )


        if (
            snapshot[
                "mac"
            ]
            !=
            license_doc
            .licensed_mac
        ):

            mismatch_fields.append(
                "MAC"
            )


        if (
            snapshot[
                "reported_ip"
            ]
            !=
            license_doc
            .licensed_ip
        ):

            mismatch_fields.append(
                "IP"
            )


    last_seen_due = True


    if (
        license_doc.last_seen
    ):

        previous_seen = get_datetime(
            license_doc.last_seen
        )


        last_seen_due = (
            now
            -
            previous_seen
        ).total_seconds() >= 300


    signed_values_changed = (
        license_doc.last_mac
        !=
        snapshot[
            "mac"
        ]
        or
        license_doc.last_reported_ip
        !=
        snapshot[
            "reported_ip"
        ]
        or
        license_doc.last_observed_ip
        !=
        observed_ip
        or
        license_doc.last_machine_id_hash
        !=
        snapshot[
            "machine_id_hash"
        ]
        or
        license_doc.last_device_fingerprint
        !=
        snapshot[
            "device_fingerprint"
        ]
    )


    must_save = (
        last_seen_due
        or
        signed_values_changed
        or
        not license_doc.key_proven_at
        or
        bool(
            mismatch_fields
        )
        or
        license_doc.status
        !=
        STATUS_ACTIVE
    )


    if must_save:

        with (
            device_license_service_context()
        ):

            license_doc.last_seen = (
                now
            )

            license_doc.last_mac = (
                snapshot[
                    "mac"
                ]
            )

            license_doc.last_reported_ip = (
                snapshot[
                    "reported_ip"
                ]
            )

            license_doc.last_observed_ip = (
                observed_ip
            )

            license_doc.last_machine_id_hash = (
                snapshot[
                    "machine_id_hash"
                ]
            )

            license_doc.last_device_fingerprint = (
                snapshot[
                    "device_fingerprint"
                ]
            )


            if not (
                license_doc.key_proven_at
            ):

                license_doc.key_proven_at = (
                    now
                )


            if (
                mismatch_fields
            ):

                license_doc.status = (
                    STATUS_MISMATCH
                )

                license_doc.suspended_at = (
                    now
                )

                license_doc.suspended_reason = (
                    "تم اكتشاف تغيير في: "
                    +
                    ", ".join(
                        mismatch_fields
                    )
                )


            license_doc.save(
                ignore_permissions=True
            )


    if (
        mismatch_fields
        and
        previous_status
        !=
        STATUS_MISMATCH
    ):

        _log_event(
            license_doc,
            "Device Identity Mismatch",

            details={
                "mismatch_fields":
                    mismatch_fields,

                "licensed_mac":
                    license_doc
                    .licensed_mac,

                "current_mac":
                    snapshot[
                        "mac"
                    ],

                "licensed_ip":
                    license_doc
                    .licensed_ip,

                "current_ip":
                    snapshot[
                        "reported_ip"
                    ],

                "observed_ip":
                    observed_ip,
            },
        )


    response = _public_response(
        license_doc
    )


    response[
        "key_proven"
    ] = bool(
        license_doc.key_proven_at
    )


    return response


@frappe.whitelist(
    methods=["POST"],
)
def rebind_device_license(
    activation_code: str,
) -> dict[str, Any]:

    _require_manage_permission()


    license_doc = _get_license(
        activation_code
    )


    if (
        license_doc.status
        !=
        STATUS_MISMATCH
    ):

        frappe.throw(
            _(
                "يمكن إعادة ربط الترخيص "
                "من حالة تغير هوية الجهاز فقط."
            )
        )


    if not (
        license_doc.key_proven_at
        and
        license_doc.last_machine_id_hash
        and
        license_doc.last_mac
        and
        license_doc.last_reported_ip
    ):

        frappe.throw(
            _(
                "لا توجد هوية موقعة كافية "
                "لإعادة ربط الجهاز."
            )
        )


    old_values = {
        "machine_id_hash":
            license_doc
            .machine_id_hash,

        "mac":
            license_doc
            .licensed_mac,

        "ip":
            license_doc
            .licensed_ip,
    }


    with (
        device_license_service_context()
    ):

        license_doc.machine_id_hash = (
            license_doc
            .last_machine_id_hash
        )

        license_doc.device_fingerprint = (
            license_doc
            .last_device_fingerprint
        )

        license_doc.licensed_mac = (
            license_doc
            .last_mac
        )

        license_doc.licensed_ip = (
            license_doc
            .last_reported_ip
        )

        license_doc.status = (
            STATUS_ACTIVE
        )

        license_doc.suspended_at = (
            None
        )

        license_doc.suspended_reason = (
            None
        )


        license_doc.save(
            ignore_permissions=True
        )


    _log_event(
        license_doc,
        "Device Rebound",

        details={
            "old":
                old_values,

            "new": {
                "machine_id_hash":
                    license_doc
                    .machine_id_hash,

                "mac":
                    license_doc
                    .licensed_mac,

                "ip":
                    license_doc
                    .licensed_ip,
            },
        },
    )


    return {
        "name":
            license_doc.name,

        "status":
            license_doc.status,
    }



# ============================================================
# Activate
# ============================================================

@frappe.whitelist(
    methods=["POST"],
)
def activate_device_license(
    activation_code: str,
) -> dict[str, Any]:

    _require_manage_permission()


    license_doc = _get_license(
        activation_code
    )


    if (
        license_doc.status
        !=
        STATUS_PENDING
    ):

        frappe.throw(
            _(
                "يمكن تفعيل الترخيص "
                "من حالة الانتظار فقط."
            )
        )

    if not (
        license_doc.key_proven_at
    ):

        frappe.throw(
            _(
                "لم يثبت الجهاز امتلاك "
                "المفتاح الخاص بعد. "
                "اترك التطبيق متصلاً ثم "
                "أعد المحاولة."
            )
        )


    if not (
        license_doc.last_mac
        and
        license_doc.last_observed_ip
    ):

        frappe.throw(
            _(
                "لا توجد بيانات شبكة "
                "كافية لتفعيل الجهاز."
            )
        )


    with (
        device_license_service_context()
    ):

        license_doc.status = (
            STATUS_ACTIVE
        )

        license_doc.machine_id_hash = (
            license_doc
            .last_machine_id_hash
            or
            license_doc
            .machine_id_hash
        )


        license_doc.device_fingerprint = (
            license_doc
            .last_device_fingerprint
            or
            license_doc
            .device_fingerprint
        )


        license_doc.licensed_mac = (
            license_doc.last_mac
        )


        license_doc.licensed_ip = (
            license_doc
            .last_reported_ip
        )

        license_doc.activated_at = (
            now_datetime()
        )

        license_doc.activated_by = (
            frappe.session.user
        )

        license_doc.suspended_at = (
            None
        )

        license_doc.suspended_reason = (
            None
        )


        license_doc.save(
            ignore_permissions=True
        )
        


    _log_event(
        license_doc,
        "Activated",

        details={
            "licensed_mac":
                license_doc
                .licensed_mac,

            "licensed_ip":
                license_doc
                .licensed_ip,
        },
    )


    return {
        "name":
            license_doc.name,

        "status":
            license_doc.status,
    }


# ============================================================
# Suspend
# ============================================================

@frappe.whitelist(
    methods=["POST"],
)
def suspend_device_license(
    activation_code: str,
    reason: str | None = None,
) -> dict[str, Any]:

    _require_manage_permission()


    license_doc = _get_license(
        activation_code
    )


    if (
        license_doc.status
        !=
        STATUS_ACTIVE
    ):

        frappe.throw(
            _(
                "يمكن تعليق الترخيص "
                "الفعال فقط."
            )
        )


    reason = _clean_text(
        reason,
        max_length=1000,
    )


    with (
        device_license_service_context()
    ):

        license_doc.status = (
            STATUS_SUSPENDED
        )

        license_doc.suspended_at = (
            now_datetime()
        )

        license_doc.suspended_reason = (
            reason
            or
            "تم التعليق بواسطة مسؤول النظام."
        )


        license_doc.save(
            ignore_permissions=True
        )


    _log_event(
        license_doc,
        "Suspended",

        details={
            "reason":
                license_doc
                .suspended_reason,
        },
    )


    return {
        "name":
            license_doc.name,

        "status":
            license_doc.status,
    }


# ============================================================
# Resume
# ============================================================

@frappe.whitelist(
    methods=["POST"],
)
def resume_device_license(
    activation_code: str,
) -> dict[str, Any]:

    _require_manage_permission()


    license_doc = _get_license(
        activation_code
    )


    if (
        license_doc.status
        !=
        STATUS_SUSPENDED
    ):

        frappe.throw(
            _(
                "يمكن استئناف الترخيص "
                "المعلق فقط."
            )
        )


    with (
        device_license_service_context()
    ):

        license_doc.status = (
            STATUS_ACTIVE
        )

        license_doc.suspended_at = (
            None
        )

        license_doc.suspended_reason = (
            None
        )


        license_doc.save(
            ignore_permissions=True
        )


    _log_event(
        license_doc,
        "Resumed",
    )


    return {
        "name":
            license_doc.name,

        "status":
            license_doc.status,
    }


# ============================================================
# Revoke
# ============================================================

@frappe.whitelist(
    methods=["POST"],
)
def revoke_device_license(
    activation_code: str,
) -> dict[str, Any]:

    _require_manage_permission()


    license_doc = _get_license(
        activation_code
    )


    if (
        license_doc.status
        ==
        STATUS_REVOKED
    ):

        return {
            "name":
                license_doc.name,

            "status":
                license_doc.status,
        }


    with (
        device_license_service_context()
    ):

        license_doc.status = (
            STATUS_REVOKED
        )

        license_doc.revoked_at = (
            now_datetime()
        )

        license_doc.revoked_by = (
            frappe.session.user
        )


        license_doc.save(
            ignore_permissions=True
        )


    _log_event(
        license_doc,
        "Revoked",
    )


    return {
        "name":
            license_doc.name,

        "status":
            license_doc.status,
    }