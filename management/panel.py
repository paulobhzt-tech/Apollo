"""Private Apollo commercial dashboard, accessed only via SSH tunnel.

Standard library only. Listens on 127.0.0.1:8787; never expose to the Internet.
APOLLO_ADMIN_PASSWORD must be a strong, private environment variable.
It does not charge customers or control the tenant PDV's availability.
"""
import base64
from datetime import date, timedelta
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import os
from pathlib import Path
import secrets
import sqlite3
from urllib.parse import parse_qs

try:
    from .licenses import connect
except ImportError:
    from licenses import connect


STATUSES = ("trial", "active", "suspended", "cancelled")
CSS = """
:root{font-family:system-ui,Segoe UI,sans-serif;color-scheme:dark}
body{background:#101622;color:#f0f4fa;margin:0}
header{background:#192437;border-bottom:1px solid #36445b;padding:22px max(24px,calc((100vw - 1120px)/2))}
main{max-width:1120px;margin:28px auto;padding:0 20px}
h1{margin:0;font-size:26px}h2{font-size:19px}
small,.muted{color:#a7b5cc}
.panel{background:#1a2638;border:1px solid #33435a;border-radius:14px;padding:20px;margin-bottom:22px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
input,select,button{font:inherit;border-radius:8px;padding:10px;box-sizing:border-box}
input,select{background:#0b1320;color:white;border:1px solid #526078;width:100%}
button{background:#35ad86;border:0;color:#081c16;font-weight:700;cursor:pointer}
button.secondary{background:#334a68;color:white}
label{font-size:13px;display:block;margin-bottom:5px;color:#cbd6e7}
table{border-collapse:collapse;width:100%;min-width:800px}
th,td{padding:11px;border-bottom:1px solid #314259;text-align:left;font-size:13px;vertical-align:top}
th{color:#b2c9e4}.scroller{overflow-x:auto}
form.inline{display:inline-flex;gap:5px;align-items:center}
form.inline input,form.inline select{width:auto;max-width:145px;padding:7px}
form.inline button{padding:8px}
p.warn{color:#ffd18d}
.kpi{font-size:25px;font-weight:700;margin:6px 0}
"""
def esc(value):
    return escape(str(value if value is not None else ""), quote=True)


def money(cents):
    return "R$ " + f"{cents / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def summary(db):
    rows = db.execute("SELECT status, due_date, monthly_cents FROM licenses").fetchall()
    active = sum(1 for status, _, _ in rows if status == "active")
    overdue = sum(1 for status, due, _ in rows if status in ("trial", "active") and due < date.today().isoformat())
    mrr = sum(cents for status, _, cents in rows if status == "active")
    return len(rows), active, overdue, mrr


def ensure_payments(db):
    db.execute("""CREATE TABLE IF NOT EXISTS payments(
        id TEXT PRIMARY KEY,
        license_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        paid_on TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY(license_id) REFERENCES licenses(id)
    )""")
    db.commit()


class PanelHandler(BaseHTTPRequestHandler):
    server_version = "ApolloAdmin"
    def _authorized(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False
        try:
            raw = base64.b64decode(header[6:], validate=True).decode()
            username, password = raw.split(":", 1)
        except (ValueError, UnicodeDecodeError):
            return False
        return hmac.compare_digest(username, "admin") and hmac.compare_digest(password, self.server.admin_password)

    def _write(self, code, body, *, content_type="text/html; charset=utf-8", headers=None):
        data = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
        if headers:
            for name, value in headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def _guard(self):
        if self._authorized():
            return True
        self._write(401, "Autenticacao necessaria", content_type="text/plain; charset=utf-8",
                    headers={"WWW-Authenticate": 'Basic realm="Apollo Administrativo", charset="UTF-8"'})
        return False

    def _token(self):
        return '<input type="hidden" name="csrf" value="' + esc(self.server.csrf) + '">'

    def do_GET(self):
        if not self._guard():
            return
        if self.path != "/":
            self._write(404, "Pagina nao encontrada")
            return
        with connect(self.server.db_path) as db:
            ensure_payments(db)
            count, active, overdue, mrr = summary(db)
            clients = db.execute("SELECT id,customer,plan,status,due_date,monthly_cents,domain FROM licenses ORDER BY customer").fetchall()
            pays = db.execute("""SELECT p.paid_on,l.customer,p.amount_cents,p.note FROM payments p
                 JOIN licenses l ON l.id=p.license_id ORDER BY p.paid_on DESC, p.created_at DESC LIMIT 20""").fetchall()

        metrics = "".join(f'<div class="panel"><small>{esc(label)}</small><div class="kpi">{esc(value)}</div></div>'
                          for label, value in (("Clientes",count),("Ativos",active),("Vencidos",overdue),("Mensalidade cadastrada",money(mrr))))
        rows = []
        for lid, customer, plan, status, due, cents, domain in clients:
            token = self._token()
            options = "".join(f'<option value="{s}" {"selected" if status==s else ""}>{s}</option>' for s in STATUSES)
            rows.append(f"""<tr><td>{esc(customer)}<br><small>{esc(lid)}</small></td><td>{esc(plan)}</td>
                <td>{esc(domain)}</td><td>{money(cents)}</td><td>{esc(status)}</td><td>{esc(due)}</td>
                <td>
                <form class="inline" method="post" action="/status">{token}<input type="hidden" name="id" value="{esc(lid)}">
                   <select name="status">{options}</select><button class="secondary">Alterar</button></form>
                <form class="inline" method="post" action="/payment">{token}
                   <input type="hidden" name="id" value="{esc(lid)}">
                   <input type="number" name="amount" min="0.01" max="999999" step="0.01" required placeholder="R$ recebido">
                   <button>Registrar</button></form></td></tr>""")
        history = "".join(f"<tr><td>{esc(d)}</td><td>{esc(n)}</td><td>{money(a)}</td><td>{esc(note)}</td></tr>" for d,n,a,note in pays)
        body = f"""<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Apollo — Administração</title><style>{CSS}</style></head><body>
        <header><h1>Apollo PDV · Administração comercial</h1><small>Área exclusiva do proprietário · Acesso via túnel SSH</small></header>
        <main><div class="grid">{metrics}</div>
        <section class="panel"><h2>Cadastrar restaurante</h2><form method="post" action="/create">{self._token()}
            <div class="grid"><div><label>Nome do cliente</label><input name="customer" maxlength="100" required></div>
            <div><label>Plano</label><select name="plan"><option>Mensal</option><option>Trimestral</option><option>Anual</option></select></div>
            <div><label>Mensalidade (R$)</label><input name="amount" type="number" min="0" max="999999" step="0.01" required></div>
            <div><label>Domínio (opcional)</label><input name="domain" maxlength="200" placeholder="loja.seudominio.com.br"></div>
            <div><label>Dias até vencimento</label><input name="days" type="number" min="1" max="366" value="30" required></div></div>
            <p><button>Cadastrar cliente</button></p></form></section>
        <section class="panel"><h2>Clientes e licenças</h2><div class="scroller"><table><thead><tr>
            <th>Cliente</th><th>Plano</th><th>Domínio</th><th>Valor</th><th>Status</th><th>Vencimento</th><th>Ações</th>
            </tr></thead><tbody>{''.join(rows)}</tbody></table></div></section>
        <section class="panel"><h2>Últimos pagamentos registrados</h2><div class="scroller"><table><thead><tr>
            <th>Data</th><th>Cliente</th><th>Valor</th><th>Observação</th>
            </tr></thead><tbody>{history}</tbody></table></div></section>
        <p class="warn">Pagamentos são lançados manualmente; não há cobrança automática nem bloqueio do sistema do cliente.</p></main></body></html>"""
        self._write(200, body)

    def do_POST(self):
        if not self._guard():
            return
        if self.path not in ("/create", "/status", "/payment"):
            self._write(404, "Nao encontrado")
            return
        if int(self.headers.get("Content-Length", "0")) > 8192:
            self._write(413, "Formulario grande demais")
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0] != "application/x-www-form-urlencoded":
            self._write(415, "Formato invalido")
            return
        # Require the per-process CSRF token even though Basic authentication is used.
        fields = parse_qs(self.rfile.read(int(self.headers.get("Content-Length","0"))).decode("utf-8"), keep_blank_values=True)
        get = lambda key, default="": fields.get(key, [default])[0]
        if not hmac.compare_digest(get("csrf"), self.server.csrf):
            self._write(403, "CSRF invalido")
            return
        try:
            with connect(self.server.db_path) as db:
                if self.path == "/create":
                    customer = get("customer").strip()
                    plan = get("plan").strip()
                    amount = round(float(get("amount")) * 100)
                    days = int(get("days"))
                    domain = get("domain").strip()
                    if not 2 <= len(customer) <= 100 or plan not in ("Mensal","Trimestral","Anual") or not 0 <= amount <= 99999900 or not 1 <= days <= 366 or len(domain) > 200:
                        raise ValueError("Cadastro invalido")
                    db.execute("INSERT INTO licenses VALUES (?,?,?,?,?,?,?,?)", (
                        "APL-" + secrets.token_hex(8).upper(), customer, plan, domain, amount,
                        "trial", (date.today() + timedelta(days=days)).isoformat(), date.today().isoformat()))
                elif self.path == "/status":
                    status = get("status")
                    if status not in STATUSES:
                        raise ValueError("Status invalido")
                    result = db.execute("UPDATE licenses SET status=? WHERE id=?", (status, get("id")))
                    if not result.rowcount:
                        raise ValueError("Cliente nao encontrado")
                else:
                    ensure_payments(db)
                    amount = round(float(get("amount")) * 100)
                    lid = get("id")
                    if not 1 <= amount <= 99999900 or not db.execute("SELECT 1 FROM licenses WHERE id=?", (lid,)).fetchone():
                        raise ValueError("Pagamento invalido")
                    db.execute("INSERT INTO payments VALUES (?,?,?,?,?,?)", (
                        "PAY-" + secrets.token_hex(8).upper(), lid, amount, date.today().isoformat(), "",
                        date.today().isoformat()))
                db.commit()
        except (ValueError, OverflowError, sqlite3.IntegrityError) as ex:
            self._write(400, "Dados invalidos: " + esc(ex), content_type="text/plain; charset=utf-8")
            return
        self.send_response(303)
        self.send_header("Location", "/")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def log_message(self, fmt, *args):
        # Do not log authentication headers or submitted form data.
        super().log_message(fmt, *args)


def main():
    password = os.environ.get("APOLLO_ADMIN_PASSWORD", "")
    if len(password) < 16:
        raise SystemExit("Defina APOLLO_ADMIN_PASSWORD com pelo menos 16 caracteres (somente em variavel de ambiente).")
    db_path = Path(os.environ.get("APOLLO_LICENSE_DB", "./licenses.sqlite3")).resolve()
    server = ThreadingHTTPServer(("127.0.0.1", 8787), PanelHandler)
    server.admin_password = password
    server.csrf = secrets.token_urlsafe(32)
    server.db_path = db_path
    print("Painel privado em http://127.0.0.1:8787 (acesso remoto SOMENTE via tunel SSH)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
