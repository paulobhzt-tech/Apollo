"""Signed license verification tests; private keys are generated only in tests."""
import base64
from datetime import datetime, timedelta, timezone
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from lib.license_verification import LicenseError, canonical_payload, verify_license


def make_license():
    private = Ed25519PrivateKey.generate()
    public = base64.b64encode(private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw)).decode()
    payload = {"version": 1, "license_id": "license-1", "installation_id": "pc-1",
               "status": "active", "expires_at": "2030-01-01T00:00:00Z"}
    signature = base64.b64encode(private.sign(canonical_payload(payload))).decode()
    return {"payload": payload, "signature": signature}, public


def test_valid_offline_license():
    license_doc, key = make_license()
    assert verify_license(license_doc, key, "pc-1", datetime(2028, 1, 1, tzinfo=timezone.utc))["license_id"] == "license-1"


def test_copied_license_rejected_on_other_installation():
    license_doc, key = make_license()
    with pytest.raises(LicenseError, match="outra instalação"):
        verify_license(license_doc, key, "pc-2")


def test_tampering_invalidates_signature():
    license_doc, key = make_license()
    license_doc["payload"]["license_id"] = "modified"
    with pytest.raises(LicenseError, match="Assinatura"):
        verify_license(license_doc, key, "pc-1")


def test_expired_license_rejected():
    license_doc, key = make_license()
    with pytest.raises(LicenseError, match="expirada"):
        verify_license(license_doc, key, "pc-1", datetime(2031, 1, 1, tzinfo=timezone.utc))


def test_untrusted_signer_rejected():
    license_doc, _ = make_license()
    _, other_key = make_license()
    with pytest.raises(LicenseError, match="Assinatura"):
        verify_license(license_doc, other_key, "pc-1")


def test_invalid_document_rejected():
    _, key = make_license()
    with pytest.raises(LicenseError):
        verify_license({"payload": {}}, key, "pc-1")
