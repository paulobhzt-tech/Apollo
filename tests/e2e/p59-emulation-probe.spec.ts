import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:https';

const worker = `
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).pathname !== '/probe') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() =>
    new Response('<p>fixture fallback</p>', { headers: {
      'Content-Type': 'text/html', 'X-Probe-Fallback': 'yes'
    } })
  ));
});
`;

test('P59 compare offline emulation and real HTTPS loss without Apollo or CacheStorage', async ({ page, context, browser }, info) => {
  const hits: string[] = [];
  const tls = '/tmp/apollo-p41-tls';
  const server = createServer({
    key: await readFile(tls + '/server.key'),
    cert: await readFile(tls + '/server.crt'),
  }, (request, response) => {
    const path = request.url || '/';
    hits.push(path);
    response.setHeader('Cache-Control', 'no-store');
    if (path === '/worker.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript' }).end(worker);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<p>fixture network</p>');
  });
  const stop = () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture listener unavailable');
  const origin = 'https://127.0.0.1:' + address.port;
  try {
    await page.goto(origin);
    await page.evaluate(async () => { await navigator.serviceWorker.register('/worker.js'); });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const online = await page.goto(origin + '/probe?online');
    expect(online?.status()).toBe(200);
    await expect(page.getByText('fixture network')).toBeVisible();
    expect(hits).toContain('/probe?online');

    await context.setOffline(true);
    const pageFetchFailed = await page.evaluate(async () => {
      try { await fetch('/direct', { cache: 'no-store' }); return false; }
      catch { return true; }
    });
    const attempt = await page.goto(origin + '/probe?emulated')
      .then(async response => ({ status: response?.status(), header: await response?.headerValue('x-probe-fallback'), worker: response?.fromServiceWorker() }))
      .catch((error: Error) => ({ error: error.message }));
    const evidence = { browser: browser.version(), project: process.env.P47_BROWSER, pageFetchFailed,
      networkReachedProbe: hits.includes('/probe?emulated'), networkReachedDirect: hits.includes('/direct'), attempt };
    console.log('P59 minimal emulation', JSON.stringify(evidence));
    await info.attach('minimal-emulation', { body: JSON.stringify(evidence), contentType: 'application/json' });

    await context.setOffline(false);
    await stop();
    const real = await page.goto(origin + '/probe?shutdown');
    expect(real?.status()).toBe(200);
    expect(await real?.headerValue('x-probe-fallback')).toBe('yes');
    await expect(page.getByText('fixture fallback')).toBeVisible();
  } finally {
    await stop();
  }
});
