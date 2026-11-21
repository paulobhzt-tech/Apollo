"""Verify admission control without replacing transactional integration tests."""
import asyncio
import pytest
from lib.counter_sale_gate import counter_sale_gate, _locks

@pytest.mark.asyncio
async def test_same_operator_waits_while_other_operator_proceeds():
    entered = asyncio.Event()
    release = asyncio.Event()
    second_entered = asyncio.Event()
    async def first():
        async with counter_sale_gate("cashier-a"):
            entered.set()
            await release.wait()
    async def second():
        await entered.wait()
        async with counter_sale_gate("cashier-a"):
            second_entered.set()
    first_task = asyncio.create_task(first())
    second_task = asyncio.create_task(second())
    await entered.wait()
    try:
        async with asyncio.timeout(1):
            async with counter_sale_gate("cashier-b"):
                assert not second_entered.is_set()
    finally:
        release.set()
        await asyncio.gather(first_task, second_task)
    assert second_entered.is_set()
    assert "cashier-a" not in _locks and "cashier-b" not in _locks

@pytest.mark.asyncio
async def test_cancelled_waiter_does_not_block_following_receipt():
    async with counter_sale_gate("cancelled-cashier"):
        async def wait():
            async with counter_sale_gate("cancelled-cashier"):
                raise AssertionError("cancelled waiter entered")
        task = asyncio.create_task(wait())
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    async with asyncio.timeout(1):
        async with counter_sale_gate("cancelled-cashier"):
            pass
