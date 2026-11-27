import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import PaymentDialog from "@/components/PaymentDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, apiPost } from "@/lib/api";
import { catalogNumber } from "@/lib/catalog-form";
import { brl, errMsg, uid } from "@/lib/format";
import { onlineMutation, onlineOperation, useOffline } from "@/lib/offline";
import type { Order, PayIn, TableReceipt } from "@/lib/types";

interface ReceiptRequest {
  client_ref: string;
  expected_order_id: string;
  expected_balance: number;
  mode: TableReceipt["mode"];
  value: number;
  payments: PayIn["payments"];
}

export default function MonetaryReceiptDialog({ tableId, order, needsPin, onClose, onChange }: {
  tableId: string;
  order: Order;
  needsPin: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  const { offline } = useOffline();
  const endpoint = `/tables/${tableId}/monetary-receipts`;
  const [mode, setMode] = useState<TableReceipt["mode"]>("amount");
  const [input, setInput] = useState("");
  const [reversing, setReversing] = useState<TableReceipt | null>(null);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [quote, setQuote] = useState<{ amount: number; request: Omit<ReceiptRequest, "payments"> } | null>(null);
  const [uncertain, setUncertain] = useState<ReceiptRequest | null>(null);
  const balanceCents = Math.round(order.subtotal * 100) - Math.round((order.advance_paid ?? 0) * 100);
  const value = catalogNumber(input);
  const valueCents = value === null ? 0 : Math.round(value * 100);
  const precise = value !== null && valueCents / 100 === value && Number.isSafeInteger(valueCents);
  const amountCents = !precise || (mode === "percentage" && valueCents >= 10_000)
    ? 0 : mode === "amount" ? valueCents : Math.floor((balanceCents * valueCents + 5_000) / 10_000);
  const valid = amountCents > 0 && amountCents < balanceCents;
  const receipt = useMutation({
    ...onlineMutation,
    mutationFn: (body: ReceiptRequest) => onlineOperation(() => apiPost<{ amount: number }>(endpoint, body)),
    onSuccess: (result) => {
      toast.success(`Parcela registrada · ${brl(result.amount)}`);
      onChange();
      onClose();
    },
    onError: (error, body) => {
      if (!(error instanceof ApiError) || error.status >= 500) setUncertain(body);
      else {
        setUncertain(null);
        setQuote(null);
        onChange();
      }
      toast.error(errMsg(error));
    },
  });
  const reverse = useMutation({
    ...onlineMutation,
    mutationFn: ({ id, reversalReason, managerPin }: { id: string; reversalReason: string; managerPin: string }) =>
      onlineOperation(() => apiPost(`${endpoint}/${id}/reverse`, {
        expected_order_id: order.id,
        reason: reversalReason,
        manager_pin: managerPin || null,
      })),
    onSuccess: () => {
      setReversing(null);
      setReason("");
      setPin("");
      onChange();
      toast.success("Estorno registrado.");
    },
    onError: (error) => toast.error(errMsg(error)),
  });

  return <>
    <Dialog open={!quote} onOpenChange={(open) => { if (!open && !reverse.isPending) onClose(); }}>
      <DialogContent className="gap-3 pr-9 sm:max-w-lg">
        <DialogTitle>Recebimentos por valor</DialogTitle>
        <p className="text-sm text-foreground" data-testid="monetary-receipt-balance">
          Saldo dos itens <strong>{brl(balanceCents / 100)}</strong>
        </p>
        {!reversing && <div className="grid grid-cols-2 gap-2 border-y border-border py-2">
          <label className="grid gap-1 text-xs">Forma de cálculo
            <select value={mode} onChange={(event) => setMode(event.target.value === "percentage" ? "percentage" : "amount")}
              className="h-8 min-w-0 rounded border border-border bg-panel px-2">
              <option value="amount">Valor livre</option>
              <option value="percentage">Percentual do saldo</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs">{mode === "amount" ? "Valor (R$)" : "Percentual (%)"}
            <Input value={input} onChange={(event) => setInput(event.target.value)} inputMode="decimal" />
          </label>
          <p className="col-span-2 text-xs text-muted-foreground" aria-live="polite">
            {valid ? `Parcela ${brl(amountCents / 100)} · saldo após o recebimento ${brl((balanceCents - amountCents) / 100)}`
              : "Informe uma parcela menor que o saldo, com até duas casas decimais."}
          </p>
          <Button size="sm" disabled={offline || !valid} className="col-span-2 justify-self-end" onClick={() => setQuote({
            amount: amountCents / 100,
            request: { client_ref: uid(), expected_order_id: order.id, expected_balance: balanceCents / 100, mode, value: valueCents / 100 },
          })}>Receber parcela</Button>
        </div>}
        {!!order.table_receipts?.length && <ul className="max-h-40 divide-y divide-border overflow-y-auto" aria-label="Parcelas registradas">
          {order.table_receipts.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-1 py-1 text-sm">
            <span>{brl(entry.amount)} · {entry.by_name}{entry.reversed_at ? " · Estornado" : ""}</span>
            {!entry.reversed_at && !reversing && <Button size="xs" variant="outline" disabled={offline} onClick={() => setReversing(entry)}>Estornar</Button>}
          </li>)}
        </ul>}
        {reversing && <div className="grid gap-2 border-t border-border pt-2">
          <p className="text-sm">Confirme a devolução de {brl(reversing.amount)} pelos meios recebidos.</p>
          <label className="grid gap-1 text-xs">Motivo do estorno<Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} /></label>
          {needsPin && <label className="grid gap-1 text-xs">PIN do gerente<Input type="password" value={pin} onChange={(event) => setPin(event.target.value)} /></label>}
          <div className="flex flex-wrap justify-end gap-1">
            <Button size="sm" variant="ghost" disabled={reverse.isPending} onClick={() => { setReversing(null); setPin(""); }}>Voltar</Button>
            <Button size="sm" disabled={offline || reverse.isPending || reason.trim().length < 3 || (needsPin && !pin)}
              onClick={() => reverse.mutate({ id: reversing.id, reversalReason: reason.trim(), managerPin: pin })}>Registrar estorno</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
    <PaymentDialog open={!!quote} onOpenChange={(open) => { if (!open) setQuote(null); }}
      subtotal={quote?.amount ?? 0} title="Receber parcela" partialMode fixedReceipt pending={receipt.isPending}
      connectionRequired={offline} onRetryUncertain={uncertain ? () => receipt.mutate(uncertain) : undefined}
      onConfirm={(payment) => { if (quote) receipt.mutate({ ...quote.request, payments: payment.payments }); }} />
  </>;
}
