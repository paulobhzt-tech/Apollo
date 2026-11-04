"""Google Drive backup: owner connects once (OAuth, drive.file scope), then backups are uploaded manually or every night by the platform cron."""
import asyncio
import hmac
import io
import json
import logging
import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from lib.auth import require
from lib.db import db
from models.schemas import AuthUrlOut, DriveBackupInfo, DriveSettingsIn, DriveStatus, OkOut

router = APIRouter()
log = logging.getLogger(__name__)
SCOPE = "https://www.googleapis.com/auth/drive.file"
FOLDER = "Backups Espeteria"
KEEP = 14  # backups kept in Drive


def _configured() -> bool:
    return bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))


def _base_url(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if host and not host.startswith(("localhost", "127.0.0.1", "0.0.0.0")):
        return f"https://{host.split(',')[0].strip()}"
    return os.environ.get("APP_URL", "").rstrip("/")


def _flow(redirect_uri: str, scopes: list[str] | None):
    from google_auth_oauthlib.flow import Flow
    return Flow.from_client_config({"web": {
        "client_id": os.environ["GOOGLE_CLIENT_ID"], "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [redirect_uri]}}, scopes=scopes, redirect_uri=redirect_uri)


async def _doc() -> dict:
    return await db.settings.find_one({"_id": "drive"}) or {}


@router.get("/drive/status", response_model=DriveStatus)
async def drive_status(_: dict = Depends(require())):
    d = await _doc()
    hist = d.get("history", [])
    return DriveStatus(configured=_configured(), connected=bool(d.get("refresh_token")), email=d.get("email", ""),
                       auto=d.get("auto", True), folder_name=FOLDER, last=hist[0] if hist else None, history=hist[:10])


@router.get("/drive/connect", response_model=AuthUrlOut)
async def drive_connect(request: Request, _: dict = Depends(require())):
    if not _configured():
        raise HTTPException(400, "Credenciais do Google ainda não cadastradas no servidor")
    state = secrets.token_urlsafe(24)
    redirect = f"{_base_url(request)}/api/drive/callback"
    flow = _flow(redirect, [SCOPE, "openid", "https://www.googleapis.com/auth/userinfo.email"])
    url, _s = flow.authorization_url(access_type="offline", include_granted_scopes="true", prompt="consent", state=state)
    verifier = getattr(flow, "code_verifier", None)
    await db.settings.update_one({"_id": "drive"}, {"$set": {"pending_state": state, "pending_redirect": redirect, "pending_verifier": verifier}}, upsert=True)
    return AuthUrlOut(authorization_url=url)


@router.get("/drive/callback")
async def drive_callback(request: Request, code: str = Query(""), state: str = Query(""), error: str = Query("")):
    d = await _doc()
    base = _base_url(request)
    if error or not code or not state or not hmac.compare_digest(state, d.get("pending_state") or "-"):
        return RedirectResponse(f"{base}/config?tab=backup&drive=erro")
    try:
        flow = _flow(d["pending_redirect"], None)
        if d.get("pending_verifier"):
            flow.code_verifier = d["pending_verifier"]
        await asyncio.to_thread(flow.fetch_token, code=code)
        c = flow.credentials
        if SCOPE not in set(c.scopes or []):
            return RedirectResponse(f"{base}/config?tab=backup&drive=escopo")
        email = ""
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as h:
                r = await h.get("https://www.googleapis.com/oauth2/v2/userinfo", headers={"Authorization": f"Bearer {c.token}"})
                email = r.json().get("email", "") if r.status_code == 200 else ""
        except Exception:  # noqa: BLE001 - email is cosmetic
            pass
        await db.settings.update_one({"_id": "drive"}, {"$set": {
            "access_token": c.token, "refresh_token": c.refresh_token or d.get("refresh_token"), "scopes": list(c.scopes or []),
            "expiry": c.expiry.replace(tzinfo=timezone.utc) if c.expiry else None, "email": email, "folder_id": None,
            "connected_at": datetime.now(timezone.utc), "auto": d.get("auto", True)},
            "$unset": {"pending_state": "", "pending_verifier": ""}}, upsert=True)
        return RedirectResponse(f"{base}/config?tab=backup&drive=ok")
    except Exception as e:  # noqa: BLE001
        log.error("Drive OAuth callback failed: %s", type(e).__name__)
        return RedirectResponse(f"{base}/config?tab=backup&drive=erro")


@router.put("/drive/settings", response_model=OkOut)
async def drive_settings(body: DriveSettingsIn, _: dict = Depends(require())):
    await db.settings.update_one({"_id": "drive"}, {"$set": {"auto": body.auto}}, upsert=True)
    return OkOut(message="Backup automático " + ("ligado" if body.auto else "desligado"))


@router.delete("/drive", response_model=OkOut)
async def drive_disconnect(_: dict = Depends(require())):
    await db.settings.update_one({"_id": "drive"}, {"$unset": {"access_token": "", "refresh_token": "", "email": "", "folder_id": "", "expiry": ""}})
    return OkOut(message="Google Drive desconectado")


def _upload_sync(d: dict, name: str, content: bytes) -> tuple[str, str, dict]:
    """Blocking Google API calls (run in a thread). Returns (file_id, folder_id, refreshed token fields)."""
    from google.auth.transport.requests import Request as GReq
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload
    creds = Credentials(token=d.get("access_token"), refresh_token=d["refresh_token"], token_uri="https://oauth2.googleapis.com/token",
                        client_id=os.environ["GOOGLE_CLIENT_ID"], client_secret=os.environ["GOOGLE_CLIENT_SECRET"], scopes=d.get("scopes") or [SCOPE])
    if not creds.valid:
        creds.refresh(GReq())
    svc = build("drive", "v3", credentials=creds, cache_discovery=False)
    folder = d.get("folder_id")
    if folder:
        try:
            if svc.files().get(fileId=folder, fields="id,trashed").execute().get("trashed"):
                folder = None
        except Exception:  # noqa: BLE001 - folder deleted by the user
            folder = None
    if not folder:
        folder = svc.files().create(body={"name": FOLDER, "mimeType": "application/vnd.google-apps.folder"}, fields="id").execute()["id"]
    media = MediaIoBaseUpload(io.BytesIO(content), mimetype="application/json", resumable=True)
    fid = svc.files().create(body={"name": name, "parents": [folder]}, media_body=media, fields="id").execute()["id"]
    old = svc.files().list(q=f"'{folder}' in parents and trashed=false and name contains 'backup-espeteria-'", orderBy="createdTime desc",
                           fields="files(id)", pageSize=100).execute().get("files", [])
    for f in old[KEEP:]:
        try:
            svc.files().delete(fileId=f["id"]).execute()
        except Exception:  # noqa: BLE001
            pass
    return fid, folder, {"access_token": creds.token, "expiry": creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None}


async def run_drive_backup(trigger: str) -> DriveBackupInfo:
    from routers.config import build_backup
    d = await _doc()
    info = DriveBackupInfo(at=datetime.now(timezone.utc), trigger=trigger)
    try:
        if not _configured():
            raise RuntimeError("Credenciais do Google não cadastradas")
        if not d.get("refresh_token"):
            raise RuntimeError("Google Drive não conectado")
        stamp, payload = await build_backup()
        content = json.dumps(payload, ensure_ascii=False).encode()
        info.file_name, info.size_kb = f"backup-espeteria-{stamp}.json", max(1, len(content) // 1024)
        _fid, folder, tok = await asyncio.to_thread(_upload_sync, d, info.file_name, content)
        await db.settings.update_one({"_id": "drive"}, {"$set": {"folder_id": folder, **tok}})
        info.ok = True
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "invalid_grant" in msg:
            msg = "Acesso ao Google expirou ou foi revogado. Conecte o Google Drive novamente."
        info.error = msg[:300]
        log.warning("Drive backup failed (%s): %s", trigger, type(e).__name__)
    await db.settings.update_one({"_id": "drive"}, {"$push": {"history": {"$each": [info.model_dump()], "$position": 0, "$slice": 30}}}, upsert=True)
    return info


@router.post("/drive/backup-now", response_model=DriveBackupInfo)
async def drive_backup_now(_: dict = Depends(require())):
    info = await run_drive_backup("manual")
    if not info.ok:
        raise HTTPException(400, info.error or "Falha no backup")
    return info


# ---------- platform cron (.emergent/crons.yml) ----------
async def _nightly() -> None:
    d = await _doc()
    if d.get("auto", True) and d.get("refresh_token"):
        await run_drive_backup("automatico")


@router.post("/cron/nightly-backup", response_model=OkOut)
async def cron_nightly_backup(request: Request, tasks: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("authorization", "")
    if not secret or not auth.startswith("Bearer ") or not hmac.compare_digest(auth[7:], secret):
        raise HTTPException(401, "Unauthorized")
    try:
        env = await request.json()
    except Exception:  # noqa: BLE001
        env = {}
    if not isinstance(env, dict):
        raise HTTPException(400, "Invalid body")
    run_id = request.headers.get("x-webhook-id") or env.get("run_id") or datetime.now(timezone.utc).strftime("%Y%m%d")
    res = await db.cron_runs.update_one({"_id": f"nightly-backup:{run_id}"}, {"$setOnInsert": {"at": datetime.now(timezone.utc)}}, upsert=True)
    if res.upserted_id is None:
        return OkOut(message="duplicate")
    tasks.add_task(_nightly)
    return OkOut(message="queued")
