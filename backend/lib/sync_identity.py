"""Authenticated sync identity for a database installation and its operator.

The reserved installation identity is never imported by restore. Existing deployments
without tenant_id use the installation as establishment; this does not turn legacy
business collections into a shared multi-tenant database.
"""
import uuid
from fastapi import HTTPException
from lib.db import db


async def sync_context(user: dict) -> dict:
    if not user.get("id"):
        raise HTTPException(401, "Operador não autenticado")
    identity = await db.settings.find_one_and_update(
        {"_id": "sync_identity"}, {"$setOnInsert": {"server_id": uuid.uuid4().hex}},
        projection={"_id": 0, "server_id": 1}, upsert=True, return_document=True)
    if not identity or not identity.get("server_id"):
        raise HTTPException(503, "Identidade de sincronização indisponível")
    return {"server_id": identity["server_id"],
            "establishment_id": user.get("tenant_id") or identity["server_id"],
            "operator_id": user["id"]}


async def validate_sync_context(context, user: dict):
    if context is not None and context.model_dump() != await sync_context(user):
        raise HTTPException(403, "Fila pertence a outro estabelecimento, servidor ou operador. Nenhuma venda foi processada.")
