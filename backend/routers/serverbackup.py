"""Backup local no próprio servidor: cópias completas compactadas guardadas no banco (sobrevivem a reinícios),
geradas toda noite pelo agendador ou na hora, para baixar ou restaurar com um clique."""
import gzip
import hashlib
import io
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from bson import Binary
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import AwareDatetime, BaseModel, Field, TypeAdapter, ValidationError

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


class CloudBackupRun(BaseModel):
    status: Literal["running", "verified", "failed"]
    at: datetime
    name: str | None = None
    size_bytes: int | None = None
    sha256: str | None = None


class CloudRestoreDrill(BaseModel):
    at: AwareDatetime
    name: str = Field(max_length=128)
    duration_seconds: int = Field(ge=0)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


def read_cloud_metadata(path: Path, schema: TypeAdapter):
    with path.open("rb") as source:
        content = source.read(32769)
    if len(content) > 32768:
        raise ValueError("status exceeds metadata limit")
    return schema.validate_json(content)


@router.get("/backups/cloud")
def cloud_backup_status(_: dict = Depends(require())):
    state = os.environ.get("APOLLO_CLOUD_BACKUP_STATUS_FILE")
    requests = os.environ.get("APOLLO_CLOUD_BACKUP_REQUEST_DIR")
    result = {"configured": bool(state), "manual_enabled": bool(state and requests),
              "destination": os.environ.get("APOLLO_CLOUD_BACKUP_DISPLAY_NAME", "Armazenamento externo"),
              "history": [], "next_scheduled_at": None, "status": "unconfigured", "latest": None, "last_restore": None}
    if not state:
        return result
    now = datetime.now(timezone.utc)
    result["next_scheduled_at"] = now.replace(second=0, microsecond=0) + timedelta(minutes=15 - now.minute % 15)
    result["status"] = "waiting"
    try:
        result["last_restore"] = read_cloud_metadata(Path(state).with_name("restore.json"), TypeAdapter(CloudRestoreDrill))
    except (OSError, ValueError):
        pass
    try:
        history = read_cloud_metadata(Path(state), TypeAdapter(list[CloudBackupRun]))
    except FileNotFoundError:
        return result
    except (OSError, ValidationError, ValueError):
        result["status"] = "unavailable"
        return result

    result["history"] = history[:20]
    latest = next((entry for entry in history if entry.status == "verified"), None)
    result["latest"] = latest
    if history:
        recent = history[0]
        age = now - recent.at if recent.at.tzinfo else timedelta.max
        result["status"] = "overdue" if age > timedelta(minutes=30) else recent.status
    return result


@router.post("/backups/cloud/request", status_code=202)
async def request_cloud_backup(me: dict = Depends(require())):
    directory = os.environ.get("APOLLO_CLOUD_BACKUP_REQUEST_DIR")
    if not directory or not os.environ.get("APOLLO_CLOUD_BACKUP_STATUS_FILE"):
        raise HTTPException(503, "Backup externo indisponível neste servidor.")
    try:
        with (Path(directory) / "request").open("x"):
            pass
    except FileExistsError:
        return OkOut(message="Já existe uma solicitação pendente.")
    except OSError as exc:
        raise HTTPException(503, "Não foi possível solicitar o backup externo.") from exc
    await audit_backup("cloud_backup_requested", me)
    return OkOut(message="Backup externo solicitado.")


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
