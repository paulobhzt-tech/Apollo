import { apiGet } from "@/lib/api";
import { brl, fmtDateTime, payLabel } from "@/lib/format";
import { groupItems } from "@/lib/group";
import { printHtml } from "@/lib/printTicket";
import { queryClient } from "@/lib/queryClient";
import type { GeneralSettings, Order, Printer } from "@/lib/types";

const PREF = "print-simple-receipt";
export const getReceiptPref = () => localStorage.getItem(PREF) !== "0";
export const setReceiptPref = (v: boolean) => localStorage.setItem(PREF, v ? "1" : "0");

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export const companyHeader = (s?: GeneralSettings) => ({
  name: s?.trade_name || "Espeteria Churras Buguer",
  legal: s?.company_name || "",
  doc: [s?.cnpj && `CNPJ ${s.cnpj}`, s?.ie && `IE ${s.ie}`].filter(Boolean).join(" · "),
  addr: [s?.address, s?.city].filter(Boolean).join(" · "),
  phone: s?.phone || "",
});

/** Cupom simples (não fiscal) with grouped items, printed on the caixa printer. */
export async function printSimpleReceipt(o: Order) {
  const [s, printers] = await Promise.all([
    queryClient.fetchQuery({ queryKey: ["settings-general"], queryFn: () => apiGet<GeneralSettings>("/settings/general") }),
    queryClient.fetchQuery({ queryKey: ["printers"], queryFn: () => apiGet<Printer[]>("/printers") }),
  ]);
  const h = companyHeader(s);
  const pr = printers.find((p) => p.active && p.purpose === "caixa");
  const paper = pr?.paper ?? "80mm";
  const width = paper === "A4" ? "190mm" : paper === "58mm" ? "54mm" : "76mm";
  const rows = groupItems(o.items).map((g) => `<tr><td>${g.qty}x ${esc(g.name)}${g.options.length ? `<div class="op">${esc(g.options.join(" · "))}</div>` : ""}</td><td class="r">${brl(g.total)}</td></tr>`).join("");
  const pays = (o.payments ?? []).map((p) => `<div class="row"><span>${esc(payLabel(p.method, p.brand))}</span><span>${brl(p.amount)}</span></div>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cupom #${o.number}</title><style>
    @page { size: ${paper === "A4" ? "A4" : `${width} auto`}; margin: 2mm; }
    body { font-family: "Courier New", monospace; width: ${width}; margin: 0; color: #000; font-size: 12px; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; } .op { font-size: 10px; padding-left: 8px; }
    table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; vertical-align: top; }
    .sep { border-top: 1px dashed #000; margin: 4px 0; } .tot { font-size: 16px; font-weight: bold; } .row { display: flex; justify-content: space-between; }
  </style></head><body>
    <div class="c"><b style="font-size:15px">${esc(h.name.toUpperCase())}</b>${h.legal ? `<br>${esc(h.legal)}` : ""}${h.doc ? `<br>${esc(h.doc)}` : ""}${h.addr ? `<br>${esc(h.addr)}` : ""}${h.phone ? `<br>${esc(h.phone)}` : ""}</div>
    <div class="sep"></div><div class="c"><b>CUPOM SIMPLES · PEDIDO #${o.number}</b><br>${esc(o.table_label || (o.channel === "delivery" ? "Delivery" : "Balcão"))} · ${fmtDateTime(o.paid_at ?? o.created_at)}</div>
    <div class="sep"></div><table>${rows}</table><div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${brl(o.subtotal)}</span></div>
    ${o.discount ? `<div class="row"><span>Desconto</span><span>- ${brl(o.discount)}</span></div>` : ""}
    ${o.service_fee ? `<div class="row"><span>Serviço</span><span>${brl(o.service_fee)}</span></div>` : ""}
    ${o.delivery_fee ? `<div class="row"><span>Entrega</span><span>${brl(o.delivery_fee)}</span></div>` : ""}
    <div class="row tot"><span>TOTAL</span><span>${brl(o.total)}</span></div>${pays}
    ${o.change ? `<div class="row"><span>Troco</span><span>${brl(o.change)}</span></div>` : ""}
    <div class="sep"></div><div class="c"><b>NÃO É DOCUMENTO FISCAL</b><br>${esc(s?.receipt_footer || "Obrigado pela preferência!")}</div>
  </body></html>`;
  await printHtml(html, 1);
}
