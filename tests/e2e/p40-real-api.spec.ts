import { test, expect, BrowserContext } from '@playwright/test';

test('real API: two cashiers and waiter, shared table, mixed payments and replay', async ({ browser }, info) => {
  test.setTimeout(180000);
  const base = 'https://127.0.0.1:8001';
  const contexts: BrowserContext[] = [];
  async function login(username: string) {
    const context = await browser.newContext({ ...info.project.use, baseURL: base, ignoreHTTPSErrors: true });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(base);
    await page.getByLabel('Usuário', { exact: true }).fill(username);
    await page.getByLabel('Senha', { exact: true }).fill('P40-Fictitious-Password!');
    const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', {name:'Entrar',exact:true}).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByTestId('pin-panel')).toBeHidden();
    return { context, page };
  }
  async function call(actor: Awaited<ReturnType<typeof login>>, method: string, path: string, data?: unknown) {
    const r = await actor.context.request.fetch(base + '/api' + path, {method, data, headers: {Origin: base}});
    expect(r.ok(), method + ' ' + path + ': ' + await r.text()).toBeTruthy();
    return r.json();
  }
  try {
    const admin = await login('p40admin');
    const [c1,c2,w] = await Promise.all([login('p40caixa1'),login('p40caixa2'),login('p40garcom')]);
    const denied = await w.context.request.post(base+'/api/cash/open',{data:{opening_amount:0},headers:{Origin:base}});
    expect(denied.status()).toBe(403);
    const deniedInvoice = await w.context.request.get(base+'/api/invoices/p41-invoice-access-probe');
    expect(deniedInvoice.status()).toBe(403);
    const missingOrigin = await c1.context.request.post(base+'/api/cash/open',{data:{opening_amount:0}});
    expect(missingOrigin.status()).toBe(403);
    const hostileOrigin = await c1.context.request.post(base+'/api/cash/open',{data:{opening_amount:0},headers:{Origin:'https://hostile.invalid'}});
    expect(hostileOrigin.status()).toBe(403);
    const cash = await call(c1,'POST','/cash/open',{opening_amount:100,note:'P40 ficticio'});
    const suffix = info.project.name;
    const t1 = await call(c1,'POST','/tables',{number:suffix==='desktop'?9401:9403});
    const t2 = await call(c2,'POST','/tables',{number:suffix==='desktop'?9402:9404});
    const opened = await call(w,'POST','/tables/'+t1.id+'/open',{people:2,customer_name:'Ana ficticia'});
    await call(w,'PUT','/tables/'+t1.id+'/customers',{customers:['Ana ficticia','Bia ficticia']});
    const batch = {order_id:opened.order_id,client_ref:'p40-table-'+suffix,items:[
      {product_id:'p40product',qty:2,customer_name:'Ana ficticia'},
      {product_id:'p40product',qty:2,customer_name:'Bia ficticia'}]};
    const first = await call(w,'POST','/tables/'+t1.id+'/items',batch);
    const replay = await call(w,'POST','/tables/'+t1.id+'/items',batch);
    expect(replay.items).toEqual(first.items);
    expect(replay.total).toBe(40);
    const sale = {client_ref:'p40-sale-'+suffix,items:[{product_id:'p40product',qty:1}],
      payments:[{method:'pix',amount:5},{method:'dinheiro',amount:5}],emit_invoice:false};
    const [paid, moved] = await Promise.all([
      call(c2,'POST','/pdv/sale',sale),
      call(c1,'POST','/tables/'+t1.id+'/transfer',{target_table_id:t2.id})
    ]);
    expect(moved.order_id).toBe(opened.order_id);
    const again = await call(c2,'POST','/pdv/sale',sale);
    expect(again.order.id).toBe(paid.order.id);
    const order = await call(c1,'GET','/tables/'+t2.id+'/order');
    const partial = {client_ref:'p40-partial-'+suffix,quantities:{[order.items[0].id]:1},
      payment:{payments:[{method:'dinheiro',amount:10}],emit_invoice:false}};
    const partialPaid = await call(c1,'POST','/tables/'+t2.id+'/partial-bill/pay',partial);
    const partialReplay = await call(c1,'POST','/tables/'+t2.id+'/partial-bill/pay',partial);
    expect(partialReplay.order.id).toBe(partialPaid.order.id);
    const remaining = await call(c2,'GET','/tables/'+t2.id+'/order');
    expect(remaining.total).toBe(30);
    await call(c2,'POST','/tables/'+t2.id+'/pay',{payments:[{method:'pix',amount:30}],emit_invoice:false});
    await call(admin,'POST','/orders/'+paid.order.id+'/cancel',{reason:'P40 estorno ficticio'});
    const tables = await call(c1,'GET','/tables');
    expect(tables.find((t:any)=>t.id===t2.id).status).toBe('livre');
    await w.context.setOffline(true);
    await expect(w.page.evaluate(()=>fetch('/api/tables').then(()=>false).catch(()=>true))).resolves.toBe(true);
    await w.context.setOffline(false);
    expect((await call(w,'GET','/tables')).length).toBeGreaterThan(0);
    const summary = await call(c1,'GET','/cash/current');
    expect(summary.expected_cash).toBe(110);
    await call(c1,'POST','/cash/close',{counted_amount:110,expected_session_id:cash.id,note:'P40 encerramento ficticio'});
    await info.attach('real-api-scope',{body:JSON.stringify({cash:cash.id,order:opened.order_id,partial:partialPaid.order.id,
      replay:again.order.id,scope:'Real HTTP operations; UI login only; offline transport recovery, not queued offline sale'},null,2),contentType:'application/json'});
  } finally { for (const c of contexts) await c.close(); }
});
