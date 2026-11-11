"""Backup local no próprio servidor: cópias completas compactadas guardadas no banco (sobrevivem a reinícios),
geradas toda noite pelo agendador ou na hora, para baixar ou restaurar com um clique."""
import gzip
import hashlib
import io
import json
import uuid
from datetime import datetime, timezone

from bson import Binary
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from lib.auth import require
from lib.db import db
from models.schemas import LocalBackupSettings, OkOut, RestoreIn, RestoreOut, ServerBackupInfo

router = APIRouter()


async def audit_backup(action: str, user: dict, backup_id: str = "") -> None:
    """Append-only operational audit entry, without backup payload or credentials."""
    await db.backup_audit.insert_one({
        "at": datetime.now(timezone.utc),
        "action": action,
        "backup_id": backup_id,
        "employee_id": user.get("id", ""),
        "employee_name": user.get("name", ""),
    })


@router.get("/backups/server/audit")
async def list_backup_audit(_: dict = Depends(require())):
    return await db.backup_audit.find({}, {"_id": 0}).sort("at", -1).to_list(200)

MAX_BYTES = 15 * 1024 * 1024  # Mongo document limit is 16 MB
MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024  # Protect restore/download from oversized payloads


async def local_settings() -> LocalBackupSettings:
    d = await db.settings.find_one({"_id": "backup_local"}, {"_id": 0}) or {}
    return LocalBackupSettings(**d)


async def make_server_backup(trigger: str, by_name: str = "") -> ServerBackupInfo:
    from routers.config import build_backup
    _stamp, payload = await build_backup()
    raw = json.dumps(payload, ensure_ascii=False).encode()
    if len(raw) > MAX_UNCOMPRESSED_BYTES:
        raise HTTPException(400, "Backup excede o limite de segurança de 100 MB")
    blob = gzip.compress(raw, compresslevel=6)
    if len(blob) > MAX_BYTES:
        raise HTTPException(400, "Backup grande demais para guardar no servidor: use o Google Drive ou baixe o arquivo")
    info = ServerBackupInfo(id=str(uuid.uuid4()), at=datetime.now(timezone.utc), trigger=trigger, size_kb=max(1, len(blob) // 1024), by_name=by_name)
    await db.server_backups.insert_one({**info.model_dump(), "blob": Binary(blob), "sha256": hashlib.sha256(raw).hexdigest()})
    keep = (await local_settings()).keep
    old = await db.server_backups.find({}, {"_id": 0, "id": 1}).sort("at", -1).skip(keep).to_list(1000)
    if old:
        await db.server_backups.delete_many({"id": {"$in": [o["id"] for o in old]}})
    return info


@router.get("/backups/server", response_model=list[ServerBackupInfo])
async def list_server_backups(_: dict = Depends(require())):
    return await db.server_backups.find({}, {"_id": 0, "blob": 0}).sort("at", -1).to_list(100)


@router.post("/backups/server", response_model=ServerBackupInfo)
async def backup_now(me: dict = Depends(require())):
    info = await make_server_backup("manual", me["name"])
    await audit_backup("created", me, info.id)
    return info


@router.get("/backups/server/settings", response_model=LocalBackupSettings)
async def get_local_settings(_: dict = Depends(require())):
    return await local_settings()


@router.get("/backups/server/health")
async def backup_health(overdue_hours: int = Query(default=36, ge=1, le=720),
                        _: dict = Depends(require())):
    """Inspect backup metadata only; never decompress, restore, or mutate data.

    Daily automatic backups get a 12-hour tolerance by default. Checksum
    availability is not proof of integrity: use /{id}/verify for that check.
    """
    settings = await local_settings()
    document = await db.server_backups.find_one(
        {}, {"_id": 0, "id": 1, "at": 1, "size_kb": 1, "sha256": 1},
        sort=[("at", -1)],
    )
    result = {
        "auto_enabled": settings.auto,
        "keep": settings.keep,
        "overdue_hours": overdue_hours,
        "status": "missing",
        "overdue": True,
        "latest": None,
        "integrity": "not_checked",
        # Existing verification is deliberately read-only and stores no history.
        "last_verified_at": None,
    }
    if not document:
        return result
    at = document.get("at")
    if not isinstance(at, datetime):
        result["status"] = "invalid_metadata"
        return result
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)  # legacy Mongo timestamps are UTC
    age_seconds = (datetime.now(timezone.utc) - at).total_seconds()
    age_hours = round(max(0, age_seconds) / 3600, 2)
    checksum = document.get("sha256")
    checksum_available = isinstance(checksum, str) and len(checksum) == 64 and all(
        ch in "0123456789abcdefABCDEF" for ch in checksum
    )
    overdue = age_seconds > overdue_hours * 3600
    result.update(
        status="invalid_metadata" if age_seconds < -300 else "overdue" if overdue else "recent",
        overdue=overdue or age_seconds < -300,
        latest={"id": document.get("id"), "at": at, "age_hours": age_hours,
                "size_kb": document.get("size_kb"), "checksum_available": checksum_available},
    )
    return result


@router.put("/backups/server/settings", response_model=LocalBackupSettings)
async def put_local_settings(body: LocalBackupSettings, me: dict = Depends(require())):
    await db.settings.update_one({"_id": "backup_local"}, {"$set": body.model_dump()}, upsert=True)
    await audit_backup("settings_updated", me)
    return body


async def _load(id: str) -> tuple[dict, dict]:
    d = await db.server_backups.find_one({"id": id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Backup não encontrado")
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(bytes(d["blob"]))) as stream:
            raw = stream.read(MAX_UNCOMPRESSED_BYTES + 1)
        if len(raw) > MAX_UNCOMPRESSED_BYTES:
            raise HTTPException(400, "Backup excede o limite de segurança de 100 MB")
        expected = d.get("sha256")
        if expected and hashlib.sha256(raw).hexdigest() != expected:
            raise HTTPException(409, "Integridade do backup comprometida. Restauração bloqueada.")
        payload = json.loads(raw)
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
            raise HTTPException(400, "Estrutura do backup inválida")
        return d, payload
    except (OSError, EOFError, ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(400, "Backup corrompido ou inválido") from exc


@router.get("/backups/server/{id}/verify")
async def verify_server_backup(id: str, _: dict = Depends(require())):
    """Read and validate a backup without modifying restaurant data."""
    document, payload = await _load(id)
    from routers.config import validate_restore_data
    collections = validate_restore_data(payload["data"])
    return {
        "id": id,
        "valid": True,
        "integrity": "sha256" if document.get("sha256") else "legacy_without_checksum",
        "collections": sorted(collections.keys()),
        "record_counts": {name: len(docs) for name, docs in collections.items()},
        "message": "Backup íntegro; nenhuma restauração foi executada.",
    }


@router.get("/backups/server/{id}/download")
async def download_backup(id: str, _: dict = Depends(require())):
    d, payload = await _load(id)
    name = f"backup-apollo-{d['at'].strftime('%Y%m%d-%H%M')}.json"
    return Response(json.dumps(payload, ensure_ascii=False), media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/backups/server/{id}/restore", response_model=RestoreOut)
async def restore_backup(id: str, me: dict = Depends(require())):
    from routers.config import restore
    _d, payload = await _load(id)
    from routers.config import validate_restore_data
    validate_restore_data(payload["data"])
    await make_server_backup("antes da restauração", me["name"])  # safety copy of the current data
    result = await restore(RestoreIn(data=payload["data"], data_sha256=payload.get("data_sha256")), me)
    await audit_backup("restored", me, id)
    return result


@router.delete("/backups/server/{id}", response_model=OkOut)
async def delete_backup(id: str, me: dict = Depends(require())):
    if not (await db.server_backups.delete_one({"id": id})).deleted_count:
        raise HTTPException(404, "Backup não encontrado")
    await audit_backup("deleted", me, id)
    return OkOut(message="Backup apagado")
