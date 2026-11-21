import { test, expect } from '@playwright/test';

test('persisted offline queue recovers after browser context restart and does not charge twice', async ({ browser }, info) => {
  test.setTimeout(120000);
  const base = 'https://127.0.0.1:8001';
  let context = await browser.newContext({...info.project.use, baseURL: base,ignoreHTTPSErrors:true});
  let page = await context.newPage();
  const username = 'p40caixa1';
  const ref = 'p41-offline-' + info.project.name;
  async function call(method: string, path: string, data?: unknown) {
    const response = await context.request.fetch(base + '/api' + path, {method, data, headers:{Origin:base}});
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  try {
    await page.goto(base);
    await page.getByLabel('Usuário', {exact:true}).fill(username);
    await page.getByLabel('Senha', {exact:true}).fill('P40-Fictitious-Password!');
    const login = page.waitForResponse(r=>r.url().endsWith('/api/auth/login') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    expect((await login).status()).toBe(200);
    await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
    const cash = await call('POST','/cash/open',{opening_amount:0,note:'P41 queue fictitious'});
    const identity = await call('GET','/auth/sync-context');
    const ingredients = await call('GET','/ingredients');
    const before = ingredients.find((x:any)=>x.id==='p40ing').stock;
    const key = 'pdv_offline_queue:v3:' + encodeURIComponent(JSON.stringify([identity.establishment_id,identity.server_id,identity.operator_id]));
    const payload = {client_ref:ref,sync_context:identity,items:[{product_id:'p40product',qty:1}],
      payments:[{method:'dinheiro',amount:10}],emit_invoice:false,send_to_kitchen:false};
    await context.setOffline(true);
    await page.evaluate(({key,payload})=>{
      localStorage.setItem(key,JSON.stringify([{payload,total:10,queued_at:new Date().toISOString()}]));
    },{key,payload});
    // Recover an already persisted queue using the production application's startup code.
    const state = await context.storageState();
    await context.close();
    context = await browser.newContext({...info.project.use,baseURL:base,ignoreHTTPSErrors:true,storageState:state});
    page = await context.newPage();
    await page.goto(base);
    await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]').length,key),{timeout:30000}).toBe(0);
    const paid = await call('POST','/pdv/sale',payload);
    expect(paid.order.status).toBe('pago');
    const replay = await call('POST','/pdv/sale',payload);
    expect(replay.order.id).toBe(paid.order.id);
    const after = (await call('GET','/ingredients')).find((x:any)=>x.id==='p40ing').stock;
    expect(after).toBe(before-1);
    const summary = await call('GET','/cash/current');
    expect(summary.expected_cash).toBe(10);
    await call('POST','/cash/close',{counted_amount:10,expected_session_id:cash.id,note:'P41 queue reconciled'});
    await info.attach('queue-recovery',{body:JSON.stringify({ref,order:paid.order.id,stock_before:before,stock_after:after,
      scope:'Persisted queue recovery in Chromium after context restart; queue fixture inserted into localStorage while offline. Does not prove offline sale entry through UI.'},null,2),contentType:'application/json'});
  } finally { await context.close(); }
});
