"""Backup local no próprio servidor: cópias completas compactadas guardadas no banco (sobrevivem a reinícios),
geradas toda noite pelo agendador ou na hora, para baixar ou restaurar com um clique."""
import gzip
import hashlib
import io
import json
import uuid
from datetime import datetime, timezone

from bson import Binary
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from lib.auth import require
from lib.db import db
from models.schemas import LocalBackupSettings, OkOut, RestoreIn, RestoreOut, ServerBackupInfo

router = APIRouter()
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
    return await make_server_backup("manual", me["name"])


@router.get("/backups/server/settings", response_model=LocalBackupSettings)
async def get_local_settings(_: dict = Depends(require())):
    return await local_settings()


@router.put("/backups/server/settings", response_model=LocalBackupSettings)
async def put_local_settings(body: LocalBackupSettings, _: dict = Depends(require())):
    await db.settings.update_one({"_id": "backup_local"}, {"$set": body.model_dump()}, upsert=True)
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


@router.get("/backups/server/{id}/download")
async def download_backup(id: str, _: dict = Depends(require())):
    d, payload = await _load(id)
    name = f"backup-apollo-{d['at'].strftime('%Y%m%d-%H%M')}.json"
    return Response(json.dumps(payload, ensure_ascii=False), media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/backups/server/{id}/restore", response_model=RestoreOut)
async def restore_backup(id: str, me: dict = Depends(require())):
    from routers.config import restore
    _d, payload = await _load(id)
    await make_server_backup("antes da restauração", me["name"])  # safety copy of the current data
    return await restore(RestoreIn(data=payload["data"]), me)


@router.delete("/backups/server/{id}", response_model=OkOut)
async def delete_backup(id: str, _: dict = Depends(require())):
    if not (await db.server_backups.delete_one({"id": id})).deleted_count:
        raise HTTPException(404, "Backup não encontrado")
    return OkOut(message="Backup apagado")
