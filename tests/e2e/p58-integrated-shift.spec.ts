import { chromium, expect, request as playwrightRequest, test } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { createServer, request } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const backendPort = Number(process.env.APOLLO_P58_BACKEND_PORT ?? 8001);
const backend = `https://127.0.0.1:${backendPort}`;
const fixturePassword = 'P40-Fictitious-Password!';
const vaultPassword = 'P58-Cofre-Ficticio-Longo';

async function json(response: APIResponse) {
  if (!response.ok()) throw new Error(`${response.status()} ${response.url()}: ${await response.text()}`);
  return response.json();
}

const post = async (client: APIRequestContext, pathname: string, data: object) =>
  json(await client.post('/api' + pathname, { data }));

test('P58 two cashiers reconcile 25 sales while a disconnected waiter retains and replays drafts', async ({}, info) => {
  test.setTimeout(180_000);
  expect(process.env.DB_NAME).toBe('apollo_p40_browser_p58_integrated');
  expect(Number.isInteger(backendPort) && backendPort > 0 && backendPort <= 65535).toBe(true);
  expect(process.env.MONGO_URL).toMatch(/^mongodb:\/\/127\.0\.0\.1:\d+\//);
  const tls = '/tmp/apollo-p41-tls';
  const [key, cert, ca] = await Promise.all(['server.key', 'server.crt', 'apollo-local-ca.crt'].map(name => readFile(join(tls, name))));
  let lostResponses = 0;
  const server = createServer({ key, cert }, (incoming, outgoing) => {
    const upstream = request(backend + incoming.url, { method: incoming.method, headers: incoming.headers, ca }, response => {
      if (!lostResponses && incoming.method === 'POST' && incoming.url === '/api/offline/tables' && response.statusCode === 200) {
        response.once('end', () => { lostResponses++; outgoing.destroy(); });
        response.resume();
        return;
      }
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.once('error', () => outgoing.destroy());
    incoming.pipe(upstream);
  });
  const start = (port: number) => new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const stop = () => new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
  const profile = await mkdtemp(join(tmpdir(), 'apollo-p58-waiter-'));
  const clients: APIRequestContext[] = [];
  let waiter: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    await start(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing disposable HTTPS listener');
    const origin = `https://127.0.0.1:${address.port}`;
    const launchWaiter = () => chromium.launchPersistentContext(profile, {
      ...info.project.use.launchOptions,
      ignoreHTTPSErrors: true,
    });
    const operators = ['p40caixa1', 'p40caixa2'];
    for (const username of operators) {
      const client = await playwrightRequest.newContext({ baseURL: backend, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: backend } });
      clients.push(client);
      await post(client, '/auth/login', { username, password: fixturePassword });
    }
    const cashiers = clients;
    const sessions = await Promise.all(cashiers.map(client => post(client, '/cash/open', { opening_amount: 0 })));
    expect(new Set(sessions.map(session => session.id)).size).toBe(2);
    expect(sessions.map(session => session.opened_by_id)).toEqual(operators);
    const ingredientStock = async () => (await json(await cashiers[0].get('/api/ingredients')))
      .find((ingredient: { id: string }) => ingredient.id === 'p40ing').stock;
    const initialStock = await ingredientStock();
    const tables = [];
    for (const [number, kind] of [[9821, 'mesa'], [9822, 'comanda'], [9823, 'mesa']] as const) {
      tables.push(await post(cashiers[0], '/tables', { number, kind }));
    }
    waiter = await launchWaiter();
    let page = waiter.pages()[0] ?? await waiter.newPage();
    await page.goto(origin + '/login');
    await page.getByLabel('Usuário', { exact: true }).fill('p40garcom');
    await page.getByLabel('Senha', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
    for (const table of tables.slice(0, 2)) {
      await json(await waiter.request.post(origin + '/api/tables/' + table.id + '/open', {
        data: { people: 1 }, headers: { Origin: origin },
      }));
    }
    await page.goto(origin + '/mesas-offline');
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 25_000 }).toBe(true);
    const unlock = async () => {
      await page.getByLabel('Senha local').fill(vaultPassword);
      await page.getByRole('button', { name: 'Abrir cofre' }).click();
    };
    const pending = (count: number) => page.getByRole('heading', { name: `Pedidos pendentes (${count})` });
    await unlock();
    await expect(pending(0)).toBeVisible();
    await stop();
    await expect(waiter.request.get(origin + '/api/')).rejects.toThrow(/ECONNREFUSED/);
    const salePrefix = 'p58-' + crypto.randomUUID();
    const firstSaleAt = Date.now();
    const sale = (index: number) => {
      const cashier = index % 2;
      const payload = {
        client_ref: `${salePrefix}-${index}`,
        expected_cash_session_id: sessions[cashier].id,
        items: [{ product_id: 'p40product', qty: 1 }],
        payments: [{ method: 'dinheiro', amount: 6 }, { method: 'pix', amount: 4 }],
        emit_invoice: false, send_to_kitchen: false,
      };
      return Promise.all([
        post(cashiers[cashier], '/pdv/sale', payload),
        post(cashiers[cashier], '/pdv/sale', payload),
      ]).then(([first, replay]) => ({ cashier, first: first.order, replay: replay.order }));
    };
    const salesRun = Promise.allSettled(Array.from({ length: 25 }, (_, index) => sale(index)));
    await waiter.close();
    waiter = await launchWaiter();
    page = waiter.pages()[0] ?? await waiter.newPage();
    expect(await (await page.goto(origin + '/mesas-offline'))?.headerValue('x-apollo-offline-fallback')).toBe('shell');
    await unlock();
    for (const table of tables.slice(0, 2)) {
      await page.getByLabel('Atendimento', { exact: true }).selectOption(table.id);
      await page.getByLabel('Produto').selectOption('p40product');
      await page.getByRole('button', { name: 'Adicionar item' }).click();
      await page.getByRole('button', { name: 'Salvar pedido no dispositivo' }).click();
      await expect(page.getByRole('status')).toContainText('Pedido gravado');
    }
    await waiter.close();
    waiter = await launchWaiter();
    page = waiter.pages()[0] ?? await waiter.newPage();
    await page.goto(origin + '/mesas-offline');
    await unlock();
    await expect(pending(2)).toBeVisible();
    await info.attach('two-durable-offline-drafts', { body: await page.screenshot(), contentType: 'image/png' });

    const submitted = await salesRun;
    const sales = submitted.map(result => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
    expect(new Set(sales.map(sale => sale.first.id)).size).toBe(25);
    for (const { cashier, first, replay } of sales) {
      expect(replay.id).toBe(first.id);
      expect(first.cash_session_id).toBe(sessions[cashier].id);
      expect(first.waiter_id).toBe(operators[cashier]);
      const audit = first.audit_events.find((event: { action: string }) => event.action === 'counter_sale_created');
      expect(audit.actor_id).toBe(operators[cashier]);
      expect(Date.parse(audit.at)).toBeGreaterThanOrEqual(firstSaleAt - 1000);
      expect(first.status).toBe('pago');
      expect(first.payments.map(({ method, amount }: { method: string; amount: number }) => ({ method, amount })))
        .toEqual([{ method: 'dinheiro', amount: 6 }, { method: 'pix', amount: 4 }]);
      expect(Date.parse(first.paid_at)).toBeGreaterThanOrEqual(firstSaleAt - 1000);
    }
    const persisted = await json(await cashiers[0].get('/api/orders?status=pago&limit=500'));
    expect(persisted.filter((order: { client_ref: string | null }) => order.client_ref?.startsWith(salePrefix))).toHaveLength(25);
    expect(await ingredientStock()).toBe(initialStock - 25);
    await post(cashiers[0], `/tables/${tables[1].id}/transfer`, { target_table_id: tables[2].id });

    const receipts = new Map<string, object>();
    page.on('request', req => {
      if (req.method() === 'POST' && req.url().endsWith('/api/offline/tables')) {
        const body = req.postDataJSON();
        receipts.set(body.existing.table_id, body);
      }
    });
    await start(address.port);
    await expect(pending(1)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Revisão necessária (HTTP 409)', { exact: false })).toBeVisible();
    expect(lostResponses).toBe(1);
    expect(receipts.size).toBe(2);
    const order = await json(await cashiers[0].get(`/api/tables/${tables[0].id}/order`));
    expect(order.items).toHaveLength(1);
    expect(order.items[0].ordered_by).toBe('p40garcom');
    expect(Date.parse(order.items[0].ordered_at)).toBeGreaterThanOrEqual(firstSaleAt - 1000);
    expect(order.payments).toEqual([]);
    const moved = await json(await cashiers[0].get(`/api/tables/${tables[2].id}/order`));
    expect(moved.items).toEqual([]);
    const stockAfter = await ingredientStock();
    expect(stockAfter).toBe(initialStock - 26);
    await page.getByRole('button', { name: 'Fechar cofre' }).click();
    await waiter.close();
    waiter = await launchWaiter();
    page = waiter.pages()[0] ?? await waiter.newPage();
    await page.goto(origin + '/mesas-offline');
    await unlock();
    await expect(pending(1)).toBeVisible();
    await expect(page.getByText('Revisão necessária (HTTP 409)', { exact: false })).toBeVisible();

    const balanced = [];
    for (const [index, client] of cashiers.entries()) {
      const salesCount = index === 0 ? 13 : 12;
      const cash = await json(await client.get('/api/cash/current'));
      expect(cash.totals_by_method).toEqual({ dinheiro: salesCount * 6, pix: salesCount * 4 });
      expect(cash.expected_cash).toBe(salesCount * 6);
      const closed = await post(client, '/cash/close', { counted_amount: salesCount * 6, expected_session_id: sessions[index].id });
      expect(closed.difference).toBe(0);
      balanced.push({ operator: operators[index], sales: salesCount, cash: closed.expected_cash, difference: closed.difference });
    }
    const evidence = { sales: 25, saleRequests: 50, registers: balanced, offlineOrders: 1, conflicts: 1, lostResponses, initialStock, stockAfter };
    console.log(JSON.stringify(evidence));
    await info.attach('p58-reconciliation', { body: JSON.stringify(evidence), contentType: 'application/json' });
  } finally {
    await Promise.all(clients.map(client => client.dispose()));
    await waiter?.close();
    await stop();
    await rm(profile, { recursive: true, force: true });
  }
});
