"""Offline mocked Mercado Pago Pix billing tests: no real payments."""
from datetime import date
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from management.licenses import connect
from management.pix_billing import create_pix, reconcile, api


class FakeResponse:
    def __init__(self, data):
        self._data = data
    def __enter__(self):
        return self
    def __exit__(self, *exc):
        return False
    def read(self):
        return json.dumps(self._data).encode("utf-8")


class BillingTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.db = connect(Path(self.temp.name) / "licenses.sqlite3")
        self.db.execute("""INSERT INTO licenses
          (id,customer,plan,domain,monthly_cents,status,due_date,created_at)
          VALUES(?,?,?,?,?,?,?,?)""",
          ("APL-TEST","Restaurante Teste","mensal","",9990,"trial","2026-11-10","2026-11-05"))
        self.db.commit()
        self.calls = []
        self.status = "pending"
        self.amount = 99.90
        self.reference = None
        self.currency = "BRL"

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def fake_api(self, req, timeout=0):
        self.calls.append(req)
        if req.get_method() == "POST":
            payload = json.loads(req.data)
            self.reference = payload["external_reference"]
            self.assertEqual(req.headers.get("X-idempotency-key"), self.reference)
            self.assertEqual(payload["payment_method_id"], "pix")
            return FakeResponse({"id": 192837, "status": "pending",
                "point_of_interaction":{"transaction_data":{"qr_code":"PIX-TEST","ticket_url":"https://example.test/pay"}}})
        return FakeResponse({"id": 192837,"status":self.status,
          "external_reference":self.reference,"currency_id":self.currency,
          "transaction_amount":self.amount})

    def test_pending_is_not_renewed_then_approved_once(self):
        result = create_pix(self.db,"APL-TEST","customer@example.com","test-token",transport=self.fake_api)
        self.assertEqual(result["qr_code"],"PIX-TEST")
        self.assertEqual(len(self.calls),1)
        second = create_pix(self.db,"APL-TEST","customer@example.com","test-token",transport=self.fake_api)
        self.assertEqual(second["payment_id"],result["payment_id"])
        self.assertEqual(len(self.calls),1)
        self.assertEqual(reconcile(self.db,"test-token",transport=self.fake_api,today=date(2026,11,5)),0)
        self.assertEqual(self.db.execute("SELECT due_date FROM licenses").fetchone()[0],"2026-11-10")
        self.status = "approved"
        self.assertEqual(reconcile(self.db,"test-token",transport=self.fake_api,today=date(2026,11,5)),1, msg=str({"invoices":self.db.execute("SELECT id,payment_id,status,amount_cents FROM pix_invoices").fetchall(),"ref":self.reference,"status":self.status,"calls":len(self.calls)}))
        self.assertEqual(self.db.execute("SELECT due_date FROM licenses").fetchone()[0],"2026-12-10")
        self.assertEqual(reconcile(self.db,"test-token",transport=self.fake_api,today=date(2026,11,5)),0)
        self.assertEqual(self.db.execute("SELECT due_date FROM licenses").fetchone()[0],"2026-12-10")

    def test_wrong_amount_and_reference_never_renew(self):
        create_pix(self.db,"APL-TEST","customer@example.com","token",transport=self.fake_api)
        self.status = "approved"
        self.amount = 15
        self.assertEqual(reconcile(self.db,"token",transport=self.fake_api),0)
        self.amount = 99.90
        self.reference = "OTHER-INVOICE"
        self.assertEqual(reconcile(self.db,"token",transport=self.fake_api),0)
        self.reference = self.db.execute("SELECT id FROM pix_invoices").fetchone()[0]
        self.currency = "USD"
        self.assertEqual(reconcile(self.db,"token",transport=self.fake_api),0)
        self.assertEqual(self.db.execute("SELECT status FROM licenses").fetchone()[0],"trial")

    def test_cancelled_license_not_renewed(self):
        create_pix(self.db,"APL-TEST","customer@example.com","token",transport=self.fake_api)
        self.db.execute("UPDATE licenses SET status='cancelled'")
        self.db.commit()
        self.status = "approved"
        self.assertEqual(reconcile(self.db,"token",transport=self.fake_api),0)
        self.assertEqual(self.db.execute("SELECT status FROM licenses").fetchone()[0],"cancelled")

    def test_api_does_not_allow_host_override(self):
        with self.assertRaises(ValueError):
            api("GET","https://evil.com/v1/payments/123","token")


if __name__ == "__main__":
    unittest.main()
