import {test,expect,chromium,firefox,webkit,Page} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const base='https://127.0.0.1:8001';
async function login(page:Page) {
  await page.goto(base);
  await page.getByLabel('Usuário',{exact:true}).fill('p40admin');
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
