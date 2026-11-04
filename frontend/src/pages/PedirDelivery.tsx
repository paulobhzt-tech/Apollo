import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import PublicMenu from "@/components/PublicMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/api";
import { brl, errMsg } from "@/lib/format";
import type { PublicDeliveryIn, PublicOrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { k: "pendente", l: "Recebido" }, { k: "aceito", l: "Confirmado" }, { k: "preparo", l: "Em preparo" }, { k: "saiu", l: "A caminho" }, { k: "entregue", l: "Entregue" },
];
const METHODS = [{ k: "pix", l: "PIX" }, { k: "credito", l: "Crédito" }, { k: "debito", l: "Débito" }, { k: "dinheiro", l: "Dinheiro" }] as const;

export default function PedirDelivery() {
  const [cartOpen, setCartOpen] = useState(false);
  const [trackId, setTrackId] = useState<string | null>(() => localStorage.getItem("site_order_id"));
  const [c, setC] = useState({ name: "", phone: "", address: "", cpf: "" });
  const [method, setMethod] = useState<PublicDeliveryIn["payment_method"]>("pix");
  const track = useQuery({
    queryKey: ["site-order", trackId],
    queryFn: () => apiGet<PublicOrderStatus>(`/public/delivery/${trackId}`),
    enabled: !!trackId,
    refetchInterval: 8000,
  });
  const place = useMutation({
    mutationFn: (b: PublicDeliveryIn) => apiPost<PublicOrderStatus>("/public/delivery", b),
    onError: (e) => toast.error(errMsg(e)),
  });
  const st = track.data?.delivery_status ?? "";
  const idx = STEPS.findIndex((s) => s.k === st);
  const valid = c.name.trim().length >= 2 && c.phone.trim().length >= 8 && c.address.trim().length >= 5;

  return (
    <PublicMenu
      cartOpen={cartOpen}
      setCartOpen={setCartOpen}
      header={
        <>
          <p className="mt-1 text-zinc-300">Delivery direto do restaurante · taxa de entrega {brl(5)} · sem comissões de aplicativo</p>
          {track.data && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur" data-testid="site-order-tracking">
              <p className="flex items-center gap-2 text-sm text-white"><Clock className="size-4 text-primary" /> Pedido #{track.data.number} · {brl(track.data.total)}</p>
              {st === "recusado" ? <p className="mt-2 text-sm text-red-300">Pedido recusado pelo restaurante.</p> : (
                <div className="mt-3 flex gap-1">
                  {STEPS.map((s, i) => (
                    <div key={s.k} className="flex-1">
                      <div className={cn("h-1.5 rounded-full", i <= idx ? "bg-primary" : "bg-white/10")} />
                      <p className={cn("mt-1 text-[10px]", i <= idx ? "text-white" : "text-zinc-500")}>{s.l}</p>
                    </div>
                  ))}
                </div>
              )}
              {(st === "entregue" || st === "recusado") && (
                <button type="button" className="mt-2 text-xs text-primary underline" onClick={() => { localStorage.removeItem("site_order_id"); setTrackId(null); }} data-testid="site-new-order">Fazer novo pedido</button>
              )}
            </div>
          )}
        </>
      }
      renderCheckout={(_l, items, total, clear) => (
        <div className="space-y-3 rounded-2xl border border-white/5 p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-400">Entrega</p>
          <Input placeholder="Seu nome" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} data-testid="site-name-input" />
          <Input placeholder="Telefone / WhatsApp" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} data-testid="site-phone-input" />
          <Input placeholder="Endereço completo" value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} data-testid="site-address-input" />
          <div className="grid grid-cols-4 gap-2">
            {METHODS.map((m) => (
              <Button key={m.k} size="sm" variant={method === m.k ? "default" : "outline"} onClick={() => setMethod(m.k)} data-testid={`site-pay-${m.k}`}>{m.l}</Button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">Pagamento na entrega. Subtotal {brl(total)} + entrega {brl(5)}</p>
          <Button className="h-14 w-full text-base" disabled={!items.length || !valid || place.isPending} data-testid="site-place-order"
            onClick={() => place.mutate({ items, customer: c, payment_method: method, change_for: 0 }, {
              onSuccess: (o) => {
                toast.success(`Pedido #${o.number} enviado!`);
                localStorage.setItem("site_order_id", o.id); setTrackId(o.id); clear(); setCartOpen(false);
              },
            })}>
            <CheckCircle2 className="size-5" /> {place.isPending ? "Enviando…" : `Finalizar pedido · ${brl(total + 5)}`}
          </Button>
        </div>
      )}
    />
  );
}
