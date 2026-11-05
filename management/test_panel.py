"""Tests for the isolated commercial dashboard (no third-party dependencies)."""
import base64
import http.client
from http.server import ThreadingHTTPServer
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from urllib.parse import urlencode

from management.licenses import connect
from management.panel import PanelHandler, ensure_payments, summary


class DashboardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / "licenses.sqlite3"
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), PanelHandler)
        self.server.admin_password = "secret-passphrase-123456"
        self.server.csrf = "random-csrf-test-token"
        self.server.db_path = self.db
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.auth = "Basic " + base64.b64encode(b"admin:secret-passphrase-123456").decode()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        self.temp.cleanup()

    def request(self, method, path, form=None, authorized=True):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        headers = {}
        if authorized:
            headers["Authorization"] = self.auth
        if form is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            payload = urlencode(form)
        else:
            payload = None
        conn.request(method, path, body=payload, headers=headers)
        res = conn.getresponse()
        data = res.read().decode()
        status = res.status
        conn.close()
        return status, data

    def test_rejects_unauthenticated_and_invalid_csrf(self):
        self.assertEqual(self.request("GET", "/", authorized=False)[0], 401)
        self.assertEqual(self.request("POST", "/create", {"customer":"Foo","csrf":"wrong"})[0], 403)

    def test_customer_and_payment_workflow(self):
        status, page = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("Apollo PDV", page)
        status, _ = self.request("POST", "/create", {"csrf":self.server.csrf, "customer":"Restaurante Teste",
           "plan":"Mensal", "amount":"99.90", "domain":"teste.example", "days":"30"})
        self.assertEqual(status, 303)
        with connect(self.db) as conn:
            row = conn.execute("SELECT id,monthly_cents,status FROM licenses").fetchone()
            self.assertEqual(row[1:], (9990,"trial"))
            lid = row[0]
        status, _ = self.request("POST", "/status", {"csrf":self.server.csrf,"id":lid,"status":"active"})
        self.assertEqual(status, 303)
        status, _ = self.request("POST", "/payment", {"csrf":self.server.csrf,"id":lid,"amount":"99.90"})
        self.assertEqual(status, 303)
        with connect(self.db) as conn:
            ensure_payments(conn)
            self.assertEqual(conn.execute("SELECT amount_cents FROM payments").fetchone()[0],9990)
            count, active, overdue, mrr = summary(conn)
            self.assertEqual((count, active, mrr), (1, 1, 9990))
        self.assertIn("Restaurante Teste", self.request("GET", "/")[1])

    def test_html_escapes_names_and_sql_injection(self):
        bad = '<script>alert("oops")</script>'
        status, _ = self.request("POST", "/create", {"csrf":self.server.csrf, "customer":bad,
              "plan":"Mensal", "amount":"40", "days":"30"})
        self.assertEqual(status, 303)
        status, page = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertNotIn(bad, page)
        self.assertIn("&lt;script&gt;", page)

    def test_rejects_unknown_client_and_negative_amount(self):
        self.assertEqual(self.request("POST", "/payment", {"csrf":self.server.csrf,"id":"missing","amount":"10"})[0], 400)
        self.assertEqual(self.request("POST", "/create", {"csrf":self.server.csrf,"customer":"Example",
            "plan":"Mensal","amount":"-5","days":"30"})[0], 400)


if __name__ == "__main__":
    unittest.main()
