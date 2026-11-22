import {test,expect,chromium,firefox,webkit,request,Page} from '@playwright/test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer,request as httpsRequest} from 'node:https';
import path from 'node:path';
const base = process.env.APOLLO_E2E_BASE_URL || 'https://127.0.0.1:8001';
async function login(page:Page, origin=base, username='p40admin') {
  await page.goto(origin);
  await page.getByLabel('Usuário',{exact:true}).fill(username);
  await page.getByLabel('Senha',{exact:true}).fill('P40-Fictitious-Password!');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
}
async function noOverflow(page:Page) {
  expect(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth})))
    .toEqual(expect.objectContaining({width:expect.any(Number)}));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'document horizontal overflow').toBe(true);
}
async function pay(page:Page,mixed=false) {
  const dialog=page.getByTestId('payment-dialog');
  await expect(dialog).toBeVisible();
  const invoice=page.getByTestId('payment-emit-invoice-checkbox');
  if(await invoice.isVisible()) await invoice.uncheck();
  const service=page.getByTestId('payment-service-checkbox');
  if(await service.isVisible()) await service.uncheck();
  if(mixed) {
    await page.getByTestId('payment-amount-input').fill('5,00');
    await page.getByTestId('payment-add-button').click();
    await page.getByTestId('payment-method-credito').click();
    await page.getByTestId('card-brand-visa').click();
  }
  await page.getByTestId('payment-add-button').click();
  await expect(page.getByTestId('payment-remaining')).toContainText('0,00');
  await noOverflow(page);
  await page.getByTestId('payment-confirm-button').click();
  await expect(dialog).toBeHidden();
}
test('UI operational shift: tables, shared customers, transfer, comanda, mixed payment, closing',async({browser},info)=>{
  test.setTimeout(240000);
  const context=await browser.newContext({...info.project.use,baseURL:base,ignoreHTTPSErrors:true});
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('dialog',d=>d.accept());
  try {
    await login(page);
    await page.goto(base+'/caixa');
    await page.getByTestId('cash-opening-input').fill('100,00');
    const opening=page.waitForResponse(r=>r.url().endsWith('/api/cash/open')&&r.request().method()==='POST');
    await page.getByTestId('cash-open-button').click();
    expect((await opening).ok()).toBe(true);
    await expect(page.getByTestId('cash-open-panel')).toBeHidden();
    await page.goto(base+'/mesas');
    const start=info.project.name==='desktop'?9541:9551;
    for(const n of [start,start+1]) {
      await page.getByTestId('new-table-open-button').click();
      await page.getByTestId('new-table-number').fill(String(n));
      await page.getByTestId('new-table-qty').fill('1');
      await page.getByTestId('new-table-save').click();
      await expect(page.getByTestId('new-table-dialog')).toBeHidden();
    }
    await page.getByTestId('table-card-'+start).click();
    await page.getByTestId('open-table-people-input').fill('2');
    await page.getByTestId('open-table-name-input').fill('Ana P43');
    await page.getByTestId('open-table-button').click();
    await page.getByTestId('table-customer-name').fill('Bia P43');
    await page.getByTestId('table-customers').getByRole('button',{name:'Adicionar',exact:true}).click();
    await page.getByTestId('table-save-customers').click();
    await expect(page.getByText('Clientes da mesa atualizados',{exact:true})).toBeVisible();
    await page.getByTestId('add-items-button').click();
    await page.locator('[data-testid^="product-card-"]').filter({hasText:'Espetinho P40'}).click();
    await page.getByTestId('send-to-kitchen-button').click();
    const send=page.waitForResponse(r=>/\/api\/tables\/[^/]+\/items$/.test(r.url())&&r.request().method()==='POST');
    await page.getByTestId('waiter-confirm-send').click();
    expect((await send).ok()).toBe(true);
    await expect(page.getByTestId('table-order-total')).toContainText('10,00');
    await noOverflow(page);
    await page.getByTestId('transfer-select').click();
    await page.getByRole('option',{name:new RegExp('Mesa '+(start+1)+'$','i')}).click();
    if (process.env.APOLLO_P57_ONLINE_GUARD === '1') {
      const operations: string[] = [];
      const observe = (request: import('@playwright/test').Request) => {
        if (request.method() === 'POST' && /\/(transfer|cancel|pay)$/.test(new URL(request.url()).pathname)) operations.push(request.url());
      };
      page.on('request', observe);
      await context.setOffline(true);
      await expect(page.getByTestId('table-online-required')).toBeVisible();
      for (const testId of ['transfer-button', 'table-cancel-button', 'close-table-button']) {
        await expect(page.getByTestId(testId)).toBeDisabled();
      }
      await expect(page.getByRole('button', {name: 'Dividir por cliente ou itens'})).toBeDisabled();
      expect(operations).toEqual([]);
      await context.setOffline(false);
      await expect(page.getByTestId('transfer-button')).toBeEnabled();
      expect(operations).toEqual([]);
      page.off('request', observe);
    }
    await page.getByTestId('transfer-button').click();
    await expect(page.getByTestId('table-sheet')).toBeHidden();
    await page.getByTestId('table-card-'+(start+1)).click();
    await page.getByTestId('close-table-button').click();
    await pay(page,true);
    await page.getByTestId('table-workspace-close').click();
    await page.getByTestId('kind-tab-comanda').click();
    await page.getByTestId('new-table-open-button').click();
    await page.getByTestId('new-table-number').fill(String(start));
    await page.getByTestId('new-table-qty').fill('1');
    await page.getByTestId('new-table-save').click();
    await expect(page.getByTestId('new-table-dialog')).toBeHidden();
    await page.getByTestId('comanda-card-'+start).click();
    await page.getByTestId('open-table-button').click();
    await page.getByTestId('add-items-button').click();
    await page.locator('[data-testid^="product-card-"]').filter({hasText:'Bebida P41'}).click();
    await page.getByTestId('send-to-kitchen-button').click();
    await page.getByTestId('waiter-confirm-send').click();
    await expect(page.getByTestId('table-order-total')).toContainText('5,00');
    await page.getByTestId('close-table-button').click();
    await pay(page);
    await page.goto(base+'/caixa');
    await page.getByTestId('cash-toggle-blind').click();
    await expect(page.getByTestId('cash-expected')).toContainText('110,00');
    await page.getByTestId('cash-counted-input').fill('110,00');
    if (process.env.APOLLO_P57_ONLINE_GUARD === '1') {
      await context.setOffline(true);
      await expect(page.getByTestId('cash-online-required')).toBeVisible();
      await expect(page.getByTestId('cash-close-button')).toBeDisabled();
      await expect(page.getByTestId('cash-move-button')).toBeDisabled();
      await context.setOffline(false);
      await expect(page.getByTestId('cash-close-button')).toBeEnabled();
    }
    const closing=page.waitForResponse(r=>r.url().endsWith('/api/cash/close')&&r.request().method()==='POST');
    await page.getByTestId('cash-close-button').click();
    const result=await (await closing).json();
    expect(result.difference).toBe(0);
    await expect(page.getByTestId('cash-open-panel')).toBeVisible();
    await info.attach('operational-closing',{body:JSON.stringify(result,null,2),contentType:'application/json'});
    await info.attach('operational-browser',{body:await page.screenshot(),contentType:'image/png'});
  } finally {
    try {
      const r=await context.request.get(base+'/api/cash/current');
      const cash=r.ok()?await r.json():null;
      if(cash?.id) await context.request.post(base+'/api/cash/close',{headers:{Origin:base},
        data:{counted_amount:cash.expected_cash,expected_session_id:cash.id,note:'P43 disposable test cleanup'}});
    } finally {await context.close();}
  }
});
test('UI offline sale persists in a real browser profile across process restart and reconciles stock and cash',async({browserName},info)=>{
  test.setTimeout(180000);
  const profile=await mkdtemp(path.join(tmpdir(),'apollo-offline-profile-'));
  const browserType={chromium,firefox,webkit}[browserName];
  const launch=()=>browserType.launchPersistentContext(profile,{
    ...info.project.use,
    ...info.project.use.launchOptions,
    baseURL:base,
    ignoreHTTPSErrors:true,
  });
  let context=await launch().catch(async error=>{
    await rm(profile,{recursive:true,force:true});
    throw error;
  });
  let page=await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('dialog',d=>d.accept());
  async function read(path:string) {
    const r=await context.request.get(base+'/api'+path);
    expect(r.ok(),await r.text()).toBe(true); return r.json();
  }
  try {
    await login(page);
    await page.goto(base+'/caixa');
    await page.getByTestId('cash-opening-input').fill('0,00');
    await page.getByTestId('cash-open-button').click();
    await expect(page.getByTestId('cash-open-panel')).toBeHidden();
    const before=(await read('/ingredients')).find((x:any)=>x.id==='p40ing').stock;
    await page.goto(base+'/pdv');
    await page.locator('[data-testid^="product-card-"]').filter({hasText:'Espetinho P40'}).click();
    await context.setOffline(true);
    await expect(page.getByTestId('pdv-offline-banner')).toBeVisible();
    await page.getByTestId('pdv-checkout-button').click();
    await pay(page);
    await expect(page.getByTestId('pdv-offline-banner')).toContainText('1 na fila');
    const queued=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('pdv_offline_queue:v3:'))
      .flatMap(k=>JSON.parse(localStorage.getItem(k)||'[]')));
    expect(queued).toHaveLength(1);
    const payload=queued[0].payload;
    await info.attach('offline-queued',{body:await page.screenshot(),contentType:'image/png'});
    // Reopen the same on-disk profile without exporting or restoring storageState.
    await context.close();
    context=await launch();
    page=await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('dialog',d=>d.accept());
    await page.goto(base);
    expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('pdv_offline_queue:v3:'))
      .flatMap(k=>JSON.parse(localStorage.getItem(k)||'[]')).length)).toBe(1);
    await login(page);
    await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('pdv_offline_queue:v3:'))
      .flatMap(k=>JSON.parse(localStorage.getItem(k)||'[]')).length),{timeout:45000}).toBe(0);
    const replay=await context.request.post(base+'/api/pdv/sale',{data:payload,headers:{Origin:base}});
    expect(replay.ok(),await replay.text()).toBe(true);
    const paid=await replay.json();
    const replay2=await context.request.post(base+'/api/pdv/sale',{data:payload,headers:{Origin:base}});
    expect((await replay2.json()).order.id).toBe(paid.order.id);
    expect((await read('/ingredients')).find((x:any)=>x.id==='p40ing').stock).toBe(before-1);
    expect((await read('/cash/current')).expected_cash).toBe(10);
    await page.goto(base+'/caixa');
    await page.getByTestId('cash-counted-input').fill('10,00');
    const closing=page.waitForResponse(r=>r.url().endsWith('/api/cash/close')&&r.request().method()==='POST');
    await page.getByTestId('cash-close-button').click();
    const response=await closing;
    expect(response.ok()).toBe(true);
    const receipt=await response.json();
    expect(receipt.difference).toBe(0);
    await expect(page.getByTestId('cash-open-panel')).toBeVisible();
    await info.attach('offline-result',{body:JSON.stringify({reference:payload.client_ref,order:paid.order.id,stock_before:before,stock_after:before-1,difference:receipt.difference}),contentType:'application/json'});
  }finally {
    try {
      const r=await context.request.get(base+'/api/cash/current');
      const cash=r.ok()?await r.json():null;
      if(cash?.id) await context.request.post(base+'/api/cash/close',{headers:{Origin:base},
        data:{counted_amount:cash.expected_cash,expected_session_id:cash.id,note:'P43 disposable test cleanup'}});
    } finally {
      await context.close();
      await rm(profile,{recursive:true,force:true});
    }
  }
});

test('table items recover after restart and queued items sync outside the table', async ({ browserName }, info) => {
  test.setTimeout(240_000);
  const [key, cert, ca] = await Promise.all(['server.key', 'server.crt', 'apollo-local-ca.crt']
    .map(file => readFile('/tmp/apollo-p41-tls/' + file)));
  const itemsEndpoint = /\/api\/tables\/[^/]+\/items$/;
  let dropResponse = false;
  let itemPosts = 0;
  let original: unknown;
  let committedStatus: number | undefined;
  const proxy = createServer({ key, cert }, (incoming, outgoing) => {
    const submitsItems = incoming.method === 'POST' && itemsEndpoint.test(incoming.url ?? '');
    if (submitsItems) itemPosts++;
    const drop = dropResponse && submitsItems;
    const chunks: Buffer[] = [];
    if (drop) incoming.on('data', chunk => chunks.push(chunk));
    const upstream = httpsRequest({
      hostname: new URL(base).hostname, port: new URL(base).port, path: incoming.url, method: incoming.method,
      headers: incoming.headers, ca,
    }, response => {
      if (drop) {
        response.resume();
        response.once('end', () => {
          original = JSON.parse(Buffer.concat(chunks).toString());
          committedStatus = response.statusCode;
          outgoing.destroy();
        });
        return;
      }
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => outgoing.destroy());
    incoming.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', resolve);
  });
  const address = proxy.address();
  if (!address || typeof address === 'string') throw new Error('Missing disposable proxy listener');
  const origin = `https://127.0.0.1:${address.port}`;
  const profile = await mkdtemp(path.join(tmpdir(), 'apollo-table-replay-'));
  const launch = () => ({ chromium, firefox, webkit }[browserName]).launchPersistentContext(profile, {
    ...info.project.use,
    ...info.project.use.launchOptions,
    baseURL: origin,
    ignoreHTTPSErrors: true,
  });
  let context: Awaited<ReturnType<typeof launch>> | undefined;
  let auditContext: Awaited<ReturnType<typeof request.newContext>> | undefined;
  try {
    context = await launch();
    let page = await context.newPage();
    const auditor = await request.newContext({baseURL: base, ignoreHTTPSErrors: true, extraHTTPHeaders: {Origin: base}});
    auditContext = auditor;
    expect((await auditor.post('/api/auth/login', {data: {
      username: 'p40admin', password: 'P40-Fictitious-Password!',
    }})).ok()).toBe(true);
    const stock = async (ingredientId = 'p40ing') => {
      const response = await auditor.get('/api/ingredients');
      expect(response.ok()).toBe(true);
      return (await response.json()).find((item: { id: string }) => item.id === ingredientId).stock;
    };
    const before = await stock();
    const counterStockBefore = await stock('p41ingportion');
    const number = info.project.name === 'desktop' ? '9581' : '9582';
    const table = await auditor.post('/api/tables', { data: { number: Number(number) } });
    expect(table.ok()).toBe(true);
    await login(page, origin, 'p40garcom');
    await page.getByTestId('table-card-' + number).click();
    await page.getByTestId('open-table-button').click();
    await page.getByTestId('add-items-button').click();
    await page.locator('[data-testid^="product-card-"]').filter({ hasText: 'Espetinho P40' }).click();
    await page.getByTestId('send-to-kitchen-button').click();

    dropResponse = true;
    await page.getByTestId('waiter-confirm-send').click();
    await expect.poll(() => committedStatus).toBe(200);
    await expect(page.getByText('Itens salvos neste dispositivo. Envio pendente de conexão.')).toBeVisible();
    expect(await stock()).toBe(before - 1);
    expect(original).toEqual(expect.objectContaining({ sync_context: expect.any(Object), client_ref: expect.any(String) }));

    await context.close();
    dropResponse = false;
    context = await launch();
    page = await context.newPage();
    const replay = page.waitForResponse(response => itemsEndpoint.test(response.url()) && response.request().method() === 'POST');
    await login(page, origin, 'p40garcom');
    const response = await replay;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toEqual(original);
    expect(new URL(page.url()).pathname).not.toBe('/mesas');
    await page.getByTestId('table-card-' + number).click();
    await expect(page.getByRole('button', { name: 'Conferir envio pendente' })).toHaveCount(0);
    expect(await stock()).toBe(before - 1);
    const postsBeforeOffline = itemPosts;
    await page.getByTestId('add-items-button').click();
    await page.locator('[data-testid^="product-card-"]').filter({ hasText: 'Espetinho P40' }).click();
    await page.getByTestId('send-to-kitchen-button').click();
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await page.getByTestId('waiter-confirm-send').click();
    await expect(page.getByText('Envio salvo neste dispositivo. Aguardando conexão.', { exact: true })).toBeVisible();
    expect(itemPosts).toBe(postsBeforeOffline);

    const sales = await runConcurrentCashiers();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    expect(itemPosts).toBe(postsBeforeOffline);
    expect(await stock()).toBe(before - 1);
    const counterStockAfter = await stock('p41ingportion');
    expect(counterStockAfter).toBeCloseTo(counterStockBefore - 10, 6);
    await info.attach('concurrent-offline-waiter-and-cashiers', {
      body: JSON.stringify({
        ...sales, waiterHadNoNetwork: true, postsFromWaiterDuringSales: 0,
        counterStockBefore, counterStockAfter,
      }),
      contentType: 'application/json',
    });

    await context.close();
    context = await launch();
    page = await context.newPage();
    const resynced = page.waitForResponse(response => itemsEndpoint.test(response.url()) && response.request().method() === 'POST');
    await login(page, origin, 'p40garcom');
    const synced = await resynced;
    expect(synced.ok()).toBe(true);
    expect(synced.request().postDataJSON().client_ref).not.toBe((original as { client_ref: string }).client_ref);
    await expect(page.getByRole('button', { name: 'Conferir envio pendente' })).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toBe("/mesas");
    expect(itemPosts).toBe(postsBeforeOffline + 1);
    expect(await stock()).toBe(before - 2);
    expect(await stock('p41ingportion')).toBe(counterStockAfter);
    await info.attach('table-offline-reconnection', {
      body: JSON.stringify({ itemPostsBeforeOffline: postsBeforeOffline, itemPostsAfterReconnect: itemPosts, stockAfterReconnect: await stock() }),
      contentType: 'application/json',
    });
    await info.attach('table-recovery', {
      body: JSON.stringify({ stockBefore: before, stockAfterReplay: before - 1, repeatedSameRequest: true }),
      contentType: 'application/json',
    });
  } finally {
    try {
      await context?.close();
      await auditContext?.dispose();
    } finally {
      proxy.close();
      proxy.closeAllConnections();
      await rm(profile, { recursive: true, force: true });
    }
  }
});

async function runConcurrentCashiers() {
  const cashiers = await Promise.all([1, 2].map(() => request.newContext({
    baseURL: base, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: base },
  })));
  const post = async (index: number, path: string, data: object) => {
    const response = await cashiers[index].post('/api' + path, { data });
    expect(response.ok(), path + ' HTTP ' + response.status()).toBe(true);
    return response.json();
  };
  try {
    const shifts = await Promise.all(cashiers.map(async (_, index) => {
      await post(index, '/auth/login', { username: 'p40caixa' + (index + 1), password: 'P40-Fictitious-Password!' });
      return post(index, '/cash/open', { opening_amount: 0 });
    }));
    expect(shifts[0].id).not.toBe(shifts[1].id);
    const prefix = crypto.randomUUID();
    const orders = await Promise.all(Array.from({ length: 25 }, async (_, sale) => {
      const index = sale % 2;
      const payload = {
        client_ref: prefix + '-' + sale,
        items: [{ product_id: 'p41portion', qty: 1 }],
        payments: [{ method: 'dinheiro', amount: 5 }, { method: 'pix', amount: 10 }],
        emit_invoice: false,
        send_to_kitchen: false,
      };
      const first = await post(index, '/pdv/sale', payload);
      const replay = await post(index, '/pdv/sale', payload);
      expect(first.order.cash_session_id).toBe(shifts[index].id);
      expect(replay.order.id).toBe(first.order.id);
      return first.order.id;
    }));
    expect(new Set(orders).size).toBe(25);
    const closed = await Promise.all(shifts.map(async (shift, index) => {
      const counted = index === 0 ? 65 : 60;
      const response = await cashiers[index].get('/api/cash/current');
      expect(response.ok()).toBe(true);
      const current = await response.json();
      expect(current.totals_by_method).toEqual({ dinheiro: counted, pix: counted * 2 });
      return post(index, '/cash/close', { expected_session_id: shift.id, counted_amount: counted });
    }));
    expect(closed.map(shift => shift.difference)).toEqual([0, 0]);
    return { orders, replays: 25, cashDifferences: closed.map(shift => shift.difference) };
  } finally {
    await Promise.all(cashiers.map(cashier => cashier.dispose()));
  }
}
