import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, MapPin, Phone, Zap } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { brl, errMsg, fmtTime, PAY_LABEL, SOURCE_COLOR, SOURCE_LABEL } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { DeliveryStatus, Order, PayMethod } from "@/lib/types";
import { Empty } from "./Dashboard";

const PLATFORMS = ["ifood", "99food", "keeta", "site"] as const;
const DS_LABEL: Record<DeliveryStatus, string> = {
  pendente: "Aguardando aceite", aceito: "Aceito", preparo: "Em preparo", saiu: "Saiu p/ entrega", entregue: "Entregue", recusado: "Recusado",
};
const NEXT: Partial<Record<DeliveryStatus, { s: DeliveryStatus; label: string }[]>> = {
  pendente: [{ s: "aceito", label: "Aceitar" }, { s: "recusado", label: "Recusar" }],
  aceito: [{ s: "saiu", label: "Despachar motoboy" }],
  preparo: [{ s: "saiu", label: "Despachar motoboy" }],
  saiu: [{ s: "entregue", label: "Confirmar entrega" }],
};

export default function Delivery() {
  const [search, setSearch] = useState("");
  const demo = useQuery({ queryKey: ["demo-status"], queryFn: () => apiGet<{ delivery_simulation?: boolean }>("/demo-status") });
  const canSimulate = demo.data?.delivery_simulation === true;
  const orders = useQuery({ queryKey: ["delivery"], queryFn: () => apiGet<Order[]>("/delivery/orders"), refetchInterval: 8000 });
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!orders.data) return;
    const ids = new Set(orders.data.filter((o) => o.delivery_status === "pendente").map((o) => o.id));
    if (seen.current) {
      const fresh = orders.data.filter((o) => ids.has(o.id) && !seen.current!.has(o.id));
      fresh.forEach((o) => toast.info(`Novo pedido ${SOURCE_LABEL[o.source]} #${o.number} · ${brl(o.total)}`));
    }
    seen.current = ids;
  }, [orders.data]);

  const inv = () => { void queryClient.invalidateQueries({ queryKey: ["delivery"] }); void queryClient.invalidateQueries({ queryKey: ["dashboard"] }); };
  const simulate = useMutation({
    mutationFn: (source: string) => apiPost<Order>("/delivery/simulate", { source }),
    onSuccess: inv,
    onError: (e) => toast.error(errMsg(e)),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DeliveryStatus }) => apiPatch<Order>(`/delivery/orders/${id}/status`, { status }),
    onSuccess: (o) => { toast.success(`Pedido #${o.number}: ${DS_LABEL[o.delivery_status!]}`); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const term = search.trim().toLocaleLowerCase("pt-BR");
  const list = (orders.isError ? [] : orders.data ?? []).filter((order) =>
    [String(order.number), order.customer?.name, SOURCE_LABEL[order.source]].some(
      (value) => value?.toLocaleLowerCase("pt-BR").includes(term),
    ));
  const active = list.filter((o) => ["pendente", "aceito", "preparo", "saiu"].includes(o.delivery_status ?? ""));
  const done = list.filter((o) => !active.includes(o));

  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Central de Delivery" subtitle="Acompanhe pedidos e entregas"
        actions={<Link to="/pedir" target="_blank" className="flex items-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 py-2 text-sm text-emerald-300" data-testid="open-own-site-link"><ExternalLink className="size-4" /> Abrir site próprio</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PLATFORMS.map((platform) => (
          <div key={platform} className="min-w-0 rounded-xl border border-border bg-panel p-3" data-testid={`platform-card-${platform}`}>
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <span className="size-3 shrink-0 rounded-full" style={{ background: SOURCE_COLOR[platform] }} />{SOURCE_LABEL[platform]}
            </p>
            <Badge variant="outline" className="mt-2 max-w-full whitespace-normal">
              {platform === "site" ? "Canal próprio" : "Integração indisponível"}
            </Badge>
            {canSimulate && <Button size="sm" variant="outline" disabled={simulate.isPending} className="mt-3 w-full whitespace-normal"
              onClick={() => simulate.mutate(platform)} data-testid={`simulate-${platform}`}>
              <Zap className="size-3.5" /> Simular pedido
            </Button>}
          </div>
        ))}
      </div>
      <Input aria-label="Pesquisar pedidos delivery" placeholder="Pesquisar por pedido, cliente ou canal"
        className="mt-4 max-w-md" value={search} onChange={(event) => setSearch(event.target.value)} />
      {orders.isPending && <p role="status" className="mt-3 text-sm text-muted-foreground">Carregando pedidos…</p>}
      {orders.isError && <p role="alert" className="mt-3 text-sm text-destructive">Não foi possível consultar os pedidos.</p>}
      <h3 className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">Em andamento ({active.length})</h3>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {active.map((o) => <DeliveryCard key={o.id} o={o} onStatus={(s) => setStatus.mutate({ id: o.id, status: s })} />)}
        {!orders.isPending && !orders.isError && active.length === 0 && <div className="col-span-full"><Empty text={term ? "Nenhum pedido em andamento corresponde à busca." : "Nenhum pedido em andamento."} /></div>}
      </div>
      {done.length > 0 && (
        <>
          <h3 className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">Finalizados (24h)</h3>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{done.map((o) => <DeliveryCard key={o.id} o={o} />)}</div>
        </>
      )}
    </AppShell>
  );
}

function DeliveryCard({ o, onStatus }: { o: Order; onStatus?: (s: DeliveryStatus) => void }) {
  const ds = o.delivery_status ?? "pendente";
  return (
    <article className="rounded-2xl border border-white/5 bg-panel p-4 animate-rise" data-testid={`delivery-order-${o.number}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="rounded-md px-2 py-0.5 text-xs font-semibold text-black" style={{ background: SOURCE_COLOR[o.source] }}>{SOURCE_LABEL[o.source]}</span>
          <span className="font-mono text-sm text-white">#{o.number}</span>
        </span>
        <span className="text-xs text-zinc-400" data-testid={`delivery-status-${o.number}`}>{DS_LABEL[ds]} · {fmtTime(o.created_at)}</span>
      </div>
      <p className="mt-3 text-sm font-medium text-white">{o.customer.name}</p>
      <p className="flex items-center gap-1 text-xs text-zinc-400"><MapPin className="size-3" />{o.customer.address}</p>
      <p className="flex items-center gap-1 text-xs text-zinc-400"><Phone className="size-3" />{o.customer.phone}</p>
      <ul className="mt-3 space-y-0.5 text-sm text-zinc-300">
        {o.items.map((i) => <li key={i.id}><span className="font-mono text-primary">{i.qty}x</span> {i.name}{i.notes && <span className="text-amber-300"> · {i.notes}</span>}</li>)}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-xs text-zinc-500">{o.pay_on_delivery ? `Pagar na entrega: ${PAY_LABEL[o.pay_on_delivery as PayMethod]}` : "Pago online"}</span>
        <span className="font-mono text-lg text-white">{brl(o.total)}</span>
      </div>
      {onStatus && (
        <div className="mt-3 flex gap-2">
          {(NEXT[ds] ?? []).map((n) => (
            <Button key={n.s} size="sm" className="flex-1" variant={n.s === "recusado" ? "outline" : "default"} onClick={() => onStatus(n.s)} data-testid={`delivery-${n.s}-${o.number}`}>
              {n.label}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}
