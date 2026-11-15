import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

async function setup(post) {
  const storage = new Map();
  const context = vm.createContext({
    navigator: { onLine: true }, window: { addEventListener() {}, removeEventListener() {} },
    setTimeout() {}, setInterval() {}, console,
  });
  const stubs = {
    react: { useSyncExternalStore() {} },
    './api': { ApiError: class ApiError extends Error {}, apiPost: post },
    './queryClient': { queryClient: { invalidateQueries() {} } },
    './desktop': { deviceTag: () => 'test', kv: {
      get: key => storage.get(key) ?? null,
      set: (key, value) => storage.set(key, value),
    } },
  };
  const source = readFileSync(new URL('../src/lib/offline.ts', import.meta.url), 'utf8');
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(source), { context });
  await mod.link(specifier => {
    const values = stubs[specifier];
    assert.ok(values, `Unexpected import ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return { api: mod.namespace, queue: () => JSON.parse(storage.get('pdv_offline_queue')) };
}
const sale = ref => ({ payload: { client_ref: ref }, total: 10, queued_at: '2026-11-15' });

test('sale enqueued during an awaited replay survives synchronization', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { api, queue } = await setup(() => pending);
  api.enqueue(sale('original'));
  const sync = api.syncQueue();
  api.enqueue(sale('new-sale'));
  release({});
  assert.equal((await sync).synced, 1);
  assert.deepEqual(queue().map(s => s.payload.client_ref), ['new-sale']);
});

test('network failure preserves both the attempted sale and new arrivals', async () => {
  let fail;
  const pending = new Promise((_, reject) => { fail = reject; });
  const { api, queue } = await setup(() => pending);
  api.enqueue(sale('original'));
  const sync = api.syncQueue();
  api.enqueue(sale('new-sale'));
  fail(new Error('network interrupted'));
  assert.equal((await sync).synced, 0);
  assert.deepEqual(queue().map(s => s.payload.client_ref), ['original', 'new-sale']);
});

test('successful replay removes only completed entries and does not send arrivals early', async () => {
  const sent = [];
  let api;
  const setupResult = await setup(async (_, payload) => {
    sent.push(payload.client_ref);
    if (payload.client_ref === 'first') api.enqueue(sale('third'));
  });
  api = setupResult.api;
  api.enqueue(sale('first'));
  api.enqueue(sale('second'));
  await api.syncQueue();
  assert.deepEqual(sent, ['first', 'second']);
  assert.deepEqual(setupResult.queue().map(s => s.payload.client_ref), ['third']);
  await api.syncQueue();
  assert.deepEqual(sent, ['first', 'second', 'third']);
  assert.deepEqual(setupResult.queue(), []);
});
