import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, Receipt, ShoppingCart, ListChecks, ChefHat } from "lucide-react";
import { toast } from "sonner";
import PublicMenu from "@/components/PublicMenu";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import { equalBillShares } from "@/lib/bill-split";
import { brl, errMsg } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { OkOut, OrderItemIn, PublicTable } from "@/lib/types";

export default function Cardapio() {
  const { tableId = "" } = useParams();
  const [cartOpen, setCartOpen] = useState(false);
  const [showConsumed, setShowConsumed] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [splitPeople, setSplitPeople] = useState(2);
  const [splitQty, setSplitQty] = useState<Record<string, number>>({});
  const [showPreparation, setShowPreparation] = useState(false);
  const preparation = useQuery({ queryKey: ["public-preparation", tableId], queryFn: () => apiGet<{ tickets: { id: string; status: "novo" | "preparo" | "pronto" | "entregue"; items: { name: string; qty: number; station: string }[] }[] }>(`/public/tables/${tableId}/preparo`), enabled: showPreparation && !!tableId, refetchInterval: 5000 });
  const table = useQuery({ queryKey: ["public-table", tableId], queryFn: () => apiGet<PublicTable>(`/public/tables/${tableId}`), refetchInterval: showConsumed ? 5000 : 15000 });
  const t = table.isError ? undefined : table.data;
  const equalShares = equalBillShares(t?.total ?? 0, splitPeople);
  const order = useMutation({
    mutationFn: (items: OrderItemIn[]) => apiPost<PublicTable>(`/public/tables/${tableId}/order`, { items }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const splitRequest = useMutation({
    mutationFn: (quantities: Record<string, number>) => apiPost<{ message: string }>(`/public/tables/${tableId}/split-request`, { quantities }),
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error(errMsg(error)),
  });
  const call = useMutation({
    mutationFn: (type: "garcom" | "conta") => apiPost<OkOut>(`/public/tables/${tableId}/call`, { type }),
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <PublicMenu
      channel="qr"
      cartOpen={cartOpen}
      setCartOpen={setCartOpen}
      header={
        <>
          <p className="mt-1 text-zinc-300" data-testid="public-table-label">
            {t ? `Você está na ${t.label || `Mesa ${t.number}`}` : table.isError ? "Mesa não encontrada" : "Carregando mesa…"}
            {t && t.total > 0 && <span className="ml-2 font-mono text-sm text-zinc-400">· consumo {brl(t.total)}</span>}
          </p>
          {t && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => call.mutate("garcom")} data-testid="public-call-waiter"><Bell className="size-4" /> Chamar garçom</Button>
              <Button variant="outline" size="sm" onClick={() => setCartOpen(true)} data-testid="public-order-table"><ShoppingCart className="size-4" /> Pedir pela mesa</Button>
              <Button variant="outline" size="sm" aria-expanded={showPreparation} aria-controls="public-preparation-status"
                onClick={() => setShowPreparation((visible) => !visible)} data-testid="public-track-preparation">
                <ChefHat className="size-4" /> {showPreparation ? "Ocultar preparo" : "Acompanhar preparo"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowConsumed(!showConsumed); void table.refetch(); }} data-testid="public-view-consumed"><ListChecks className="size-4" /> Ver o que consumiu</Button>
              <Button variant="outline" size="sm" onClick={() => setShowSplit(!showSplit)} data-testid="public-split-bill"><Receipt className="size-4" /> Dividir conta</Button>
              <Button variant="outline" size="sm" onClick={() => call.mutate("conta")} data-testid="public-request-bill"><Receipt className="size-4" /> Pedir a conta</Button>
            </div>
          )}
          {t && showSplit && (
            <section className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4" data-testid="public-split-preview">
              <p className="font-semibold text-white">Simular divisão da conta</p>
              <p className="mt-1 text-sm text-zinc-400">Divisão igual entre pessoas. Apenas simulação: o caixa confirma os valores e recebe o pagamento.</p>
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" disabled={splitPeople <= 2} onClick={() => setSplitPeople(n => Math.max(2, n - 1))} aria-label="Diminuir pessoas">−</Button>
                <span className="min-w-24 text-center font-medium">{splitPeople} pessoas</span>
                <Button type="button" variant="outline" size="sm" disabled={splitPeople >= 30} onClick={() => setSplitPeople(n => Math.min(30, n + 1))} aria-label="Aumentar pessoas">+</Button>
              </div>
              <p className="mt-3 text-sm">Total da mesa: <strong>{brl(t.total)}</strong></p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">Por pessoa: {equalShares.extraPeople
                ? `${splitPeople - equalShares.extraPeople} × ${brl(equalShares.amount)} + ${equalShares.extraPeople} × ${brl(equalShares.extraAmount)}`
                : brl(equalShares.amount)}</p>
              <div className="mt-4 border-t border-white/10 pt-3" data-testid="public-item-split">
                <p className="font-semibold text-white">Ou selecione itens para uma conta separada</p>
                <p className="mt-1 text-xs text-zinc-400">Prévia dos itens selecionados. O caixa confirma a divisão e o pagamento.</p>
                {(t.items ?? []).map((item, index) => {
                  const key = item.id || String(index);
                  const qty = Math.min(item.qty, splitQty[key] ?? 0);
                  return <div key={key} className="mt-3 flex items-center justify-between gap-2 text-sm">
                    <span className="flex-1">{item.name} · {brl(item.unit_price)}</span>
                    <Button type="button" size="sm" variant="outline" disabled={qty <= 0} onClick={() => setSplitQty(old => ({ ...old, [key]: Math.max(0, qty - 1) }))}>−</Button>
                    <span className="w-12 text-center">{qty}/{item.qty}</span>
                    <Button type="button" size="sm" variant="outline" disabled={qty >= item.qty} onClick={() => setSplitQty(old => ({ ...old, [key]: Math.min(item.qty, qty + 1) }))}>+</Button>
                  </div>;
                })}
                <p className="mt-3 font-semibold text-emerald-300">Itens selecionados: {brl((t.items ?? []).reduce((sum, item, index) => sum + Math.min(item.qty, splitQty[item.id || String(index)] ?? 0) * item.unit_price, 0))}</p>
                <p className="mt-1 text-xs text-zinc-400">A seleção não reserva itens e não registra pagamento.</p>
                <Button type="button" className="mt-3 w-full" disabled={splitRequest.isPending || !(t.items ?? []).some((item, index) => (splitQty[item.id || String(index)] ?? 0) > 0 && !!item.id)}
                  onClick={() => splitRequest.mutate(Object.fromEntries((t.items ?? []).filter((item, index) => !!item.id && (splitQty[item.id || String(index)] ?? 0) > 0).map(item => [item.id!, Math.min(item.qty, splitQty[item.id!] ?? 0)])))}
                  data-testid="public-send-split-request">
                  {splitRequest.isPending ? "Enviando…" : "Enviar divisão ao caixa"}
                </Button>
              </div>
              <Button type="button" className="mt-3" variant="outline" disabled={call.isPending} onClick={() => call.mutate("conta")} data-testid="public-split-request-cashier">Solicitar fechamento ao caixa</Button>
            </section>
          )}
          {t && showPreparation && (
            <section id="public-preparation-status" className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4" data-testid="public-preparation-status">
              <p className="font-semibold text-white">Acompanhamento dos pedidos</p>
              {preparation.isError && <p className="mt-2 text-sm text-red-300">Não foi possível atualizar o preparo. Tente novamente.</p>}
              {preparation.isLoading && <p className="mt-2 text-sm text-zinc-400">Consultando cozinha e bar…</p>}
              {preparation.data?.tickets.length === 0 && <p className="mt-2 text-sm text-zinc-400">Nenhum pedido em preparo nesta mesa.</p>}
              {preparation.data?.tickets.map(ticket => (
                <div key={ticket.id} className="mt-3 border-t border-white/10 pt-3">
                  <p className="font-medium text-amber-200">{({ novo: "Recebido", preparo: "Em preparo", pronto: "Pronto para servir", entregue: "Entregue" } as const)[ticket.status] ?? "Em atendimento"}</p>
                  {ticket.items.map((item, i) => <p key={i} className="text-sm text-zinc-300">{item.qty}× {item.name} · {item.station === "bar" ? "Bar" : item.station === "cozinha" ? "Cozinha" : item.station}</p>)}
                </div>
              ))}
              <p className="mt-3 text-xs text-zinc-500">Atualização automática a cada 5 segundos.</p>
            </section>
          )}
          {t && showConsumed && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4" data-testid="public-consumed-list">
              <p className="font-semibold text-white">Consumo da mesa</p>
              {t.items?.length ? t.items.map((item, i) => (
                <div key={i} className="mt-2 flex justify-between gap-3 text-sm text-zinc-300">
                  <span>{item.qty}× {item.name}</span><span>{brl(item.qty * item.unit_price)}</span>
                </div>
              )) : <p className="mt-2 text-sm text-zinc-400">Nenhum item lançado nesta mesa.</p>}
              <p className="mt-3 border-t border-white/10 pt-3 font-semibold text-white">Total da mesa: {brl(t.total)}</p>
            </div>
          )}
        </>
      }
      renderCheckout={(_lines, items, total, clear) => (
        <Button className="h-14 w-full text-base" disabled={!items.length || order.isPending || !t || t.status === "reservada" || t.status === "conta"} data-testid="public-send-order"
          onClick={() => order.mutate(items, {
            onSuccess: () => {
              toast.success("Pedido enviado para a cozinha!");
              setShowPreparation(true);
              clear(); setCartOpen(false);
              void queryClient.invalidateQueries({ queryKey: ["public-table", tableId] });
              void queryClient.invalidateQueries({ queryKey: ["public-preparation", tableId] });
            },
          })}>
          {order.isPending ? "Enviando…" : `Enviar pedido · ${brl(total)}`}
        </Button>
      )}
    />
  );
}
