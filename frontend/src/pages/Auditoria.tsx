import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";

const LABELS: Record<string, string> = {
  counter_sale_created: "Venda criada", payment_recorded: "Pagamento registrado", partial_payment_recorded: "Pagamento parcial",
  table_receipt_recorded: "Parcela por valor", table_receipt_reversed: "Estorno de parcela",
  order_cancelled: "Pedido cancelado", item_cancelled: "Item cancelado", item_refunded: "Estorno de item",
  cash_opened: "Caixa aberto", cash_closed: "Caixa fechado", cash_sangria: "Sangria", cash_suprimento: "Suprimento",
  registered_customer_linked: "Cliente cadastrado vinculado", table_items_copied: "Itens copiados",
  table_items_transferred: "Itens transferidos",
  kds_status_changed: "Etapa da cozinha/bar",
};
const VALUE_LABELS: Record<string, string> = { amount: "Valor", remaining: "Saldo", mode: "Cálculo", total: "Total", discount: "Desconto", service_fee: "Serviço", change: "Troco", difference: "Diferença", counted_amount: "Contado", opening_amount: "Abertura", expected_cash: "Saldo esperado", from: "Antes", to: "Depois", item_id: "Item", qty: "Quantidade", method: "Forma", brand: "Bandeira" };
const INTEGRITY: Record<string, string> = { valid: "Assinatura válida", invalid: "Assinatura divergente — revisar", unsigned: "Sem assinatura", key_unavailable: "Chave indisponível" };
interface Entry { source: string; record_id: string; integrity: string; event: { id?: string; action: string; at: string; actor_name?: string; actor_id?: string; reason?: string; authorized_by?: string; values?: Record<string, string | number | null> } }
export default function Auditoria() {
  const { data: me } = useMe();
  const [action, setAction] = useState("");
  const [params] = useSearchParams();
  const initialRecord = params.get("registro")?.slice(0, 128) ?? "";
  const [record, setRecord] = useState(initialRecord);
  const [filter, setFilter] = useState(initialRecord);
  const audit = useQuery({ queryKey: ["operational-audit", action, filter], enabled: me?.role === "admin",
    queryFn: () => apiGet<{ events: Entry[]; signing_configured: boolean }>(`/audit/operations?limit=100&action=${encodeURIComponent(action)}&record_id=${encodeURIComponent(filter)}`) });
  const alerts = useQuery({ queryKey: ["audit-alerts"], enabled: me?.role === "admin", queryFn: () => apiGet<{ alerts: { id: string; severity: string; reason: string; actor: { id: string; name: string }; count: number }[]; sample_size: number; sample_limit_reached: boolean }>("/audit/alerts") });
  return <AppShell roles={["admin"]}>
    <PageHeader title="Auditoria de operação" subtitle="Caixa, pagamentos, cancelamentos e cozinha/bar" />
    <section className="mb-4 space-y-2 rounded-lg border p-3" data-testid="audit-alerts">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Alertas para revisão administrativa</h2><Button variant="outline" size="sm" onClick={() => void alerts.refetch()}>Atualizar alertas</Button></div>
      <p className="text-xs text-muted-foreground">Indicadores não comprovam fraude e não bloqueiam operações. Amostra: {alerts.data?.sample_size ?? "—"} eventos recentes; não representa todo o histórico.</p>
      {alerts.isError && <p role="alert">Não foi possível consultar os alertas.</p>}
      {alerts.data?.alerts.map(item => <p key={item.id} className={item.severity === "critical" ? "break-words text-sm font-semibold text-red-500" : "break-words text-sm"}>{item.reason} · Operador: {item.actor.name || item.actor.id || "Não identificado"} · {item.count} ocorrência(s)</p>)}
      {alerts.data && !alerts.data.alerts.length && <p className="text-sm">Nenhum indicador atingiu os limites na amostra consultada.</p>}
      {alerts.data?.sample_limit_reached && <p className="text-xs text-amber-500">Limite da amostra atingido; existem eventos que podem não estar nesta revisão.</p>}
    </section>
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
    <div className="rounded border border-border bg-panel" data-testid="audit-events">
      <Table stacked aria-label="Eventos de auditoria">
        <TableHeader><TableRow>
          <TableHead>Data</TableHead><TableHead>Ação</TableHead><TableHead>Operador</TableHead>
          <TableHead>Integridade</TableHead><TableHead>Registro</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {audit.data?.events.map((row, i) => <TableRow key={row.event.id ?? `${row.source}-${row.record_id}-${i}`}>
            <TableCell label="Data">{fmtDateTime(row.event.at)}</TableCell>
            <TableCell label="Ação" className="whitespace-normal font-medium">{LABELS[row.event.action] ?? row.event.action}</TableCell>
            <TableCell label="Operador" className="whitespace-normal wrap-anywhere">{row.event.actor_name || row.event.actor_id || "Registro legado sem autoria"}</TableCell>
            <TableCell label="Integridade" className={row.integrity === "invalid" ? "whitespace-normal font-semibold text-red-700 dark:text-red-300" : "whitespace-normal text-muted-foreground"}>{INTEGRITY[row.integrity] ?? row.integrity}</TableCell>
            <TableCell label="Registro" className="max-w-80 whitespace-normal wrap-anywhere">
              <details>
                <summary className="cursor-pointer">Ver detalhes</summary>
                <div className="mt-1 grid gap-1 text-xs">
                  <span>Registro: {row.record_id}</span>
                  {row.event.reason && <span>Motivo: {row.event.reason}</span>}
                  {row.event.authorized_by && <span>Autorizado por: {row.event.authorized_by}</span>}
                  {row.event.values && Object.entries(row.event.values).map(([key, value]) =>
                    <span key={key}>{VALUE_LABELS[key] ?? key}: {value ?? "—"}</span>)}
                </div>
              </details>
            </TableCell>
          </TableRow>)}
          {audit.data && !audit.data.events.length && <TableRow><TableCell colSpan={5} className="py-3 whitespace-normal text-muted-foreground">Nenhum evento encontrado para este filtro.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
    <p className="mt-4 text-xs text-muted-foreground">Últimos 100 eventos. Alterações diretas e exclusões no banco exigem controles adicionais. Auditorias financeiras, de usuários e de backup existentes continuam preservadas.</p>
  </AppShell>;
}
