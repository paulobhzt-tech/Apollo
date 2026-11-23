import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';

const dist = new URL('../frontend/dist/', import.meta.url);
const worker = await readFile(new URL('sw.js', dist), 'utf8');
const cache = /const CACHE = "([^"]+)";/.exec(worker)?.[1];
assert.ok(cache);
const legacy = execFileSync('git', [
  'show', 'fd3a66fd19a94d8bad09d754f9f2a5f6dee4a506:frontend/public/sw.js',
], { cwd: new URL('../', import.meta.url) });
let updating = false;
let upstreamUnavailable = false;
const server = createServer({
  cert: await readFile('/tmp/apollo-p41-tls/server.crt'),
  key: await readFile('/tmp/apollo-p41-tls/server.key'),
}, async (request, response) => {
  try {
    if (upstreamUnavailable) {
      response.writeHead(503);
      return response.end();
    }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/sw.js') {
      response.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' });
      return response.end(updating ? worker : legacy);
    }
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (name.startsWith('api/')) {
      response.writeHead(401, { 'content-type': 'application/json' });
      return response.end('{}');
    }
    const body = await readFile(new URL(name, dist));
    const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.js') ? 'text/javascript' :
      name.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'https://127.0.0.1:' + server.address().port;
const engines = { chromium, firefox, webkit };
const profile = await mkdtemp(join(tmpdir(), 'apollo-p61-'));
const browserType = engines[process.argv[2] || 'chromium'];
const spki = process.env.APOLLO_TEST_TLS_SPKI;
const launch = () => browserType.launchPersistentContext(profile, {
  ignoreHTTPSErrors: true,
  args: spki && browserType === chromium ? ['--ignore-certificate-errors-spki-list=' + spki] : [],
});
const submission = { ref: 'p61-fictitious', orderId: 'p61-order', payload: '[]', autoSync: true };
let context;

try {
  context = await launch();
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(origin);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(value => new Promise((resolve, reject) => {
    const open = indexedDB.open('apollo-table-submissions', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('submissions');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('submissions', 'readwrite');
      tx.objectStore('submissions').put(value, 'p61');
      tx.oncomplete = () => { open.result.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), submission);
  updating = true;
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).waiting !== null);
  assert.deepEqual((await page.evaluate(() => caches.keys())).sort(), ['apollo-public-v2', cache].sort());
  await page.close();
  const activated = await context.newPage();
  await activated.goto(origin);
  await activated.waitForFunction(async name => {
    const registration = await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    return navigator.serviceWorker.controller === registration.active &&
      keys.length === 1 && keys[0] === name &&
      Boolean(await (await caches.open(name)).match('/index.html'));
  }, cache);
  await context.close();

  context = await launch();
  const reopened = context.pages()[0] ?? await context.newPage();
  await reopened.goto(origin);
  await reopened.waitForFunction(async name => {
    const keys = await caches.keys();
    return navigator.serviceWorker.controller && keys.length === 1 && keys[0] === name &&
      Boolean(await (await caches.open(name)).match('/index.html'));
  }, cache);
  const saved = await reopened.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('apollo-table-submissions', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('submissions').objectStore('submissions').get('p61');
      request.onsuccess = () => { open.result.close(); resolve(request.result); };
      request.onerror = () => reject(request.error);
    };
  }));
  assert.deepEqual(saved, submission);
  // A local gateway outage exercises fallback without browser-specific emulation.
  upstreamUnavailable = true;
  const offline = await reopened.goto(origin + '/pdv');
  assert.equal(await offline.headerValue('x-apollo-offline-fallback'), 'shell',
    `Unexpected navigation response ${offline.status()} ${offline.url()}`);
  await reopened.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
  console.log(browserType.name(), 'legacy cache migrated, pending IndexedDB submission preserved, offline login shell rendered');
} finally {
  if (context) await context.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
