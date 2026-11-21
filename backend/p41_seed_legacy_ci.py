"""Only for a fresh disposable CI database; no production credentials."""
import asyncio
from lib.db import db
from lib.auth import secure_hash_pin
from models.schemas import CashSession

async def main():
    assert db.name == "apollo_p40_browser_p41legacy", db.name
    from p40_seed_ci import main as seed
    await seed()
    await db.employees.update_one({"id": "p40admin"}, {"$set": {"pin_hash": secure_hash_pin("1234")}})
    await db.cash_sessions.insert_one(CashSession(opened_by_name="CI ficticio", opening_amount=0).model_dump())
    print("Disposable legacy HTTP fixture ready")

if __name__ == "__main__":
    asyncio.run(main())
