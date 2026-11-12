"""Integration checks for joining open table orders; test database only."""
import asyncio
import uuid
import pytest
from fastapi import HTTPException
from lib.db import db
from models.schemas import Order, OrderItem, Table, TransferIn
from routers import tables
from routers.tables import MergeTablesIn, merge_tables

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_transfer_rolls_back_then_allows_only_one_concurrent_destination(monkeypatch):
    suffix = uuid.uuid4().hex
    source, first, second = [f"transfer-{suffix}-{i}" for i in range(3)]
    order_id = f"transfer-order-{suffix}"
    ticket_id = f"transfer-ticket-{suffix}"
    request = {"order_id": order_id, "subtotal": 25}
    await db.tables.insert_many([
        {"id": source, "number": 871, "status": "conta", "order_id": order_id,
         "split_request": request, "total": 25},
        Table(id=first, number=872).model_dump(),
        Table(id=second, number=873).model_dump(),
    ])
    await db.orders.insert_one(Order(id=order_id, number=871, channel="mesa", source="mesa",
                                     table_id=source, table_number=871, total=25).model_dump())
    await db.kitchen_tickets.insert_one({"id": ticket_id, "order_id": order_id,
                                         "label": "Mesa 871"})
    try:
        async def fail_before_releasing(*args, **kwargs):
            raise RuntimeError("Falha simulada antes de liberar a mesa")

        with monkeypatch.context() as patch:
            patch.setattr(tables, "free_table", fail_before_releasing)
            with pytest.raises(RuntimeError, match="Falha simulada"):
                await tables.transfer(source, TransferIn(target_table_id=first), {})
        assert (await db.tables.find_one({"id": source}))["order_id"] == order_id
        assert (await db.tables.find_one({"id": first}))["order_id"] is None
        assert (await db.orders.find_one({"id": order_id}))["table_id"] == source
        assert (await db.kitchen_tickets.find_one({"id": ticket_id}))["label"] == "Mesa 871"

        results = await asyncio.gather(
            tables.transfer(source, TransferIn(target_table_id=first), {}),
            tables.transfer(source, TransferIn(target_table_id=second), {}),
            return_exceptions=True,
        )
        transferred = [result for result in results if isinstance(result, dict)]
        assert len(transferred) == 1, results
        destination = transferred[0]
        assert destination["split_request"] == request
        assert destination["total"] == 25
        assert await db.tables.count_documents({"order_id": order_id}) == 1
        assert (await db.tables.find_one({"id": source}))["status"] == "livre"
        assert (await db.orders.find_one({"id": order_id}))["table_id"] == destination["id"]
        assert (await db.kitchen_tickets.find_one({"id": ticket_id}))["label"] == f"Mesa {destination['number']}"
    finally:
        await db.tables.delete_many({"id": {"$in": [source, first, second]}})
        await db.orders.delete_one({"id": order_id})
        await db.kitchen_tickets.delete_one({"id": ticket_id})


async def test_merge_moves_items_and_releases_source_without_duplicate_sales():
    suffix = uuid.uuid4().hex
    source_id, target_id = "merge-src-" + suffix, "merge-dst-" + suffix
    source_order_id, target_order_id = "merge-order-src-" + suffix, "merge-order-dst-" + suffix
    src = Table(id=source_id, number=881, status="ocupada", order_id=source_order_id, total=20).model_dump()
    dst = Table(id=target_id, number=882, status="ocupada", order_id=target_order_id, total=30).model_dump()
    so = Order(id=source_order_id, number=881, channel="mesa", source="mesa", table_id=source_id,
               items=[OrderItem(id="src-" + suffix, product_id="test", name="Espetinho", qty=2, unit_price=10, unit_cost=4)],
               subtotal=20, total=20).model_dump()
    to = Order(id=target_order_id, number=882, channel="mesa", source="mesa", table_id=target_id,
               items=[OrderItem(id="dst-" + suffix, product_id="test", name="Porção", qty=1, unit_price=30, unit_cost=12)],
               subtotal=30, total=30).model_dump()
    await db.tables.insert_many([src, dst])
    await db.orders.insert_many([so, to])
    try:
        result = await merge_tables(source_id, MergeTablesIn(target_table_id=target_id), {})
        assert result["id"] == target_id
        assert result["total"] == 50
        source_after = await db.tables.find_one({"id": source_id})
        assert source_after["status"] == "livre"
        assert source_after["order_id"] is None
        target_after = await db.orders.find_one({"id": target_order_id})
        assert target_after["status"] == "aberto"
        assert target_after["subtotal"] == 50
        assert target_after["cmv"] == 20
        assert len(target_after["items"]) == 2
        original_after = await db.orders.find_one({"id": source_order_id})
        assert original_after["status"] == "cancelado"
        assert original_after["merged_into_order_id"] == target_order_id
        assert await db.orders.count_documents({"id": {"$in": [source_order_id, target_order_id]}, "status": "pago"}) == 0
        with pytest.raises(HTTPException):
            await merge_tables(source_id, MergeTablesIn(target_table_id=target_id), {})
    finally:
        await db.orders.delete_many({"id": {"$in": [source_order_id, target_order_id]}})
        await db.tables.delete_many({"id": {"$in": [source_id, target_id]}})


async def test_merge_rejects_partially_paid_order_without_changing_tables():
    suffix = uuid.uuid4().hex
    ids = ["paid-src-" + suffix, "paid-dst-" + suffix]
    orders = ["paid-order-src-" + suffix, "paid-order-dst-" + suffix]
    await db.tables.insert_many([Table(id=ids[i], number=890+i, status="ocupada", order_id=orders[i]).model_dump() for i in range(2)])
    await db.orders.insert_many([
        {**Order(id=orders[i], number=890+i, channel="mesa", source="mesa", table_id=ids[i]).model_dump(),
         **({"payments": [{"method": "pix", "amount": 10}]} if i == 0 else {})} for i in range(2)])
    try:
        with pytest.raises(HTTPException) as error:
            await merge_tables(ids[0], MergeTablesIn(target_table_id=ids[1]), {})
        assert error.value.status_code == 400
        assert (await db.tables.find_one({"id": ids[0]}))["order_id"] == orders[0]
        assert (await db.tables.find_one({"id": ids[1]}))["order_id"] == orders[1]
    finally:
        await db.orders.delete_many({"id": {"$in": orders}})
        await db.tables.delete_many({"id": {"$in": ids}})


async def test_concurrent_table_open_does_not_replace_the_winning_order():
    suffix = uuid.uuid4().hex
    table = Table(id=f"open-race-{suffix}", number=875).model_dump()
    await db.tables.insert_one(dict(table))
    try:
        results = await asyncio.gather(
            tables.get_or_open_order({**table, "people": 2}, {"id": "a", "name": "A"}, opening_customer="Ana"),
            tables.get_or_open_order({**table, "people": 3}, {"id": "b", "name": "B"}, opening_customer="Bia"),
            return_exceptions=True,
        )
        winners = [result for result in results if isinstance(result, dict)]
        assert len(winners) == 1, results
        conflicts = [result for result in results if isinstance(result, HTTPException)]
        assert len(conflicts) == 1 and conflicts[0].status_code == 409
        updated = await db.tables.find_one({"id": table["id"]})
        assert updated["order_id"] == winners[0]["id"]
        expected = ("Ana", 2) if winners[0]["waiter_id"] == "a" else ("Bia", 3)
        assert (updated["customer_name"], updated["people"]) == expected
        assert await db.orders.count_documents({"table_id": table["id"], "status": "aberto"}) == 1
    finally:
        await db.orders.delete_many({"table_id": table["id"]})
        await db.tables.delete_one({"id": table["id"]})
