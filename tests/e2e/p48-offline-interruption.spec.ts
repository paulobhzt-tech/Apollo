import { test, expect } from '@playwright/test';
import { createServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('P48 offline navigation with real server interruption and no network emulation', async ({ page }, testInfo) => {
  const root = path.resolve('../frontend/dist');
  let upstreamUnavailable = false;
  const server = createServer({
    key: await readFile('/tmp/apollo-p41-tls/server.key'),
    cert: await readFile('/tmp/apollo-p41-tls/server.crt'),
  }, async (req, res) => {
    const url = new URL(req.url || '/', 'https://localhost');
    if (upstreamUnavailable) {
      res.writeHead(503, { 'Content-Type': 'text/plain' }).end('Upstream unavailable');
      return;
    }
    const target = url.pathname === '/sw.js' ? 'sw.js'
      : url.pathname === '/manifest.webmanifest' ? 'manifest.webmanifest'
      : url.pathname === '/offline.html' ? 'offline.html'
      : url.pathname.startsWith('/assets/') ? url.pathname.slice(1)
      : 'index.html';
    if (target.includes('..')) { res.writeHead(400).end(); return; }
    try {
      const body = await readFile(path.join(root, target));
      const type = target.endsWith('.js') ? 'application/javascript'
        : target.endsWith('.css') ? 'text/css'
        : target.endsWith('.webmanifest') ? 'application/manifest+json'
        : target.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing disposable listener');
  const base = 'https://127.0.0.1:' + address.port;
  try {
    await page.goto(base);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
    upstreamUnavailable = true;
    await page.goto(base + '/pdv');
    await expect(page.getByRole('heading', { name: 'Apollo sem conexão' })).toBeVisible();
    const api = await page.goto(base + '/api');
    expect(api?.status()).toBe(503);
    await expect(page.getByText('Upstream unavailable')).toBeVisible();
    upstreamUnavailable = false;
    await page.goto(base);
    await expect(page.getByRole('heading', { name: 'Apollo sem conexão' })).toHaveCount(0);
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    await page.goto(base + '/pdv');
    await expect(page.getByRole('heading', { name: 'Apollo sem conexão' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Apollo sem conexão' })).toBeVisible();
    await testInfo.attach('scope', { body: 'HTTP 503 and recovery followed by a real loopback HTTPS server stop, using the same disposable TLS certificate as the operational tests. Public fallback only, no offline sales or physical iPhone approval.', contentType: 'text/plain' });
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
