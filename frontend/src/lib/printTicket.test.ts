import {afterEach,describe,expect,it,vi} from 'vitest';
import {printHtml,ticketHtml} from './printTicket';
import type {KitchenTicket} from './types';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function browserFrame(print: (()=>void)|undefined) {
  const write=vi.fn(),remove=vi.fn();
  const frame={style:{cssText:''},setAttribute:vi.fn(),contentDocument:{open:vi.fn(),write,close:vi.fn()},
    contentWindow:{focus:vi.fn(),print},remove};
  vi.stubGlobal('document',{createElement:()=>frame,body:{appendChild:vi.fn()}});
  return {write,remove};
}
describe('printer failure propagation and simulated output',()=>{
  it('rejects printer exceptions so callers cannot mark tickets printed',async()=>{
    vi.useFakeTimers();
    const {remove}=browserFrame(()=>{throw new Error('printer offline');});
    const result=expect(printHtml('<p>ticket</p>')).rejects.toThrow('printer offline');
    await vi.runAllTimersAsync(); await result; expect(remove).toHaveBeenCalledOnce();
  });
  it('rejects unavailable browser printing',async()=>{
    vi.useFakeTimers();browserFrame(undefined);
    const result=expect(printHtml('ticket')).rejects.toThrow('Impressão indisponível');
    await vi.runAllTimersAsync();await result;
  });
  it('sends two copies and cleans up after browser print invocation',async()=>{
    vi.useFakeTimers();const print=vi.fn();const {write,remove}=browserFrame(print);
    const pending=printHtml('<p>ticket</p>',2);
    await vi.runAllTimersAsync();await pending;
    expect(print).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0].match(/<p>ticket<\/p>/g)).toHaveLength(2);
    expect(remove).toHaveBeenCalledOnce();
  });
  it('propagates desktop spooler failure',async()=>{
    vi.stubGlobal('window',{pdvDesktop:{print:vi.fn().mockResolvedValue({ok:false,error:'spooler offline'})}});
    await expect(printHtml('ticket')).rejects.toThrow('spooler offline');
  });
  it('formats 80mm, fractional quantity, escaping and station separation',()=>{
    const ticket={order_number:44,label:'Mesa <44>',created_at:'2026-11-21T12:00:00Z',items:[
      {station:'cozinha',print_ticket:true,qty:0.5,name:'Espeto <teste>',options:['Sem <sal>'],notes:'<nota>'},
      {station:'bar',print_ticket:true,qty:1,name:'Bebida',options:[]},
      {station:'cozinha',print_ticket:false,qty:1,name:'Oculto',options:[]}
    ]} as KitchenTicket;
    const html=ticketHtml(ticket,'cozinha','Cozinha');
    expect(html).toContain('width: 76mm');
    expect(html).toContain('0.5x Espeto &lt;teste&gt;');
    expect(html).toContain('Sem &lt;sal&gt;');
    expect(html).not.toContain('Bebida'); expect(html).not.toContain('Oculto');
    expect(html).not.toContain('<nota>');
  });
});
