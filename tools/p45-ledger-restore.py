"""Restore the actual P45 financial acceptance backup into a NEW disposable database only."""
import asyncio,json,os,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
assert os.environ["DB_NAME"]=="apollo_restore_test_p45_ledger"
assert os.environ["MONGO_URL"].startswith("mongodb://127.0.0.1:")
sys.path.insert(0,str(root/"backend"))
from fastapi.encoders import jsonable_encoder
from lib.db import db
from models.schemas import RestoreIn
from routers.config import restore, backup_data_checksum
async def main():
    assert not await db.list_collection_names(),"Refusing to replace a nonempty database"
    payload=json.loads((root/"evidence/p45-ledger-backup.json").read_text())
    expected=sorted(payload["data"]["cash_adjustments"],key=lambda row:row["_id"])
    assert len(expected)==2
    actor={"id":"p45-restore-fictitious","name":"P45 restore fictitious","role":"admin"}
    result=await restore(RestoreIn(data=payload["data"],data_sha256=payload["data_sha256"]),actor)
    actual=jsonable_encoder(await db.cash_adjustments.find({}).sort("_id",1).to_list(None))
    assert actual==expected,(actual,expected)
    assert result.counts["cash_adjustments"]==2
    original_cash=await db.cash_sessions.find_one({"id":expected[0]["cash_session_id"]})
    assert original_cash["status"]=="fechado" and original_cash["difference"]==0
    # Repeating a restore preserves stable adjustment ids; it cannot duplicate refunds.
    await restore(RestoreIn(data=payload["data"],data_sha256=payload["data_sha256"]),actor)
    assert await db.cash_adjustments.count_documents({})==2
    restored=jsonable_encoder(await db.cash_adjustments.find({}).sort("_id",1).to_list(None))
    assert restored==expected
    evidence={"database":db.name,"restored_collection_counts":result.counts,
        "refund_adjustments":2,"same_ids_and_values":True,"repeat_restore_no_duplicates":True,
        "cash_difference":original_cash["difference"],"backup_sha256":payload["data_sha256"]}
    (root/"evidence/p45-ledger-restore.json").write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence),flush=True)
asyncio.run(main())
