"""End-to-end signing and offline validation for seven-day trials."""
import base64
from datetime import datetime, timedelta, timezone
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from lib.license_verification import LicenseError, verify_license
from lib.trial_signing import sign_trial_license

START = datetime(2026, 11, 7, tzinfo=timezone.utc)


def keys():
    private = Ed25519PrivateKey.generate()
    raw_private = private.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw,
                                        serialization.NoEncryption())
    raw_public = private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(raw_private).decode(), base64.b64encode(raw_public).decode()


def record():
    return {"_id": "customer-1", "kind": "trial", "installation_id": "pc-1",
            "started_at": START, "expires_at": START + timedelta(days=7)}


def test_trial_signature_roundtrip_offline():
    secret, public = keys()
    signed = sign_trial_license(record(), secret, now=START + timedelta(hours=1))
    verified = verify_license(signed, public, "pc-1", now=START + timedelta(hours=1))
    assert verified["license_type"] == "trial"
    assert verified["expires_at"] == "2026-11-14T00:00:00Z"


def test_copy_to_another_machine_is_rejected():
    secret, public = keys()
    signed = sign_trial_license(record(), secret, now=START)
    with pytest.raises(LicenseError):
        verify_license(signed, public, "pc-2", now=START)


def test_signing_cannot_extend_expired_trial():
    secret, _ = keys()
    with pytest.raises(LicenseError):
        sign_trial_license(record(), secret, now=START + timedelta(days=7))


def test_signing_rejects_tampered_longer_trial():
    secret, _ = keys()
    r = record()
    r["expires_at"] = START + timedelta(days=8)
    with pytest.raises(ValueError):
        sign_trial_license(r, secret, now=START)


def test_private_key_required():
    with pytest.raises(LicenseError):
        sign_trial_license(record(), "invalid", now=START)
