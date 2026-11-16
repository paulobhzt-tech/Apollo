import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
async function setup(shared = new Map()) {
  let held = false;
  const context = vm.createContext({ Date, crypto: {randomUUID:()=> '11111111-1111-4111-8111-111111111111'},
    localStorage: {getItem:k=>shared.get(k)??null,setItem:(k,v)=>shared.set(k,v),removeItem:k=>shared.delete(k)},
    navigator:{locks:{request:async(_name,_opts,run)=>{if(held)return run(null);held=true;try{return await run({});}finally{held=false;}}}},
  });
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('../src/lib/webSaleRecovery.ts',import.meta.url),'utf8')), {context});
  await mod.link(()=>{});await mod.evaluate();return {api:mod.namespace,shared};
}
test('unknown response survives reload; another submit is never sent', async()=> {
  const first=await setup();let calls=0;
  await assert.rejects(first.api.webCheckout(async()=>{calls++;throw Error('lost response after commit');}));
  const pending=first.api.pendingWebSale();assert.ok(pending.ref.startsWith('web-'));
  const reloaded=await setup(first.shared);
  await assert.rejects(reloaded.api.webCheckout(async()=>{calls++;}),/pendente/);
  assert.equal(calls,1);assert.deepEqual(Object.keys(JSON.parse([...first.shared.values()][0])).sort(),['created_at','ref']);
});
test('parallel clicks cannot create two operation identities',async()=>{
  const {api}=await setup();let release;let sent=0;
  const first=api.webCheckout(async()=>{sent++;await new Promise(r=>release=r);return 'ok';});
  await assert.rejects(api.webCheckout(async()=>{sent++;}),/Outra aba/);
  release();await first;assert.equal(sent,1);assert.equal(api.pendingWebSale(),null);
});
test('only matching confirmed reference can be removed',async()=>{
  const {api}=await setup();await assert.rejects(api.webCheckout(async()=>{throw Error();}));
  const pending=api.pendingWebSale();api.clearConfirmedWebSale('different');assert.ok(api.pendingWebSale());
  api.clearConfirmedWebSale(pending.ref);assert.equal(api.pendingWebSale(),null);
});
test('corrupt storage fails closed without sending',async()=>{
  const {api,shared}=await setup();shared.set(api.PENDING_SALE_KEY,'{broken');let sent=0;
  await assert.rejects(api.webCheckout(async()=>{sent++;}));assert.equal(sent,0);
});
test('storage quota failure prevents network submission',async()=>{
 const storage=new class extends Map {set(){throw Error('Quota exceeded');}}();
 const {api}=await setup(storage);let sent=0;
 await assert.rejects(api.webCheckout(async()=>{sent++;}),/Quota/);assert.equal(sent,0);
});
