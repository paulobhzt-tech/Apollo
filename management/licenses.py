"""Local commercial license ledger. No payment processing or network endpoints.

This is administrative bookkeeping, NOT access enforcement. Keep the SQLite file
private on the operator's computer or management server, outside any tenant DB.
"""
import argparse
import os
import secrets
import sqlite3
from datetime import date, timedelta
from pathlib import Path


def connect(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        customer TEXT NOT NULL,
        plan TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT '',
        monthly_cents INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('trial','active','suspended','cancelled')),
        due_date TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    conn.commit()
    return conn


def main():
    parser = argparse.ArgumentParser(description="Apollo: cadastro administrativo de licencas")
    parser.add_argument("--db", default=os.environ.get("APOLLO_LICENSE_DB", "./licenses.sqlite3"))
    sub = parser.add_subparsers(dest="cmd", required=True)
    new = sub.add_parser("create")
    new.add_argument("--customer", required=True)
    new.add_argument("--plan", default="mensal")
    new.add_argument("--monthly-cents", required=True, type=int)
    new.add_argument("--domain", default="")
    new.add_argument("--days", type=int, default=30)
    sub.add_parser("list")
    update = sub.add_parser("status")
    update.add_argument("id")
    update.add_argument("status", choices=("trial", "active", "suspended", "cancelled"))
    renew = sub.add_parser("renew")
    renew.add_argument("id")
    renew.add_argument("--days", type=int, default=30)
    args = parser.parse_args()
    db = connect(Path(args.db))
    if args.cmd == "create":
        if args.monthly_cents < 0 or not 1 <= args.days <= 366:
            parser.error("Valor/dias invalido")
        license_id = "APL-" + secrets.token_hex(8).upper()
        db.execute("INSERT INTO licenses VALUES (?,?,?,?,?,?,?,?)", (
            license_id, args.customer.strip(), args.plan.strip(),
            args.domain.strip(), args.monthly_cents,
            "trial", (date.today() + timedelta(days=args.days)).isoformat(),
            date.today().isoformat(),
        ))
        db.commit()
        print("Cadastro criado:", license_id)
        print("ATENCAO: o cadastro nao ativa nem bloqueia automaticamente o PDV.")
    elif args.cmd == "list":
        for row in db.execute("SELECT id,customer,plan,status,due_date,monthly_cents,domain FROM licenses ORDER BY customer"):
            print(" | ".join(str(value) for value in row))
    elif args.cmd == "status":
        cursor = db.execute("UPDATE licenses SET status=? WHERE id=?", (args.status, args.id))
        db.commit()
        if not cursor.rowcount:
            parser.error("Licenca nao encontrada")
        print("Status cadastral atualizado. Nao bloqueia a loja.")
    elif args.cmd == "renew":
        if not 1 <= args.days <= 366:
            parser.error("Dias invalidos")
        result = db.execute("SELECT due_date FROM licenses WHERE id=?", (args.id,)).fetchone()
        if not result:
            parser.error("Licenca nao encontrada")
        from datetime import datetime
        previous = date.fromisoformat(result[0])
        next_date = max(previous, date.today()) + timedelta(days=args.days)
        db.execute("UPDATE licenses SET due_date=?,status='active' WHERE id=?", (next_date.isoformat(), args.id))
        db.commit()
        print("Vencimento cadastral:", next_date.isoformat())


if __name__ == "__main__":
    main()
