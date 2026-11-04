import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { brl, fmtDateTime, PAY_LABEL } from "@/lib/format";
import type { Invoice } from "@/lib/types";

export default function InvoiceDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
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
              <p className="text-center font-bold">BRASA & FORNO RESTAURANTE LTDA</p>
              <p className="text-center">CNPJ 12.345.678/0001-90 · IE 123.456.789.000</p>
              <p className="text-center">Rua dos Sabores, 100 · São Paulo/SP</p>
              <p className="my-2 border-y border-dashed border-zinc-400 py-1 text-center font-bold">
                {invoice.doc_type === "nfce" ? "Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica" : "Documento Auxiliar da NF-e"}
              </p>
              <p className="text-center text-[10px] font-bold text-red-700">AMBIENTE DE SIMULAÇÃO — SEM VALOR FISCAL</p>
              <table className="mt-2 w-full">
                <tbody>
                  {invoice.items.map((i, idx) => (
                    <tr key={idx}>
                      <td>{i.qty}x {i.name}</td>
                      <td className="text-right">{brl(i.qty * i.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 border-t border-dashed border-zinc-400 pt-1">
                <div className="flex justify-between font-bold"><span>VALOR TOTAL</span><span>{brl(invoice.total)}</span></div>
                {invoice.payments.map((p, i) => (
                  <div key={i} className="flex justify-between"><span>{PAY_LABEL[p.method]}</span><span>{brl(p.amount)}</span></div>
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
