"""PDV sale emits a mock NFC-e invoice whose access_key is generated via `secrets` module
and is the correct 44-digit SEFAZ format."""
import time

import httpx

from .conftest import api_url


def _login(pin: str) -> httpx.Client:
    c = httpx.Client(base_url=api_url(), timeout=30.0)
    r = c.post("/auth/login", json={"pin": pin})
    assert r.status_code == 200, r.text
    token = r.cookies.get("pdv_session")
    c.headers["Cookie"] = f"pdv_session={token}"
    return c


def test_pdv_sale_pix_emits_nfce_with_44_digit_access_key():
    c = _login("1234")  # admin (passes require("caixa"))
    try:
        prods = c.get("/products").json()
        prod = next(p for p in prods if p.get("price"))
        client_ref = f"tscheck-nfce-{int(time.time() * 1000)}"
        payload = {
            "client_ref": client_ref,
            "items": [{"product_id": prod["id"], "qty": 1}],
            "payments": [{"method": "pix", "amount": prod["price"]}],
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
        c.close()
