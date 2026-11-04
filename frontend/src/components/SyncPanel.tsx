import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, Monitor, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/pages/Dashboard";
import { Button } from "@/components/ui/button";
import { desktop } from "@/lib/desktop";
import { brl, fmtDateTime } from "@/lib/format";
import { dismissRejected, lastSync, retryRejected, syncQueue, useOffline } from "@/lib/offline";

/** Sincronização: pending offline sales, rejected ones (kept for review) and the desktop app status. */
export default function SyncPanel() {
  const { offline, queue, rejected } = useOffline();
  const d = desktop();
  const cfg = useQuery({ queryKey: ["desktop-config"], queryFn: () => d!.config(), enabled: !!d });
  const last = lastSync();
  const run = async () => {
    const r = await syncQueue();
    if (r.synced || r.failed) toast.success(`${r.synced} venda(s) sincronizada(s)${r.failed ? ` · ${r.failed} recusada(s)` : ""}`);
    else toast.message(offline ? "Sem conexão: as vendas continuam guardadas" : "Nada pendente");
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Vendas offline deste computador">
        <div className="flex flex-wrap items-center gap-3">
          <span className={offline ? "text-amber-300" : "text-emerald-300"} data-testid="sync-connection">
            {offline ? <><CloudOff className="mr-1 inline size-4" /> Sem conexão</> : <><CheckCircle2 className="mr-1 inline size-4" /> Conectado</>}
          </span>
          <span className="text-sm text-zinc-300" data-testid="sync-pending-count">{queue.length} pendente(s)</span>
          <Button size="sm" onClick={() => void run()} disabled={!queue.length} data-testid="sync-now-button"><RefreshCw className="size-3.5" /> Sincronizar agora</Button>
        </div>
        {last && <p className="mt-2 text-xs text-zinc-500" data-testid="sync-last">Última sincronização: {fmtDateTime(last.at)} · {last.synced} enviada(s) · {last.failed} recusada(s)</p>}
        <ul className="mt-3 space-y-1.5">
          {queue.map((s) => (
            <li key={s.payload.client_ref} className="flex justify-between rounded-lg border border-white/5 px-3 py-2 text-sm" data-testid="sync-pending-item">
              <span className="text-zinc-300">{s.payload.items.length} item(ns) · {fmtDateTime(s.queued_at)}</span><span className="font-mono text-white">{brl(s.total)}</span>
            </li>
          ))}
          {!queue.length && <li className="text-xs text-zinc-500">Nenhuma venda aguardando envio.</li>}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">Cada venda tem um código único: reenviar nunca duplica a venda. O estoque é baixado quando ela chega ao servidor.</p>
      </Panel>
      <Panel title="Recusadas pelo servidor (para conferir)">
        <ul className="space-y-1.5" data-testid="sync-rejected-list">
          {rejected.map((s) => (
            <li key={s.payload.client_ref} className="rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-200">{fmtDateTime(s.queued_at)} · {brl(s.total)}</span>
                <span className="flex gap-1">
                  <Button size="xs" variant="outline" onClick={() => retryRejected(s.payload.client_ref)} data-testid="sync-retry-button"><RotateCcw className="size-3" /> Reenviar</Button>
                  <Button size="xs" variant="ghost" onClick={() => window.confirm("Descartar esta venda recusada?") && dismissRejected(s.payload.client_ref)} data-testid="sync-dismiss-button"><Trash2 className="size-3" /></Button>
                </span>
              </div>
              <p className="text-xs text-red-300">{s.error}</p>
            </li>
          ))}
          {!rejected.length && <li className="text-xs text-zinc-500">Nenhuma venda recusada. (Ex.: caixa fechado. Abra o caixa e clique em Reenviar.)</li>}
        </ul>
      </Panel>
      <Panel title="Aplicativo Windows" className="lg:col-span-2">
        {d ? (
          <p className="text-sm text-zinc-300" data-testid="desktop-info"><Monitor className="mr-1 inline size-4 text-primary" /> PDV 3.0 versão {d.version} · computador <b>{d.deviceId}</b> · servidor {cfg.data?.serverUrl} · modo {cfg.data?.mode === "offline" ? "offline (cópia local)" : "online"}</p>
        ) : (
          <p className="text-sm text-zinc-400" data-testid="desktop-info">Você está usando pelo navegador. Instale o <b>PDV-3.0-Setup.exe</b> no computador do caixa para imprimir sem janela e abrir o sistema mesmo sem internet.</p>
        )}
      </Panel>
    </div>
  );
}
