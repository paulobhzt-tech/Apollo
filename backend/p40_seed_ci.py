"""Seed only a newly created fictitious CI database."""
import asyncio, os
from lib.db import db, ensure_indexes
from lib.auth import secure_hash_pin
from models.schemas import Ingredient, Product, Purchase, Supplier, Table

async def main():
    assert db.name.startswith("apollo_p40_browser_"), db.name
    assert not await db.list_collection_names(), "Refusing nonempty database"
    await ensure_indexes()
    for role, username in [("admin","p40admin"),("caixa","p40caixa1"),("caixa","p40caixa2"),("garcom","p40garcom")]:
        await db.employees.insert_one(dict(id=username,name=username,role=role,username=username,
            active=True,password_hash=secure_hash_pin("P40-Fictitious-Password!"),must_change_password=False))
    supplier = Supplier(id="p40supplier", name="Fornecedor fictício")
    await db.suppliers.insert_one(supplier.model_dump())

    async def seed_lot(lot_id, ingredient, unit_cost):
        lot = Purchase(
            id=lot_id, supplier_id=supplier.id, supplier_name=supplier.name,
            ingredient_id=ingredient.id, ingredient_name=ingredient.name,
            qty=ingredient.stock, remaining_qty=ingredient.stock, unit=ingredient.unit,
            unit_cost=unit_cost, total_cost=ingredient.stock * unit_cost,
            expiry_date="2099-12-31",
        )
        await db.purchases.insert_one(lot.model_dump())

    await db.categories.insert_one(dict(id="p40cat",name="Espetinhos",station="cozinha",sort=0))
    ingredient = Ingredient(id="p40ing", name="Insumo ficticio", unit="un", stock=100, cost_per_unit=4)
    await db.ingredients.insert_one(ingredient.model_dump())
    await db.products.insert_one(Product(id="p40product",name="Espetinho P40",category_id="p40cat",price=10,
        recipe=[dict(ingredient_id="p40ing",qty=1)],station="cozinha").model_dump())
    await seed_lot("p40lot", ingredient, 4)
    for key, name, station, unit, recipe_qty, price, cost in [
        ("drink", "Bebida P41", "bar", "un", 1, 5, 2),
        ("portion", "Porcao P41", "cozinha", "kg", 0.4, 15, 10),
    ]:
        await db.categories.insert_one(dict(id="p41cat"+key,name=name,station=station,sort=1))
        ingredient = Ingredient(id="p41ing" + key, name=name, unit=unit, stock=100, cost_per_unit=cost)
        await db.ingredients.insert_one(ingredient.model_dump())
        await db.products.insert_one(Product(id="p41"+key,name=name,category_id="p41cat"+key,price=price,
            recipe=[dict(ingredient_id="p41ing"+key,qty=recipe_qty)],station=station).model_dump())
        await seed_lot("p41lot" + key, ingredient, cost)
    for number in [401,402]:
        await db.tables.insert_one(Table(id=f"p40table{number}",number=number).model_dump())
    print("P40 fictitious seed ready")
if __name__ == "__main__":
    asyncio.run(main())
