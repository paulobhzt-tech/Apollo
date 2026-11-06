import BillAlertsPanel from "@/components/BillAlerts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AppShell, { PageHeader, Stat } from "@/components/AppShell";
import { apiGet } from "@/lib/api";
import { brl } from "@/lib/format";
import type { Dashboard as D } from "@/lib/types";

export const CHART_COLORS = ["#F97316", "#38BDF8", "#34D399", "#FBBF24", "#A78BFA", "#F472B6", "#94A3B8"];
export const tooltipStyle = { background: "#181C2B", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, color: "#fff" };


type Executive = {
  revenue: number; paid_orders: number; average_ticket: number; recorded_expenses: number;
  recorded_cmv: number; indicative_balance: number; critical_stock_count: number;
  active_employees: number; alerts: { severity: string; title: string; detail: string }[];
  note: string;
};
function ExecutivePanel() {
  const [days, setDays] = useState(30);
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const fmt = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  const q = useQuery({ queryKey: ["executive-report", days], queryFn: () => apiGet<Executive>(`/reports/executive?start=${fmt(start)}&end=${fmt(end)}`), refetchInterval: 60000 });
  return <section className="mb-5 space-y-3" data-testid="executive-panel">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Painel Executivo Apollo 3.0</h2>
      <div className="flex gap-2"><button className="rounded-lg border border-white/20 px-3 py-1 text-sm" onClick={() => setDays(7)} aria-pressed={days === 7}>7 dias</button><button className="rounded-lg border border-white/20 px-3 py-1 text-sm" onClick={() => setDays(30)} aria-pressed={days === 30}>30 dias</button></div>
    </div>
    {q.isError && <p role="alert" className="text-red-400">Não foi possível carregar o resumo executivo.</p>}
    {q.data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat testid="executive-metric-1" label="Faturamento do período" value={brl(q.data.revenue)} />
        <Stat testid="executive-metric-2" label="Saldo indicativo" value={brl(q.data.indicative_balance)} />
        <Stat testid="executive-metric-3" label="Despesas lançadas" value={brl(q.data.recorded_expenses)} />
        <Stat testid="executive-metric-4" label="CMV registrado" value={brl(q.data.recorded_cmv)} />
        <Stat testid="executive-metric-5" label="Pedidos pagos" value={String(q.data.paid_orders)} />
        <Stat testid="executive-metric-6" label="Ticket médio" value={brl(q.data.average_ticket)} />
        <Stat testid="executive-metric-7" label="Estoque crítico" value={String(q.data.critical_stock_count)} />
        <Stat testid="executive-metric-8" label="Funcionários ativos" value={String(q.data.active_employees)} />
      </div>
      <Panel title="Alertas gerenciais"><ul className="space-y-2 text-sm">{q.data.alerts.map((a, i) => <li key={i} className="rounded-lg border border-white/10 p-3"><strong>{a.title}</strong><p className="text-zinc-400">{a.detail}</p></li>)}{!q.data.alerts.length && <li className="text-zinc-400">Nenhum alerta nas verificações disponíveis.</li>}</ul></Panel>
      <p className="text-xs text-zinc-400">{q.data.note}</p>
    </>}
  </section>;
}

export default function Dashboard() {
  const { data, isError } = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<D>("/reports/dashboard"), refetchInterval: 20000 });
  const d = isError ? undefined : data;
  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Painel de Comando" subtitle={d ? `Movimento de hoje · ${d.date.split("-").reverse().join("/")}` : "Movimento de hoje"}
        actions={<Link to="/pdv" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white" data-testid="dashboard-go-pdv">Abrir PDV</Link>} />
      {d && !d.cash_open && (
        <Link to="/caixa" data-testid="dashboard-cash-closed-alert" className="mb-4 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="size-4" /> O caixa está fechado. Abra o caixa para registrar vendas. <ArrowRight className="ml-auto size-4" />
        </Link>
      )}
      <BillAlertsPanel />
      <ExecutivePanel />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Faturamento hoje" value={brl(d?.revenue_today ?? 0)} testid="stat-revenue" accent="text-primary" />
        <Stat label="Pedidos pagos" value={String(d?.orders_today ?? 0)} hint={`Ticket médio ${brl(d?.avg_ticket ?? 0)}`} testid="stat-orders" />
        <Stat label="Mesas ocupadas" value={`${d?.open_tables ?? 0}/${d?.total_tables ?? 0}`} testid="stat-tables" />
        <Stat label="Na cozinha" value={String(d?.kitchen_pending ?? 0)} hint={`${d?.delivery_pending ?? 0} delivery aguardando aceite`} testid="stat-kitchen" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Faturamento últimos 7 dias" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d?.last7 ?? []}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
              <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} width={60} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
              <Area type="monotone" dataKey="value" stroke="#F97316" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Meios de pagamento (hoje)">
          {d && d.by_payment.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={d.by_payment} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {d.by_payment.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Panel>
        <Panel title="Vendas por hora (hoje)" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d?.sales_by_hour ?? []}>
              <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
              <XAxis dataKey="name" stroke="#71717a" fontSize={11} />
              <YAxis stroke="#71717a" fontSize={11} width={60} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
              <Bar dataKey="value" fill="#38BDF8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Estoque crítico">
          <ul className="space-y-2" data-testid="dashboard-low-stock">
            {(d?.low_stock ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between rounded-lg bg-red-500/5 px-3 py-2 text-sm">
                <span className="text-zinc-200">{i.name}</span>
                <span className="font-mono text-red-300">{i.stock.toFixed(2)} {i.unit}</span>
              </li>
            ))}
            {d && d.low_stock.length === 0 && <p className="text-sm text-zinc-500">Nenhum insumo abaixo do mínimo.</p>}
          </ul>
        </Panel>
        <Panel title="Mais vendidos (hoje)" className="xl:col-span-2">
          <ul className="divide-y divide-white/5">
            {(d?.top_products ?? []).map((p, i) => (
              <li key={p.name} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-mono text-zinc-500">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1 text-zinc-200">{p.name}</span>
                <span className="font-mono text-zinc-400">{p.qty}x</span>
                <span className="w-28 text-right font-mono text-white">{brl(p.revenue)}</span>
              </li>
            ))}
            {d && d.top_products.length === 0 && <Empty />}
          </ul>
        </Panel>
        <Panel title="Canais de venda (hoje)">
          <ul className="space-y-2">
            {(d?.by_channel ?? []).map((c) => (
              <li key={c.name} className="flex justify-between text-sm"><span className="text-zinc-300">{c.name}</span><span className="font-mono">{brl(c.value)}</span></li>
            ))}
            {d && d.by_channel.length === 0 && <Empty />}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}

export function Panel({ title, children, className = "", actions }: { title: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-white/5 bg-panel p-5 animate-rise ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export const Empty = ({ text = "Sem dados ainda." }: { text?: string }) => <p className="py-6 text-center text-sm text-zinc-500">{text}</p>;
