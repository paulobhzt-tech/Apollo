"""Seed only a newly created fictitious CI database."""
import asyncio, os
from datetime import datetime, timezone
from lib.db import db, ensure_indexes
from lib.auth import secure_hash_pin
from models.schemas import Product, Ingredient, Table

async def main():
    assert db.name.startswith("apollo_p40_browser_"), db.name
    assert not await db.list_collection_names(), "Refusing nonempty database"
    await ensure_indexes()
    for role, username in [("admin","p40admin"),("caixa","p40caixa1"),("caixa","p40caixa2"),("garcom","p40garcom")]:
        await db.employees.insert_one(dict(id=username,name=username,role=role,username=username,
            active=True,password_hash=secure_hash_pin("P40-Fictitious-Password!"),must_change_password=False))
    await db.categories.insert_one(dict(id="p40cat",name="Espetinhos",station="cozinha",sort=0))
    await db.ingredients.insert_one(Ingredient(id="p40ing",name="Insumo ficticio",unit="un",stock=100,cost_per_unit=4).model_dump())
    await db.products.insert_one(Product(id="p40product",name="Espetinho P40",category_id="p40cat",price=10,
        recipe=[dict(ingredient_id="p40ing",qty=1)],station="cozinha").model_dump())
    await db.purchases.insert_one(dict(id="p40lot",ingredient_id="p40ing",remaining_qty=100,qty=100,
        unit_cost=4,expiry_date="2099-12-31",created_at=datetime.now(timezone.utc)))
    for number in [401,402]:
        await db.tables.insert_one(Table(id=f"p40table{number}",number=number).model_dump())
    print("P40 fictitious seed ready")
if __name__ == "__main__":
    asyncio.run(main())
