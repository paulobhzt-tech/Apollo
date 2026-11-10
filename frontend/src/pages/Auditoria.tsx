import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";

const LABELS: Record<string, string> = {
  counter_sale_created: "Venda criada", payment_recorded: "Pagamento registrado", partial_payment_recorded: "Pagamento parcial",
  order_cancelled: "Pedido cancelado", item_cancelled: "Item cancelado", item_refunded: "Estorno de item",
  cash_opened: "Caixa aberto", cash_closed: "Caixa fechado", cash_sangria: "Sangria", cash_suprimento: "Suprimento",
  kds_status_changed: "Etapa da cozinha/bar",
};
const VALUE_LABELS: Record<string, string> = { amount: "Valor", total: "Total", discount: "Desconto", service_fee: "Serviço", change: "Troco", difference: "Diferença", counted_amount: "Contado", opening_amount: "Abertura", expected_cash: "Saldo esperado", from: "Antes", to: "Depois", item_id: "Item", qty: "Quantidade", method: "Forma", brand: "Bandeira" };
const INTEGRITY: Record<string, string> = { valid: "Assinatura válida", invalid: "Assinatura divergente — revisar", unsigned: "Sem assinatura", key_unavailable: "Chave indisponível" };
interface Entry { source: string; record_id: string; integrity: string; event: { id?: string; action: string; at: string; actor_name?: string; actor_id?: string; reason?: string; authorized_by?: string; values?: Record<string, string | number | null> } }
export default function Auditoria() {
  const { data: me } = useMe();
  const [action, setAction] = useState("");
  const [record, setRecord] = useState("");
  const [filter, setFilter] = useState("");
  const audit = useQuery({ queryKey: ["operational-audit", action, filter], enabled: me?.role === "admin",
    queryFn: () => apiGet<{ events: Entry[]; signing_configured: boolean }>(`/audit/operations?limit=100&action=${encodeURIComponent(action)}&record_id=${encodeURIComponent(filter)}`) });
  return <AppShell roles={["admin"]}>
    <PageHeader title="Auditoria de operação" subtitle="Caixa, pagamentos, cancelamentos e cozinha/bar" />
    <div className="mb-4 flex flex-wrap gap-2">
      <select aria-label="Filtrar ação" className="max-w-full rounded-md border bg-background px-3 py-2 text-sm" value={action} onChange={e => setAction(e.target.value)}>
        <option value="">Todas as ações</option>{Object.entries(LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <Input aria-label="Identificador do registro" className="max-w-sm" placeholder="ID do pedido ou caixa (opcional)" value={record} onChange={e => setRecord(e.target.value)} />
      <Button onClick={() => { if (filter === record.trim()) void audit.refetch(); else setFilter(record.trim()); }}>Consultar</Button>
    </div>
    <p className="mb-4 text-sm text-muted-foreground">Eventos novos são guardados junto da operação. {audit.data?.signing_configured ? "Assinatura configurada; consulte a integridade de cada evento." : "Assinatura não configurada. A trilha não comprova proteção contra alteração direta do banco."}</p>
    {audit.isError && <p role="alert">{errMsg(audit.error)}</p>}
    {audit.isLoading && <p>Carregando eventos…</p>}
    <div className="space-y-2" data-testid="audit-events">
      {audit.data?.events.map((row, i) => <article key={row.event.id ?? `${row.source}-${row.record_id}-${i}`} className="min-w-0 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong>{LABELS[row.event.action] ?? row.event.action}</strong><span>{fmtDateTime(row.event.at)}</span></div>
        <p className="break-all">Operador: {row.event.actor_name || row.event.actor_id || "Registro legado sem autoria"} · Registro: {row.record_id}</p>
        {row.event.reason && <p>Motivo: {row.event.reason}</p>}{row.event.authorized_by && <p>Autorizado por: {row.event.authorized_by}</p>}
        {row.event.values && <p className="break-words text-muted-foreground">{Object.entries(row.event.values).map(([k, v]) => `${VALUE_LABELS[k] ?? k}: ${v ?? "—"}`).join(" · ")}</p>}
        <p className={row.integrity === "invalid" ? "font-semibold text-red-500" : "text-muted-foreground"}>{INTEGRITY[row.integrity] ?? row.integrity}</p>
      </article>)}
      {audit.data && !audit.data.events.length && <p>Nenhum evento encontrado para este filtro. Registros anteriores à atualização podem não ter trilha.</p>}
    </div>
    <p className="mt-4 text-xs text-muted-foreground">Últimos 100 eventos. Alterações diretas e exclusões no banco exigem controles adicionais. Auditorias financeiras, de usuários e de backup existentes continuam preservadas.</p>
  </AppShell>;
}
