# ChefControl — PDV & Gestão para alimentação (spec)

Dark-themed POS/management app for restaurants, bars, pizzerias & delivery (pt-BR, R$).
Stack: FastAPI + Mongo (backend/routers/*, models/schemas.py) · Vite React TS (frontend/src/pages/*). Types mirrored in frontend/src/lib/types.ts.

## Auth
- PIN login (`POST /api/auth/login {pin}`) → httpOnly cookie `pdv_session` (14h). `GET /api/auth/me`. Public `GET /api/auth/profiles`.
- Roles: admin (everything), caixa (painel, PDV, mesas, KDS, delivery, caixa, notas, estoque), garcom (mesas, KDS, QR codes), cozinha (KDS, estoque).
- Seed PINs: see memory/test_credentials.md.

## Screens
/login, / (dashboard), /pdv, /mesas, /cozinha (KDS), /delivery, /caixa, /notas, /produtos (cardápio + ficha técnica), /estoque, /financeiro (DRE + despesas), /funcionarios, /qrcodes.
Public (no login): /cardapio/:tableId (QR table menu → order goes to table comanda + KDS, call waiter/bill), /pedir (own delivery site, 0% fee, tracking).

## Key flows / rules
- PDV `POST /api/pdv/sale` = create+pay atomically, idempotent by `client_ref`. Requires open cash session. Multi-payment, change only in cash, discount, split display.
- Offline: header toggle "Online/Offline" forces contingency; PDV sales queue in localStorage and replay to /pdv/sale when back online.
- Tables: open → add items (`/tables/{id}/items` creates kitchen ticket + stock deduction) → pré-conta → pay (`/tables/{id}/pay`, 10% service optional) → table freed. Cancel item w/ reason returns stock. Transfer to free table.
- Stock: each product has recipe (ficha técnica); sales deduct ingredients (type "venda"); CMV = recipe cost.
- KDS tickets: novo → preparo → pronto → entregue. Stations cozinha/forno/bar via category.
- Delivery: iFood/99Food/Keeta are MOCKED (`POST /api/delivery/simulate`). Status pendente→aceito(ticket+stock)→saiu→entregue(paid). Fees: iFood 23%, 99Food 15%, Keeta 12%, site 0%.
- NFC-e/NF-e: MOCKED emission (fake access key/protocol), DANFE dialog with QR.
- Cash: open/sangria/suprimento/close with blind count.
- DRE: gross, discounts, marketplace fees, taxes 6% (simulated), CMV, commissions (garçom commission_pct on mesa sales), expenses.

## Seed (python backend/seed.py — wipes collections)
5 employees, 7 categories, 15 products (codes PZ01..SB02), 20 ingredients (Bacon below minimum), 12 tables (Mesa 5 occupied with order, Mesa 12 reserved), ~390 paid historical orders over 20 days, an OPEN cash session, 1 pending iFood order, 6 expenses this month.
