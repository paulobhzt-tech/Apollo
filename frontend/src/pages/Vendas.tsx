import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Lock, Printer, RotateCcw, Search, X } from "lucide-react";
import { printSimpleReceipt } from "@/lib/receipt";
import { toast } from "sonner";
import AppShell, { PageHeader, Stat } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { brl, canCancel, errMsg, fmtDateTime, payLabel, SOURCE_LABEL } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { Order, OrderItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type Target = { kind: "order"; order: Order } | { kind: "item"; order: Order; item: OrderItem };

const STATUS_BADGE: Record<Order["status"], { label: string; cls: string }> = {
  pago: { label: "Pago", cls: "border-emerald-400/30 text-emerald-300" },
  aberto: { label: "Em aberto", cls: "border-amber-400/30 text-amber-300" },
  cancelado: { label: "Estornado", cls: "border-red-400/30 text-red-300" },
};
const origin = (o: Order) => o.table_label || (o.table_number ? `Mesa ${o.table_number}` : SOURCE_LABEL[o.source]);

export default function Vendas() {
  const { data: me } = useMe();
  const allowed = canCancel(me);
  const q = useQuery({ queryKey: ["orders-history"], queryFn: () => apiGet<Order[]>("/orders?limit=200"), refetchInterval: 15000 });
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const orders = q.isError ? [] : q.data ?? [];
  const s = search.trim().toLowerCase();

  const items = useMemo(() => orders.flatMap((o) => o.items.map((i) => ({ o, i })))
    .filter(({ o, i }) => !s || i.name.toLowerCase().includes(s) || String(o.number).includes(s)), [orders, s]);
  const sales = orders.filter((o) => !s || String(o.number).includes(s) || o.items.some((i) => i.name.toLowerCase().includes(s)));
  const paid = orders.filter((o) => o.status === "pago");
  const refunded = orders.reduce((t, o) => t + (o.status === "cancelado" && o.paid_at ? o.total : 0) + o.refunded_total, 0);

  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Histórico de Vendas" subtitle="Últimos itens vendidos, estornos e cancelamentos"
        actions={<div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <Input placeholder="Produto ou nº do pedido" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 pl-9" data-testid="history-search-input" /></div>} />
      {!allowed && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-white/8 bg-panel px-4 py-3 text-sm text-zinc-400" data-testid="history-no-permission">
          <Lock className="size-4" /> Você pode consultar o histórico, mas estornos e cancelamentos exigem o PIN de um gerente autorizado.
        </p>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vendas listadas" value={String(orders.length)} testid="history-count" />
        <Stat label="Pagas" value={brl(paid.reduce((t, o) => t + o.total, 0))} hint={`${paid.length} pedidos`} testid="history-paid-total" />
        <Stat label="Itens vendidos" value={String(items.filter(({ i }) => !i.cancelled).reduce((t, { i }) => t + i.qty, 0))} testid="history-items-count" />
        <Stat label="Estornado" value={brl(refunded)} testid="history-refunded" accent="text-red-300" />
      </div>
      <Tabs defaultValue="itens">
        <TabsList>
          <TabsTrigger value="itens" data-testid="tab-history-items">Últimos itens</TabsTrigger>
          <TabsTrigger value="vendas" data-testid="tab-history-sales">Vendas</TabsTrigger>
        </TabsList>
        <TabsContent value="itens" className="mt-4">
          <div className="rounded-2xl border border-white/5 bg-panel">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Origem</TableHead><TableHead>Pedido</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {items.slice(0, 300).map(({ o, i }) => (
                  <TableRow key={i.id} className={cn(i.cancelled && "opacity-50")} data-testid={`history-item-${i.id}`}>
                    <TableCell className="text-xs text-zinc-400">{fmtDateTime(o.paid_at ?? o.created_at)}</TableCell>
                    <TableCell className={cn("text-white", i.cancelled && "line-through")}>
                      {i.name}{i.cancelled && <span className="block text-xs text-red-300 no-underline">Cancelado: {i.cancel_reason}</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{i.qty}</TableCell>
                    <TableCell className="text-right font-mono">{brl(i.qty * i.unit_price)}</TableCell>
                    <TableCell className="text-zinc-300">{origin(o)}</TableCell>
                    <TableCell><span className="font-mono">#{o.number}</span> <Badge variant="outline" className={STATUS_BADGE[o.status].cls}>{STATUS_BADGE[o.status].label}</Badge></TableCell>
                    <TableCell className="text-right">
                      {!i.cancelled && o.status !== "cancelado" && (
                        <Button size="xs" variant="outline" onClick={() => setTarget({ kind: "item", order: o, item: i })} data-testid={`history-cancel-item-${i.id}`}>
                          <X className="size-3" /> Cancelar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-zinc-500">Nenhum item encontrado.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="vendas" className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {sales.map((o) => (
            <article key={o.id} className="rounded-2xl border border-white/5 bg-panel p-4" data-testid={`history-sale-${o.number}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-white">#{o.number} <span className="text-xs text-zinc-500">· {origin(o)}</span></span>
                <Badge variant="outline" className={STATUS_BADGE[o.status].cls}>{STATUS_BADGE[o.status].label}</Badge>
              </div>
              <p className="text-xs text-zinc-500">{fmtDateTime(o.paid_at ?? o.created_at)}{o.waiter_name && ` · ${o.waiter_name}`}</p>
              <ul className="mt-2 space-y-0.5 text-sm">
                {o.items.map((i) => (
                  <li key={i.id} className={cn("flex justify-between", i.cancelled && "text-zinc-600 line-through")}>
                    <span>{i.qty}x {i.name}</span><span className="font-mono">{brl(i.qty * i.unit_price)}</span>
                  </li>
                ))}
              </ul>
              {o.payments.length > 0 && <p className="mt-2 text-xs text-zinc-400">{o.payments.map((p) => `${payLabel(p.method, p.brand)} ${brl(p.amount)}`).join(" + ")}</p>}
              {o.refunds.map((r, idx) => (
                <p key={idx} className="text-xs text-red-300">Estorno {brl(r.amount)} · {r.item_name} · {r.reason} ({r.by_name})</p>
              ))}
              {o.status === "cancelado" && o.cancel_reason && <p className="text-xs text-red-300">Motivo: {o.cancel_reason}{o.cancelled_by && ` · por ${o.cancelled_by}`}</p>}
              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
                <span className="font-mono text-lg text-white">{brl(o.total)}</span>
                {o.status === "pago" && (
                  <Button size="sm" variant="outline" onClick={() => void printSimpleReceipt(o)} data-testid={`history-receipt-${o.number}`}><Printer className="size-3.5" /> Cupom</Button>
                )}
                {o.status !== "cancelado" && (
                  <Button size="sm" variant="destructive" onClick={() => setTarget({ kind: "order", order: o })} data-testid={`history-refund-order-${o.number}`}>
                    <RotateCcw className="size-3.5" /> {o.status === "pago" ? "Estornar venda" : "Cancelar pedido"}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </TabsContent>
      </Tabs>
      <ReasonDialog target={target} allowed={allowed} onClose={() => setTarget(null)} />
    </AppShell>
  );
}

function ReasonDialog({ target, allowed, onClose }: { target: Target | null; allowed: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const manager_pin = allowed ? undefined : pin;
  const m = useMutation({
    mutationFn: () => target!.kind === "order"
      ? apiPost<Order>(`/orders/${target!.order.id}/cancel`, { reason, manager_pin })
      : apiPost<Order>(`/orders/${target!.order.id}/items/${target!.item.id}/refund`, { reason, manager_pin }),
    onSuccess: () => {
      toast.success(target!.kind === "order" ? `Pedido #${target!.order.number} estornado` : "Item cancelado e valor estornado");
      setReason(""); setPin(""); onClose();
      ["orders-history", "dashboard", "cash", "tables", "table-order", "invoices", "ingredients"].forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const value = !target ? 0 : target.kind === "order" ? target.order.total : target.item.qty * target.item.unit_price;
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-white/10 bg-elevated sm:max-w-md" data-testid="refund-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-white">
            {target?.kind === "order" ? `Estornar venda #${target.order.number}` : `Cancelar ${target?.kind === "item" ? `${target.item.qty}x ${target.item.name}` : ""}`}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-zinc-400">
          Valor: <span className="font-mono text-white">{brl(value)}</span>. Os insumos voltam ao estoque
          {target?.order.status === "pago" ? " e o valor sai do caixa e dos relatórios." : "."}
        </p>
        <Input placeholder="Motivo (obrigatório)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="refund-reason-input" />
        {!allowed && (
          <Input type="password" inputMode="numeric" maxLength={6} placeholder="PIN do gerente (autorização)" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="font-mono" data-testid="refund-manager-pin-input" />
        )}
        <Button variant="destructive" disabled={reason.trim().length < 3 || (!allowed && pin.length < 4) || m.isPending} onClick={() => m.mutate()} data-testid="refund-confirm-button">
          {m.isPending ? "Processando…" : "Confirmar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
