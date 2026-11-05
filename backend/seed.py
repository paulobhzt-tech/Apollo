"""DESTRUCTIVE demo seed. Restricted to opt-in, demo/test DBs only."""
import asyncio
import random
from datetime import datetime, timedelta, timezone

from lib.auth import secure_hash_pin
from lib.demo_guard import assert_demo_seed_allowed
from lib.db import db, ensure_indexes
from lib.orders import MARKET_FEES, TZ
from models.schemas import (CashSession, Category, Employee, Expense, Ingredient, KitchenTicket, KitchenItem, Order,
                            OrderItem, Product, RecipeItem, Table)

IMG = {
    "pizza": "https://images.unsplash.com/photo-1651980979183-79425af50103?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "burger": "https://images.unsplash.com/photo-1606131731446-5568d87113aa?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "dish": "https://images.unsplash.com/photo-1502998070258-dc1338445ac2?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "drink": "https://images.unsplash.com/photo-1556855810-ac404aa91e85?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "bar": "https://images.unsplash.com/photo-1597075687490-8f673c6c17f6?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
}

COLLS = ["fiado_customers", "customer_moves", "settings", "employees", "sessions", "categories", "products", "ingredients", "stock_moves", "tables", "orders",
         "kitchen_tickets", "invoices", "cash_sessions", "expenses", "counters"]


async def main() -> None:
    assert_demo_seed_allowed()
    for c in COLLS:
        await db[c].drop()
    await ensure_indexes()
    now = datetime.now(timezone.utc)

    emps = [
        ("Marina Costa", "admin", "1234", 0), ("Rafael Operador", "caixa", "0000", 0),
        ("Lucas Garçom", "garcom", "1111", 5), ("Juliana Garçonete", "garcom", "3333", 5),
        ("Chef Paulo", "cozinha", "2222", 0),
    ]
    emp_docs = []
    for name, role, pin, comm in emps:
        e = Employee(name=name, role=role, commission_pct=comm, can_cancel=role == "admin", phone="(11) 98888-0000").model_dump()
        emp_docs.append(e)
        await db.employees.insert_one({**e, "pin_hash": secure_hash_pin(pin)})
    waiters = [e for e in emp_docs if e["role"] == "garcom"]

    ing_specs = [
        ("Farinha 00", "kg", 25, 5, 6.5), ("Queijo Muçarela", "kg", 12, 4, 38), ("Molho de Tomate", "L", 10, 3, 12),
        ("Manjericão", "g", 400, 100, 0.08), ("Calabresa", "kg", 6, 2, 32), ("Carne Bovina (blend)", "kg", 9, 3, 48),
        ("Pão Brioche", "un", 60, 20, 1.8), ("Queijo Cheddar", "kg", 3, 1, 52), ("Bacon", "kg", 1.5, 2, 45),
        ("Batata Congelada", "kg", 20, 5, 14), ("Chopp Pilsen", "L", 50, 15, 9), ("Limão", "un", 80, 30, 0.5),
        ("Cachaça", "L", 6, 2, 28), ("Açúcar", "kg", 8, 2, 4.5), ("Refrigerante Lata", "un", 96, 24, 2.6),
        ("Filé Mignon", "kg", 4, 2, 89), ("Arroz", "kg", 15, 5, 5.5), ("Chocolate", "kg", 2, 1, 42),
        ("Leite Condensado", "un", 18, 6, 6.2), ("Água Mineral", "un", 48, 12, 1.1),
    ]
    ings = {}
    for n, u, s, m, c in ing_specs:
        i = Ingredient(name=n, unit=u, stock=s, min_stock=m, cost_per_unit=c).model_dump()
        ings[n] = i["id"]
        await db.ingredients.insert_one(i)

    cat_specs = [("Pizzas", "forno"), ("Burgers", "cozinha"), ("Porções", "cozinha"), ("Pratos", "cozinha"),
                 ("Bebidas", "bar"), ("Drinks", "bar"), ("Sobremesas", "cozinha")]
    cats = {}
    for idx, (n, st) in enumerate(cat_specs):
        c = Category(name=n, station=st, sort=idx).model_dump()
        cats[n] = c["id"]
        await db.categories.insert_one(c)

    R = lambda *pairs: [RecipeItem(ingredient_id=ings[a], qty=b) for a, b in pairs]  # noqa: E731
    prod_specs = [
        ("Pizza Margherita", "Pizzas", 59.9, "PZ01", "pizza", "Molho de tomate, muçarela de búfala e manjericão fresco",
         R(("Farinha 00", 0.3), ("Queijo Muçarela", 0.25), ("Molho de Tomate", 0.15), ("Manjericão", 10))),
        ("Pizza Calabresa", "Pizzas", 54.9, "PZ02", "pizza", "Calabresa fatiada, cebola roxa e azeitonas",
         R(("Farinha 00", 0.3), ("Queijo Muçarela", 0.2), ("Molho de Tomate", 0.15), ("Calabresa", 0.2))),
        ("Pizza Quatro Queijos", "Pizzas", 64.9, "PZ03", "pizza", "Muçarela, provolone, gorgonzola e parmesão",
         R(("Farinha 00", 0.3), ("Queijo Muçarela", 0.4), ("Molho de Tomate", 0.1))),
        ("Smash Burger", "Burgers", 34.9, "BG01", "burger", "Dois smash de 90g, cheddar e molho da casa no brioche",
         R(("Carne Bovina (blend)", 0.18), ("Pão Brioche", 1), ("Queijo Cheddar", 0.04))),
        ("Cheddar Bacon Burger", "Burgers", 39.9, "BG02", "burger", "Blend 180g, cheddar cremoso e bacon crocante",
         R(("Carne Bovina (blend)", 0.18), ("Pão Brioche", 1), ("Queijo Cheddar", 0.05), ("Bacon", 0.05))),
        ("Batata Frita", "Porções", 24.9, "PO01", "dish", "Porção 400g com sal e alecrim", R(("Batata Congelada", 0.4))),
        ("Batata Cheddar & Bacon", "Porções", 32.9, "PO02", "dish", "Batata coberta com cheddar e bacon",
         R(("Batata Congelada", 0.4), ("Queijo Cheddar", 0.06), ("Bacon", 0.05))),
        ("Filé à Parmegiana", "Pratos", 72.9, "PR01", "dish", "Filé mignon empanado, arroz e fritas",
         R(("Filé Mignon", 0.25), ("Queijo Muçarela", 0.08), ("Molho de Tomate", 0.1), ("Arroz", 0.15), ("Batata Congelada", 0.2))),
        ("Chopp Artesanal 500ml", "Bebidas", 16.9, "BB01", "bar", "Pilsen artesanal gelado na pressão", R(("Chopp Pilsen", 0.5))),
        ("Refrigerante Lata", "Bebidas", 7.0, "BB02", "drink", "Coca-Cola, Guaraná ou Sprite", R(("Refrigerante Lata", 1))),  # noqa
        ("Água Mineral", "Bebidas", 5.0, "BB03", "drink", "500ml com ou sem gás", R(("Água Mineral", 1))),
        ("Caipirinha de Limão", "Drinks", 22.9, "DR01", "drink", "Cachaça artesanal, limão taiti e açúcar",
         R(("Cachaça", 0.06), ("Limão", 2), ("Açúcar", 0.03))),
        ("Gin Tônica", "Drinks", 29.9, "DR02", "bar", "Gin, tônica, especiarias e limão siciliano", R(("Limão", 1))),
        ("Petit Gâteau", "Sobremesas", 26.9, "SB01", "dish", "Bolo de chocolate com sorvete de creme",
         R(("Chocolate", 0.08), ("Leite Condensado", 0.2))),
        ("Pudim de Leite", "Sobremesas", 16.9, "SB02", "dish", "Pudim caseiro com calda de caramelo",
         R(("Leite Condensado", 0.5), ("Açúcar", 0.05))),
    ]
    ing_cost = {i["id"]: i["cost_per_unit"] for i in await db.ingredients.find({}, {"_id": 0}).to_list(100)}
    prods = []
    for n, cat, price, code, img, desc, rec in prod_specs:
        p = Product(name=n, category_id=cats[cat], price=price, code=code, image=IMG[img], description=desc, recipe=rec).model_dump()
        p.pop("cost"), p.pop("margin_pct")
        await db.products.insert_one(dict(p))
        p["_station"] = dict(cat_specs)[cat]
        p["_cost"] = round(sum(ing_cost[r["ingredient_id"]] * r["qty"] for r in p["recipe"]), 2)
        prods.append(p)

    tables = []
    names = {1: "Varanda", 2: "Varanda", 10: "Salão VIP", 11: "Salão VIP"}
    for n in range(1, 13):
        t = Table(number=n, name=names.get(n, ""), seats=2 if n <= 3 else (6 if n >= 10 else 4)).model_dump()
        tables.append(t)
        await db.tables.insert_one(dict(t))
    for n in range(101, 109):
        await db.tables.insert_one(Table(number=n, kind="comanda", seats=1, name="Bar" if n <= 104 else "").model_dump())
    await db.tables.update_one({"number": 12}, {"$set": {"status": "reservada", "customer_name": "Reserva Família Silva"}})

    # ---- history: 20 days of paid orders, one closed cash session per day ----
    seq = 0
    rng = random.Random(42)
    orders, sessions = [], []
    for d in range(20, 0, -1):
        day = (datetime.now(TZ) - timedelta(days=d)).replace(hour=10, minute=0, second=0, microsecond=0)
        sess = CashSession(opened_by_name="Rafael Operador", opened_at=day.astimezone(timezone.utc), opening_amount=200,
                           status="fechado", closed_at=(day + timedelta(hours=13)).astimezone(timezone.utc),
                           closed_by_name="Rafael Operador").model_dump()
        totals: dict[str, float] = {}
        for _ in range(rng.randint(14, 26)):
            seq += 1
            src = rng.choices(["pdv", "mesa", "cardapio", "ifood", "99food", "keeta", "site"], [3, 5, 1, 3, 1, 1, 1])[0]
            picks = rng.sample(prods, k=rng.randint(1, 4))
            items = [OrderItem(product_id=p["id"], name=p["name"], qty=rng.randint(1, 3), unit_price=p["price"],
                               unit_cost=p["_cost"], station=p["_station"]).model_dump() for p in picks]
            sub = round(sum(i["qty"] * i["unit_price"] for i in items), 2)
            channel = "mesa" if src in ("mesa", "cardapio") else ("balcao" if src == "pdv" else "delivery")
            service = round(sub * 0.1, 2) if channel == "mesa" else 0
            dfee = 7.99 if channel == "delivery" else 0
            total = round(sub + service + dfee, 2)
            method = "online" if src in ("ifood", "99food", "keeta") else rng.choice(["dinheiro", "credito", "debito", "pix", "pix", "fiado"])
            paid_at = (day + timedelta(hours=rng.randint(1, 12), minutes=rng.randint(0, 59))).astimezone(timezone.utc)
            w = rng.choice(waiters) if channel == "mesa" else None
            o = Order(number=seq, channel=channel, source=src, items=items, status="pago",
                      delivery_status="entregue" if channel == "delivery" else None, subtotal=sub, service_fee=service,
                      delivery_fee=dfee, total=total, payments=[{"method": method, "amount": total, "brand": rng.choice(["visa", "mastercard", "elo"]) if method in ("credito", "debito") else None}],
                      marketplace_fee=round(sub * MARKET_FEES.get(src, 0), 2), cmv=round(sum(i["qty"] * i["unit_cost"] for i in items), 2),
                      waiter_id=w["id"] if w else None, waiter_name=w["name"] if w else "",
                      table_number=rng.randint(1, 11) if channel == "mesa" else None,
                      cash_session_id=sess["id"] if method != "online" else None,
                      created_at=paid_at - timedelta(minutes=40), paid_at=paid_at).model_dump()
            orders.append(o)
            if method != "online":
                totals[method] = round(totals.get(method, 0) + total, 2)
        sess["totals_by_method"] = totals
        sess["sales_count"] = sum(1 for o in orders if o["cash_session_id"] == sess["id"])
        sess["sales_total"] = round(sum(totals.values()), 2)
        sess["expected_cash"] = round(200 + totals.get("dinheiro", 0), 2)
        sess["counted_amount"] = sess["expected_cash"]
        sessions.append(sess)
    await db.orders.insert_many(orders)
    await db.cash_sessions.insert_many(sessions)

    # ---- today: open cash + an occupied table + a pending ifood order ----
    open_sess = CashSession(opened_by_name="Rafael Operador", opening_amount=200).model_dump()
    await db.cash_sessions.insert_one(open_sess)
    t5 = tables[4]
    seq += 1
    its = [OrderItem(product_id=prods[0]["id"], name=prods[0]["name"], qty=1, unit_price=prods[0]["price"], unit_cost=prods[0]["_cost"], station="forno"),
           OrderItem(product_id=prods[8]["id"], name=prods[8]["name"], qty=2, unit_price=prods[8]["price"], unit_cost=prods[8]["_cost"], station="bar", notes="Bem gelado")]
    sub = round(sum(i.qty * i.unit_price for i in its), 2)
    o5 = Order(number=seq, channel="mesa", source="mesa", table_id=t5["id"], table_number=5, table_label="Mesa 5", items=its, subtotal=sub, total=sub,
               waiter_id=waiters[0]["id"], waiter_name=waiters[0]["name"], created_at=now - timedelta(minutes=18)).model_dump()
    await db.orders.insert_one(dict(o5))
    await db.tables.update_one({"id": t5["id"]}, {"$set": {"status": "ocupada", "people": 3, "customer_name": "Carlos",
                                                           "order_id": o5["id"], "opened_at": now - timedelta(minutes=18),
                                                           "waiter_id": waiters[0]["id"], "waiter_name": waiters[0]["name"], "total": sub}})
    await db.kitchen_tickets.insert_one(KitchenTicket(order_id=o5["id"], order_number=seq, label="Mesa 5", source="mesa",
                                                      items=[KitchenItem(name=i.name, qty=i.qty, notes=i.notes, station=i.station) for i in its],
                                                      status="preparo", created_at=now - timedelta(minutes=17)).model_dump())
    seq += 1
    its2 = [OrderItem(product_id=prods[4]["id"], name=prods[4]["name"], qty=2, unit_price=prods[4]["price"], unit_cost=prods[4]["_cost"], station="cozinha", notes="Sem cebola")]
    sub2 = round(sum(i.qty * i.unit_price for i in its2), 2)
    await db.orders.insert_one(Order(number=seq, channel="delivery", source="ifood", items=its2, delivery_status="pendente",
                                     subtotal=sub2, delivery_fee=7.99, total=round(sub2 + 7.99, 2), marketplace_fee=round(sub2 * 0.23, 2),
                                     customer={"name": "Fernanda Ribeiro", "phone": "(11) 97777-1234", "address": "Rua Augusta, 1200 - ap 42"},
                                     created_at=now - timedelta(minutes=3)).model_dump())
    await db.counters.insert_one({"_id": "order", "seq": seq})

    month_start = datetime.now(TZ).strftime("%Y-%m-01")
    for desc, cat, amt in [("Aluguel do salão", "aluguel", 6500), ("Folha de pagamento", "salarios", 14200),
                           ("Conta de energia", "energia", 1890), ("Conta de água", "agua", 420),
                           ("Impulsionamento Instagram", "marketing", 600), ("Manutenção forno", "manutencao", 350)]:
        await db.expenses.insert_one(Expense(description=desc, category=cat, amount=amt, date=month_start).model_dump())
    from seed_extras import main as extras
    await extras()
    print(f"Seed OK: {len(emp_docs)} funcionários, {len(prods)} produtos, {len(orders)} pedidos históricos")


if __name__ == "__main__":
    asyncio.run(main())
