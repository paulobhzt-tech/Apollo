"""Integration checks for joining open table orders; test database only."""
import uuid
import pytest
from fastapi import HTTPException
from lib.db import db
from models.schemas import Order, OrderItem, Table
from routers.tables import MergeTablesIn, merge_tables

pytestmark = pytest.mark.asyncio(loop_scope="session")


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
