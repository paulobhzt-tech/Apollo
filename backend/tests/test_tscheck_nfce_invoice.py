"""PDV sale emits a mock NFC-e invoice whose access_key is generated via `secrets` module
and is the correct 44-digit SEFAZ format."""
import json
import time

from .conftest import seeded_operator_client


def test_pdv_sale_pix_emits_nfce_with_44_digit_access_key():
    c = seeded_operator_client("p40admin")  # admin (passes require("caixa"))
    try:
        opened = c.post("/cash/open", json={"opening_amount": 0})
        assert opened.status_code == 200, opened.text
        prods = c.get("/products").json()
        prod = next(p for p in prods if p.get("price"))
        client_ref = f"tscheck-nfce-{int(time.time() * 1000)}"
        payload = {
            "client_ref": client_ref,
            "items": [{"product_id": prod["id"], "qty": 1}],
            "payments": [{"method": "pix", "amount": prod["price"],
                          "details": {"reference": client_ref, "pix_received": True}}],
            "emit_invoice": True,
            "doc_type": "nfce",
        }
        r = c.post("/pdv/sale", json=payload)
        assert r.status_code == 200, r.text
        result = r.json()
        inv = result["invoice"]
        assert inv is not None, "no invoice emitted"
        assert inv["doc_type"] == "nfce"
        assert len(inv["access_key"]) == 44, f"access_key wrong length: {inv['access_key']}"
        assert inv["access_key"].isdigit()

        card = {"pos_terminal": "POS de teste", "authorization_code": "ABC-12", "nsu": "000013"}
        payload.update(client_ref=f"{client_ref}-card", emit_invoice=False, payments=[
            {"method": "debito", "amount": prod["price"], "brand": "visa", "details": card},
        ])
        card_result = c.post("/pdv/sale", json=payload)
        assert card_result.status_code == 200, card_result.text
        order = card_result.json()["order"]
        assert all(order["payments"][0]["details"][key] == value for key, value in card.items())
        event = next(event for event in order["audit_events"] if event["action"] == "payment_recorded")
        assert json.loads(event["values"]["card_transactions"]) == [{"index": 0, "method": "debito", **card}]
        replay = c.post("/pdv/sale", json=payload)
        assert replay.status_code == 200, replay.text
        assert replay.json()["order"]["id"] == order["id"]
    finally:
        current = c.get("/cash/current").json()
        if current and current.get("id"):
            c.post("/cash/close", json={"counted_amount": current["expected_cash"], "expected_session_id": current["id"]})
        c.close()
