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
- Cancel/refund permission: `Employee.can_cancel` (admin always allowed; set in Funcionários form). Enforced by `require_cancel` on `POST /api/orders/{id}/cancel` (estorno total), `POST /api/orders/{id}/items/{item_id}/refund` (cancel one item; on paid orders records a partial refund in `order.refunds` and subtracts it from cash/report totals) and table item cancel. History screen: /vendas (últimos itens + vendas).
- Payments in UI: dinheiro, crédito, débito, pix, fiado. Crédito/débito require `brand` (visa | mastercard | elo) — backend 400 without it. Cash totals are keyed "credito:visa" etc.
- Config (/config, admin): printers CRUD (`/api/printers`, browser printing only), general settings `/api/settings/general` (pix_key, pix_holder, phone, address) used by the WhatsApp fiado billing (wa.me link), card fees tab, backup `GET /api/backup` (JSON download of all collections, no PINs/sessions; the user uploads it to Google Drive manually).
- Ambientes de produção (`environments` {key, name, auto_print}; CRUD `/api/environments`, defaults cozinha/churrasqueira/forno/bar ensured at startup). Category.station and optional Product.station override = env key; Product.print_ticket toggles ticket printing. Managed in Cadastro de Produtos → tab Ambientes; product form has Ambiente select + "Imprimir ticket" checkbox. KDS filters by env.
- Auto printing: printer.purpose = "caixa" or env key. /impressao (Central de Impressão) — device picks envs (localStorage), polls `GET /api/print/queue?stations=a,b` and prints each env's items via hidden iframe, then `POST /api/kds/tickets/{id}/printed {station}` (ticket.printed[]). Reprint from recent list (`/api/print/recent`). Silent printing needs Chrome --kiosk-printing (browser limitation).
- Restore backup: `POST /api/backup/restore {data}` (admin) replaces each collection in the file (ISO strings revived to datetimes); employees keep current PINs, unknown ones restored inactive; logged admin kept; order counter bumped to max order number. UI: Configurações → Backup → Restaurar.
- Auto teste: Configurações → tab "Auto teste" → `POST /api/selftest` (admin) returns checks {key,label,status ok|aviso|falha,detail,fix}: banco, acesso, produtos, ambientes, impressoras, fila, caixa, estoque, pagamentos, backup, agendador; plus browser-side internet/offline-queue checks. Last result `GET /api/selftest/last` (settings `_id: selftest_last`).
- Google Drive backup (real OAuth, scope drive.file): env GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET; redirect URI = https://<host>/api/drive/callback (must be registered in Google Cloud for preview + prod hosts). Tokens in settings `_id: drive` (excluded from backups/restore). `/api/drive/status|connect|callback|settings|backup-now`, `DELETE /api/drive`. Uploads to folder "Backups Espeteria", keeps last 14, history of 30 attempts.
- Nightly cron: .emergent/crons.yml `nightly-backup` 03:00 America/Sao_Paulo → `POST /api/cron/nightly-backup` (Bearer WEBHOOK_CRON_SECRET, idempotent by X-Webhook-Id in `cron_runs`, work in background; runs only if connected and auto on).
- Pré-conta: Mesas → table sheet → "Pré-conta" opens PreBillDialog (grouped items, optional 10% service, split per person, PIX key, "não é documento fiscal"), prints via hidden iframe on the caixa printer paper and sets table status "conta". Items are grouped by name+options+price (lib/group.ts) in the table sheet (toggle to item-by-item view for cancelling), the pré-conta and the DANFE/receipt.
- Login: demo quick-access PIN buttons removed (profiles + keypad only).
- Mesas/comandas: free table → status buttons Livre/Ocupada/Reservada (manual "ocupada" can still be opened). Open table → Marcar conta / Voltar p/ ocupada, Liberar (`POST /api/tables/{id}/release`, only when no active items), Cancelar mesa/comanda (`POST /api/tables/{id}/cancel {reason, manager_pin?}` → cancels order, returns stock, frees table). PATCH status with an open order only accepts ocupada/conta.
- Company data in settings general: trade_name, company_name, cnpj, ie, city, receipt_footer (+pix/phone/address) — used by cupom simples, pré-conta and DANFE header.
- Cupom simples (não fiscal, grouped items): PaymentDialog checkbox (pref in localStorage `print-simple-receipt`, default on) prints after PDV/mesa payment; reprint per paid sale in Histórico de Vendas → Vendas ("Cupom"). lib/receipt.ts.
- Nav is grouped: Operação / Financeiro (Caixa, DRE, Histórico, Fiado, Notas) / Cadastros / Sistema.
- Product images: upload is compressed client-side to a JPEG data URL stored in product.image (a URL also works).
- Combos: an option choice whose name matches a product gets a `product_id` link on save; the linked products' recipes and costs are consumed (`OrderItem.option_products`). Seed: category Combos, CB01 "Combo Churras". Options ranking: `GET /api/reports/options`.
- Cash closing report printable per method/brand (Caixa page, also for past shifts).
- Conta Fiado (/fiado): `fiado_customers` (balance, credit_limit) + `customer_moves` (compra/pagamento/estorno). Paying with "fiado" requires `fiado_customer_id` in PayIn and respects credit limit. `POST /api/customers/{id}/receive` needs an open cash session and counts in the cash totals. Refunds of fiado sales give the credit back.
- Manager PIN: cancel/refund endpoints accept `manager_pin`; an unauthorised user succeeds if the PIN belongs to an admin or a can_cancel employee ("autorizado por X" is recorded).
- Card fees: `settings` doc `_id: card_fees` → `fees{"credito:visa": %}`; `GET/PUT /api/settings/card-fees`. The DRE subtracts `card_fees`.
- Product options: `Product.options[]` groups {name, required, multi, choices[{name, price}]}; `OrderItemIn.options[{group, name}]` is validated server-side, extras are added to unit_price, and the labels go to `OrderItem.options` and the KDS ticket. Espetos category and ES01-ES05 products plus burger options come from `seed_extras.py` (idempotent, also called by seed.py).
- App name: "Espeteria Churras Buguer" (RESTAURANT_NAME env default).
- Tables & comandas: `tables` collection has `kind` ("mesa" | "comanda") + optional `name`; unique on (kind, number). Admin/caixa create (batch from Mesas screen "Nova mesa/comanda"), staff rename via `PUT /api/tables/{id}`, delete only when free. Label = "Mesa 3 · Varanda" / "Comanda 105 · Pedro" (stored on order as `table_label`, shown in KDS/QR menu). Same flow for both kinds:
- Tables: open → add items (`/tables/{id}/items` creates kitchen ticket + stock deduction) → pré-conta → pay (`/tables/{id}/pay`, 10% service optional) → table freed. Cancel item w/ reason returns stock. Transfer to free table.
- Stock: each product has recipe (ficha técnica); sales deduct ingredients (type "venda"); CMV = manual `cost_price` when > 0, otherwise recipe cost.
- KDS tickets: novo → preparo → pronto → entregue. Stations cozinha/forno/bar via category.
- Delivery: iFood/99Food/Keeta are MOCKED (`POST /api/delivery/simulate`). Status pendente→aceito(ticket+stock)→saiu→entregue(paid). Fees: iFood 23%, 99Food 15%, Keeta 12%, site 0%.
- NFC-e/NF-e: MOCKED emission (fake access key/protocol), DANFE dialog with QR.
- Cash: open/sangria/suprimento/close with blind count.
- DRE: gross, discounts, marketplace fees, taxes 6% (simulated), CMV, commissions (garçom commission_pct on mesa sales), expenses.

## Seed (python backend/seed.py — wipes collections)
5 employees, 7 categories, 15 products (codes PZ01..SB02), 20 ingredients (Bacon below minimum), 12 tables (Mesa 5 occupied with order, Mesa 12 reserved), ~390 paid historical orders over 20 days, an OPEN cash session, 1 pending iFood order, 6 expenses this month.
