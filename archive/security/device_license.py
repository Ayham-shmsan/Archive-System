from __future__ import annotations


import base64
import ipaddress
import json
import re
import secrets
import time
import uuid


from contextlib import (
    contextmanager,
)

from typing import (
    Any,
)


import frappe


from cryptography.exceptions import (
    InvalidSignature,
)

from cryptography.hazmat.primitives.serialization import (
    load_pem_public_key,
)

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PublicKey,
)


# ============================================================
# Protocol
# ============================================================

HEARTBEAT_PROTOCOL_VERSION = 1


HEARTBEAT_PREFIX = (
    "ARCHIVE-DEVICE-HEARTBEAT-V1"
)


CHALLENGE_TTL_SECONDS = 90


CHALLENGE_KEY_PREFIX = (
    "archive:device-license:challenge"
)


HEX_64_PATTERN = re.compile(
    r"^[0-9a-f]{64}$"
)


MAC_PATTERN = re.compile(
    r"^(?:[0-9A-F]{2}:){5}"
    r"[0-9A-F]{2}$"
)


# ============================================================
# Cache
# ============================================================

def _cache():

    cache = frappe.cache


    if callable(
        cache
    ):

        return cache()


    return cache


def _challenge_key(
    challenge_id: str,
) -> str:

    return (
        f"{CHALLENGE_KEY_PREFIX}:"
        f"{challenge_id}"
    )


@contextmanager
def _challenge_lock(
    challenge_id: str,
):

    cache = _cache()


    lock_factory = getattr(
        cache,
        "lock",
        None,
    )


    if not callable(
        lock_factory
    ):

        yield

        return


    lock = lock_factory(
        (
            f"{_challenge_key(challenge_id)}"
            ":lock"
        ),
        timeout=5,
        blocking_timeout=2,
    )


    with lock:
        yield


# ============================================================
# Normalization
# ============================================================

def _text(
    value: Any,
    *,
    max_length: int,
) -> str:

    result = str(
        value or ""
    ).strip()


    if (
        not result
        or
        len(result)
        >
        max_length
    ):

        frappe.throw(
            "بيانات التحقق من الجهاز غير صالحة."
        )


    return result


def _uuid(
    value: Any,
) -> str:

    value = _text(
        value,
        max_length=64,
    )


    try:

        return str(
            uuid.UUID(
                value
            )
        )

    except (
        ValueError,
        TypeError,
        AttributeError,
    ):

        frappe.throw(
            "معرف التحقق غير صالح."
        )


def _hash(
    value: Any,
) -> str:

    value = (
        _text(
            value,
            max_length=64,
        )
        .lower()
    )


    if not HEX_64_PATTERN.fullmatch(
        value
    ):

        frappe.throw(
            "بصمة الجهاز غير صالحة."
        )


    return value


def _mac(
    value: Any,
) -> str:

    value = (
        _text(
            value,
            max_length=32,
        )
        .replace(
            "-",
            ":",
        )
        .upper()
    )


    if (
        not MAC_PATTERN.fullmatch(
            value
        )
        or
        value
        ==
        "00:00:00:00:00:00"
    ):

        frappe.throw(
            "عنوان MAC غير صالح."
        )


    return value


def _ip(
    value: Any,
) -> str:

    value = _text(
        value,
        max_length=64,
    )


    try:

        return str(
            ipaddress.ip_address(
                value
            )
        )

    except ValueError:

        frappe.throw(
            "عنوان IP غير صالح."
        )


# ============================================================
# Challenge
# ============================================================

def issue_challenge(
    license_doc,
) -> dict[str, Any]:

    challenge_id = str(
        uuid.uuid4()
    )


    nonce = secrets.token_urlsafe(
        32
    )


    expires_at = (
        int(
            time.time()
        )
        +
        CHALLENGE_TTL_SECONDS
    )


    record = {
        "challenge_id":
            challenge_id,

        "activation_code":
            license_doc.activation_code,

        "installation_id":
            license_doc.installation_id,

        "public_key_fingerprint":
            license_doc.public_key_fingerprint,

        "nonce":
            nonce,

        "expires_at":
            expires_at,
    }


    _cache().set_value(
        _challenge_key(
            challenge_id
        ),
        record,
        expires_in_sec=
            CHALLENGE_TTL_SECONDS,
    )


    return {
        "challenge_id":
            challenge_id,

        "nonce":
            nonce,

        "expires_in":
            CHALLENGE_TTL_SECONDS,

        "protocol_version":
            HEARTBEAT_PROTOCOL_VERSION,
    }


def _consume_challenge(
    challenge_id: str,
) -> dict[str, Any]:

    key = _challenge_key(
        challenge_id
    )


    with _challenge_lock(
        challenge_id
    ):

        cache = _cache()


        record = cache.get_value(
            key
        )


        if not record:

            frappe.throw(
                "انتهت صلاحية تحدي الجهاز "
                "أو تم استخدامه مسبقًا."
            )


        # نحذف Challenge قبل التحقق النهائي.
        #
        # أي محاولة ثانية بنفس Challenge
        # لن تنجح.
        cache.delete_value(
            key
        )


    if isinstance(
        record,
        str,
    ):

        try:

            record = json.loads(
                record
            )

        except json.JSONDecodeError:

            frappe.throw(
                "تحدي الجهاز غير صالح."
            )


    if not isinstance(
        record,
        dict,
    ):

        frappe.throw(
            "تحدي الجهاز غير صالح."
        )


    if (
        int(
            record.get(
                "expires_at"
            )
            or 0
        )
        <
        int(
            time.time()
        )
    ):

        frappe.throw(
            "انتهت صلاحية تحدي الجهاز."
        )


    return record

# ============================================================
# Canonical message
# ============================================================

def _heartbeat_message(
    data: dict[str, str],
) -> bytes:

    values = [
        HEARTBEAT_PREFIX,
        data["challenge_id"],
        data["activation_code"],
        data["installation_id"],
        data["nonce"],
        data["machine_id_hash"],
        data["mac"],
        data["reported_ip"],
        data["public_key_fingerprint"],
        data["device_fingerprint"],
    ]


    return "\n".join(
        values
    ).encode(
        "utf-8"
    )


# ============================================================
# Verify
# ============================================================

def verify_heartbeat(
    license_doc,
    payload: dict[str, Any],
) -> dict[str, str]:

    challenge_id = _uuid(
        payload.get(
            "challenge_id"
        )
    )


    activation_code = _text(
        payload.get(
            "activation_code"
        ),
        max_length=64,
    ).upper()


    installation_id = _uuid(
        payload.get(
            "installation_id"
        )
    )


    nonce = _text(
        payload.get(
            "nonce"
        ),
        max_length=128,
    )


    machine_id_hash = _hash(
        payload.get(
            "machine_id_hash"
        )
    )


    mac = _mac(
        payload.get(
            "mac"
        )
    )


    reported_ip = _ip(
        payload.get(
            "ipv4"
        )
    )


    public_key_fingerprint = _hash(
        payload.get(
            "public_key_fingerprint"
        )
    )


    device_fingerprint = _hash(
        payload.get(
            "device_fingerprint"
        )
    )


    signature_text = _text(
        payload.get(
            "signature"
        ),
        max_length=1024,
    )


    challenge = _consume_challenge(
        challenge_id
    )


    expected = {
        "activation_code":
            license_doc.activation_code,

        "installation_id":
            license_doc.installation_id,

        "public_key_fingerprint":
            license_doc.public_key_fingerprint,
    }


    actual = {
        "activation_code":
            activation_code,

        "installation_id":
            installation_id,

        "public_key_fingerprint":
            public_key_fingerprint,
    }


    if (
        actual
        !=
        expected
    ):

        frappe.throw(
            "هوية الجهاز لا تطابق الترخيص."
        )


    if (
        challenge.get(
            "activation_code"
        )
        !=
        activation_code
        or
        challenge.get(
            "installation_id"
        )
        !=
        installation_id
        or
        challenge.get(
            "public_key_fingerprint"
        )
        !=
        public_key_fingerprint
        or
        challenge.get(
            "nonce"
        )
        !=
        nonce
    ):

        frappe.throw(
            "تحدي الجهاز لا يطابق طلب التحقق."
        )


    try:

        signature = base64.b64decode(
            signature_text,
            validate=True,
        )

    except (
        ValueError,
        TypeError,
    ):

        frappe.throw(
            "توقيع الجهاز غير صالح."
        )


    try:

        public_key = load_pem_public_key(
            license_doc.public_key.encode(
                "utf-8"
            )
        )

    except Exception:

        frappe.throw(
            "تعذر قراءة المفتاح العام "
            "المخزن للجهاز."
        )


    if not isinstance(
        public_key,
        Ed25519PublicKey,
    ):

        frappe.throw(
            "نوع مفتاح الجهاز غير مدعوم."
        )


    message_data = {
        "challenge_id":
            challenge_id,

        "activation_code":
            activation_code,

        "installation_id":
            installation_id,

        "nonce":
            nonce,

        "machine_id_hash":
            machine_id_hash,

        "mac":
            mac,

        "reported_ip":
            reported_ip,

        "public_key_fingerprint":
            public_key_fingerprint,

        "device_fingerprint":
            device_fingerprint,
    }


    try:

        public_key.verify(
            signature,
            _heartbeat_message(
                message_data
            ),
        )

    except InvalidSignature:

        frappe.throw(
            "فشل إثبات هوية الجهاز."
        )


    return {
        "machine_id_hash":
            machine_id_hash,

        "mac":
            mac,

        "reported_ip":
            reported_ip,

        "device_fingerprint":
            device_fingerprint,

        "challenge_id":
            challenge_id,
    }