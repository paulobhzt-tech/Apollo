"""P45 financial scope guards. Real concurrency and balances are covered by HTTP acceptance."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from lib import cash_scope as cash
from lib import orders

@pytest.mark.parametrize("mode",["operator","shared"])
def test_scope_is_explicit_and_uses_authenticated_id(monkeypatch,mode):
    monkeypatch.setenv("APOLLO_CASH_MODE",mode)
    assert cash.cash_scope({"id":"cashier-a"})==({"operator_id":"cashier-a"} if mode=="operator" else {})

def test_independent_cash_is_default_and_unknown_mode_fails_closed(monkeypatch):
    monkeypatch.delenv("APOLLO_CASH_MODE",raising=False)
    assert cash.independent_cash()
    monkeypatch.setenv("APOLLO_CASH_MODE","typo")
    with pytest.raises(RuntimeError):
        cash.independent_cash()

def test_unidentified_operator_cannot_choose_register(monkeypatch):
    monkeypatch.setenv("APOLLO_CASH_MODE","operator")
    with pytest.raises(HTTPException) as error:
        cash.cash_scope({})
    assert error.value.status_code==403

@pytest.mark.asyncio
async def test_independent_lookup_filters_the_owner(monkeypatch):
    monkeypatch.setenv("APOLLO_CASH_MODE","operator")
    collection=SimpleNamespace(find_one=AsyncMock(return_value={"id":"cash-a"}))
    monkeypatch.setattr(orders,"db",SimpleNamespace(cash_sessions=collection))
    assert await orders.current_cash(operator_id="a")=={"id":"cash-a"}
    collection.find_one.assert_awaited_once_with({"status":"aberto","opened_by_id":"a"},{"_id":0})
    with pytest.raises(HTTPException) as error:
        await orders.current_cash()
    assert error.value.status_code==403

@pytest.mark.asyncio
async def test_independent_financial_write_requires_transaction(monkeypatch):
    monkeypatch.setenv("APOLLO_CASH_MODE","operator")
    with pytest.raises(HTTPException) as error:
        await cash.claim_cash({"id":"a","opened_by_id":"operator-a"})
    assert error.value.status_code==503

@pytest.mark.asyncio
async def test_close_conflict_rejects_receipt(monkeypatch):
    from lib import db as database
    monkeypatch.setenv("APOLLO_CASH_MODE","operator")
    collection=SimpleNamespace(update_one=AsyncMock(return_value=SimpleNamespace(modified_count=0)))
    monkeypatch.setattr(database,"db",SimpleNamespace(cash_sessions=collection))
    with pytest.raises(HTTPException) as error:
        await cash.claim_cash({"id":"a","opened_by_id":"operator-a"},session="transaction")
    assert error.value.status_code==409
    args=collection.update_one.call_args
    assert args.args[0]=={"id":"a","status":"aberto","opened_by_id":"operator-a"}
    assert args.kwargs["session"]=="transaction"

@pytest.mark.asyncio
async def test_mode_migration_refuses_standalone_or_unowned_open_shift(monkeypatch):
    from lib import db as database
    monkeypatch.setenv("APOLLO_CASH_MODE","operator")
    collection=SimpleNamespace(find_one=AsyncMock(return_value=None),create_index=AsyncMock(),drop_index=AsyncMock())
    fake=SimpleNamespace(command=AsyncMock(return_value={}),cash_sessions=collection)
    monkeypatch.setattr(database,"db",fake)
    with pytest.raises(RuntimeError,match="transações"):
        await cash.prepare_cash_mode()
    fake.command.return_value={"setName":"rs0"}
    collection.find_one.return_value={"id":"legacy","status":"aberto"}
    with pytest.raises(RuntimeError,match="compartilhado"):
        await cash.prepare_cash_mode()
    collection.drop_index.assert_not_awaited()

@pytest.mark.asyncio
async def test_mode_change_back_to_shared_refuses_open_independent_shift(monkeypatch):
    from lib import db as database
    monkeypatch.setenv("APOLLO_CASH_MODE","shared")
    fake=SimpleNamespace(cash_sessions=SimpleNamespace(find_one=AsyncMock(return_value={"id":"a","opened_by_id":"a"})))
    monkeypatch.setattr(database,"db",fake)
    with pytest.raises(RuntimeError,match="independentes"):
        await cash.prepare_cash_mode()
