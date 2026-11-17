import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const origin='https://127.0.0.1:8444';
const fixture=path.resolve('../backend/tools/p10_fixture.py');
function db(mode='snapshot'){const out=execFileSync(process.env.P10_PYTHON||'python',[fixture,mode],{env:process.env,encoding:'utf8'});return mode==='snapshot'?JSON.parse(out):null;}
async function api(page:Page,method:string,url:string,data?:unknown,status=200){
 const response=await page.request.fetch('/api'+url,{method,data,headers:{Origin:origin}});
 expect(response.status(),url+' '+await response.text()).toBe(status);
 return response.json();
}
async function login(page:Page,role='admin'){
 await page.goto('/login');await page.getByLabel('Usuário',{exact:true}).fill('p10-'+role);
 await page.getByLabel('Senha',{exact:true}).fill('Synthetic-P10-Test-Only!');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByTestId('page-title')).toBeVisible();
}
async function cash(page:Page){await api(page,'POST','/cash/open',{opening_amount:100});}
const body=(ref='p10-'+crypto.randomUUID(),method='pix',items=[{product_id:'p10-product',qty:1}])=>({client_ref:ref,items,payments:[{method,amount:items.reduce((n,i)=>n+i.qty,0)*10}],emit_invoice:false,send_to_kitchen:true});
let observations:{path:string;status:number}[]=[];
test.beforeEach(({page})=>{db('reset');observations=[];page.on('response',r=>{if(r.url().includes('/api/'))observations.push({path:new URL(r.url()).pathname,status:r.status()});});});
test.afterEach(async({},info)=>{
 db('clear-failpoint');const state=db();expect(state.duplicate_refs).toBe(0);expect(state.duplicate_numbers).toBe(0);
 await info.attach('observed-api.json',{body:JSON.stringify(observations),contentType:'application/json'});
 await info.attach('observed-financial-state.json',{body:JSON.stringify(state,null,2),contentType:'application/json'});
});

test('P10-01 built Web HTTPS login logout expiration roles and blocked external routes',async({page})=>{
 await login(page,'caixa');await expect(page.getByTestId('demo-notice')).toContainText('HOMOLOGAÇÃO');
 const cookies=await page.context().cookies();const session=cookies.find(c=>c.name==='pdv_session')!;
 expect(session.secure&&session.httpOnly).toBe(true);expect(await page.evaluate(()=>document.cookie)).not.toContain('pdv_session');
 await api(page,'GET','/employees',undefined,403);await api(page,'GET','/drive/connect',undefined,403);
 await api(page,'POST','/cron/nightly-backup',{},403);await api(page,'POST','/backup/restore',{},403);
 expect((await page.request.post('/api/cash/open',{data:{opening_amount:0},headers:{Origin:'https://hostile.invalid'}})).status()).toBe(403);
 const cors=await page.request.fetch('/api/auth/me',{method:'OPTIONS',headers:{Origin:'https://hostile.invalid','Access-Control-Request-Method':'GET'}});
 expect(cors.headers()['access-control-allow-origin']).toBeUndefined();
 await page.reload();expect((await page.request.get('/api/auth/me')).status()).toBe(200);
 db('expire');await api(page,'GET','/auth/me',undefined,401);await login(page,'admin');
 await api(page,'POST','/auth/logout',{});await api(page,'GET','/auth/me',undefined,401);
});

test('P10-02 actual product ingredient recipe CRUD and staff authorization',async({page})=>{
 await login(page);
 const ingredient=await api(page,'POST','/ingredients',{name:'Insumo fictício novo',unit:'un',stock:40,cost_per_unit:1});
 const product={name:'Produto fictício novo',category_id:'p10-cat',price:12,recipe:[{ingredient_id:ingredient.id,qty:2}]};
 const created=await api(page,'POST','/products',product);
 const changed=await api(page,'PUT','/products/'+created.id,{...product,price:14});expect(changed.price).toBe(14);
 expect(changed.recipe).toEqual(product.recipe);await page.goto('/produtos');await expect(page.getByText('Produto fictício novo',{exact:true}).first()).toBeVisible();
 await api(page,'POST','/auth/logout',{});await login(page,'garcom');
 await api(page,'POST','/products',product,403);await api(page,'POST','/ingredients',{name:'Bloqueado',unit:'un'},403);
});

test('P10-03 UI cash sale kitchen stock receipt and reconciled cash closing',async({page})=>{
 await login(page);await page.goto('/caixa');await page.getByTestId('cash-opening-input').fill('100');await page.getByTestId('cash-open-button').click();
 await page.goto('/pdv');await page.getByTestId('product-card-P10').click();await page.getByTestId('pdv-checkout-button').click();
 await page.getByTestId('payment-method-dinheiro').click();await page.getByTestId('payment-add-button').click();
 await page.getByTestId('payment-simple-receipt-checkbox').uncheck();await page.getByTestId('payment-emit-invoice-checkbox').uncheck();
 const done=page.waitForResponse(r=>r.url().endsWith('/api/pdv/sale')&&r.status()===200);await page.getByTestId('payment-confirm-button').click();await done;
 expect(db().stock).toBe(999);expect(db().lot).toBe(999);expect(db().tickets).toBe(1);expect(db().markers).toBe(1);
 await page.goto('/cozinha');await expect(page.getByText('Produto fictício P10').first()).toBeVisible();
 const tickets=await api(page,'GET','/kds/tickets');await api(page,'PATCH','/kds/tickets/'+tickets[0].id,{status:'preparo'});await api(page,'PATCH','/kds/tickets/'+tickets[0].id,{status:'pronto'});
 const summary=await api(page,'GET','/cash/current');expect(summary.expected_cash).toBe(110);expect(summary.sales_total).toBe(10);
 const closed=await api(page,'POST','/cash/close',{counted_amount:110});expect(closed.difference).toBe(0);expect(closed.sales_count).toBe(1);
 const reports=await api(page,'GET','/reports/cashflow');expect(reports).toBeTruthy();
 const dashboard=await api(page,'GET','/reports/dashboard');expect(dashboard.revenue_today).toBe(10);expect(dashboard.orders_today).toBe(1);
});

test('P10-04 tables tabs public QR and payment do not double-debit stock',async({page})=>{
 await login(page);await cash(page);
 for(const [number,kind] of [[10,'mesa'],[11,'comanda']] as const){
  const table=await api(page,'POST','/tables',{number,kind});
  await api(page,'POST','/tables/'+table.id+'/open',{people:1,customer_name:'Cliente fictício'});
  const order=await api(page,'POST','/tables/'+table.id+'/items',{client_ref:'p10-table-'+crypto.randomUUID(),items:[{product_id:'p10-product',qty:1}]});
  expect(order.total).toBe(10);
  await api(page,'POST','/tables/'+table.id+'/pay',{payments:[{method:'pix',amount:10}],emit_invoice:false});
 }
 expect(db().stock).toBe(998);expect(db().lot).toBe(998);
 const qr=await api(page,'POST','/tables',{number:12,kind:'mesa'});
 const order={client_ref:'p10-qr-'+crypto.randomUUID(),items:[{product_id:'p10-product',qty:1}]};
 await api(page,'POST','/public/tables/'+qr.id+'/order',order);await api(page,'POST','/public/tables/'+qr.id+'/order',order);
 expect(db().stock).toBe(997);const publicTable=await api(page,'GET','/public/tables/'+qr.id);expect(publicTable.total).toBe(10);
});

test('P10-05 fictional delivery lifecycle public DTO no cost leakage and stock reconciliation',async({page})=>{
 await login(page);await cash(page);
 const order=await api(page,'POST','/public/delivery',{client_ref:'p10-delivery-'+crypto.randomUUID(),items:[{product_id:'p10-product',qty:1}],customer:{name:'Cliente fictício',phone:'00000000000',address:'Endereço fictício P10'},payment_method:'pix'});
 expect(JSON.stringify(order)).not.toMatch(/unit_cost|stock_recipe|cost_per_unit/);expect(db().stock).toBe(1000);
 for(const status of ['aceito','preparo','saiu','entregue'])await api(page,'PATCH','/delivery/orders/'+order.id+'/status',{status});
 expect(db().stock).toBe(999);expect(db().lot).toBe(999);
 const delivered=await api(page,'GET','/public/delivery/'+order.id);expect(delivered.delivery_status).toBe('entregue');
 await api(page,'POST','/orders/'+order.id+'/cancel',{reason:'Cancelamento fictício'});expect(db().stock).toBe(1000);expect(db().lot).toBe(1000);
});

test('P10-06 managerial PIN partial and total refunds restore exactly original stock',async({page})=>{
 await login(page);await cash(page);
 const paid=await api(page,'POST','/pdv/sale',body(undefined,'pix',[{product_id:'p10-product',qty:1},{product_id:'p10-product',qty:1}]));
 await api(page,'POST','/auth/logout',{});await login(page,'caixa');
 await api(page,'POST','/orders/'+paid.order.id+'/cancel',{reason:'Sem autorização'},403);
 await api(page,'POST','/orders/'+paid.order.id+'/cancel',{reason:'PIN inválido',manager_pin:'000000'},403);
 const refunded=await api(page,'POST',`/orders/${paid.order.id}/items/${paid.order.items[0].id}/refund`,{reason:'Estorno fictício parcial',manager_pin:'739251'});
 expect(refunded.refunded_total).toBe(10);expect(refunded.total).toBe(10);expect(db().stock).toBe(999);
 await api(page,'POST','/orders/'+paid.order.id+'/cancel',{reason:'Estorno fictício restante',manager_pin:'739251'});
 expect(db().stock).toBe(1000);expect(db().lot).toBe(1000);
});

test('P10-07 fiado sale and reversal preserve debt and ledger',async({page})=>{
 await login(page);await cash(page);
 const paid=await api(page,'POST','/pdv/sale',{...body(undefined,'fiado'),fiado_customer_id:'p10-customer'});
 expect(db().fiado_balance).toBe(10);await api(page,'POST','/orders/'+paid.order.id+'/cancel',{reason:'Estorno fictício fiado'});
 expect(db().fiado_balance).toBe(0);expect(db().stock).toBe(1000);
 const dashboard=await api(page,'GET','/reports/dashboard');expect(dashboard).toBeTruthy();
});

test('P10-08 concurrent sales replays cancellations and unknown commit preserve atomicity',async({page})=>{
 await login(page);await cash(page);const request=body();
 const replies=await Promise.all(Array.from({length:10},()=>api(page,'POST','/pdv/sale',request)));
 expect(new Set(replies.map(r=>r.order.id)).size).toBe(1);expect(db().markers).toBe(1);expect(db().stock).toBe(999);
 await Promise.all(Array.from({length:10},()=>api(page,'POST','/orders/'+replies[0].order.id+'/cancel',{reason:'Cancelamento concorrente fictício'})));
 expect(db().stock).toBe(1000);expect(db().lot).toBe(1000);
 db('unknown-commit');await api(page,'POST','/pdv/sale',body());expect(db().orders).toHaveLength(2);expect(db().stock).toBe(999);
});

test('P10-09 precommit failure leaves no sale and UI offline never replays',async({page,context})=>{
 await login(page);await cash(page);db('fail-insert');await api(page,'POST','/pdv/sale',body(),503);
 expect(db().orders).toHaveLength(0);expect(db().stock).toBe(1000);db('clear-failpoint');
 await page.goto('/pdv');await page.getByTestId('product-card-P10').click();await page.getByTestId('pdv-checkout-button').click();
 await context.setOffline(true);await expect(page.getByTestId('pdv-offline-banner')).toBeVisible();await context.setOffline(false);
 expect(db().orders).toHaveLength(0);expect(await page.evaluate(()=>localStorage.getItem('pdv_offline_queue'))).toBeNull();
});

test('P10-10 lost committed response survives refresh without duplicate',async({page})=>{
 await login(page);await cash(page);await page.goto('/pdv');await page.getByTestId('product-card-P10').click();await page.getByTestId('pdv-checkout-button').click();
 await page.getByTestId('payment-method-pix').click();await page.getByTestId('payment-add-button').click();
 await page.getByTestId('payment-simple-receipt-checkbox').uncheck();await page.getByTestId('payment-emit-invoice-checkbox').uncheck();
 await page.route('**/api/pdv/sale',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');});
 await page.getByTestId('payment-confirm-button').click();await expect(page.getByTestId('web-sale-recovery')).toBeVisible();await page.reload();
 await expect(page.getByTestId('web-sale-recovery')).toBeVisible();await page.getByTestId('web-sale-reconcile').click();
 await expect(page.getByTestId('web-sale-recovery')).toContainText('confirmada no servidor');expect(db().orders).toHaveLength(1);expect(db().stock).toBe(999);
});

test('P10-11 keyboard responsive layout and automated WCAG checks on main flows',async({page},info)=>{
 await page.goto('/login');await page.getByLabel('Usuário',{exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Senha',{exact:true})).toBeFocused();
 for(const url of ['/login','/pdv','/caixa']){
  if(url==='/pdv')await login(page);
  await page.goto(url);await expect(page.getByTestId('demo-notice')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  await info.attach('accessibility-'+url.replace('/','')+'.json',{body:JSON.stringify(result),contentType:'application/json'});
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
 }
});

for(const processName of ['backend','mongo'])test(`P10-12 restart ${processName} preserves committed sale and idempotent replay`,async({page})=>{
 await login(page);await cash(page);const payload=body();const first=await api(page,'POST','/pdv/sale',payload);
 const control=process.env.P10_CONTROL_FILE!;fs.rmSync(control+'.done',{force:true});fs.writeFileSync(control,JSON.stringify({action:processName}));
 await expect.poll(()=>fs.existsSync(control+'.done'),{timeout:60000}).toBe(true);
 expect(JSON.parse(fs.readFileSync(control+'.done','utf8')).ready).toBe(true);
 const replay=await api(page,'POST','/pdv/sale',payload);expect(replay.order.id).toBe(first.order.id);
 expect(db().orders).toHaveLength(1);expect(db().stock).toBe(999);expect(db().lot).toBe(999);
});

test('P10-13 financial accounts payment and repeated request do not duplicate the record',async({page})=>{
 await login(page);const today=new Date().toISOString().slice(0,10);
 const bills=await api(page,'POST','/bills',{kind:'pagar',description:'Despesa fictícia P10',amount:7,due_date:today});
 expect(bills).toHaveLength(1);const payment={paid_date:today,paid_amount:7,payment_method:'pix'};
 const paid=await api(page,'POST','/bills/'+bills[0].id+'/pay',payment);expect(paid.paid_amount).toBe(7);expect(paid.status).toBe('pago');
 await api(page,'POST','/bills/'+bills[0].id+'/pay',payment,400);
 const list=await api(page,'GET','/bills');expect(list.filter((b:{id:string})=>b.id===paid.id)).toHaveLength(1);
});

test('P10-14 public mutations reserve a bounded budget without financial side effects',async({page})=>{
 await login(page);const table=await api(page,'POST','/tables',{number:40,kind:'mesa'});
 if(new Date().getUTCSeconds()>50)await expect.poll(()=>new Date().getUTCSeconds()<5,{timeout:15000}).toBe(true);
 const replies=await Promise.all(Array.from({length:61},()=>page.request.post('/api/public/tables/'+table.id+'/call',{data:{type:'garcom'},headers:{Origin:origin}})));
 expect(replies.filter(r=>r.status()===200)).toHaveLength(60);expect(replies.filter(r=>r.status()===429)).toHaveLength(1);
 expect(db().orders).toHaveLength(0);expect(db().stock).toBe(1000);
});
