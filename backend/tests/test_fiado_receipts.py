import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from models.schemas import ReceiveIn
from routers import fiado


@pytest.fixture
def ledger(monkeypatch):
    customer = {"id": "client", "balance": 100, "credit_limit": 150}
    moves = {}

    async def get_customer(customer_id):
        snapshot = deepcopy(customer)
        await asyncio.sleep(0)
        return snapshot

    async def update(condition, changes, **kwargs):
        journal = customer.setdefault("fiado_journal", {})
        reversals = customer.setdefault("fiado_reversals", {})
        if customer["balance"] != condition["balance"]:
            return None
        for field in condition:
            if "." in field:
                parent, key = field.split(".")
                if key in customer[parent]:
                    return None
        for field, value in changes["$set"].items():
            if "." in field:
                parent, key = field.split(".")
                customer[parent][key] = value
            else:
                customer[field] = value
        return deepcopy(customer)

    async def publish(key, changes, **kwargs):
        moves.setdefault(key["_id"], changes["$setOnInsert"])

    monkeypatch.setattr(fiado, "get_customer", get_customer)
    monkeypatch.setattr(fiado, "db", SimpleNamespace(
        fiado_customers=SimpleNamespace(find_one_and_update=update),
        customer_moves=SimpleNamespace(update_one=publish),
    ))
    monkeypatch.setattr(fiado, "validate_methods", AsyncMock())
    monkeypatch.setattr(fiado, "current_cash", AsyncMock(return_value={"id": "cash"}))
    return customer, moves


async def test_two_cashiers_cannot_receive_more_than_balance(ledger):
    customer, moves = ledger
    results = await asyncio.gather(*[
        fiado.receive("client", ReceiveIn(client_ref=f"ref-{i}", amount=70, method="dinheiro"),
                      {"id": f"cashier-{i}", "name": f"Caixa {i}"})
        for i in range(2)
    ], return_exceptions=True)
    assert sum(isinstance(result, HTTPException) for result in results) == 1
    assert customer["balance"] == 30
    assert len(moves) == 1


async def test_retry_recovers_interrupted_history_projection(ledger, monkeypatch):
    customer, moves = ledger
    actor = {"id": "cashier", "name": "Caixa"}
    body = ReceiveIn(client_ref="saved-request", amount=25, method="dinheiro")
    publish = fiado.db.customer_moves.update_one
    monkeypatch.setattr(fiado.db.customer_moves, "update_one", AsyncMock(side_effect=ConnectionError))
    with pytest.raises(ConnectionError):
        await fiado.receive("client", body, actor)
    assert customer["balance"] == 75
    assert not moves
    monkeypatch.setattr(fiado.db.customer_moves, "update_one", publish)
    await fiado.receive("client", body, actor)
    await fiado.receive("client", body, actor)
    assert customer["balance"] == 75
    assert len(moves) == 1
    assert next(iter(moves.values()))["balance_after"] == 75
    with pytest.raises(HTTPException, match="Referência"):
        await fiado.receive("client", body.model_copy(update={"amount": 26}), actor)


async def test_manual_debt_cannot_be_reversed_twice(ledger):
    customer, moves = ledger
    admin = {"id": "admin", "name": "Admin"}
    await fiado.record_debt("client", fiado.DebtIn(client_ref="new", amount=30, reason="Dívida conferida"), admin)
    move = next(iter(moves.values()))
    await fiado.reverse_debt("client", move["id"], fiado.ReverseDebtIn(client_ref="reverse", reason="Duplicidade conferida"), admin)
    with pytest.raises(HTTPException, match="já estornada"):
        await fiado.reverse_debt("client", move["id"], fiado.ReverseDebtIn(client_ref="reverse-again", reason="Nova tentativa"), admin)
    assert customer["balance"] == 100
    assert len(moves) == 2
