import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Volume2, VolumeX } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch } from "@/lib/api";
import { errMsg, fmtTime, minutesSince, SOURCE_COLOR } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { KitchenTicket, Station } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEnvironments } from "@/lib/environments";
import { toast } from "sonner";

const COLS: { key: KitchenTicket["status"]; label: string; next?: KitchenTicket["status"]; action?: string }[] = [
  { key: "novo", label: "Novos pedidos", next: "preparo", action: "Iniciar preparo" },
  { key: "preparo", label: "Em preparo", next: "pronto", action: "Marcar pronto" },
  { key: "pronto", label: "Pronto / Despachar", next: "entregue", action: "Entregue" },
];

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch (err) { console.warn("Som de novo pedido bloqueado pelo navegador:", err); }
}

export default function Kds() {
  const [station, setStation] = useState<Station | "all">("cozinha");
  const [sound, setSound] = useState(true);
  const [onlyLate, setOnlyLate] = useState(false);
  const [, tick] = useState(0);
  const tickets = useQuery({ queryKey: ["kds"], queryFn: () => apiGet<KitchenTicket[]>("/kds/tickets"), refetchInterval: 5000 });
  const seen = useRef<Set<string> | null>(null);
  const envs = useEnvironments();
  const STATIONS: { key: Station | "all"; label: string }[] = [{ key: "all", label: "Todos os ambientes" }, ...(envs.data ?? []).map((e) => ({ key: e.key, label: e.name }))];

  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!tickets.data) return;
    const ids = new Set(tickets.data.filter((t) => t.status === "novo" && (station === "all" || t.items.some(i => i.station === station))).map((t) => t.id));
    if (seen.current) {
      const fresh = [...ids].filter((id) => !seen.current!.has(id));
      if (fresh.length) { toast.info(`${fresh.length} novo(s) pedido(s) em ${station === "all" ? "todos os ambientes" : (envs.data?.find(e => e.key === station)?.name ?? station)}`); if (sound) beep(); }
    }
    seen.current = ids;
  }, [tickets.data, sound, station, envs.data]);

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch<KitchenTicket>(`/kds/tickets/${id}`, { status }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["kds"] }); void queryClient.invalidateQueries({ queryKey: ["waiter-ready-tickets"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const list = (tickets.isError ? [] : tickets.data ?? [])
    .map((t) => ({ ...t, items: t.items.filter((i) => station === "all" || i.station === station) }))
    .filter((t) => t.items.length && (!onlyLate || (t.status !== "pronto" && minutesSince(t.created_at) >= 15)));
  const waiting = list.filter((t) => t.status === "novo").length;
  const preparing = list.filter((t) => t.status === "preparo").length;
  const delayed = list.filter((t) => t.status !== "pronto" && minutesSince(t.created_at) >= 15).length;

  return (
    <AppShell roles={["cozinha", "garcom", "caixa"]}>
      <PageHeader title="Cozinha e Bar (KDS)" subtitle="Atualiza automaticamente · <15min verde · 15-25 amarelo · >25 vermelho" actions={
        <>
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/8 p-1">
            {STATIONS.map((s) => (
              <button key={s.key} type="button" onClick={() => setStation(s.key)} data-testid={`kds-station-${s.key}`}
                className={cn("rounded-lg px-3 py-1.5 text-xs transition-colors duration-150", station === s.key ? "bg-primary text-white" : "text-zinc-400 hover:text-white")}>
                {s.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => setSound(!sound)} data-testid="kds-sound-toggle">{sound ? <Volume2 /> : <VolumeX />}</Button>
        </>
      } />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm" data-testid="kds-summary"><span>Novos: <strong>{waiting}</strong></span><span>Em preparo: <strong>{preparing}</strong></span><span className={delayed ? "font-semibold text-amber-300" : ""}>Atrasados (15min+): <strong>{delayed}</strong></span><Button size="sm" variant={onlyLate ? "default" : "outline"} onClick={() => setOnlyLate((v) => !v)} data-testid="kds-late-filter">{onlyLate ? "Mostrar todos" : "Ver atrasados"}</Button><Button size="sm" variant="outline" onClick={() => void tickets.refetch()}>Atualizar</Button></div>
      <div className="grid gap-4 lg:grid-cols-3">
        {COLS.map((c) => {
          const col = list.filter((t) => t.status === c.key);
          return (
            <section key={c.key} className="rounded-2xl border border-white/5 bg-shell p-3" data-testid={`kds-column-${c.key}`}>
              <h3 className="mb-3 flex items-center justify-between px-1 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">
                {c.label} <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-white">{col.length}</span>
              </h3>
              <div className="space-y-3">
                {col.map((t) => {
                  const m = minutesSince(t.created_at);
                  const urgent = m > 25 && c.key !== "pronto";
                  return (
                    <article key={t.id} data-testid={`kds-ticket-${t.order_number}`}
                      className={cn("rounded-xl border p-3 animate-rise", urgent ? "animate-urgent border-red-400 bg-[#2A1418]" : "border-white/8 bg-[#1A1E2E]")}>
                      <div className="flex items-center justify-between">
                        <p className="font-heading text-lg font-semibold text-white">{t.label}</p>
                        <span className={cn("rounded-md px-2 py-0.5 font-mono text-xs", m < 15 ? "bg-emerald-400/15 text-emerald-300" : m <= 25 ? "bg-amber-400/15 text-amber-300" : "bg-red-400/20 text-red-300")}>
                          {m}min
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        <span className="mr-1 inline-block size-2 rounded-full" style={{ background: SOURCE_COLOR[t.source] }} />
                        #{t.order_number} · {fmtTime(t.created_at)} · {envs.data?.find(e => e.key === t.items[0]?.station)?.name ?? t.items[0]?.station ?? "Produção"}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {t.items.map((i, idx) => (
                          <li key={idx} className="text-sm">
                            <span className="font-mono text-primary">{i.qty}x</span> <span className="text-zinc-100">{i.name}</span>
                            {i.options?.map((o) => <p key={o} className="ml-6 text-xs font-semibold text-sky-300" data-testid="kds-item-option">▸ {o}</p>)}
                            {i.customer_name && <p className="ml-6 text-xs text-zinc-400">Cliente: {i.customer_name}</p>}
                            {i.notes && <p className="ml-6 rounded bg-amber-400/10 px-1.5 text-xs font-medium text-amber-300">⚠ {i.notes}</p>}
                          </li>
                        ))}
                      </ul>
                      {c.next && (
                        <Button size="sm" className="mt-3 w-full" variant={c.key === "pronto" ? "outline" : "default"} disabled={move.isPending || (station !== "all" && t.items.some(i => i.station !== station))}
                          title={station !== "all" && t.items.some(i => i.station !== station) ? "Pedido antigo com setores misturados: gerencie em Todos os ambientes" : undefined}
                          onClick={() => move.mutate({ id: t.id, status: c.next! })} data-testid={`kds-advance-${t.order_number}`}>
                          {c.action}
                        </Button>
                      )}
                    </article>
                  );
                })}
                {col.length === 0 && <p className="py-8 text-center text-xs text-zinc-600">Vazio</p>}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
