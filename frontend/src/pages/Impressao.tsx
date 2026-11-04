import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play, Printer as PrinterIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Panel } from "./Dashboard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";
import { envName, useEnvironments } from "@/lib/environments";
import { fmtTime } from "@/lib/format";
import { printHtml, ticketHtml } from "@/lib/printTicket";
import { isDesktop } from "@/lib/desktop";
import { queryClient } from "@/lib/queryClient";
import type { KitchenTicket, Printer } from "@/lib/types";
import { cn } from "@/lib/utils";

const LS = "print-station-config";
type DeviceCfg = { stations: string[]; auto: boolean };
const loadCfg = (): DeviceCfg => { try { return { stations: [], auto: false, ...JSON.parse(localStorage.getItem(LS) ?? "{}") }; } catch { return { stations: [], auto: false }; } };

export default function Impressao() {
  const envs = useEnvironments();
  const printers = useQuery({ queryKey: ["printers"], queryFn: () => apiGet<Printer[]>("/printers") });
  const [cfg, setCfg] = useState<DeviceCfg>(loadCfg);
  const [log, setLog] = useState<{ id: string; text: string; at: string }[]>([]);
  const busy = useRef(false);
  const autoKeys = cfg.stations.filter((k) => envs.data?.find((e) => e.key === k)?.auto_print !== false);

  useEffect(() => { localStorage.setItem(LS, JSON.stringify(cfg)); }, [cfg]);

  const queue = useQuery({
    queryKey: ["print-queue", autoKeys.join(",")],
    queryFn: () => apiGet<KitchenTicket[]>(`/print/queue?stations=${encodeURIComponent(autoKeys.join(","))}`),
    enabled: cfg.auto && autoKeys.length > 0, refetchInterval: 4000,
  });
  const recent = useQuery({ queryKey: ["print-recent"], queryFn: () => apiGet<KitchenTicket[]>("/print/recent"), refetchInterval: 8000 });

  const printerFor = (station: string) => printers.data?.find((p) => p.active && p.purpose === station);

  const printOne = async (t: KitchenTicket, station: string) => {
    const pr = printerFor(station);
    await printHtml(ticketHtml(t, station, envName(envs.data, station), pr?.paper), pr?.copies ?? 1, pr);
    await apiPost<KitchenTicket>(`/kds/tickets/${t.id}/printed`, { station });
    setLog((l) => [{ id: `${t.id}-${station}-${Date.now()}`, text: `${envName(envs.data, station)} · ${t.label} (#${t.order_number})${pr ? ` → ${pr.name}` : ""}`, at: new Date().toISOString() }, ...l].slice(0, 30));
  };

  const latest = useRef({ printOne, autoKeys });
  latest.current = { printOne, autoKeys };
  useEffect(() => {
    if (!cfg.auto || !queue.data?.length || busy.current) return;
    const { printOne: print, autoKeys: keys } = latest.current;
    busy.current = true;
    void (async () => {
      try {
        for (const t of queue.data) {
          const pending = [...new Set(t.items.filter((i) => keys.includes(i.station) && i.print_ticket !== false).map((i) => i.station))].filter((s) => !t.printed.includes(s));
          for (const s of pending) await print(t, s);
        }
      } catch (err) { console.error("Auto print failed:", err); toast.error("Falha ao imprimir um ticket"); }
      finally { busy.current = false; void queryClient.invalidateQueries({ queryKey: ["print-queue"] }); void queryClient.invalidateQueries({ queryKey: ["print-recent"] }); }
    })();
  }, [queue.data, cfg.auto]);

  const toggleStation = (k: string) => setCfg((c) => ({ ...c, stations: c.stations.includes(k) ? c.stations.filter((x) => x !== k) : [...c.stations, k] }));

  return (
    <AppShell roles={["caixa", "cozinha", "garcom"]}>
      <PageHeader title="Central de Impressão" subtitle="Deixe esta tela aberta no computador ligado à impressora: cada pedido novo sai impresso no ambiente certo"
        actions={
          <Button onClick={() => setCfg((c) => ({ ...c, auto: !c.auto }))} disabled={!cfg.stations.length} variant={cfg.auto ? "outline" : "default"} data-testid="print-auto-toggle">
            {cfg.auto ? <><Pause className="size-4" /> Pausar impressão automática</> : <><Play className="size-4" /> Ligar impressão automática</>}
          </Button>
        } />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Panel title="Ambientes impressos neste computador">
            <div className="space-y-2">
              {(envs.data ?? []).map((e) => {
                const pr = printerFor(e.key);
                return (
                  <label key={e.key} className="flex items-center gap-3 rounded-xl border border-white/5 px-3 py-2.5 transition-colors duration-150 hover:border-primary/40" data-testid={`print-env-${e.key}`}>
                    <Checkbox checked={cfg.stations.includes(e.key)} onCheckedChange={() => toggleStation(e.key)} data-testid={`print-env-checkbox-${e.key}`} />
                    <span className="flex-1">
                      <span className="block text-sm text-white">{e.name}</span>
                      <span className="block text-[11px] text-zinc-500">{pr ? `${pr.name} · ${pr.paper} · ${pr.copies} via(s)` : "Sem impressora cadastrada (usa 80mm)"}</span>
                    </span>
                    {!e.auto_print && <Badge variant="outline">Só manual</Badge>}
                  </label>
                );
              })}
            </div>
            <div className={cn("mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm", cfg.auto ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-zinc-400")} data-testid="print-status">
              <span className={cn("size-2 rounded-full", cfg.auto ? "animate-pulse bg-emerald-400" : "bg-zinc-500")} />
              {cfg.auto ? `Imprimindo automaticamente · ${queue.data?.length ?? 0} na fila` : "Impressão automática desligada"}
            </div>
          </Panel>
          <Panel title="Impressão sem janela (recomendado)">
            <p className="text-xs leading-relaxed text-zinc-400">
              {isDesktop() ? "Aplicativo PDV 3.0: os tickets saem direto na impressora do Windows escolhida em Configurações → Impressoras, sem janela." : <>Instale o aplicativo <b>PDV 3.0</b> para Windows para imprimir direto, ou defina a impressora térmica como padrão e abra o Chrome com a opção <code className="rounded bg-white/10 px-1 font-mono text-zinc-200">--kiosk-printing</code> no atalho.</>}
              Assim os tickets saem direto, sem a janela de confirmação. Para imprimir em várias impressoras, use um computador/tablet por ambiente ou um perfil do Chrome para cada impressora.
            </p>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Impresso agora há pouco (nesta sessão)">
            <ul className="space-y-1.5" data-testid="print-log">
              {log.map((l) => <li key={l.id} className="flex justify-between text-sm text-zinc-200"><span><PrinterIcon className="mr-2 inline size-3.5 text-primary" />{l.text}</span><span className="font-mono text-xs text-zinc-500">{fmtTime(l.at)}</span></li>)}
              {!log.length && <li className="text-sm text-zinc-500">Nada impresso ainda.</li>}
            </ul>
          </Panel>
          <Panel title="Pedidos recentes · reimprimir">
            <div className="space-y-2">
              {(recent.data ?? []).map((t) => {
                const stations = [...new Set(t.items.filter((i) => i.print_ticket !== false).map((i) => i.station))];
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 px-3 py-2" data-testid={`print-recent-${t.order_number}`}>
                    <span className="min-w-40 flex-1 text-sm text-white">{t.label} <span className="font-mono text-xs text-zinc-500">#{t.order_number} · {fmtTime(t.created_at)}</span></span>
                    {stations.map((s) => (
                      <Button key={s} size="xs" variant={t.printed.includes(s) ? "outline" : "default"} onClick={() => void printOne(t, s).then(() => queryClient.invalidateQueries({ queryKey: ["print-recent"] }))}
                        data-testid={`print-reprint-${t.order_number}-${s}`}>
                        <RotateCcw className="size-3" /> {envName(envs.data, s)}{t.printed.includes(s) ? " ✓" : ""}
                      </Button>
                    ))}
                    {!stations.length && <span className="text-xs text-zinc-500">sem itens para imprimir</span>}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
