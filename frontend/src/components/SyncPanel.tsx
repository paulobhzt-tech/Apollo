import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, Monitor, RefreshCw, RotateCcw, Archive } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/pages/Dashboard";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/auth";
import { contextToken } from "@/lib/queue-context";
import type { LegacyReviewItem } from "@/lib/legacy-reconciliation";
import { desktop } from "@/lib/desktop";
import { brl, errMsg, fmtDateTime } from "@/lib/format";
import { diagnoseSync, migrateLegacySale, dismissRejected, legacyQueuePreview, legacyQueueStatus, legacyReconciliationStatus, reviewedSales, lastSync, retryRejected, syncQueue, useOffline } from "@/lib/offline";

/** Sincronização: pending offline sales, rejected ones (kept for review) and the desktop app status. */
export default function SyncPanel() {
  const { offline, queue, rejected, context } = useOffline();
  const { data: operator } = useMe();
  const [confirmedIdentity, setConfirmedIdentity] = useState<string | null>(null);
  const identity = context ? contextToken(context) : null;
  const originConfirmed = identity !== null && confirmedIdentity === identity;
  const diagnosis = useMutation({
    mutationFn: diagnoseSync,
    onError: (error) => toast.error(error instanceof Error ? error.message : errMsg(error)),
  });
  const migration = useMutation({
    mutationFn: (item: LegacyReviewItem) => {
      if (!context || !originConfirmed) throw new Error("Confirme a origem antes de importar.");
      return migrateLegacySale(item, context);
    },
    onSuccess: (status) => {
      setConfirmedIdentity(null);
      toast.success(status === "registered" ? "Venda já registrada no servidor." : "Registro copiado para a fila atual e aguardando sincronização.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : errMsg(error)),
  });
  const legacy = legacyQueueStatus();
  const legacyPreview = legacyQueuePreview();
  const legacyReview = legacyReconciliationStatus();
  const legacyCounts = legacyReview.items.reduce<Record<string, number>>((counts, item) => {
    counts[item.decision] = (counts[item.decision] ?? 0) + 1;
    return counts;
  }, {});
  const d = desktop();
  const cfg = useQuery({ queryKey: ["desktop-config"], queryFn: () => d!.config(), enabled: !!d });
  const last = lastSync();
  const archive = reviewedSales();
  const archiveSale = (ref: string) => {
    if (!window.confirm("Arquivar esta recusa como revisada? O registro continuará preservado neste dispositivo. Isso não cancela uma venda no servidor.")) return;
    try { dismissRejected(ref); toast.success("Registro arquivado sem apagar os dados"); }
    catch (error) { toast.error(error instanceof Error ? error.message : errMsg(error)); }
  };
  const retry = (ref: string) => {
    try { retryRejected(ref); } catch (error) { toast.error(error instanceof Error ? error.message : errMsg(error)); }
  };
  const run = async () => {
    try {
    const r = await syncQueue({ force: true });
    if (r.synced || r.failed) toast.success(`${r.synced} venda(s) sincronizada(s)${r.failed ? ` · ${r.failed} recusada(s)` : ""}`);
    else toast.message(offline ? "Sem conexão: as vendas continuam guardadas" : "Nenhuma venda enviada; confira as pendências e tentativas");
    } catch (error) { toast.error(error instanceof Error ? error.message : errMsg(error)); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Vendas offline deste computador">
        {!context && <p role="alert" className="mb-3 text-sm text-amber-300">Confirme seu acesso novamente em um servidor atualizado para habilitar a fila isolada.</p>}
        {context && <p className="mb-3 text-xs text-zinc-400">Fila exclusiva do estabelecimento, servidor e operador autenticados. Outras filas continuam preservadas no dispositivo.</p>}
        {legacy.has_data && <p role="alert" className="mb-3 text-sm text-amber-300">Fila anterior preservada: {legacy.pending} pendente(s), {legacy.rejected} recusa(s). O envio automático está bloqueado até revisão do estabelecimento e operador de origem.</p>}
        {legacy.has_data && <div className="mb-3 rounded-lg border border-amber-400/25 p-3 text-xs text-amber-100" data-testid="legacy-queue-preview">
          <strong>Revisão da fila antiga</strong>
          <p>{legacyPreview.pending} pendente(s) · {legacyPreview.rejected} recusa(s) · Total informado: {brl(legacyPreview.total)}</p>
          <p>{legacyPreview.duplicate_refs} referência(s) repetida(s) · {legacyPreview.missing_refs} referência(s) ausente(s)</p>
          {legacyPreview.invalid && <p role="alert" className="font-semibold text-red-300">Dados inválidos ou ilegíveis detectados. Preserve os registros sinalizados para revisão técnica.</p>}
          <div className="mt-2 space-y-1" data-testid="legacy-reconciliation-status">
            <p>Revisão de origem pendente: {legacyCounts.needs_origin_confirmation ?? 0}</p>
            <p>Referências duplicadas: {legacyCounts.duplicate_reference ?? 0} · Identidade divergente: {legacyCounts.foreign_identity ?? 0}</p>
            <p>Registros inválidos: {legacyCounts.invalid ?? 0}</p>
            {legacyReview.unreadable && <p role="alert" className="font-semibold text-red-300">Fila antiga ilegível: preserve o dispositivo e procure suporte antes de qualquer migração.</p>}
          </div>
          {context && !legacyReview.unreadable && <>
            <label className="my-2 flex items-start gap-2">
              <input type="checkbox" checked={originConfirmed} disabled={migration.isPending} onChange={(event) => setConfirmedIdentity(event.target.checked ? identity : null)} />
              <span>Conferi os comprovantes e confirmo que o registro pertence a {operator?.name ?? context.operator_id}, neste estabelecimento ({context.establishment_id}) e servidor ({context.server_id}).</span>
            </label>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {legacyReview.items.filter((item) => item.decision === "needs_origin_confirmation" &&
                legacyReview.items.filter((candidate) => candidate.client_ref === item.client_ref).length === 1).map((item) => (
                <li key={item.client_ref} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-all">{item.client_ref} · {item.source === "pending" ? "Pendente" : "Recusada"}</span>
                  <Button size="xs" variant="outline" disabled={!originConfirmed || offline || migration.isPending}
                    onClick={() => migration.mutate(item)}>Conferir e importar</Button>
                </li>
              ))}
            </ul>
            <p className="mt-2">Ao importar, o registro entra na fila de envio automático com a referência original. A cópia de origem fica preservada neste dispositivo.</p>
          </>}
        </div>}
        <div className="flex flex-wrap items-center gap-3">
          <span className={offline ? "text-amber-300" : "text-emerald-300"} data-testid="sync-connection">
            {offline ? <><CloudOff className="mr-1 inline size-4" /> Sem conexão</> : <><CheckCircle2 className="mr-1 inline size-4" /> Conectado</>}
          </span>
          <span className="text-sm text-zinc-300" data-testid="sync-pending-count">{queue.length} pendente(s)</span>
          <Button size="sm" onClick={() => void run()} disabled={!queue.length} data-testid="sync-now-button"><RefreshCw className="size-3.5" /> Sincronizar agora</Button>
        </div>
        <Button size="sm" variant="outline" className="mt-2" disabled={diagnosis.isPending}
          onClick={() => diagnosis.mutate()}>Diagnosticar conexão</Button>
        {diagnosis.isSuccess && <p role="status" className="mt-2 text-xs text-zinc-300">
          Servidor e operador confirmados em {diagnosis.data.latency} ms · {diagnosis.data.pending} pendente(s) · {diagnosis.data.rejected} recusada(s)
        </p>}
        {last && <p className="mt-2 text-xs text-zinc-500" data-testid="sync-last">Última sincronização: {fmtDateTime(last.at)} · {last.synced} enviada(s) · {last.failed} recusada(s)</p>}
        <ul className="mt-3 space-y-1.5">
          {queue.map((s) => (
            <li key={s.payload.client_ref} className="flex justify-between rounded-lg border border-white/5 px-3 py-2 text-sm" data-testid="sync-pending-item">
              <span className="text-zinc-300">{s.payload.items.length} item(ns) · {fmtDateTime(s.queued_at)}{s.attempts ? <small className="block text-amber-400">{s.attempts} tentativa(s) · {s.last_error} · Próxima: {fmtDateTime(s.next_retry_at ?? null)}</small> : null}</span><span className="font-mono text-white">{brl(s.total)}</span>
            </li>
          ))}
          {!queue.length && <li className="text-xs text-zinc-500">Nenhuma venda aguardando envio.</li>}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">Cada venda mantém um código único para evitar duplicidade no reenvio. O estoque é baixado quando ela chega ao servidor.</p>
      </Panel>
      <Panel title="Recusadas pelo servidor (para conferir)">
        <ul className="space-y-1.5" data-testid="sync-rejected-list">
          {rejected.map((s) => (
            <li key={s.payload.client_ref} className="rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-200">{fmtDateTime(s.queued_at)} · {brl(s.total)}</span>
                <span className="flex gap-1">
                  <Button size="xs" variant="outline" onClick={() => retry(s.payload.client_ref)} data-testid="sync-retry-button"><RotateCcw className="size-3" /> Reenviar</Button>
                  <Button size="xs" variant="ghost" aria-label="Arquivar recusa revisada" onClick={() => archiveSale(s.payload.client_ref)} data-testid="sync-dismiss-button"><Archive className="size-3" /></Button>
                </span>
              </div>
              <p className="text-xs text-red-300">{s.error}</p>
            </li>
          ))}
          {!rejected.length && <li className="text-xs text-zinc-500">Nenhuma venda recusada. (Ex.: caixa fechado. Abra o caixa e clique em Reenviar.)</li>}
        </ul>
      </Panel>
      <Panel title={`Recusas revisadas e arquivadas (${archive.length})`} className="lg:col-span-2">
        <p className="mb-2 text-xs text-zinc-400">Histórico local preservado. Arquivar não confirma pagamento nem cancela pedidos no servidor.</p>
        {archive.slice(-20).reverse().map(s => <p key={s.payload.client_ref} className="break-all py-1 text-xs">{fmtDateTime(s.reviewed_at)} · {brl(s.total)} · {s.payload.client_ref} · {s.error}</p>)}
      </Panel>
      <Panel title="Aplicativo Windows" className="lg:col-span-2">
        {d ? (
          <p className="text-sm text-zinc-300" data-testid="desktop-info"><Monitor className="mr-1 inline size-4 text-primary" /> Apollo PDV versão {d.version} · computador <b>{d.deviceId}</b> · servidor {cfg.data?.serverUrl} · modo {cfg.data?.mode === "offline" ? "offline (cópia local)" : "online"}</p>
        ) : (
          <p className="text-sm text-zinc-400" data-testid="desktop-info">Você está usando pelo navegador. Instale o <b>Apollo-PDV-Setup.exe</b> no computador do caixa para imprimir sem janela e abrir o sistema mesmo sem internet.</p>
        )}
      </Panel>
    </div>
  );
}
