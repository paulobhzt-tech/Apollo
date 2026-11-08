"""Tenant isolation regression tests: never trust client-selected restaurant IDs."""
import pytest
from fastapi import HTTPException
from lib.tenant_scope import tenant_id_for_user, tenant_query, require_same_tenant


def test_tenant_query_is_scoped_to_authenticated_user():
    assert tenant_query({"tenant_id": "restaurant-a"}, {"status": "open"}) == {
        "$and": [{"tenant_id": "restaurant-a"}, {"status": "open"}]
    }


def test_tenant_override_is_rejected():
    with pytest.raises(HTTPException) as exc:
        tenant_query({"tenant_id": "restaurant-a"}, {"tenant_id": "restaurant-b"})
    assert exc.value.status_code == 403


def test_missing_tenant_fails_closed():
    with pytest.raises(HTTPException) as exc:
        tenant_id_for_user({"role": "admin"})
    assert exc.value.status_code == 403


def test_query_operators_are_rejected():
    with pytest.raises(HTTPException) as exc:
        tenant_query({"tenant_id": "restaurant-a"}, {"$or": [{"tenant_id": "restaurant-b"}]})
    assert exc.value.status_code == 422


def test_cross_tenant_record_does_not_disclose_existence():
    with pytest.raises(HTTPException) as exc:
        require_same_tenant({"tenant_id": "restaurant-a"}, {"tenant_id": "restaurant-b", "id": "secret"})
    assert exc.value.status_code == 404


def test_same_tenant_record_allowed():
    record = {"tenant_id": "restaurant-a", "id": "order-1"}
    assert require_same_tenant({"tenant_id": "restaurant-a"}, record) is record
