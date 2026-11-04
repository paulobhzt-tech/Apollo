import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { groupItems } from "@/lib/group";
import { brl, fmtDateTime, payLabel } from "@/lib/format";
import type { GeneralSettings, Invoice } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { companyHeader } from "@/lib/receipt";

export default function InvoiceDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const settings = useQuery({ queryKey: ["settings-general"], queryFn: () => apiGet<GeneralSettings>("/settings/general"), enabled: !!invoice });
  const h = companyHeader(settings.data);
  return (
    <Dialog open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-elevated sm:max-w-md" data-testid="invoice-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-white">
            {invoice?.doc_type === "nfe" ? "DANFE NF-e" : "DANFE NFC-e"} nº {invoice?.number}
          </DialogTitle>
        </DialogHeader>
        {invoice && (
          <>
            <div className="print-area rounded-lg bg-white p-4 font-mono text-[11px] leading-relaxed text-zinc-900" data-testid="invoice-danfe">
              <p className="text-center font-bold" data-testid="invoice-company-name">{(h.legal || h.name).toUpperCase()}</p>
              {h.doc && <p className="text-center">{h.doc}</p>}
              {h.addr && <p className="text-center">{h.addr}</p>}
              <p className="my-2 border-y border-dashed border-zinc-400 py-1 text-center font-bold">
                {invoice.doc_type === "nfce" ? "Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica" : "Documento Auxiliar da NF-e"}
              </p>
              <p className="text-center text-[10px] font-bold text-red-700">AMBIENTE DE SIMULAÇÃO — SEM VALOR FISCAL</p>
              <table className="mt-2 w-full">
                <tbody>
                  {groupItems(invoice.items.map((i) => ({ ...i, options: [], notes: "", cancelled: false }))).map((i) => (
                    <tr key={i.key}>
                      <td>{i.qty}x {i.name}</td>
                      <td className="text-right">{brl(i.qty * i.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 border-t border-dashed border-zinc-400 pt-1">
                <div className="flex justify-between font-bold"><span>VALOR TOTAL</span><span>{brl(invoice.total)}</span></div>
                {invoice.payments.map((p, i) => (
                  <div key={i} className="flex justify-between"><span>{payLabel(p.method, p.brand)}</span><span>{brl(p.amount)}</span></div>
                ))}
              </div>
              <p className="mt-2">Consumidor: {invoice.customer_cpf || "não identificado"}</p>
              <p>Série {invoice.series} · Nº {invoice.number} · {fmtDateTime(invoice.emitted_at)}</p>
              <p>Protocolo: {invoice.protocol}</p>
              <p className="mt-1 break-all">Chave: {invoice.access_key.replace(/(\d{4})/g, "$1 ")}</p>
              <div className="mt-3 flex justify-center">
                <QRCodeSVG value={`https://www.nfce.fazenda.sp.gov.br/consulta?p=${invoice.access_key}`} size={110} />
              </div>
              {invoice.status === "cancelada" && <p className="mt-2 text-center font-bold text-red-700">NOTA CANCELADA</p>}
            </div>
            <Button variant="outline" onClick={() => window.print()} data-testid="invoice-print-button">
              <Printer className="size-4" /> Imprimir (80mm)
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
