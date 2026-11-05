"""Mercado Pago Pix billing for the private Apollo commercial license ledger.

Only the operator runs this CLI. No public payment endpoints and no client
credentials are stored in the code. Automatic renewal means a scheduled reconcile
queries Mercado Pago's API for each pending payment, verifies amount/reference,
then extends the corresponding license exactly once.
"""
import argparse
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
import os
from pathlib import Path
import secrets
import sqlite3
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .licenses import connect

BASE_URL = "https://api.mercadopago.com"
VALID_PLANS = {"mensal": 30, "trimestral": 90, "anual": 365}


def initialize(db):
    db.execute("""CREATE TABLE IF NOT EXISTS pix_invoices (
        id TEXT PRIMARY KEY,
        license_id TEXT NOT NULL,
        payment_id TEXT UNIQUE,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        status TEXT NOT NULL DEFAULT 'creating'
            CHECK(status IN ('creating','pending','approved','rejected','cancelled')),
        qr_code TEXT NOT NULL DEFAULT '',
        ticket_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        confirmed_at TEXT,
        period_days INTEGER NOT NULL CHECK(period_days BETWEEN 1 AND 366),
        FOREIGN KEY(license_id) REFERENCES licenses(id)
    )""")
    db.execute("""CREATE UNIQUE INDEX IF NOT EXISTS pix_one_open_per_license
        ON pix_invoices(license_id)
        WHERE status IN ('creating','pending')""")
    db.commit()


def api(method, endpoint, token, *, payload=None, idempotency=None, transport=urlopen):
    if not token:
        raise ValueError("Configure MP_ACCESS_TOKEN fora do GitHub")
    if not (endpoint == "/v1/payments" or
            endpoint.startswith("/v1/payments/") and endpoint[len("/v1/payments/"):].isdigit()):
        raise ValueError("Endpoint nao permitido")
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
        if not idempotency:
            raise ValueError("Idempotency key obrigatoria")
        headers["X-Idempotency-Key"] = idempotency
    req = Request(BASE_URL + endpoint, data=body, headers=headers, method=method)
    try:
        with transport(req, timeout=15) as response:
            return json.loads(response.read())
    except (HTTPError, URLError, TimeoutError) as exc:
        # Never log request Authorization or a response containing sensitive data.
        raise RuntimeError("Falha na comunicacao com Mercado Pago") from exc


def centavos(amount) -> int:
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1")))


def create_pix(db, license_id, payer_email, token, *, transport=urlopen, today=None):
    initialize(db)
    if "@" not in payer_email or len(payer_email) > 254:
        raise ValueError("Email do pagador invalido")
    customer = db.execute("SELECT customer,plan,monthly_cents,status FROM licenses WHERE id=?", (license_id,)).fetchone()
    if not customer:
        raise ValueError("Cliente inexistente")
    name, plan, cents, status = customer
    if status == "cancelled" or cents <= 0:
        raise ValueError("Licenca cancelada ou plano sem cobranca")
    days = VALID_PLANS.get(plan.lower())
    if not days:
        raise ValueError("Plano nao suportado para Pix")
    existing = db.execute("""SELECT id, payment_id, qr_code, ticket_url FROM pix_invoices
       WHERE license_id=? AND status IN ('creating','pending')""", (license_id,)).fetchone()
    if existing:
        if existing[1]:
            return dict(zip(("invoice_id","payment_id","qr_code","ticket_url"), existing))
        raise RuntimeError("Cobranca em preparacao. Confira o status antes de repetir")
    invoice_id = "PIX-" + secrets.token_hex(12).upper()
    created = datetime.now(timezone.utc).isoformat()
    # Save a durable idempotency key before external API call.
    db.execute("INSERT INTO pix_invoices(id,license_id,amount_cents,created_at,period_days) VALUES(?,?,?,?,?)",
               (invoice_id, license_id, cents, created, days))
    db.commit()
    payload = {
        "transaction_amount": float(Decimal(cents) / 100),
        "description": f"Apollo PDV - {plan} - {name}"[:255],
        "payment_method_id": "pix",
        "payer": {"email": payer_email},
        "external_reference": invoice_id
    }
    result = api("POST", "/v1/payments", token, payload=payload,
                 idempotency=invoice_id, transport=transport)
    payment_id = str(result.get("id") or "")
    if not payment_id.isdecimal() or not payment_id:
        raise RuntimeError("Mercado Pago nao retornou ID valido; verificar conciliacao manual")
    data = result.get("point_of_interaction") or {}
    tx = data.get("transaction_data") or {}
    qr = tx.get("qr_code", "")
    ticket = tx.get("ticket_url", "")
    db.execute("""UPDATE pix_invoices SET payment_id=?,qr_code=?,ticket_url=?,status='pending'
                  WHERE id=? AND status='creating'""", (payment_id, str(qr), str(ticket), invoice_id))
    db.commit()
    return {"invoice_id": invoice_id, "payment_id": payment_id, "qr_code": qr, "ticket_url": ticket}


def apply_verified_payment(db, payment, *, today=None):
    """Idempotently renew ONLY after authenticated provider lookup."""
    initialize(db)
    pid = str(payment.get("id") or "")
    if not pid.isdecimal() or payment.get("status") != "approved":
        return False
    db.execute("BEGIN IMMEDIATE")
    try:
        row = db.execute("""SELECT id, license_id, amount_cents, status, period_days
             FROM pix_invoices WHERE payment_id=?""", (pid,)).fetchone()
        if not row or row[3] == "approved":
            db.commit()
            return False
        invoice_id, license_id, cents, _, days = row
        if (payment.get("external_reference") != invoice_id or
                payment.get("currency_id") != "BRL" or
                centavos(payment.get("transaction_amount", -1)) != cents):
            db.commit()
            return False
        license_row = db.execute("SELECT due_date,status FROM licenses WHERE id=?", (license_id,)).fetchone()
        if not license_row or license_row[1] == "cancelled":
            db.commit()
            return False
        current_day = today or date.today()
        due = max(date.fromisoformat(license_row[0]), current_day) + timedelta(days=days)
        db.execute("""UPDATE licenses SET status='active',due_date=? WHERE id=?""", (due.isoformat(), license_id))
        db.execute("""UPDATE pix_invoices SET status='approved', confirmed_at=?
             WHERE id=?""", (datetime.now(timezone.utc).isoformat(), invoice_id))
        db.commit()
        return True
    except BaseException:
        db.rollback()
        raise


def reconcile(db, token, *, transport=urlopen, today=None):
    initialize(db)
    payments = db.execute("""SELECT payment_id FROM pix_invoices
        WHERE status='pending' AND payment_id IS NOT NULL""").fetchall()
    renewed = 0
    for (pid,) in payments:
        payment = api("GET", f"/v1/payments/{pid}", token, transport=transport)
        if apply_verified_payment(db, payment, today=today):
            renewed += 1
        elif payment.get("status") in ("rejected","cancelled"):
            db.execute("UPDATE pix_invoices SET status=? WHERE payment_id=? AND status='pending'",
                       (payment["status"], pid))
            db.commit()
    return renewed


def main():
    parser = argparse.ArgumentParser(description="Apollo Pix: emissao e conciliacao privada")
    parser.add_argument("--db", type=Path, default=Path(os.getenv("APOLLO_LICENSE_DB", "./licenses.sqlite3")))
    sub = parser.add_subparsers(dest="operation", required=True)
    create = sub.add_parser("create")
    create.add_argument("--license-id", required=True)
    create.add_argument("--payer-email", required=True)
    sub.add_parser("reconcile")
    args = parser.parse_args()
    token = os.getenv("MP_ACCESS_TOKEN", "")
    if not token:
        parser.error("Defina MP_ACCESS_TOKEN como segredo privado da sua conta Mercado Pago")
    with connect(args.db) as db:
        if args.operation == "create":
            result = create_pix(db, args.license_id, args.payer_email, token)
            print("Cobranca Pix cadastrada:", result["invoice_id"])
            print("Link de pagamento:", result["ticket_url"])
            print("Copia e cola Pix:", result["qr_code"])
        else:
            print("Licencas renovadas apos confirmacao no Mercado Pago:", reconcile(db, token))


if __name__ == "__main__":
    main()
