"""Fail-closed inspection of a restore safety snapshot; never mutates a database."""
import gzip
import hashlib
import json

MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024


def inspect_restore_snapshot(snapshot: dict) -> dict:
    """Verify integrity and structure before a recovery can even be considered.

    No automatic restore is performed. Never return credentials or raw snapshot data.
    """
    blob = snapshot.get("blob")
    expected = snapshot.get("sha256")
    if not isinstance(blob, bytes) or not isinstance(expected, str) or len(expected) != 64:
        raise ValueError("Metadados da copia de seguranca invalidos")
    try:
        with gzip.GzipFile(fileobj=__import__("io").BytesIO(blob)) as stream:
            raw = stream.read(MAX_UNCOMPRESSED_BYTES + 1)
    except (OSError, EOFError) as exc:
        raise ValueError("Copia de seguranca comprimida invalida") from exc
    if len(raw) > MAX_UNCOMPRESSED_BYTES:
        raise ValueError("Copia de seguranca excede limite seguro")
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("Assinatura SHA256 da copia nao confere")
    try:
        parsed = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Conteudo da copia de seguranca invalido") from exc
    data = parsed.get("data") if isinstance(parsed, dict) else None
    if not isinstance(data, dict) or not data:
        raise ValueError("Copia sem colecoes validas")
    if any(not isinstance(records, list) or any(not isinstance(record, dict) for record in records)
           for records in data.values()):
        raise ValueError("Colecao da copia de seguranca invalida")
    return {"verified": True, "collections": len(data),
            "records": sum(len(records) for records in data.values())}
