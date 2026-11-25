"""PDV sale emits a mock NFC-e invoice whose access_key is generated via `secrets` module
and is the correct 44-digit SEFAZ format."""
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
    finally:
        current = c.get("/cash/current").json()
        if current and current.get("id"):
            c.post("/cash/close", json={"counted_amount": current["expected_cash"], "expected_session_id": current["id"]})
        c.close()
