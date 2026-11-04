import { desktop } from "@/lib/desktop";
import type { KitchenTicket, Printer } from "@/lib/types";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Ticket HTML for one environment (only that environment's printable items). */
export function ticketHtml(t: KitchenTicket, station: string, envLabel: string, paper: Printer["paper"] = "80mm") {
  const items = t.items.filter((i) => i.station === station && i.print_ticket !== false);
  const width = paper === "A4" ? "190mm" : paper === "58mm" ? "54mm" : "76mm";
  const time = new Date(t.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const rows = items.map((i) => `
    <div class="it"><b>${i.qty}x ${esc(i.name)}</b>
      ${i.options.map((o) => `<div class="op">&gt; ${esc(o)}</div>`).join("")}
      ${i.notes ? `<div class="ob">OBS: ${esc(i.notes)}</div>` : ""}
    </div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(envLabel)} #${t.order_number}</title><style>
    @page { size: ${paper === "A4" ? "A4" : `${width} auto`}; margin: 2mm; }
    body { font-family: "Courier New", monospace; width: ${width}; margin: 0; color: #000; font-size: 13px; }
    h1 { font-size: 18px; margin: 0; text-align: center; text-transform: uppercase; }
    h2 { font-size: 20px; margin: 4px 0; text-align: center; }
    .meta { text-align: center; font-size: 12px; border-bottom: 1px dashed #000; padding-bottom: 4px; }
    .it { padding: 5px 0; border-bottom: 1px dashed #000; font-size: 15px; }
    .op { font-size: 13px; padding-left: 10px; font-weight: bold; }
    .ob { font-size: 13px; padding-left: 10px; text-decoration: underline; }
  </style></head><body><h1>${esc(envLabel)}</h1><h2>${esc(t.label)}</h2>
  <div class="meta">Pedido #${t.order_number} · ${time}</div>${rows}<p style="text-align:center;font-size:11px">Espeteria Churras Buguer</p></body></html>`;
}

/** Desktop app: silent print straight to the chosen Windows printer. Browser: hidden iframe (print dialog unless --kiosk-printing). */
export async function printHtml(html: string, copies = 1, printer?: Pick<Printer, "device_name" | "paper">): Promise<void> {
  const d = desktop();
  if (d) {
    const r = await d.print({ html, deviceName: printer?.device_name || undefined, copies, paper: printer?.paper });
    if (!r.ok) throw new Error(r.error || "Falha na impressão");
    return;
  }
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.setAttribute("data-testid", "print-frame");
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(Array.from({ length: Math.max(1, copies) }, () => html).join('<div style="page-break-after:always"></div>'));
    doc.close();
    setTimeout(() => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch (err) { console.error("Falha ao imprimir ticket:", err); }
      setTimeout(() => { frame.remove(); resolve(); }, 500);
    }, 250);
  });
}
