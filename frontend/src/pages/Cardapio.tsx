import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, Receipt, ShoppingCart, ListChecks } from "lucide-react";
import { toast } from "sonner";
import PublicMenu from "@/components/PublicMenu";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import { brl, errMsg } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { OkOut, OrderItemIn, PublicTable } from "@/lib/types";

export default function Cardapio() {
  const { tableId = "" } = useParams();
  const [cartOpen, setCartOpen] = useState(false);
  const [showConsumed, setShowConsumed] = useState(false);
  const [showPreparation, setShowPreparation] = useState(false);
  const preparation = useQuery({ queryKey: ["public-preparation", tableId], queryFn: () => apiGet<{ tickets: { id: string; status: "novo" | "preparo" | "pronto" | "entregue"; items: { name: string; qty: number; station: string }[] }[] }>(`/public/tables/${tableId}/preparo`), enabled: showPreparation && !!tableId, refetchInterval: 5000 });
  const table = useQuery({ queryKey: ["public-table", tableId], queryFn: () => apiGet<PublicTable>(`/public/tables/${tableId}`), refetchInterval: showConsumed ? 5000 : 15000 });
  const t = table.isError ? undefined : table.data;
  const order = useMutation({
    mutationFn: (items: OrderItemIn[]) => apiPost<PublicTable>(`/public/tables/${tableId}/order`, { items }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const call = useMutation({
    mutationFn: (type: "garcom" | "conta") => apiPost<OkOut>(`/public/tables/${tableId}/call`, { type }),
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <PublicMenu
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
              <Button variant="outline" size="sm" onClick={() => { setShowConsumed(!showConsumed); void table.refetch(); }} data-testid="public-view-consumed"><ListChecks className="size-4" /> Ver o que consumiu</Button>
              <Button variant="outline" size="sm" onClick={() => call.mutate("conta")} data-testid="public-request-bill"><Receipt className="size-4" /> Pedir a conta</Button>
            </div>
          )}
          {t && showPreparation && (
            <section className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4" data-testid="public-preparation-status">
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
        <Button className="h-14 w-full text-base" disabled={!items.length || order.isPending || !t} data-testid="public-send-order"
          onClick={() => order.mutate(items, {
            onSuccess: () => {
              toast.success("Pedido enviado para a cozinha!");
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
