import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/pages/Dashboard";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import { errMsg, fmtDateTime } from "@/lib/format";
import { useOffline } from "@/lib/offline";
import { queryClient } from "@/lib/queryClient";
import type { SelfTestCheck, SelfTestResult, SelfTestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<SelfTestStatus, typeof CheckCircle2> = { ok: CheckCircle2, aviso: AlertTriangle, falha: XCircle };
const TONE: Record<SelfTestStatus, string> = {
  ok: "border-emerald-400/20 bg-emerald-400/5 text-emerald-300",
  aviso: "border-amber-400/25 bg-amber-400/5 text-amber-300",
  falha: "border-red-400/30 bg-red-400/10 text-red-300",
};

export default function SelfTest() {
  const { offline, queue } = useOffline();
  const last = useQuery({ queryKey: ["selftest-last"], queryFn: () => apiGet<SelfTestResult | null>("/selftest/last") });
  const run = useMutation({
    mutationFn: () => apiPost<SelfTestResult>("/selftest", {}),
    onSuccess: (r) => { queryClient.setQueryData(["selftest-last"], r); toast[r.failures ? "error" : r.warnings ? "warning" : "success"](r.failures ? `${r.failures} falha(s) encontrada(s)` : r.warnings ? `${r.warnings} aviso(s)` : "Tudo funcionando"); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const r = last.data;
  const device: SelfTestCheck[] = [
    { key: "internet", label: "Internet deste aparelho", status: offline ? "aviso" : "ok", detail: offline ? "Sem conexão ou modo contingência ligado" : "Conectado ao servidor", fix: "" },
    { key: "offline", label: "Vendas offline pendentes", status: queue.length ? "aviso" : "ok", detail: queue.length ? `${queue.length} venda(s) aguardando sincronizar` : "Nenhuma pendente", fix: queue.length ? "Clique em Online no topo" : "" },
  ];
  const checks = r ? [...r.checks, ...device] : [];
  const ok = checks.filter((c) => c.status === "ok").length;
  const warn = checks.filter((c) => c.status === "aviso").length;
  const fail = checks.filter((c) => c.status === "falha").length;

  return (
    <Panel title="Auto teste do sistema">
      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" onClick={() => run.mutate()} disabled={run.isPending} data-testid="selftest-run-button">
          {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {run.isPending ? "Testando…" : "Testar sistema agora"}
        </Button>
        {r && (
          <div className="flex flex-wrap gap-2 text-sm" data-testid="selftest-summary">
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-300" data-testid="selftest-ok-count">{ok} OK</span>
            <span className="rounded-full bg-amber-400/10 px-3 py-1 text-amber-300" data-testid="selftest-warn-count">{warn} aviso(s)</span>
            <span className="rounded-full bg-red-400/10 px-3 py-1 text-red-300" data-testid="selftest-fail-count">{fail} falha(s)</span>
            <span className="self-center text-xs text-zinc-500" data-testid="selftest-last-run">Último teste: {fmtDateTime(r.at)} · {r.by_name}</span>
          </div>
        )}
      </div>
      {!r && !last.isLoading && <p className="mt-4 text-sm text-zinc-500">Clique em “Testar sistema agora” para verificar banco de dados, cadastros, impressoras, caixa, estoque, pagamentos e backup.</p>}
      <div className="mt-4 grid gap-2 md:grid-cols-2" data-testid="selftest-results">
        {checks.map((c, i) => {
          const Icon = ICON[c.status];
          return (
            <div key={c.key} className={cn("flex gap-3 rounded-xl border px-3 py-2.5 animate-rise", TONE[c.status])} style={{ animationDelay: `${i * 30}ms` }} data-testid={`selftest-check-${c.key}`}>
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{c.label}</p>
                <p className="text-xs text-zinc-400" data-testid={`selftest-detail-${c.key}`}>{c.detail}</p>
                {c.fix && <p className="mt-0.5 text-[11px] font-medium">Resolver em: {c.fix}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
