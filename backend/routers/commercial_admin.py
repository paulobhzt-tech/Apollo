"""Commercial reseller and franchise registry: admin-only, no billing or activation.

Each location is explicitly scoped to a franchise. This registry deliberately does
not query restaurant operational collections before tenant isolation is enforced.
"""
import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.auth import require_platform_admin
from lib.db import db

router = APIRouter(prefix="/commercial/admin", tags=["commercial-admin"])


class ResellerIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254)
    commission_pct: float = Field(default=0, ge=0, le=100)
    active: bool = True


class FranchiseIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    reseller_id: str | None = None


class LocationIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    external_code: str | None = Field(default=None, max_length=80)


def normalize_email(email: str) -> str:
    email = email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(422, "E-mail do revendedor inválido")
    return email


def ensure_code(code: str | None) -> str | None:
    if code is None:
        return None
    value = code.strip()
    if not value or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
        raise HTTPException(422, "Código da unidade inválido")
    return value


@router.post("/resellers", status_code=201)
async def create_reseller(body: ResellerIn, _: dict = Depends(require_platform_admin)):
    email = normalize_email(body.email)
    if await db.commercial_resellers.find_one({"email": email}, {"_id": 0, "id": 1}):
        raise HTTPException(409, "Já existe revendedor com este e-mail")
    record = {"id": str(uuid.uuid4()), "name": body.name.strip(), "email": email,
              "commission_pct": body.commission_pct, "active": body.active,
              "created_at": datetime.now(timezone.utc)}
    # A unique database index is needed before production to eliminate concurrent inserts.
    await db.commercial_resellers.insert_one(dict(record))
    return record


@router.get("/resellers")
async def list_resellers(_: dict = Depends(require_platform_admin)):
    return await db.commercial_resellers.find({}, {"_id": 0}).sort("name", 1).to_list(1000)


@router.post("/franchises", status_code=201)
async def create_franchise(body: FranchiseIn, _: dict = Depends(require_platform_admin)):
    if body.reseller_id:
        reseller = await db.commercial_resellers.find_one({"id": body.reseller_id, "active": True})
        if not reseller:
            raise HTTPException(422, "Revendedor não encontrado ou inativo")
    record = {"id": str(uuid.uuid4()), "name": body.name.strip(),
              "reseller_id": body.reseller_id, "created_at": datetime.now(timezone.utc)}
    await db.commercial_franchises.insert_one(dict(record))
    return record


@router.get("/franchises")
async def list_franchises(_: dict = Depends(require_platform_admin)):
    return await db.commercial_franchises.find({}, {"_id": 0}).sort("name", 1).to_list(1000)


@router.post("/franchises/{franchise_id}/locations", status_code=201)
async def create_franchise_location(franchise_id: str, body: LocationIn, _: dict = Depends(require_platform_admin)):
    if not await db.commercial_franchises.find_one({"id": franchise_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Franquia não encontrada")
    code = ensure_code(body.external_code)
    if code and await db.commercial_locations.find_one({"franchise_id": franchise_id, "external_code": code}):
        raise HTTPException(409, "Código da unidade já utilizado nesta franquia")
    record = {"id": str(uuid.uuid4()), "franchise_id": franchise_id,
              "name": body.name.strip(), "external_code": code, "created_at": datetime.now(timezone.utc)}
    await db.commercial_locations.insert_one(dict(record))
    return record


@router.get("/franchises/{franchise_id}/locations")
async def list_franchise_locations(franchise_id: str, _: dict = Depends(require_platform_admin)):
    if not await db.commercial_franchises.find_one({"id": franchise_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Franquia não encontrada")
    return await db.commercial_locations.find({"franchise_id": franchise_id}, {"_id": 0}).sort("name", 1).to_list(1000)
