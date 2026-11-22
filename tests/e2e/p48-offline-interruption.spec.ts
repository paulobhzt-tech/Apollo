import { test, expect, chromium, firefox, webkit } from '@playwright/test';
import { createServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

test('P48 offline navigation with real server interruption and no network emulation', async ({ browserName }, testInfo) => {
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
    const target = ['/sw.js', '/index.html', '/apple-touch-icon.png'].includes(url.pathname) ? url.pathname.slice(1)
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
        : target.endsWith('.png') ? 'image/png'
        : target.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing disposable listener');
  const base = 'https://127.0.0.1:' + address.port;
  const profile = await mkdtemp(path.join(tmpdir(), 'apollo-p53-offline-'));
  const launch = () => ({ chromium, firefox, webkit }[browserName]).launchPersistentContext(profile, {
    ...testInfo.project.use,
    ...testInfo.project.use.launchOptions,
    ignoreHTTPSErrors: true,
  });
  let context: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    context = await launch();
    let page = context.pages()[0] ?? await context.newPage();
    await page.goto(base);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
    upstreamUnavailable = true;
    const fallback = await page.goto(base + '/pdv');
    expect(await fallback?.headerValue('x-apollo-offline-fallback')).toBe('shell');
    await expect(page.getByLabel('Usuário', { exact: true })).toBeVisible();
    const api = await page.goto(base + '/api');
    expect(api?.status()).toBe(503);
    await expect(page.getByText('Upstream unavailable')).toBeVisible();
    upstreamUnavailable = false;
    const network = await page.goto(base);
    expect(await network?.headerValue('x-apollo-offline-fallback')).toBeNull();
    await context.close();
    context = undefined;
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    context = await launch();
    page = context.pages()[0] ?? await context.newPage();
    for (const response of [await page.goto(base + '/pdv'), await page.reload()]) {
      expect(await response?.headerValue('x-apollo-offline-fallback')).toBe('shell');
    }
    await expect(page.getByLabel('Usuário', { exact: true })).toBeVisible();
    await testInfo.attach('reopened-offline', { body: await page.screenshot(), contentType: 'image/png' });
    await testInfo.attach('scope', { body: 'HTTP 503, restoration and real loopback HTTPS listener shutdown followed by a fresh browser process using the same profile. Public shell and authentication boundary only.', contentType: 'text/plain' });
  } finally {
    try { await context?.close(); } finally {
      server.closeAllConnections();
      server.close();
      await rm(profile, { recursive: true, force: true });
    }
  }
});
