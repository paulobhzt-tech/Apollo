import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play, Printer as PrinterIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Panel } from "./Dashboard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { envName, useEnvironments } from "@/lib/environments";
import { errMsg, fmtTime } from "@/lib/format";
import { printHtml, ticketHtml } from "@/lib/printTicket";
import { isDesktop } from "@/lib/desktop";
import { queryClient } from "@/lib/queryClient";
import type { KitchenTicket, PrintAttempt, Printer, PrintOutcome } from "@/lib/types";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

const LS = "print-station-config";
type DeviceCfg = { stations: string[]; auto: boolean };
const loadCfg = (): DeviceCfg => { try { return { stations: [], auto: false, ...JSON.parse(localStorage.getItem(LS) ?? "{}") }; } catch { return { stations: [], auto: false }; } };

export default function Impressao() {
  const envs = useEnvironments();
  const me = useMe();
  const printers = useQuery({ queryKey: ["printers"], queryFn: () => apiGet<Printer[]>("/printers") });
  const [cfg, setCfg] = useState<DeviceCfg>(loadCfg);
  const [log, setLog] = useState<{ id: string; text: string; at: string }[]>([]);
  const busy = useRef(false);
  const autoKeys = cfg.stations.filter((k) => envs.data?.find((e) => e.key === k)?.auto_print !== false && printers.data?.some((p) => p.active && p.purpose === k && (isDesktop() ? !!p.device_name : true)));

  useEffect(() => { localStorage.setItem(LS, JSON.stringify(cfg)); }, [cfg]);

  const queue = useQuery({
    queryKey: ["print-queue", autoKeys.join(",")],
    queryFn: () => apiGet<KitchenTicket[]>(`/print/queue?stations=${encodeURIComponent(autoKeys.join(","))}`),
    enabled: cfg.auto && autoKeys.length > 0, refetchInterval: 4000,
  });
  const recent = useQuery({ queryKey: ["print-recent"], queryFn: () => apiGet<KitchenTicket[]>("/print/recent"), refetchInterval: 8000 });

  const unresolved = useQuery({ queryKey: ["print-unresolved"], queryFn: () => apiGet<KitchenTicket[]>("/print/unresolved"), refetchInterval: 8000 });
  const displayedTickets = new Map([...unresolved.data ?? [], ...recent.data ?? []].map((ticket) => [ticket.id, ticket]));

  const printerFor = (station: string) => printers.data?.find((p) => p.active && p.purpose === station);

  const printOne = async (t: KitchenTicket, station: string, automatic = false) => {
    const pr = printerFor(station);
    if (!pr) throw new Error(`Cadastre uma impressora ativa para ${envName(envs.data, station)}`);
    if (isDesktop() && !pr.device_name) throw new Error(`Selecione a impressora Windows para ${envName(envs.data, station)}`);
    const reprint = t.printed.includes(station);
    if (reprint) await apiPost(`/kds/tickets/${t.id}/reprint-authorization`, { station });
    const html = ticketHtml(t, station, envName(envs.data, station), pr.paper, reprint);
    let attempt: PrintAttempt | null = null;
    if (!reprint) {
      try {
        attempt = await apiPost<PrintAttempt>(`/kds/tickets/${t.id}/print-attempt`, { station });
      } catch (error) {
        if (automatic && error instanceof ApiError && error.status === 409) return;
        throw error;
      }
    }
    const result = (outcome: PrintOutcome) => apiPost<KitchenTicket>(
      `/kds/tickets/${t.id}/print-result`, { station, attempt_id: attempt?.id, outcome },
    );
    const desktopPrint = isDesktop();
    try {
      await printHtml(html, pr.copies, pr);
      if (!desktopPrint && !window.confirm("O ticket saiu corretamente na impressora? Confirme após conferir o papel.")) {
        throw new Error("Resultado indeterminado. Solicite a conferência do administrador.");
      }
    } catch (error) {
      if (attempt) await result("indeterminate").catch(() => undefined);
      throw error;
    }
    const confirmed = attempt ? await result(desktopPrint ? "spooler_accepted" : "operator_confirmed") : t;
    queryClient.setQueriesData<KitchenTicket[]>({ queryKey: ["print-queue"] },
      (tickets) => tickets?.map((ticket) => ticket.id === confirmed.id ? confirmed : ticket));
    setLog((l) => [{ id: `${t.id}-${station}-${Date.now()}`, text: `${envName(envs.data, station)} · ${t.label} (#${t.order_number})${pr ? ` → ${pr.name}` : ""}`, at: new Date().toISOString() }, ...l].slice(0, 30));
  };

  const latest = useRef({ printOne, autoKeys, auto: cfg.auto });
  latest.current = { printOne, autoKeys, auto: cfg.auto };
  useEffect(() => {
    if (!cfg.auto || !queue.data?.length || busy.current) return;
    busy.current = true;
    void (async () => {
      try {
        for (const t of queue.data) {
          const pending = new Set(t.items.filter((item) => item.print_ticket !== false).map((item) => item.station));
          for (const station of pending) {
            const current = latest.current;
            if (!current.auto) return;
            if (current.autoKeys.includes(station) && !t.printed.includes(station)) {
              await current.printOne(t, station, true);
            }
          }
        }
      } catch (err) {
        // A print may have reached the printer even if confirming it to the server failed.
        latest.current.auto = false;
        setCfg((current) => ({ ...current, auto: false }));
        toast.error(err instanceof Error ? err.message : "Falha ao imprimir um ticket");
        toast.message("Impressão automática pausada. Confira o ticket antes de retomar.");
      } finally {
        busy.current = false;
        void queryClient.invalidateQueries({ queryKey: ["print-recent"] });
      }
    })();
  }, [queue.data, cfg.auto]);

  const reviewAttempt = async (ticket: KitchenTicket, attempt: PrintAttempt, printed: boolean) => {
    const question = printed ? "O papel deste setor foi conferido e o ticket está correto?"
      : "O ticket não saiu e não há nenhuma cópia pendente na fila do Windows? Confirmar libera uma nova tentativa.";
    if (!window.confirm(question)) return;
    try {
      await apiPost(`/kds/tickets/${ticket.id}/print-review`, { station: attempt.station, attempt_id: attempt.id, printed });
      void queryClient.invalidateQueries({ queryKey: ["print-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["print-recent"] });
      void queryClient.invalidateQueries({ queryKey: ["print-unresolved"] });
    } catch (error) {
      toast.error(errMsg(error));
    }
  };

  const toggleAuto = () => {
    const auto = !latest.current.auto;
    latest.current.auto = auto;
    setCfg((current) => ({ ...current, auto }));
  };
  const toggleStation = (k: string) => setCfg((c) => ({ ...c, stations: c.stations.includes(k) ? c.stations.filter((x) => x !== k) : [...c.stations, k] }));

  return (
    <AppShell roles={["caixa", "cozinha", "garcom"]}>
      <PageHeader title="Central de Impressão" subtitle="Deixe esta tela aberta no computador ligado à impressora: cada pedido novo sai impresso no ambiente certo"
        actions={
          <Button onClick={toggleAuto} disabled={!cfg.auto && !autoKeys.length} variant={cfg.auto ? "outline" : "default"} data-testid="print-auto-toggle">
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
                      <span className="block text-[11px] text-zinc-500">{pr ? `${pr.name} · ${pr.paper} · ${pr.copies} via(s)` : "Sem impressora cadastrada · impressão automática bloqueada"}</span>
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
          <Panel title="Impressão pelo Windows">
            <p className="mb-2 text-xs text-amber-300">Cadastre uma impressora ativa para cada ambiente em Configurações → Impressoras. No Windows, selecione também o nome exato da impressora instalada. Sem essa configuração, a impressão automática fica bloqueada para evitar envio ao dispositivo errado.</p>
            <p className="text-xs leading-relaxed text-zinc-400">
              {isDesktop() ? "Aplicativo Apollo PDV: os tickets saem direto na impressora do Windows escolhida em Configurações → Impressoras, sem janela." : "No navegador, selecione a impressora na janela de impressão e confira o papel antes de confirmar. Use o Apollo PDV para Windows para enviar diretamente à fila configurada."}
            </p>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Envios recentes nesta sessão">
            <ul className="space-y-1.5" data-testid="print-log">
              {log.map((l) => <li key={l.id} className="flex justify-between text-sm text-zinc-200"><span><PrinterIcon className="mr-2 inline size-3.5 text-primary" />{l.text}</span><span className="font-mono text-xs text-zinc-500">{fmtTime(l.at)}</span></li>)}
              {!log.length && <li className="text-sm text-zinc-500">Nada impresso ainda.</li>}
            </ul>
          </Panel>
          <Panel title="Pedidos recentes e tentativas para conferência">
            <div className="space-y-2">
              {Array.from(displayedTickets.values(), (t) => {
                const stations = [...new Set(t.items.filter((i) => i.print_ticket !== false).map((i) => i.station))];
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 px-3 py-2" data-testid={`print-recent-${t.order_number}`}>
                    <span className="min-w-40 flex-1 text-sm text-white">{t.label} <span className="font-mono text-xs text-zinc-500">#{t.order_number} · {fmtTime(t.created_at)}</span></span>
                    {stations.map((s) => {
                      const attempt = t.print_attempts?.find((entry) => entry.station === s);
                      const needsReview = attempt?.state === "indeterminate" ||
                        (attempt?.state === "processing" && Date.now() - Date.parse(attempt.started_at) >= 300_000);
                      const status = needsReview ? "Conferência necessária"
                        : attempt?.state === "processing" ? "Em processamento"
                        : attempt?.state === "spooler_accepted" ? "Aceito pelo spooler"
                        : attempt?.state === "operator_confirmed" ? "Conferido no papel"
                        : t.printed.includes(s) ? "Envio registrado" : "Aguardando";
                      return (
                        <div key={s} className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{envName(envs.data, s)} · {status}</Badge>
                          {needsReview && attempt && me.data?.role === "admin" && (
                            <>
                              <Button size="xs" variant="outline" onClick={() => void reviewAttempt(t, attempt, true)}>Confirmar saída</Button>
                              <Button size="xs" variant="outline" onClick={() => void reviewAttempt(t, attempt, false)}>Liberar tentativa</Button>
                            </>
                          )}
                          {(!attempt || t.printed.includes(s)) && (
                            <Button size="xs" variant={t.printed.includes(s) ? "outline" : "default"}
                              onClick={() => void printOne(t, s).catch((error: unknown) => toast.error(errMsg(error)))
                                .finally(() => queryClient.invalidateQueries({ queryKey: ["print-recent"] }))}
                              data-testid={`print-reprint-${t.order_number}-${s}`}>
                              <RotateCcw className="size-3" /> {t.printed.includes(s) ? "Reimprimir" : "Imprimir"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
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
