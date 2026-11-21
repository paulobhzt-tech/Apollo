"""Equivalent P32 recovery requirement, tested directly against the P45 implementation."""
import asyncio, json, os, sys, time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
assert os.environ["DB_NAME"]=="apollo_p40_browser_p45_recovery"
assert os.environ["MONGO_URL"].startswith("mongodb://127.0.0.1:")
assert os.environ.get("APOLLO_CASH_MODE")=="operator"
sys.path.insert(0,str(root/"backend"))
from lib.db import db
from lib.cash_scope import prepare_cash_mode
from routers import operations
from models.schemas import CashOpenIn, QuickSaleIn
actor={"id":"p40admin","name":"p40admin","role":"admin"}
body=QuickSaleIn(client_ref="p45-killed-transaction",items=[{"product_id":"p40product","qty":1}],
    payments=[{"method":"dinheiro","amount":10}],emit_invoice=False,send_to_kitchen=False)
ready=Path(os.environ["RUNNER_TEMP"])/"p45-uncommitted-ready"
async def child():
    original=operations.move_stock
    async def hold(*args,**kwargs):
        await original(*args,**kwargs)
        ready.write_text("Uncommitted financial and stock writes have executed")
        await asyncio.sleep(3600)
    operations.move_stock=hold
    await operations.quick_sale(body,actor)
async def parent():
    await prepare_cash_mode()
    await operations.cash_open(CashOpenIn(opening_amount=0),actor)
    ready.unlink(missing_ok=True)
    process=await asyncio.create_subprocess_exec(sys.executable,str(Path(__file__).resolve()),"--child",
        stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT)
    try:
        deadline=time.monotonic()+35
        while not ready.exists():
            if process.returncode is not None:
                raise AssertionError((await process.stdout.read()).decode())
            assert time.monotonic()<deadline,"Child transaction did not reach real stock write"
            await asyncio.sleep(.1)
        process.kill()
        await process.wait()
        assert await db.orders.count_documents({"client_ref":body.client_ref})==0
        assert (await db.ingredients.find_one({"id":"p40ing"}))["stock"]==100
        started=time.monotonic()
        deadline=started+100
        attempts=0
        while True:
            remaining=deadline-time.monotonic()
            assert remaining>0,"Same-reference recovery exceeded bounded 100-second window"
            attempts+=1
            try:
                result=await asyncio.wait_for(operations.quick_sale(body,actor),timeout=min(25,remaining))
                break
            except (asyncio.TimeoutError,operations.HTTPException) as exc:
                if isinstance(exc,operations.HTTPException):
                    assert exc.status_code in (409,503),str(exc)
                remaining=deadline-time.monotonic()
                assert remaining>0,"Recovery deadline exhausted"
                await asyncio.sleep(min(.5,remaining))
        elapsed=time.monotonic()-started
        replay=await operations.quick_sale(body,actor)
        assert result["order"]["id"]==replay["order"]["id"]
        assert await db.orders.count_documents({"client_ref":body.client_ref})==1
        assert await db.stock_moves.count_documents({"type":"venda","ingredient_id":"p40ing"})==1
        assert (await db.ingredients.find_one({"id":"p40ing"}))["stock"]==99
        assert (await db.purchases.find_one({"id":"p40lot"}))["remaining_qty"]==99
        cash=await operations.cash_current(actor)
        assert cash["expected_cash"]==10
        from models.schemas import CashCloseIn
        closed=await operations.cash_close(CashCloseIn(expected_session_id=cash["id"],counted_amount=10),actor)
        assert closed["difference"]==0
        result={"requirement":"P32 equivalent process-kill uncommitted transaction recovery",
            "candidate":os.environ["GITHUB_SHA"],"attempts":attempts,"recovery_seconds":elapsed,
            "overall_deadline_seconds":100,"unique_sales":1,"stock_moves":1,"stock":99,"lot_remaining":99,
            "cash_difference":0,"original_bundle_integrity":"NOT VERIFIED; no bytes available to this runner"}
        (root/"evidence/p45-p32-equivalent.json").write_text(json.dumps(result,indent=2))
        print(json.dumps(result),flush=True)
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
if __name__=="__main__":
    asyncio.run(child() if "--child" in sys.argv else parent())
