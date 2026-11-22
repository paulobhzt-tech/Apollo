import { test, expect, chromium, firefox, webkit } from '@playwright/test';
import { createServer, request } from 'node:https';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const upstream = new URL(process.env.APOLLO_E2E_BASE_URL || 'https://127.0.0.1:8001');

test('cold start with HTTPS stopped, encrypted drafts, authenticated replay and conflict rollback', async ({ browserName }, info) => {
  test.setTimeout(120_000);
  const profile = await mkdtemp(path.join(tmpdir(), 'apollo-p54-'));
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
    const login = async () => {
      await page.goto(origin + '/login');
      await page.getByLabel('Usuário', { exact: true }).fill('p40admin');
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
    await login();
    await page.goto(origin + '/mesas-offline');
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await unlock(password);
    await expect(page.getByRole('heading', { name: 'Pedidos pendentes (0)' })).toBeVisible();
    await context.close();
    context = undefined;
    await stop();
    context = await launch();
    page = context.pages()[0] ?? await context.newPage();
    expect(await (await page.goto(origin + '/mesas-offline'))?.headerValue('x-apollo-offline-fallback')).toBe('shell');
    await unlock('errada');
    await expect(page.getByRole('status')).toContainText('Senha local inválida');
    await unlock(password);
    await save('mesa', '9591');
    await save('comanda', '9592');
    await page.reload();
    await unlock(password);
    await expect(page.getByRole('heading', { name: 'Pedidos pendentes (2)' })).toBeVisible();
    await info.attach('cold-offline', { body: await page.screenshot(), contentType: 'image/png' });

    await start(address.port);
    await login();
    await page.goto(origin + '/mesas-offline');
    await unlock(password);
    const outbound = page.waitForRequest(req => req.url().endsWith('/api/offline/tables') && req.method() === 'POST');
    const readStock = async () => {
      const result = await context!.request.get(origin + '/api/ingredients');
      expect(result.ok()).toBe(true);
      return (await result.json()).find((item: { id: string }) => item.id === 'p40ing').stock;
    };
    const initial = await readStock();
    await page.getByRole('button', { name: 'Enviar após reconectar' }).click();
    const original = (await outbound).postDataJSON();
    await expect(page.getByRole('heading', { name: 'Pedidos pendentes (0)' })).toBeVisible();
    expect(await readStock()).toBe(initial - 2);
    const post = (data: object) => context!.request.post(origin + '/api/offline/tables', { data, headers: { Origin: origin } });
    const [replayA, replayB] = await Promise.all([post(original), post(original)]);
    expect(replayA.ok() && replayB.ok()).toBe(true);
    expect(await replayA.json()).toEqual(await replayB.json());
    const changed = { ...original, items: [{ ...original.items[0], expected_price: 999 }] };
    expect((await post(changed)).status()).toBe(409);
    expect((await post({ ...changed, client_ref: crypto.randomUUID(), table: { ...original.table, number: 9593 } })).status()).toBe(409);
    const tables = await context.request.get(origin + '/api/tables');
    expect((await tables.json()).filter((table: { number: number }) => [9591, 9592, 9593].includes(table.number))
      .map((table: { number: number }) => table.number).sort()).toEqual([9591, 9592]);
    expect(await readStock()).toBe(initial - 2);
    await info.attach('reconciliation', { body: JSON.stringify({ initial, final: initial - 2, replayIds: await replayA.json() }), contentType: 'application/json' });
  } finally {
    await context?.close();
    await stop();
    await rm(profile, { recursive: true, force: true });
  }
});
