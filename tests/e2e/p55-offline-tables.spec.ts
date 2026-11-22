import { test, expect, chromium, firefox, webkit } from '@playwright/test';
import { createServer, request } from 'node:https';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const upstream = new URL(process.env.APOLLO_E2E_BASE_URL || 'https://127.0.0.1:8001');

for (const [actor, baseNumber] of [['p40admin', 9591], ['p40caixa1', 9601], ['p40garcom', 9611]] as const) {
test(`P55 ${actor} reopens encrypted drafts and replays automatically after HTTPS interruption`, async ({ browserName }, info) => {
  test.setTimeout(120_000);
  const profile = await mkdtemp(path.join(tmpdir(), 'apollo-p55-'));
  const tlsRoot = '/tmp/apollo-p41-tls/';
  const [key, cert, ca] = await Promise.all(['server.key', 'server.crt', 'apollo-local-ca.crt'].map(name => readFile(tlsRoot + name)));
  const server = createServer({ key, cert }, (incoming, outgoing) => {
    const proxy = request({
      hostname: upstream.hostname, port: upstream.port, path: incoming.url,
      method: incoming.method, headers: incoming.headers, ca,
    }, response => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    proxy.once('error', () => outgoing.destroy());
    incoming.pipe(proxy);
  });
  const start = (port: number) => new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const stop = () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  await start(0);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Listener indisponível');
  const origin = 'https://127.0.0.1:' + address.port;
  const password = 'P54-Cofre-Ficticio-Longo';
  const launch = () => ({ chromium, firefox, webkit }[browserName]).launchPersistentContext(profile, {
    ...info.project.use, ...info.project.use.launchOptions, ignoreHTTPSErrors: true,
  });
  let context: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    context = await launch();
    let page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(20_000);
    const login = async (username: string = actor) => {
      await page.goto(origin + '/login');
      await page.getByLabel('Usuário', { exact: true }).fill(username);
      await page.getByLabel('Senha', { exact: true }).fill('P40-Fictitious-Password!');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
    };
    const unlock = async (secret: string) => {
      await page.getByLabel('Senha local').fill(secret);
      await page.getByRole('button', { name: 'Abrir cofre' }).click();
    };
    const save = async (kind: 'mesa' | 'comanda', number: string) => {
      await page.getByLabel('Tipo').selectOption(kind);
      await page.getByLabel('Número').fill(number);
      await page.getByLabel('Produto').selectOption('p40product');
      await page.getByLabel('Observação').fill('P54 fictício sem rede');
      await page.getByRole('button', { name: 'Adicionar item' }).click();
      await page.getByRole('button', { name: 'Salvar pedido no dispositivo' }).click();
      await expect(page.getByRole('status')).toContainText('Pedido gravado');
    };
    const serverPost = (path: string, data: object) => context!.request.post(origin + '/api' + path, { data, headers: { Origin: origin } });
    let own: { id: string; order_id: string } | undefined;
    let other: { id: string; order_id: string } | undefined;
    if (actor === 'p40garcom') {
      await login('p40admin');
      const openedOther = await serverPost('/tables/p40table402/open', { people: 1 });
      expect(openedOther.ok()).toBe(true);
      other = await openedOther.json();
    }
    await login();
    if (actor === 'p40garcom') {
      const opened = await serverPost('/tables/p40table401/open', { people: 1 });
      expect(opened.ok()).toBe(true);
      own = await opened.json();
      const snapshot = await context.request.get(origin + '/api/offline/table-profile');
      const profile = await snapshot.json();
      expect(profile.can_create).toBe(false);
      expect(profile.tables.map((row: {id: string}) => row.id)).toContain(own!.id);
      expect(profile.tables.map((row: {id: string}) => row.id)).not.toContain('p40table402');
      const unauthorized = await serverPost('/offline/tables', {
        client_ref: crypto.randomUUID(), table: { number: baseNumber }, sync_context: profile.context,
        items: [{product_id: 'p40product', qty: 1, notes: '', expected_price: 10}],
      });
      expect(unauthorized.status()).toBe(403);
    }
    await page.goto(origin + '/mesas-offline');
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {timeout: 20_000}).toBe(true);
    await unlock(password);
    await expect(page.getByRole('heading', { name: 'Pedidos pendentes (0)' })).toBeVisible();
    await context.close();
    context = undefined;
    await stop();
    context = await launch();
    page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(20_000);
    expect(await (await page.goto(origin + '/mesas-offline'))?.headerValue('x-apollo-offline-fallback')).toBe('shell');
    await unlock('errada');
    await expect(page.getByRole('status')).toContainText('Senha local inválida');
    await unlock(password);
    if (own) {
      await page.getByLabel('Atendimento', {exact: true}).selectOption(own.id);
      await page.getByLabel('Produto').selectOption('p40product');
      await page.getByRole('button', {name: 'Adicionar item'}).click();
      await page.getByRole('button', {name: 'Salvar pedido no dispositivo'}).click();
      await expect(page.getByRole('status')).toContainText('Pedido gravado');
    } else {
      await save('mesa', String(baseNumber));
      await save('comanda', String(baseNumber + 1));
    }
    const count = own ? 1 : 2;
    await page.reload();
    await unlock(password);
    await expect(page.getByRole('heading', { name: `Pedidos pendentes (${count})` })).toBeVisible();
    await page.getByRole('button', { name: 'Fechar cofre' }).click();
    await page.clock.setFixedTime(new Date(Date.now() + 9 * 3_600_000));
    await unlock(password);
    await expect(page.getByRole('status')).toContainText('renovar o acesso local');
    await page.clock.setFixedTime(new Date());
    await unlock(password);
    await expect(page.getByRole('heading', { name: `Pedidos pendentes (${count})` })).toBeVisible();
    await info.attach('cold-offline', { body: await page.screenshot(), contentType: 'image/png' });

    const outbound = page.waitForRequest(req => req.url().endsWith('/api/offline/tables') && req.method() === 'POST');
    const readCount = async () => {
      const result = await context!.request.get(origin + (own ? '/api/tables/' + own.id + '/order' : '/api/ingredients'));
      expect(result.ok()).toBe(true);
      const data = await result.json();
      return own ? data.items.length : data.find((item: { id: string }) => item.id === 'p40ing').stock;
    };
    await start(address.port);
    const initial = await readCount();
    const final = own ? initial + 1 : initial - 2;
    const original = (await outbound).postDataJSON();
    await expect(page.getByRole('heading', { name: 'Pedidos pendentes (0)' })).toBeVisible({timeout: 30_000});
    expect(await readCount()).toBe(final);
    const post = (data: object) => context!.request.post(origin + '/api/offline/tables', { data, headers: { Origin: origin } });
    const [replayA, replayB] = await Promise.all([post(original), post(original)]);
    expect(replayA.ok() && replayB.ok()).toBe(true);
    expect(await replayA.json()).toEqual(await replayB.json());
    const foreign = { ...original, sync_context: { ...original.sync_context, operator_id: actor === 'p40garcom' ? 'p40admin' : 'p40garcom' } };
    expect((await post(foreign)).status()).toBe(403);
    if (own && other) {
      const createAttempt = {...original, client_ref: crypto.randomUUID(), existing: undefined};
      expect((await post(createAttempt)).status()).toBe(403);
      const foreignOrder = {...original, client_ref: crypto.randomUUID(), existing: {table_id: other.id, order_id: other.order_id}};
      expect((await post(foreignOrder)).status()).toBe(409);
      const staleOrder = {...original, client_ref: crypto.randomUUID(), existing: {table_id: own.id, order_id: crypto.randomUUID()}};
      expect((await post(staleOrder)).status()).toBe(409);
    }
    const changed = { ...original, items: [{ ...original.items[0], expected_price: 999 }] };
    expect((await post(changed)).status()).toBe(409);
    expect((await post({ ...changed, client_ref: crypto.randomUUID(), table: { ...original.table, number: baseNumber + 2 } })).status()).toBe(409);
    const tables = await context.request.get(origin + '/api/tables');
    expect((await tables.json()).filter((table: { number: number }) => [baseNumber, baseNumber + 1, baseNumber + 2].includes(table.number))
      .map((table: { number: number }) => table.number).sort()).toEqual(own ? [] : [baseNumber, baseNumber + 1]);
    expect(await readCount()).toBe(final);
    await page.getByRole('button', { name: 'Apagar cofre vazio' }).click();
    await expect(page.getByRole('status')).toContainText('Cofre local apagado');
    await stop();
    await page.reload();
    await unlock(password);
    await expect(page.getByRole('status')).toContainText('preparar ou renovar');
    await info.attach('reconciliation', { body: JSON.stringify({ initial, final, replayIds: await replayA.json() }), contentType: 'application/json' });
  } finally {
    await context?.close();
    await stop();
    await rm(profile, { recursive: true, force: true });
  }
});
}
