"""Real ASGI routes, session resolution and role guards; only persistence is mocked.

No live server, production database, dependency overrides or real credentials.
"""
import asyncio
import copy
import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from pymongo import ReturnDocument

from lib import auth as security
from lib import orders as domain
from lib.csrf import CsrfOriginMiddleware
from models.schemas import Bill, Invoice, Order, OrderItem, Table
from routers import auth, config, finance, operations, reports, tables


BILL = {"kind": "pagar", "description": "Test bill", "amount": 10, "due_date": "2026-11-01"}
PAY = {"paid_date": "2026-11-01", "paid_amount": 10, "payment_method": "pix"}
ADMIN_ROUTES = [
    ("GET", "/employees", None),
    ("POST", "/employees", {"name": "Test employee", "role": "admin", "pin": "000000"}),
    ("PUT", "/employees/other", {"role": "admin", "can_cancel": True}),
    ("DELETE", "/employees/other", None),
    ("PUT", "/settings/general", {"pix_key": "synthetic-test-key"}),
    ("GET", "/backup", None),
    ("POST", "/backup/restore", {"data": {"orders": [{"id": "test"}]}}),
    ("POST", "/bills", BILL),
    ("PUT", "/bills/test", BILL),
    ("DELETE", "/bills/test", None),
    ("POST", "/bills/test/reopen", None),
    ("POST", "/bills/test/cancel", None),
    ("POST", "/payment-methods", {"name": "Test method"}),
    ("PUT", "/payment-methods/test", {"name": "Test method"}),
    ("DELETE", "/payment-methods/test", None),
    ("POST", "/account-categories", {"name": "Test category", "kind": "pagar"}),
    ("PUT", "/account-categories/test", {"name": "Test category", "kind": "pagar"}),
    ("DELETE", "/account-categories/test", None),
    ("GET", "/reports/dre", None),
    ("GET", "/expenses", None),
    ("POST", "/expenses", {"description": "Test expense", "category": "outros", "amount": 10, "date": "2026-11-01"}),
    ("DELETE", "/expenses/test", None),
]
CASHIER_ROUTES = [
    ("GET", "/orders", None),
    ("GET", "/invoices", None),
    ("GET", "/invoices/test", None),
    ("POST", "/orders/test/invoice", {}),
    ("GET", "/cash/current", None),
    ("GET", "/cash/history", None),
    ("POST", "/cash/open", {"opening_amount": 0}),
    ("POST", "/cash/close", {"counted_amount": 0}),
    ("POST", "/cash/movement", {"type": "sangria", "amount": 10, "note": "test"}),
    ("GET", "/bills", None),
    ("GET", "/bills/summary", None),
    ("GET", "/bills/alerts", None),
    ("POST", "/bills/test/pay", PAY),
    ("POST", "/pdv/sale", {"client_ref": "test-sale", "items": [{"product_id": "test", "qty": 1}],
                            "payments": [{"method": "pix", "amount": 10}]}),
    ("GET", "/delivery/orders", None),
]
CANCEL_ROUTES = [
    "/orders/test/cancel",
    "/orders/test/items/item/refund",
    "/tables/test/cancel",
    "/tables/test/items/item/cancel",
]


def collection():
    result = MagicMock()
    for name in ("find_one", "find_one_and_update", "insert_one", "update_one", "update_many",
                 "delete_one", "delete_many", "count_documents"):
        setattr(result, name, AsyncMock(return_value=None))
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[])
    result.find.return_value = cursor
    result.update_one.return_value = SimpleNamespace(modified_count=1, matched_count=1)
    return result


@pytest.fixture
def harness(monkeypatch):
    names = ("employees", "sessions", "login_attempts", "orders", "invoices", "tables", "bills",
             "cash_sessions", "settings", "expenses", "account_categories", "payment_methods",
             "kitchen_tickets")
    db = SimpleNamespace(**{name: collection() for name in names})
    actors = {role: {"id": role, "name": f"Test {role}", "role": role, "active": True,
                     "can_cancel": False} for role in ("admin", "caixa", "garcom", "cozinha")}
    # A cancellation grant must never grant administrative or financial access.
    actors["delegated"] = {**actors["garcom"], "id": "delegated", "can_cancel": True}
    sessions = {hashlib.sha256(f"test-{name}".encode()).hexdigest(): {
        "employee_id": name, "expires_at": datetime.now(timezone.utc) + timedelta(hours=1)
    } for name in actors}

    async def session_find(query):
        return copy.deepcopy(sessions.get(query["$or"][0]["token_hash"]))

    async def employee_find(query, projection=None):
        employee = actors.get(query.get("id"))
        return copy.deepcopy(employee) if employee and employee["active"] else None

    db.sessions.find_one.side_effect = session_find
    db.employees.find_one.side_effect = employee_find
    attempts = {}

    async def reserve(query, update, **kwargs):
        assert kwargs == {"upsert": True, "return_document": ReturnDocument.AFTER}
        assert update["$inc"] == {"attempts": 1}
        assert update["$setOnInsert"]["expires_at"].tzinfo is not None
        key = query["_id"]
        attempts[key] = attempts.get(key, 0) + 1
        return {"attempts": attempts[key]}

    async def release(query, update):
        assert update == {"$inc": {"attempts": -1}}
        attempts[query["_id"]] -= 1

    db.login_attempts.find_one_and_update.side_effect = reserve
    db.login_attempts.update_one.side_effect = release
    item = OrderItem(id="item", product_id="test", name="Test item", qty=1, unit_price=10)
    order = Order(id="test", number=1, channel="mesa", source="mesa", items=[item],
                  subtotal=10, total=10).model_dump()
    table = Table(id="test", number=1, order_id="test", status="ocupada").model_dump()
    db.orders.find_one.return_value = order
    db.tables.find_one.return_value = table
    db.invoices.find_one.return_value = Invoice(id="test", number=1, doc_type="nfce",
        access_key="0" * 44, protocol="test", order_id="test", order_number=1,
        total=10, items=[], payments=[], customer_cpf="synthetic-customer").model_dump()
    db.bills.find_one.return_value = Bill(id="test", **BILL).model_dump()
    db.bills.find_one_and_update.return_value = Bill(id="test", **BILL, status="pago", **PAY).model_dump()
    db.bills.delete_one.return_value = SimpleNamespace(deleted_count=1)
    for module in (security, domain, auth, config, finance, operations, reports, tables):
        monkeypatch.setattr(module, "db", db)
    async def unit_transaction(callback):
        return await callback(object())
    monkeypatch.setattr(operations, "run_transaction", unit_transaction)
    monkeypatch.setattr(operations, "move_stock", AsyncMock())
    monkeypatch.setattr(operations, "free_table", AsyncMock())
    monkeypatch.setattr(tables, "move_stock", AsyncMock())
    monkeypatch.setattr(tables, "free_table", AsyncMock())
    monkeypatch.setattr(tables, "refresh_totals", AsyncMock(return_value=order))
    monkeypatch.setattr(operations, "refresh_totals", AsyncMock(return_value=order))
    real_lookup = security.find_employee_by_pin
    lookup = AsyncMock(return_value=None)
    monkeypatch.setattr(security, "find_employee_by_pin", lookup)
    app = FastAPI()
    app.add_middleware(CsrfOriginMiddleware)
    for module in (auth, finance, operations, tables, config, reports):
        app.include_router(module.router, prefix="/api")
    return SimpleNamespace(app=app, db=db, actors=actors, sessions=sessions, attempts=attempts,
                           lookup=lookup, real_lookup=real_lookup, order=order)


async def request(harness, role, method, path, body=None, token=None):
    headers = {"Origin": "https://test"}
    if role is not None:
        headers["Cookie"] = f"{security.COOKIE}={token or 'test-' + role}"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=harness.app),
                                base_url="https://test") as client:
        return await client.request(method, "/api" + path, json=body, headers=headers)


def assert_no_business_access(harness):
    for name, coll in vars(harness.db).items():
        if name not in ("employees", "sessions"):
            assert not coll.mock_calls, name
    # Employee lookup is needed for authentication, but management must not run.
    assert harness.db.employees.find_one.await_count == 1
    for name in ("find", "insert_one", "update_one", "delete_one", "delete_many", "find_one_and_update"):
        assert not getattr(harness.db.employees, name).called, name


@pytest.mark.parametrize("role", ["caixa", "garcom", "cozinha", "delegated"])
@pytest.mark.parametrize("method,path,body", ADMIN_ROUTES)
async def test_admin_routes_forbid_limited_roles_without_data_access(harness, role, method, path, body):
    response = await request(harness, role, method, path, body)
    assert response.status_code == 403, response.text
    assert_no_business_access(harness)


@pytest.mark.parametrize("role", ["garcom", "cozinha", "delegated"])
@pytest.mark.parametrize("method,path,body", CASHIER_ROUTES)
async def test_cashier_routes_forbid_limited_roles_without_data_access(harness, role, method, path, body):
    response = await request(harness, role, method, path, body)
    assert response.status_code == 403, response.text
    assert_no_business_access(harness)


@pytest.mark.parametrize("role", ["admin", "caixa"])
async def test_authorized_invoice_detail_remains_available(harness, role):
    response = await request(harness, role, "GET", "/invoices/test")
    assert response.status_code == 200
    assert response.json()["id"] == "test"
    harness.db.invoices.find_one.assert_awaited_once_with({"id": "test"}, {"_id": 0})


@pytest.mark.parametrize("role,expected", [("admin", 404), ("caixa", 404), ("garcom", 403), ("cozinha", 403)])
async def test_invoice_permission_checked_before_existence(harness, role, expected):
    harness.db.invoices.find_one.return_value = None
    assert (await request(harness, role, "GET", "/invoices/missing")).status_code == expected


@pytest.mark.parametrize("role", ["admin", "caixa"])
async def test_cashier_can_still_pay_bills_and_read_sales(harness, role):
    assert (await request(harness, role, "POST", "/bills/test/pay", PAY)).status_code == 200
    harness.db.bills.find_one_and_update.assert_awaited_once()
    assert (await request(harness, role, "GET", "/orders")).status_code == 200


@pytest.mark.parametrize("role", ["admin", "caixa"])
async def test_authorized_cash_open_remains_available(harness, monkeypatch, role):
    monkeypatch.setattr(operations, "current_cash", AsyncMock(return_value=None))
    response = await request(harness, role, "POST", "/cash/open", {"opening_amount": 20})
    assert response.status_code == 200
    assert response.json()["opening_amount"] == 20
    assert response.json()["opened_by_name"] == harness.actors[role]["name"]
    harness.db.cash_sessions.insert_one.assert_awaited_once()


async def test_admin_can_still_manage_settings_employees_and_bills(harness):
    assert (await request(harness, "admin", "PUT", "/settings/general", {})).status_code == 200
    harness.db.settings.update_one.assert_awaited_once()
    assert (await request(harness, "admin", "GET", "/employees")).status_code == 200
    assert (await request(harness, "admin", "POST", "/bills", BILL)).status_code == 200
    harness.db.bills.insert_one.assert_awaited_once()
    assert (await request(harness, "admin", "DELETE", "/bills/test")).status_code == 200
    harness.db.bills.delete_one.assert_awaited_once()


@pytest.mark.parametrize("role", ["admin", "caixa", "garcom", "cozinha"])
async def test_operational_catalog_and_settings_reads_are_preserved(harness, role):
    assert (await request(harness, role, "GET", "/payment-methods")).status_code == 200
    assert (await request(harness, role, "GET", "/settings/general")).status_code == 200
    assert (await request(harness, role, "GET", "/auth/me")).json()["role"] == role


@pytest.mark.parametrize("path", ["/invoices/test", "/employees", "/cash/current", "/bills"])
async def test_missing_session_still_requires_authentication(harness, path):
    assert (await request(harness, None, "GET", path)).status_code == 401


async def test_role_downgrade_is_effective_for_existing_session(harness):
    assert (await request(harness, "admin", "GET", "/invoices/test")).status_code == 200
    harness.actors["admin"]["role"] = "garcom"
    assert (await request(harness, "admin", "GET", "/invoices/test")).status_code == 403
    harness.actors["admin"]["active"] = False
    assert (await request(harness, "admin", "GET", "/invoices/test")).status_code == 401


async def test_expired_session_cannot_read_invoice(harness):
    key = hashlib.sha256(b"test-admin").hexdigest()
    harness.sessions[key]["expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert (await request(harness, "admin", "GET", "/invoices/test")).status_code == 401
    harness.db.invoices.find_one.assert_not_awaited()


@pytest.mark.parametrize("manager,expected", [("admin", 200), ("delegated", 200), ("cozinha", 403)])
async def test_real_pin_lookup_requires_active_authorized_employee(harness, monkeypatch, manager, expected):
    monkeypatch.setattr(security, "find_employee_by_pin", harness.real_lookup)
    employee_find = harness.db.employees.find_one.side_effect
    pin = "654321"  # Synthetic fixture only; never read credentials from the environment.

    async def lookup(query, projection=None):
        if "pin_hash" in query:
            assert query["active"] is True
            if query["pin_hash"] == security.hash_pin(pin):
                return {**harness.actors[manager], "pin_hash": security.hash_pin(pin)}
            return None
        return await employee_find(query, projection)

    harness.db.employees.find_one.side_effect = lookup
    response = await request(harness, "garcom", "POST", "/orders/test/cancel",
                             {"reason": "Test cancellation", "manager_pin": pin})
    assert response.status_code == expected
    if expected == 403:
        harness.db.orders.update_one.assert_not_awaited()


@pytest.mark.parametrize("path", CANCEL_ROUTES)
@pytest.mark.parametrize("pin", [None, "wrong-test-pin", "unauthorized-test-pin"])
async def test_cancel_without_permission_is_403_and_does_not_mutate(harness, path, pin):
    if pin == "unauthorized-test-pin":
        harness.lookup.return_value = harness.actors["cozinha"]
    response = await request(harness, "garcom", "POST", path, {"reason": "Test cancellation", "manager_pin": pin})
    assert response.status_code == 403
    for name in ("orders", "tables", "invoices", "kitchen_tickets"):
        for method in ("update_one", "update_many", "delete_one", "delete_many"):
            assert not getattr(getattr(harness.db, name), method).called
    operations.move_stock.assert_not_awaited()
    tables.move_stock.assert_not_awaited()


@pytest.mark.parametrize("role", ["admin", "delegated"])
@pytest.mark.parametrize("path", CANCEL_ROUTES)
async def test_direct_cancel_permission_remains_available(harness, role, path):
    response = await request(harness, role, "POST", path, {"reason": "Test cancellation"})
    assert response.status_code == 200, response.text
    harness.lookup.assert_not_awaited()
    harness.db.login_attempts.find_one_and_update.assert_not_awaited()


@pytest.mark.parametrize("path", CANCEL_ROUTES)
@pytest.mark.parametrize("manager", ["admin", "delegated"])
async def test_manager_approval_remains_available(harness, path, manager):
    harness.lookup.return_value = harness.actors[manager]
    response = await request(harness, "garcom", "POST", path,
                             {"reason": "Test cancellation", "manager_pin": "valid-test-pin"})
    assert response.status_code == 200, response.text
    assert sum(harness.attempts.values()) == 0


async def test_pin_budget_is_shared_across_cancel_routes_and_sessions(harness):
    body = {"reason": "Test cancellation", "manager_pin": "wrong-test-pin"}
    for i in range(security.LOGIN_LIMIT):
        assert (await request(harness, "garcom", "POST", CANCEL_ROUTES[i % 4], body)).status_code == 403
    # New session cookie for the same employee does not create a fresh budget.
    harness.sessions[hashlib.sha256(b"second-test-session").hexdigest()] = {
        "employee_id": "garcom", "expires_at": datetime.now(timezone.utc) + timedelta(hours=1)}
    harness.lookup.return_value = harness.actors["admin"]
    response = await request(harness, "garcom", "POST", CANCEL_ROUTES[0], body, token="second-test-session")
    assert response.status_code == 429
    assert harness.lookup.await_count == security.LOGIN_LIMIT
    harness.db.orders.update_one.assert_not_awaited()
    harness.db.tables.update_one.assert_not_awaited()


async def test_pin_budget_is_atomic_under_concurrent_requests(harness):
    async def delayed_lookup(pin):
        await asyncio.sleep(0)  # Keep credential lookups in flight concurrently.
        return None

    harness.lookup.side_effect = delayed_lookup

    async def approve():
        try:
            await security.cancel_authorizer(harness.actors["garcom"], "wrong-test-pin")
        except HTTPException as exc:
            return exc.status_code
    statuses = await asyncio.gather(*(approve() for _ in range(20)))
    assert statuses.count(403) == security.LOGIN_LIMIT
    assert statuses.count(429) == 20 - security.LOGIN_LIMIT
    assert harness.lookup.await_count == security.LOGIN_LIMIT


async def test_direct_grant_does_not_depend_on_exhausted_pin_budget(harness):
    for _ in range(security.LOGIN_LIMIT + 1):
        with pytest.raises(HTTPException):
            await security.cancel_authorizer(harness.actors["garcom"], "wrong-test-pin")
    harness.actors["garcom"]["can_cancel"] = True
    response = await request(harness, "garcom", "POST", "/orders/test/cancel",
                             {"reason": "Test cancellation"})
    assert response.status_code == 200
    assert harness.lookup.await_count == security.LOGIN_LIMIT


async def test_successful_approvals_do_not_exhaust_budget(harness):
    harness.lookup.return_value = harness.actors["admin"]
    for _ in range(security.LOGIN_LIMIT + 2):
        assert await security.cancel_authorizer(harness.actors["garcom"], "valid-test-pin") == "Test admin"
    assert sum(harness.attempts.values()) == 0


async def test_success_does_not_erase_previous_failed_attempts(harness):
    with pytest.raises(HTTPException) as error:
        await security.cancel_authorizer(harness.actors["garcom"], "wrong-test-pin")
    assert error.value.status_code == 403
    harness.lookup.return_value = harness.actors["admin"]
    await security.cancel_authorizer(harness.actors["garcom"], "valid-test-pin")
    assert sum(harness.attempts.values()) == 1


async def test_budget_is_separate_for_other_operators_and_login(harness):
    for _ in range(security.LOGIN_LIMIT):
        with pytest.raises(HTTPException):
            await security.cancel_authorizer(harness.actors["garcom"], "wrong-test-pin")
    harness.lookup.return_value = harness.actors["admin"]
    assert await security.cancel_authorizer(harness.actors["caixa"], "valid-test-pin") == "Test admin"
    assert all(key.startswith("cancel:") for key in harness.attempts)
    harness.db.login_attempts.find_one.assert_not_awaited()


async def test_budget_resets_in_next_window(harness, monkeypatch):
    class Clock(datetime):
        instant = datetime(2026, 11, 1, tzinfo=timezone.utc)

        @classmethod
        def now(cls, tz=None):
            return cls.instant

    monkeypatch.setattr(security, "datetime", Clock)
    for _ in range(security.LOGIN_LIMIT + 1):
        with pytest.raises(HTTPException):
            await security.cancel_authorizer(harness.actors["garcom"], "wrong-test-pin")
    Clock.instant += timedelta(seconds=security.LOGIN_WINDOW)
    harness.lookup.return_value = harness.actors["admin"]
    assert await security.cancel_authorizer(harness.actors["garcom"], "valid-test-pin") == "Test admin"
