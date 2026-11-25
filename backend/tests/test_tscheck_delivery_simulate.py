"""Mock delivery simulate uses secrets module & creates an order visible on /delivery."""
from .conftest import seeded_operator_client


def test_delivery_simulate_ifood_creates_order():
    c = seeded_operator_client("p40admin")  # admin (passes require("caixa"))
    try:
        r = c.post("/delivery/simulate", json={"source": "ifood"})
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["channel"] == "delivery"
        assert order["source"] == "ifood"
        assert order["delivery_status"] == "pendente"
        assert len(order["items"]) >= 1

        r2 = c.get("/delivery/orders")
        assert r2.status_code == 200, r2.text
        orders = r2.json()
        assert any(o["id"] == order["id"] for o in orders), "simulated order not found in /delivery/orders"
    finally:
        c.close()
