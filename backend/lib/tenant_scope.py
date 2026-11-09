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



def _validate_safe_filter(filters: dict) -> None:
    """Reject nested Mongo operators and ambiguous field paths from user filters."""
    for key, value in filters.items():
        if not isinstance(key, str) or not key or key.startswith("$") or "." in key or "\\x00" in key:
            raise HTTPException(422, "Campo de filtro não permitido")
        if isinstance(value, dict):
            # Query operators can also be hidden under otherwise valid fields.
            _validate_safe_filter(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, (dict, list)):
                    raise HTTPException(422, "Estrutura de filtro não permitida")


def tenant_query(user: dict, filters: dict | None = None) -> dict:
    """Force the authenticated tenant into MongoDB queries, rejecting override attempts."""
    tenant_id = tenant_id_for_user(user)
    filters = dict(filters or {})
    if "tenant_id" in filters and filters["tenant_id"] != tenant_id:
        raise HTTPException(403, "Acesso a outro restaurante não permitido")
    _validate_safe_filter(filters)
    return {"$and": [{"tenant_id": tenant_id}, filters]} if filters else {"tenant_id": tenant_id}


def require_same_tenant(user: dict, record: dict | None) -> dict:
    if not record:
        raise HTTPException(404, "Registro não encontrado")
    tenant_id = tenant_id_for_user(user)
    if record.get("tenant_id") != tenant_id:
        # Avoid revealing whether a record exists in another restaurant.
        raise HTTPException(404, "Registro não encontrado")
    return record
