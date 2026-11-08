"""Fail-closed tenant scope primitives for future multi-restaurant routes.

Operational collections are not tenant-isolated yet. New multi-tenant endpoints
must explicitly use these guards and filter all database queries by tenant_id.
"""
from fastapi import HTTPException


def tenant_id_for_user(user: dict) -> str:
    tenant_id = user.get("tenant_id")
    if not isinstance(tenant_id, str) or not tenant_id.strip():
        raise HTTPException(403, "Usuário sem vínculo com restaurante")
    return tenant_id.strip()


def tenant_query(user: dict, filters: dict | None = None) -> dict:
    """Force the authenticated tenant into MongoDB queries, rejecting override attempts."""
    tenant_id = tenant_id_for_user(user)
    filters = dict(filters or {})
    if "tenant_id" in filters and filters["tenant_id"] != tenant_id:
        raise HTTPException(403, "Acesso a outro restaurante não permitido")
    if any(key.startswith("$") for key in filters):
        raise HTTPException(422, "Operadores de consulta não permitidos neste filtro")
    return {"$and": [{"tenant_id": tenant_id}, filters]} if filters else {"tenant_id": tenant_id}


def require_same_tenant(user: dict, record: dict | None) -> dict:
    if not record:
        raise HTTPException(404, "Registro não encontrado")
    tenant_id = tenant_id_for_user(user)
    if record.get("tenant_id") != tenant_id:
        # Avoid revealing whether a record exists in another restaurant.
        raise HTTPException(404, "Registro não encontrado")
    return record
