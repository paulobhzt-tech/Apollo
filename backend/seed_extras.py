"""Idempotent extras (skewer category/products, burger options, fiado customers, card fees). Run: python seed_extras.py"""
import asyncio

from lib.db import db
from models.schemas import Category, FiadoCustomer, Product

PONTO = {"name": "Ponto da carne", "required": True, "multi": False,
         "choices": [{"name": "Mal passado", "price": 0}, {"name": "Ao ponto", "price": 0}, {"name": "Bem passado", "price": 0}]}
ACOMP = {"name": "Acompanhamento", "required": False, "multi": True,
         "choices": [{"name": "Farofa", "price": 0}, {"name": "Vinagrete", "price": 0}, {"name": "Mandioca frita", "price": 6}, {"name": "Pão de alho", "price": 5}]}
EXTRA = {"name": "Adicionais", "required": False, "multi": True,
         "choices": [{"name": "Bacon extra", "price": 5}, {"name": "Cheddar extra", "price": 4}, {"name": "Ovo", "price": 3}]}
IMG = "https://images.unsplash.com/photo-1502998070258-dc1338445ac2?crop=entropy&cs=srgb&fm=jpg&q=80&w=800"


async def main() -> None:
    cat = await db.categories.find_one({"name": "Espetos"})
    if not cat:
        cat = Category(name="Espetos", station="cozinha", sort=-1).model_dump()
        await db.categories.insert_one(dict(cat))
    for name, price, code, desc, opts in [
        ("Espeto de Picanha", 18.9, "ES01", "Picanha na brasa com sal grosso", [PONTO, ACOMP]),
        ("Espeto de Alcatra", 15.9, "ES02", "Alcatra macia na brasa", [PONTO, ACOMP]),
        ("Espeto de Frango", 11.9, "ES03", "Frango temperado com alho", [ACOMP]),
        ("Espeto de Linguiça", 10.9, "ES04", "Linguiça toscana artesanal", [ACOMP]),
        ("Espeto de Queijo Coalho", 10.9, "ES05", "Coalho na brasa com melaço", [ACOMP]),
    ]:
        if not await db.products.find_one({"code": code}):
            p = Product(name=name, category_id=cat["id"], price=price, code=code, image=IMG, description=desc, options=opts).model_dump()
            p.pop("cost"), p.pop("margin_pct")
            await db.products.insert_one(p)
    await db.products.update_many({"code": {"$in": ["BG01", "BG02"]}, "options": {"$in": [None, []]}}, {"$set": {"options": [PONTO, EXTRA]}})
    await db.products.update_many({"code": {"$in": ["BG01", "BG02"]}, "options": {"$exists": False}}, {"$set": {"options": [PONTO, EXTRA]}})
    if not await db.fiado_customers.count_documents({}):
        for n, ph, lim in [("Seu Antônio (vizinho)", "(11) 97000-1111", 300), ("Dona Cida", "(11) 97000-2222", 200), ("Carlos Mecânico", "(11) 97000-3333", 0)]:
            await db.fiado_customers.insert_one(FiadoCustomer(name=n, phone=ph, credit_limit=lim).model_dump())
    if not await db.settings.find_one({"_id": "card_fees"}):
        await db.settings.insert_one({"_id": "card_fees", "fees": {
            "credito:visa": 3.19, "credito:mastercard": 3.19, "credito:elo": 3.49,
            "debito:visa": 1.39, "debito:mastercard": 1.39, "debito:elo": 1.69}})
    await combos()
    print("extras OK")


async def combos() -> None:
    cat = await db.categories.find_one({"name": "Combos"})
    if not cat:
        cat = Category(name="Combos", station="cozinha", sort=-2).model_dump()
        await db.categories.insert_one(dict(cat))
    if await db.products.find_one({"code": "CB01"}):
        return
    esp = {p["name"]: p["id"] for p in await db.products.find({"code": {"$in": ["ES01", "ES02", "ES03", "ES04", "ES05"]}}, {"_id": 0}).to_list(10)}
    drinks = {p["name"]: p["id"] for p in await db.products.find({"code": {"$in": ["BB01", "BB02", "BB03"]}}, {"_id": 0}).to_list(10)}
    choice = lambda n, pid, price=0: {"name": n, "price": price, "product_id": pid}  # noqa: E731
    esp_choices = [choice(n, pid, 3 if "Picanha" in n else 0) for n, pid in esp.items()]
    groups = [{"name": f"Espeto {i}", "required": True, "multi": False, "choices": esp_choices} for i in (1, 2, 3)]
    groups.append({"name": "Bebida", "required": True, "multi": False,
                   "choices": [choice(n, pid, 6 if "Chopp" in n else 0) for n, pid in drinks.items()]})
    p = Product(name="Combo Churras (3 espetos + farofa + bebida)", category_id=cat["id"], price=39.9, code="CB01", image=IMG,
                description="Escolha 3 espetos, acompanha farofa da casa e 1 bebida", options=groups).model_dump()
    p.pop("cost"), p.pop("margin_pct")
    await db.products.insert_one(p)


if __name__ == "__main__":
    asyncio.run(main())
