import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const python=process.env.P6_PYTHON || 'python';
const fixture=path.resolve('../backend/tools/p6_fixture.py');
function db(mode='snapshot') { const out=execFileSync(python,[fixture,mode],{env:process.env,encoding:'utf8'}); return mode==='snapshot'?JSON.parse(out):null; }
async function login(page:Page,role='caixa') {
 await page.goto('/login');await page.getByLabel('Usuário',{exact:true}).fill('p6-'+role);
 await page.getByLabel('Senha',{exact:true}).fill('Synthetic-P6-Test-Only!');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByTestId('page-title')).toBeVisible();
}
async function openCash(page:Page) {
 await page.goto('/caixa');await page.getByTestId('cash-opening-input').fill('100');
 await page.getByTestId('cash-open-button').click();await expect(page.getByTestId('cash-sales-count')).toHaveText('0');
}
async function prepare(page:Page,method='dinheiro',discount='0') {
 await page.goto('/pdv');await page.getByTestId('product-card-P6').click();
 await page.getByTestId('cart-inc-0').click();await expect(page.getByTestId('cart-qty-0')).toHaveText('2');
 await page.getByTestId('pdv-checkout-button').click();
 await page.getByTestId('payment-discount-input').fill(discount);
 await page.getByTestId('payment-method-'+method).click();
 if(method==='fiado') {
   await page.getByTestId('fiado-customer-select').click();
   await page.getByRole('option').filter({hasText:'Cliente fictício P6'}).click();
 }
 await page.getByTestId('payment-add-button').click();
 await page.getByTestId('payment-simple-receipt-checkbox').uncheck();
 await page.getByTestId('payment-emit-invoice-checkbox').uncheck();
}
async function finalize(page:Page) {
 const response=page.waitForResponse(r=>r.url().endsWith('/api/pdv/sale') && r.request().method()==='POST');
 await page.getByTestId('payment-confirm-button').click();
 const r=await response;expect(r.status()).toBe(200);return r.json();
}
test.beforeEach(()=>db('reset'));
test.afterEach(async({},info)=>{db('clear-failpoint');await info.attach('financial-snapshot.json',{body:JSON.stringify(db(),null,2),contentType:'application/json'});});

test('real cash opening, quantities, admin discount, sale, stock and closing',async({page})=>{
 await login(page,'admin');await openCash(page);await prepare(page,'dinheiro','2');const result=await finalize(page);
 await expect(page.getByTestId('payment-dialog')).toBeHidden();
 const s=db();expect(s.orders).toHaveLength(1);expect(s.orders[0].total).toBe(18);expect(s.stock).toBe(998);expect(s.lot).toBe(998);expect(s.markers).toBe(1);expect(s.stock_sales).toBe(1);expect(s.tickets).toBe(1);
 await page.goto('/caixa');await expect(page.getByTestId('cash-sales-count')).toHaveText('1');
 await page.getByTestId('cash-counted-input').fill('118');page.once('dialog',d=>d.accept());
 await page.getByTestId('cash-close-button').click();await expect(page.getByTestId('cash-open-panel')).toBeVisible();
 const closed=db().cash[0];expect(closed.sales_total).toBe(18);expect(closed.expected_cash).toBe(118);expect(closed.difference).toBe(0);
 await test.info().attach('order-id',{body:result.order.id,contentType:'text/plain'});
});

test('cashier fiado writes actual customer balance and movement atomically',async({page})=>{
 await login(page);await openCash(page);await prepare(page,'fiado');await finalize(page);
 expect(db().fiado_balance).toBe(20);expect(db().customer_moves).toBe(1);expect(db().stock).toBe(998);
});

test('lost response after real commit survives reload and tab close without replay',async({page,context})=>{
 await login(page);await openCash(page);await prepare(page);
 let sent=0;await page.route('**/api/pdv/sale',async route=>{sent++;const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');});
 await page.getByTestId('payment-confirm-button').click();
 await expect(page.getByTestId('web-sale-recovery')).toBeVisible();
 expect(db().orders).toHaveLength(1);await page.reload();await expect(page.getByTestId('web-sale-recovery')).toBeVisible();
 const next=await context.newPage();await next.goto('/pdv');await page.close();
 await expect(next.getByTestId('web-sale-recovery')).toBeVisible();
 await next.getByTestId('web-sale-reconcile').click();await expect(next.getByTestId('web-sale-recovery')).toContainText('confirmada no servidor');
 expect(db().orders).toHaveLength(1);expect(db().stock).toBe(998);expect(sent).toBe(1);
});

test('double submission and concurrent identical HTTP replay debit once',async({page})=>{
 await login(page);await openCash(page);await prepare(page);
 const response=page.waitForResponse(r=>r.url().endsWith('/api/pdv/sale')&&r.status()===200);
 await page.getByTestId('payment-confirm-button').evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
 const r=await response;const payload=r.request().postDataJSON();
 const replies=await Promise.all(Array.from({length:10},()=>page.request.post('/api/pdv/sale',{data:payload,headers:{Origin:'http://127.0.0.1:3001'}})));
 expect(replies.every(r=>r.status()===200)).toBe(true);expect(db().orders).toHaveLength(1);expect(db().markers).toBe(1);expect(db().stock).toBe(998);
});

test('permanent precommit DB failure leaves no money/stock and no automatic replay',async({page})=>{
 await login(page);await openCash(page);await prepare(page);db('fail-insert');
 const failed=page.waitForResponse(r=>r.url().endsWith('/api/pdv/sale'));
 await page.getByTestId('payment-confirm-button').click();expect((await failed).status()).toBe(503);
 await expect(page.getByTestId('web-sale-recovery')).toBeVisible();
 expect(db().orders).toHaveLength(0);expect(db().stock).toBe(1000);expect(db().markers).toBe(0);
 await page.getByTestId('web-sale-reconcile').click();await expect(page.getByTestId('web-sale-recovery')).toContainText('ainda não confirmado');
});

test('unknown commit result on real replica set commits one financial unit',async({page})=>{
 await login(page);await openCash(page);await prepare(page);db('unknown-commit');await finalize(page);
 expect(db().orders).toHaveLength(1);expect(db().stock).toBe(998);expect(db().markers).toBe(1);
});

test('real cookies, CSRF, backend roles, expiry and cross-tab session change',async({page,context})=>{
 await login(page);const cookie=(await context.cookies()).find(c=>c.name==='pdv_session')!;
 expect(cookie.httpOnly).toBe(true);expect(cookie.sameSite).toBe('Lax');expect(await page.evaluate(()=>document.cookie)).not.toContain('pdv_session');
 expect((await page.request.post('/api/cash/open',{data:{opening_amount:1},headers:{Origin:'https://hostile.invalid'}})).status()).toBe(403);
 expect((await page.request.get('/api/employees')).status()).toBe(403);
 await page.goto('/produtos');await expect(page.getByRole('heading',{name:'Acesso restrito'})).toBeVisible();
 const second=await context.newPage();await second.goto('/pdv');
 await page.getByRole('button',{name:'Trocar operador',exact:true}).first().click();await expect(second).toHaveURL(/\/login$/);
 expect((await second.request.get('/api/auth/me')).status()).toBe(401);
 await login(second);db('expire');expect((await second.request.get('/api/auth/me')).status()).toBe(401);
});

test('waiter cannot submit financial requests or inspect reconciliation',async({page})=>{
 await login(page,'garcom');const body={client_ref:'p6-forbidden',items:[{product_id:'p6-product',qty:1}],payments:[{method:'dinheiro',amount:10}]};
 expect((await page.request.post('/api/pdv/sale',{data:body,headers:{Origin:'http://127.0.0.1:3001'}})).status()).toBe(403);
 expect((await page.request.get('/api/pdv/operations/p6-forbidden')).status()).toBe(403);expect(db().orders).toHaveLength(0);
});

test('offline does not create a sale or queue; reconnect never submits it',async({page,context})=>{
 await login(page);await openCash(page);await prepare(page);
 let sent=0;page.on('request',r=>{if(r.url().endsWith('/api/pdv/sale'))sent++;});
 await context.setOffline(true);await page.getByTestId('payment-confirm-button').click();
 await expect(page.getByTestId('pdv-offline-banner')).toBeVisible();
 expect(db().orders).toHaveLength(0);expect(db().stock).toBe(1000);
 await context.setOffline(false);expect(sent).toBe(0);
 expect(await page.evaluate(()=>localStorage.getItem('pdv_offline_queue'))).toBeNull();
});

test('a pending operation in another tab blocks new requests at the browser boundary',async({page,context})=>{
 await login(page);await openCash(page);await prepare(page);
 await page.route('**/api/pdv/sale',async route=>{await route.fetch();await route.abort('failed');});
 await page.getByTestId('payment-confirm-button').click();await expect(page.getByTestId('web-sale-recovery')).toBeVisible();
 const second=await context.newPage();await prepare(second);let sent=0;
 second.on('request',r=>{if(r.url().endsWith('/api/pdv/sale'))sent++;});
 await second.getByTestId('payment-confirm-button').click();
 await expect(second.getByTestId('web-sale-recovery')).toBeVisible();expect(sent).toBe(0);expect(db().orders).toHaveLength(1);
 await second.getByTestId('web-sale-reconcile').click();
 await expect(second.getByTestId('payment-dialog')).toBeHidden();
 await expect(second.getByTestId('pdv-checkout-button')).toBeDisabled();
});
