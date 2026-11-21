import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('P48 offline navigation with real server interruption and no network emulation', async ({ page }, testInfo) => {
  const root = path.resolve('../frontend/dist');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
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
  const base = 'http://127.0.0.1:' + address.port;
  try {
    await page.goto(base);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    await page.goto(base + '/pdv');
    await expect(page.getByRole('heading', { name: 'Apollo sem conexão' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Apollo sem conexão' })).toBeVisible();
    await testInfo.attach('scope', { body: 'Real loopback HTTP server stopped; secure-context loopback exception. Public fallback only, no offline sales or physical iPhone approval.', contentType: 'text/plain' });
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
