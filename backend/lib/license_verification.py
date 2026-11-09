"""Offline-capable signed license verification (Ed25519).

Only the vendor holds the private signing key. Customers receive a signed JSON
license and the public key. This module intentionally does not enforce licenses
on existing POS routes until migration/renewal workflows are validated.
"""
import base64
import json
from datetime import datetime, timezone
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


class LicenseError(ValueError):
    pass


def _b64decode(value: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except (ValueError, TypeError) as exc:
        raise LicenseError("Codificação da licença inválida") from exc


def canonical_payload(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def verify_license(document: dict, public_key_b64: str, installation_id: str, now: datetime | None = None) -> dict:
    """Validate signature, installation binding and expiry; fail closed."""
    if not isinstance(document, dict) or set(document) != {"payload", "signature"}:
        raise LicenseError("Formato da licença inválido")
    payload = document["payload"]
    if not isinstance(payload, dict):
        raise LicenseError("Dados da licença inválidos")
    if payload.get("version") != 1:
        raise LicenseError("Versão da licença não suportada")
    if not isinstance(installation_id, str) or not installation_id.strip():
        raise LicenseError("Identificação da instalação ausente")
    if payload.get("installation_id") != installation_id:
        raise LicenseError("Licença vinculada a outra instalação")
    if not isinstance(payload.get("license_id"), str) or not payload["license_id"]:
        raise LicenseError("Identificador de licença inválido")
    if payload.get("status") != "active":
        raise LicenseError("Licença não ativa")
    try:
        key = Ed25519PublicKey.from_public_bytes(_b64decode(public_key_b64))
        key.verify(_b64decode(document["signature"]), canonical_payload(payload))
    except (InvalidSignature, ValueError, TypeError) as exc:
        raise LicenseError("Assinatura digital inválida") from exc
    expires = payload.get("expires_at")
    if not isinstance(expires, str):
        raise LicenseError("Validade da licença ausente")
    try:
        deadline = datetime.fromisoformat(expires.replace("Z", "+00:00"))
    except ValueError as exc:
        raise LicenseError("Validade da licença inválida") from exc
    if deadline.tzinfo is None:
        raise LicenseError("Validade sem fuso horário")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise LicenseError("Relógio sem fuso horário")
    if current >= deadline:
        raise LicenseError("Licença expirada")
    return payload
