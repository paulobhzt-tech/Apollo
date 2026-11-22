import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const origin = 'http://127.0.0.1:18057';
const worker = await readFile(path.join(process.env.APOLLO_TEST_BUILD, 'sw.js'), 'utf8');
const cacheName = /const CACHE = "([^"]+)";/.exec(worker)?.[1];
assert.ok(cacheName, 'Built worker must name its content-addressed cache');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(origin + '/login');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const active = await page.evaluate(async () => ({
    script: navigator.serviceWorker.controller.scriptURL,
    caches: await caches.keys(),
    entries: (await (await caches.open((await caches.keys())[0])).keys()).map(req => new URL(req.url).pathname),
  }));
  assert.equal(active.script, origin + '/sw.js');
  assert.deepEqual(active.caches, [cacheName]);
  assert.ok(active.entries.includes('/index.html'));
  assert.ok(active.entries.every(value => value !== '/api' && !value.startsWith('/api/')));
  await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
  console.log('Chromium via Apache: worker candidato em controle, cache correspondente e login renderizado.');
} finally {
  await browser.close();
}
