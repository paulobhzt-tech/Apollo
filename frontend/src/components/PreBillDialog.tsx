import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer as PrinterIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet } from "@/lib/api";
import { brl, fmtDateTime, tableLabel } from "@/lib/format";
import { groupItems } from "@/lib/group";
import { printHtml } from "@/lib/printTicket";
import type { GeneralSettings, Order, Printer, Table } from "@/lib/types";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function PreBillDialog({ table, order, open, onClose, onPrinted }: { table: Table; order: Order | null; open: boolean; onClose: () => void; onPrinted: () => void }) {
  const settings = useQuery({ queryKey: ["settings-general"], queryFn: () => apiGet<GeneralSettings>("/settings/general"), enabled: open });
  const printers = useQuery({ queryKey: ["printers"], queryFn: () => apiGet<Printer[]>("/printers"), enabled: open });
  const [service, setService] = useState(true);
  const [people, setPeople] = useState(String(table.people || 1));
  const groups = groupItems(order?.items ?? []);
  const subtotal = r2(groups.reduce((s, g) => s + g.total, 0));
  const fee = service ? r2(subtotal * 0.1) : 0;
  const total = r2(subtotal + fee);
  const n = Math.max(1, Number(people) || 1);
  const qtyTotal = groups.reduce((s, g) => s + g.qty, 0);
  const pix = settings.data?.pix_key;

  const print = async () => {
    const pr = printers.data?.find((p) => p.active && p.purpose === "caixa");
    const paper = pr?.paper ?? "80mm";
    const width = paper === "A4" ? "190mm" : paper === "58mm" ? "54mm" : "76mm";
    const rows = groups.map((g) => `<tr><td>${g.qty}x ${esc(g.name)}${g.options.length ? `<div class="op">${esc(g.options.join(" · "))}</div>` : ""}</td><td class="r">${brl(g.unit_price)}</td><td class="r">${brl(g.total)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pré-conta ${esc(tableLabel(table))}</title><style>
      @page { size: ${paper === "A4" ? "A4" : `${width} auto`}; margin: 2mm; }
      body { font-family: "Courier New", monospace; width: ${width}; margin: 0; color: #000; font-size: 12px; }
      h1 { font-size: 15px; text-align: center; margin: 0; } h2 { font-size: 18px; text-align: center; margin: 4px 0; }
      .c { text-align: center; } .r { text-align: right; white-space: nowrap; } .op { font-size: 10px; padding-left: 8px; }
      table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; vertical-align: top; }
      .sep { border-top: 1px dashed #000; margin: 4px 0; } .tot { font-size: 16px; font-weight: bold; }
      .row { display: flex; justify-content: space-between; }
    </style></head><body>
      <h1>ESPETERIA CHURRAS BUGUER</h1>${settings.data?.address ? `<div class="c">${esc(settings.data.address)}</div>` : ""}
      <div class="sep"></div><h2>PRÉ-CONTA · ${esc(tableLabel(table))}</h2>
      <div class="c">${table.opened_at ? `Aberta ${fmtDateTime(table.opened_at)} · ` : ""}${table.waiter_name ? `Garçom: ${esc(table.waiter_name)}` : ""}</div>
      <div class="sep"></div><table><tr><td><b>Item</b></td><td class="r"><b>Unit.</b></td><td class="r"><b>Total</b></td></tr>${rows}</table>
      <div class="sep"></div>
      <div class="row"><span>${qtyTotal} itens · Subtotal</span><span>${brl(subtotal)}</span></div>
      ${service ? `<div class="row"><span>Serviço 10% (opcional)</span><span>${brl(fee)}</span></div>` : ""}
      <div class="row tot"><span>TOTAL</span><span>${brl(total)}</span></div>
      ${n > 1 ? `<div class="row"><span>Por pessoa (${n})</span><span>${brl(r2(total / n))}</span></div>` : ""}
      ${pix ? `<div class="sep"></div><div class="c">PIX: ${esc(pix)}${settings.data?.pix_holder ? `<br>${esc(settings.data.pix_holder)}` : ""}</div>` : ""}
      <div class="sep"></div><div class="c"><b>NÃO É DOCUMENTO FISCAL</b><br>Confira seu pedido antes do pagamento</div>
      <div class="c" style="font-size:10px">${fmtDateTime(new Date().toISOString())}</div>
    </body></html>`;
    await printHtml(html, 1);
    onPrinted();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md border-white/10 bg-shell" data-testid="prebill-dialog">
        <DialogTitle className="font-heading text-xl text-white">Pré-conta · {tableLabel(table)}</DialogTitle>
        <div className="max-h-[45vh] space-y-1.5 overflow-y-auto rounded-xl bg-white p-4 font-mono text-[12px] text-black" data-testid="prebill-preview">
          {groups.map((g) => (
            <div key={g.key} className="flex justify-between gap-2" data-testid="prebill-line">
              <span><b data-testid="prebill-line-qty">{g.qty}x</b> {g.name}{g.options.length > 0 && <span className="block pl-3 text-[10px] text-zinc-600">{g.options.join(" · ")}</span>}</span>
              <span className="whitespace-nowrap">{brl(g.total)}</span>
            </div>
          ))}
          {!groups.length && <p className="text-center text-zinc-500">Sem itens</p>}
          <div className="mt-2 border-t border-dashed border-zinc-400 pt-1">
            <div className="flex justify-between"><span>{qtyTotal} itens · Subtotal</span><span data-testid="prebill-subtotal">{brl(subtotal)}</span></div>
            {service && <div className="flex justify-between"><span>Serviço 10%</span><span data-testid="prebill-service">{brl(fee)}</span></div>}
            <div className="flex justify-between text-base font-bold"><span>TOTAL</span><span data-testid="prebill-total">{brl(total)}</span></div>
            {n > 1 && <div className="flex justify-between"><span>Por pessoa ({n})</span><span data-testid="prebill-per-person">{brl(r2(total / n))}</span></div>}
          </div>
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={service} onCheckedChange={(v) => setService(!!v)} data-testid="prebill-service-checkbox" /> Incluir 10% de serviço</label>
          <div className="w-24"><Label className="text-xs text-zinc-400">Dividir por</Label><Input value={people} onChange={(e) => setPeople(e.target.value)} inputMode="numeric" className="mt-1" data-testid="prebill-people-input" /></div>
        </div>
        <Button className="h-11" onClick={() => void print()} disabled={!groups.length} data-testid="prebill-print-button"><PrinterIcon className="size-4" /> Imprimir pré-conta</Button>
      </DialogContent>
    </Dialog>
  );
}
