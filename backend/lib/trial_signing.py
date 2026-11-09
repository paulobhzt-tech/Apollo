"""Vendor-side signing of trial licenses. Never distribute the private key.

This is a service primitive, not a public endpoint. Only a trusted licensing
backend should call it after customer verification and atomic trial issuance.
"""
import base64
from datetime import datetime, timezone
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from lib.license_verification import canonical_payload, verify_license, LicenseError
from lib.trial_issuance import evaluate_trial


def sign_trial_license(record: dict, private_key_b64: str, *, now: datetime | None = None) -> dict:
    if not record or record.get("kind") != "trial":
        raise LicenseError("Registro de teste inválido")
    state = evaluate_trial(record, now=now)
    if state["status"] != "active":
        raise LicenseError("Teste não está ativo")
    customer = record.get("_id")
    installation = record.get("installation_id")
    if not isinstance(customer, str) or not customer or not isinstance(installation, str) or not installation:
        raise LicenseError("Identificação do cliente ou instalação ausente")
    expires = record["expires_at"]
    if expires.tzinfo is None:
        raise LicenseError("Validade sem fuso horário")
    payload = {
        "version": 1, "license_id": "trial:" + customer,
        "installation_id": installation, "status": "active",
        "license_type": "trial", "customer_id": customer,
        "expires_at": expires.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    try:
        private_bytes = base64.b64decode(private_key_b64, validate=True)
        signer = Ed25519PrivateKey.from_private_bytes(private_bytes)
        signature = signer.sign(canonical_payload(payload))
    except (ValueError, TypeError) as exc:
        raise LicenseError("Chave de assinatura inválida") from exc
    return {"payload": payload, "signature": base64.b64encode(signature).decode()}
