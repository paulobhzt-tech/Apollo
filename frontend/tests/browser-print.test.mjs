import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
async function setup(fail) {
 let removed=false;
 const frame={style:{},setAttribute(){},remove(){removed=true;},contentDocument:{open(){},write(){},close(){}},contentWindow:{focus(){},print(){if(fail)throw Error('Printer API failed');}}};
 const context=vm.createContext({document:{createElement:()=>frame,body:{appendChild(){}}},setTimeout:fn=>fn()});
 const mod=new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('../src/lib/printTicket.ts',import.meta.url),'utf8')),{context});
 await mod.link(()=>new vm.SyntheticModule(['desktop'],function(){this.setExport('desktop',()=>undefined);},{context}));await mod.evaluate();
 return {api:mod.namespace,removed:()=>removed};
}
test('browser print API failure rejects instead of acknowledging a ticket',async()=>{const {api,removed}=await setup(true);await assert.rejects(api.printHtml('<p>synthetic</p>'),/permanece pendente/);assert.equal(removed(),true);});
test('opening a browser print dialog resolves without claiming physical delivery',async()=>{const {api,removed}=await setup(false);await api.printHtml('<p>synthetic</p>');assert.equal(removed(),true);});
