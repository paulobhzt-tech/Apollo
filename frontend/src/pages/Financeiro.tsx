import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AppShell, { PageHeader, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { brl, errMsg } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { CardFees, Dre, Expense, ExpenseCat, OptionRank } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CHART_COLORS, Empty, Panel, tooltipStyle } from "./Dashboard";

type Forecast = {
  historical_months: number;
  average_monthly_profit: number;
  average_monthly_expenses: number;
  average_monthly_revenue: number;
  average_profit_margin_pct: number;
  forecast: { month: string; projected_revenue: number; projected_profit: number; projected_expenses: number; scheduled_payables: number }[];
  note: string;
};

function ForecastPanel() {
  const [months, setMonths] = useState("3");
  const q = useQuery({ queryKey: ["forecast", months], queryFn: () => apiGet<Forecast>(`/reports/forecast?months=${months}`) });
  const d = q.data;
  return (
    <section className="mt-5 space-y-3" data-testid="financial-forecast">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Projeção de lucro e gastos</h2>
        <label className="flex items-center gap-2 text-sm text-zinc-400">Histórico
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{["3", "6", "12"].map(n => <SelectItem key={n} value={n}>{n} meses</SelectItem>)}</SelectContent>
          </Select>
        </label>
      </div>
      {q.isError && <p role="alert" className="text-red-400">{errMsg(q.error)}</p>}
      {d && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Lucro médio mensal" value={brl(d.average_monthly_profit)} testid="forecast-profit" />
          <Stat label="Gastos médios mensais" value={brl(d.average_monthly_expenses)} testid="forecast-expenses" />
          <Stat label="Receita média mensal" value={brl(d.average_monthly_revenue)} testid="forecast-revenue" />
          <Stat label="Margem média estimada" value={`${d.average_profit_margin_pct}%`} testid="forecast-margin" />
        </div>
        <Panel title="Próximos meses (estimativa)">
          <div className="overflow-x-auto"><Table><TableHeader><TableRow>
            <TableHead>Mês</TableHead><TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Gastos</TableHead><TableHead className="text-right">Lucro</TableHead><TableHead className="text-right">Contas previstas</TableHead>
          </TableRow></TableHeader><TableBody>
            {d.forecast.map(m => <TableRow key={m.month}><TableCell>{m.month}</TableCell>
              <TableCell className="text-right">{brl(m.projected_revenue)}</TableCell>
              <TableCell className="text-right">{brl(m.projected_expenses)}</TableCell>
              <TableCell className="text-right">{brl(m.projected_profit)}</TableCell>
              <TableCell className="text-right">{brl(m.scheduled_payables)}</TableCell>
            </TableRow>)}
          </TableBody></Table></div>
          <p className="mt-3 text-xs text-zinc-400">{d.note}</p>
        </Panel>
      </>}
    </section>
  );
}


type Cashflow = {
  start: string; end: string;
  days: { date: string; sales: number; receivables: number; payables: number; expenses: number; balance: number }[];
  totals: { sales: number; receivables: number; payables: number; expenses: number; balance: number };
  note: string;
};

function exportCashflowCsv(data: Cashflow) {
  const header = ["Data", "Vendas recebidas", "Contas recebidas", "Contas pagas", "Despesas", "Saldo estimado"];
  const rows = data.days.map((day) => [day.date, day.sales, day.receivables, day.payables, day.expenses, day.balance]);
  rows.push(["TOTAL", data.totals.sales, data.totals.receivables, data.totals.payables, data.totals.expenses, data.totals.balance]);
  const csv = "\uFEFF" + [header, ...rows].map((row) =>
    row.map((value) => `"${String(typeof value === "number" ? value.toFixed(2).replace(".", ",") : value).replace(/"/g, '""')}"`).join(";")
  ).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `apollo-fluxo-caixa-${data.start}-a-${data.end}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function CashflowPanel({ start, end }: { start: string; end: string }) {
  const q = useQuery({ queryKey: ["cashflow", start, end], queryFn: () => apiGet<Cashflow>(`/reports/cashflow?start=${start}&end=${end}`), enabled: !!start && !!end && start <= end });
  return (
    <section className="mb-5 space-y-3" data-testid="financial-cashflow">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Fluxo de caixa operacional</h2><Button size="sm" variant="outline" disabled={!q.data || !q.data.days.length} onClick={() => { if (q.data) exportCashflowCsv(q.data); }} data-testid="cashflow-export-csv"><Download className="size-4" /> Exportar Excel (CSV)</Button></div>
      {q.isError && <p role="alert" className="text-red-400">{errMsg(q.error)}</p>}
      {q.data && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat testid="finance-metric-1" label="Vendas recebidas" value={brl(q.data.totals.sales)} />
          <Stat testid="finance-metric-2" label="Contas recebidas" value={brl(q.data.totals.receivables)} />
          <Stat testid="finance-metric-3" label="Contas pagas" value={brl(q.data.totals.payables)} />
          <Stat testid="finance-metric-4" label="Despesas lançadas" value={brl(q.data.totals.expenses)} />
          <Stat label="Saldo estimado" value={brl(q.data.totals.balance)} testid="cashflow-balance" />
        </div>
        <Panel title="Movimentação diária">
          <div className="max-h-80 overflow-auto"><Table><TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead className="text-right">Entradas</TableHead><TableHead className="text-right">Saídas</TableHead><TableHead className="text-right">Saldo</TableHead>
          </TableRow></TableHeader><TableBody>
            {q.data.days.map(row => <TableRow key={row.date}><TableCell>{row.date}</TableCell>
              <TableCell className="text-right">{brl(row.sales + row.receivables)}</TableCell>
              <TableCell className="text-right">{brl(row.payables + row.expenses)}</TableCell>
              <TableCell className="text-right">{brl(row.balance)}</TableCell>
            </TableRow>)}
            {!q.data.days.length && <TableRow><TableCell colSpan={4} className="text-center text-zinc-400">Sem movimentos registrados no período</TableCell></TableRow>}
          </TableBody></Table></div>
          <p className="mt-3 text-xs text-zinc-400">{q.data.note}</p>
        </Panel>
      </>}
    </section>
  );
}




type SalesTrends = {
  previous_start: string; previous_end: string;
  current_revenue: number; previous_revenue: number; revenue_change_pct: number | null;
  current_orders: number; previous_orders: number; current_average_ticket: number; previous_average_ticket: number;
  products: { product_id: string; name: string; current_qty: number; previous_qty: number; delta_qty: number; change_pct: number | null }[];
  alerts: { level: string; title: string; detail: string }[]; note: string;
};
function SalesTrendsPanel({ start, end }: { start: string; end: string }) {
  const q = useQuery({ queryKey: ["sales-trends", start, end], queryFn: () => apiGet<SalesTrends>(`/reports/sales-trends?start=${start}&end=${end}`), enabled: !!start && !!end && start <= end });
  return <section className="mb-5 space-y-3" data-testid="sales-trends">
    <h2 className="text-xl font-semibold">Análise de tendências 2.0</h2>
    {q.isError && <p role="alert" className="text-red-400">{errMsg(q.error)}</p>}
    {q.data && <>
      <p className="text-xs text-zinc-400">Comparação com {q.data.previous_start} a {q.data.previous_end}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat testid="finance-metric-5" label="Vendas atuais" value={brl(q.data.current_revenue)} />
        <Stat testid="finance-metric-6" label="Vendas anteriores" value={brl(q.data.previous_revenue)} />
        <Stat testid="finance-revenue-change" label="Variação de vendas" value={q.data.revenue_change_pct === null ? "Sem base" : `${q.data.revenue_change_pct > 0 ? "+" : ""}${q.data.revenue_change_pct}%`} />
        <Stat testid="finance-metric-7" label="Ticket médio atual" value={brl(q.data.current_average_ticket)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Alertas e observações">
          <ul className="space-y-2 text-sm">{q.data.alerts.map((a, i) => <li key={i} className="rounded-lg border border-white/10 p-3"><strong>{a.title}</strong><p className="mt-1 text-zinc-400">{a.detail}</p></li>)}
          {!q.data.alerts.length && <li className="text-zinc-400">Sem alertas relevantes.</li>}</ul>
        </Panel>
        <Panel title="Produtos em alta e em queda">
          <div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-zinc-400"><th className="p-2">Produto</th><th className="p-2">Antes</th><th className="p-2">Agora</th><th className="p-2">Variação</th></tr></thead><tbody>
            {q.data.products.map(p => <tr key={p.product_id} className="border-t border-white/10"><td className="p-2">{p.name}</td><td className="p-2">{p.previous_qty}</td><td className="p-2">{p.current_qty}</td><td className="p-2">{p.delta_qty > 0 ? "+" : ""}{p.delta_qty}</td></tr>)}
          </tbody></table>{!q.data.products.length && <p className="p-3 text-zinc-400">Nenhuma venda de produto nos períodos.</p>}</div>
        </Panel>
      </div>
      <p className="text-xs text-zinc-400">{q.data.note}</p>
    </>}
  </section>;
}

type StockForecast = {
  days: number; observed_revenue: number; average_daily_revenue: number; projected_next_7_days: number; paid_days: number;
  restock_suggestions: { ingredient_id: string; name: string; unit: string; stock: number; daily_usage: number; suggested_purchase: number; days_cover: number | null }[];
  note: string;
};
function SalesStockForecastPanel() {
  const [days, setDays] = useState("28");
  const q = useQuery({ queryKey: ["sales-stock-forecast", days], queryFn: () => apiGet<StockForecast>(`/reports/sales-stock-forecast?days=${days}`) });
  return <section className="mb-5 space-y-3" data-testid="sales-stock-forecast">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Previsão de vendas e reposição de estoque</h2>
      <Select value={days} onValueChange={setDays}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="14">Últimos 14 dias</SelectItem><SelectItem value="28">Últimos 28 dias</SelectItem><SelectItem value="60">Últimos 60 dias</SelectItem></SelectContent></Select>
    </div>
    {q.isError && <p role="alert" className="text-red-400">{errMsg(q.error)}</p>}
    {q.data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat testid="finance-metric-8" label="Vendas no histórico" value={brl(q.data.observed_revenue)} />
        <Stat testid="finance-metric-9" label="Média diária" value={brl(q.data.average_daily_revenue)} />
        <Stat testid="finance-metric-10" label="Estimativa próximos 7 dias" value={brl(q.data.projected_next_7_days)} />
      </div>
      <Panel title="Sugestões de compra para 7 dias">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-zinc-400"><th className="p-2">Ingrediente</th><th className="p-2">Estoque atual</th><th className="p-2">Consumo/dia</th><th className="p-2">Sugestão de compra</th></tr></thead><tbody>
          {q.data.restock_suggestions.map(row => <tr key={row.ingredient_id} className="border-t border-white/10"><td className="p-2">{row.name}</td><td className="p-2">{row.stock} {row.unit}</td><td className="p-2">{row.daily_usage} {row.unit}</td><td className="p-2 font-semibold">{row.suggested_purchase} {row.unit}</td></tr>)}
        </tbody></table>{!q.data.restock_suggestions.length && <p className="p-3 text-zinc-400">Nenhuma reposição sugerida com os dados disponíveis.</p>}</div>
      </Panel>
      <p className="text-xs text-zinc-400">{q.data.note}</p>
    </>}
  </section>;
}

type IntelligentInsights = {
  revenue: number; operating_expenses: number; paid_orders: number; average_ticket: number;
  top_contribution: { product_id: string; name: string; qty: number; contribution: number; margin_pct: number }[];
  unsold_count: number; unsold_products: string[];
  insights: { level: string; title: string; detail: string }[]; method: string; note: string;
};

function IntelligentInsightsPanel({ start, end }: { start: string; end: string }) {
  const q = useQuery({ queryKey: ["intelligent-insights", start, end], queryFn: () => apiGet<IntelligentInsights>(`/reports/intelligent-insights?start=${start}&end=${end}`), enabled: !!start && !!end && start <= end });
  return <section className="mb-5 space-y-3" data-testid="intelligent-insights">
    <h2 className="text-xl font-semibold">Relatórios inteligentes — análise automática</h2>
    {q.isError && <p role="alert" className="text-red-400">{errMsg(q.error)}</p>}
    {q.data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat testid="finance-metric-11" label="Vendas pagas" value={brl(q.data.revenue)} />
        <Stat testid="finance-metric-12" label="Ticket médio" value={brl(q.data.average_ticket)} />
        <Stat testid="finance-metric-13" label="Despesas lançadas" value={brl(q.data.operating_expenses)} />
        <Stat testid="finance-metric-14" label="Produtos sem vendas" value={String(q.data.unsold_count)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Oportunidades e alertas">
          <ul className="space-y-3 text-sm">{q.data.insights.map((insight, index) => <li key={index} className="rounded-lg border border-white/10 p-3">
            <p className="font-semibold">{insight.level === "warning" ? "Atenção: " : ""}{insight.title}</p>
            <p className="mt-1 text-zinc-400">{insight.detail}</p>
          </li>)}
          {!q.data.insights.length && <li className="text-zinc-400">Nenhum alerta para o período.</li>}</ul>
        </Panel>
        <Panel title="Maior contribuição bruta por produto">
          <ul className="space-y-2 text-sm">{q.data.top_contribution.map(p => <li key={p.product_id} className="flex justify-between gap-3">
            <span>{p.name} <span className="text-zinc-500">({p.margin_pct}%)</span></span><strong>{brl(p.contribution)}</strong>
          </li>)}
          {!q.data.top_contribution.length && <li className="text-zinc-400">Sem vendas registradas.</li>}</ul>
        </Panel>
      </div>
      <p className="text-xs text-zinc-400">{q.data.note}</p>
    </>}
  </section>;
}

const EXP_LABEL: Record<ExpenseCat, string> = {
  aluguel: "Aluguel", salarios: "Salários", energia: "Energia", agua: "Água", marketing: "Marketing", manutencao: "Manutenção", impostos: "Impostos", outros: "Outros",
};
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function BreakEvenPanel({ dre }: { dre?: Dre }) {
  const [monthlyCosts, setMonthlyCosts] = useState("");
  const [daysOpen, setDaysOpen] = useState("");
  const fixed = Number(monthlyCosts.replace(",", "."));
  const days = Number(daysOpen);
  const contribution = dre ? dre.net_revenue - dre.cmv - dre.commissions : 0;
  const margin = dre && dre.gross_revenue > 0 ? contribution / dre.gross_revenue : null;
  const validFixed = !!monthlyCosts.trim() && Number.isFinite(fixed) && fixed >= 0;
  const validDays = Number.isInteger(days) && days >= 1 && days <= 31;
  const monthlyTarget = validFixed && margin !== null && margin > 0 ? fixed / margin : null;
  return <section className="mb-5 space-y-3 rounded-xl border border-border bg-panel p-4" data-testid="break-even-panel">
    <h2 className="text-lg font-semibold">Custo Diário e Ponto de Equilíbrio</h2>
    <p className="text-sm text-muted-foreground">Simulação com a margem de contribuição do período selecionado no DRE. Informe os custos fixos mensais uma vez. A simulação não gera despesas ou lançamentos no caixa.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Custos fixos mensais (R$)
        <Input inputMode="decimal" value={monthlyCosts} onChange={(event) => setMonthlyCosts(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">Dias abertos no mês
        <Input type="number" min={1} max={31} step={1} value={daysOpen} onChange={(event) => setDaysOpen(event.target.value)} />
      </label>
    </div>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div><dt>Margem histórica</dt><dd>{margin === null ? "Sem faturamento no período" : margin.toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 2 })}</dd></div>
      <div><dt>Custo fixo por dia aberto</dt><dd>{validFixed && validDays ? brl(fixed / days) : "—"}</dd></div>
      <div><dt>Ponto de equilíbrio mensal estimado</dt><dd>{monthlyTarget === null ? "—" : brl(monthlyTarget)}</dd></div>
      <div><dt>Meta diária estimada</dt><dd>{monthlyTarget !== null && validDays ? brl(monthlyTarget / days) : "—"}</dd></div>
    </dl>
    {margin !== null && margin <= 0 && <p role="status" className="text-sm text-muted-foreground">Com margem histórica igual ou abaixo de zero, não há meta de faturamento calculável.</p>}
  </section>;
}

const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function OpeningWeekdays({ dre }: { dre?: Dre }) {
  const [cost, setCost] = useState("");
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["opening-weekdays"],
    queryFn: () => apiGet<{ weekday: number; samples: number; average_revenue: number | null; average_orders: number | null; average_ticket: number | null }[]>("/reports/opening-weekdays"),
    enabled: open,
  });
  const margin = dre && dre.gross_revenue > 0 ? (dre.net_revenue - dre.cmv - dre.commissions) / dre.gross_revenue : null;
  const extra = Number(cost.replace(",", "."));
  const hasCost = cost.trim() !== "" && Number.isFinite(extra) && extra >= 0;
  return <details className="mb-5 rounded-xl border border-border bg-panel p-4" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Compensa abrir a loja?</summary>
    <p className="my-3 text-sm text-muted-foreground">Histórico das últimas 12 semanas em dias com vendas. A quantidade de pedidos serve como referência de movimento. A simulação usa a margem do DRE selecionado.</p>
    <label className="block max-w-xs text-sm">Custo adicional por dia aberto (R$)
      <Input inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
    </label>
    <p className="my-2 text-xs text-muted-foreground">Inclua apenas custos evitáveis ao fechar. Aluguel e outros custos fixos ficam no simulador de ponto de equilíbrio.</p>
    {q.isPending && open && <p role="status">Consultando histórico…</p>}
    {q.isError && <p role="alert">{errMsg(q.error)}</p>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {q.data?.map((day) => {
        const expected = day.average_revenue !== null && margin !== null ? day.average_revenue * margin : null;
        const result = expected !== null && hasCost && day.samples >= 4 ? expected - extra : null;
        const tolerance = expected !== null ? Math.max(10, Math.abs(expected) * 0.05) : 10;
        return <article key={day.weekday} className="rounded-lg border border-border p-3 text-sm">
          <h3 className="font-semibold">{WEEKDAYS[day.weekday]} · {day.samples} dias com vendas</h3>
          <p>Faturamento médio {day.average_revenue === null ? "—" : brl(day.average_revenue)}</p>
          <p>Pedidos por dia {day.average_orders ?? "—"} · Ticket {day.average_ticket === null ? "—" : brl(day.average_ticket)}</p>
          <p>Contribuição estimada {expected === null ? "—" : brl(expected)}</p>
          <p className="font-medium">{result === null ? (day.samples < 4 ? "Histórico insuficiente" : "Informe custos e confira o DRE") :
            `${Math.abs(result) <= tolerance ? "Atenção" : result > 0 ? "Compensa abrir" : "Pode não compensar"} · ${brl(result)}`}</p>
        </article>;
      })}
    </div>
  </details>;
}

export default function Financeiro() {
  const now = new Date();
  const [start, setStart] = useState(isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [end, setEnd] = useState(isoLocal(now));
  const validPeriod = !!start && !!end && start <= end;
  const dre = useQuery({ queryKey: ["dre", start, end], queryFn: () => apiGet<Dre>(`/reports/dre?start=${start}&end=${end}`), enabled: validPeriod });
  const d = dre.isError ? undefined : dre.data;
  const intelligence = useQuery({ queryKey: ["sales-intelligence", start, end], queryFn: () => apiGet<{ top: { product_id: string; name: string; qty: number; revenue: number }[]; least: { product_id: string; name: string; qty: number; revenue: number }[]; unsold: { id: string; name: string }[]; note: string }>(`/reports/sales-intelligence?start=${start}&end=${end}`), enabled: validPeriod });
  const productProfit = useQuery({ queryKey: ["product-profit", start, end], queryFn: () => apiGet<{ products: { product_id: string; name: string; qty: number; revenue: number; cost: number; profit: number; margin_pct: number }[]; profit: number; revenue: number; cost: number; note: string }>(`/reports/product-profit?start=${start}&end=${end}`), enabled: validPeriod });
  const preset = (days: number) => { const s = new Date(); s.setDate(s.getDate() - days + 1); setStart(isoLocal(s)); setEnd(isoLocal(new Date())); };

  return (
    <AppShell roles={[]}>
      <PageHeader title="Financeiro & DRE" subtitle="Demonstrativo de resultado simplificado com CMV real das fichas técnicas" actions={
        <>
          <Button size="sm" variant="outline" onClick={() => preset(7)} data-testid="dre-preset-7">7 dias</Button>
          <Button size="sm" variant="outline" onClick={() => preset(30)} data-testid="dre-preset-30">30 dias</Button>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-40" data-testid="dre-start-input" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" data-testid="dre-end-input" />
        </>
      } />
      {(!start || !end) && <p role="status" className="mb-4 text-sm text-muted-foreground">Informe as duas datas para consultar o período.</p>}
      {start > end && <p role="alert" className="mb-4 text-sm text-amber-300">A data inicial não pode ser posterior à data final.</p>}
      {validPeriod && dre.isLoading && <p role="status" className="mb-4 text-sm text-muted-foreground">Carregando o DRE do período…</p>}
      {dre.isError && <p role="alert" className="mb-4 text-sm text-red-400">{errMsg(dre.error)}</p>}
      <BreakEvenPanel dre={d} />
      <OpeningWeekdays dre={d} />
      <section className="mb-5 space-y-3" data-testid="sales-intelligence">
        <h2 className="text-lg font-semibold text-white">Inteligência de vendas</h2>
        {intelligence.isError && <p role="alert" className="text-red-400">{errMsg(intelligence.error)}</p>}
        {intelligence.data && <div className="grid gap-3 lg:grid-cols-3">
          {([{ title: "Mais vendidos", rows: intelligence.data.top }, { title: "Menos vendidos", rows: intelligence.data.least }] as const).map((group) => (
            <Panel key={group.title} title={group.title}><ul className="space-y-2 text-sm">{group.rows.map((p) => <li key={p.product_id} className="flex justify-between gap-2"><span>{p.name}</span><span className="font-mono">{p.qty} un.</span></li>)}{!group.rows.length && <li className="text-zinc-400">Sem vendas no período</li>}</ul></Panel>
          ))}
          <Panel title="Sem vendas no período"><ul className="max-h-64 space-y-2 overflow-auto text-sm">{intelligence.data.unsold.map((p) => <li key={p.id}>{p.name}</li>)}{!intelligence.data.unsold.length && <li className="text-zinc-400">Nenhum produto ativo sem vendas</li>}</ul></Panel>
          <p className="text-xs text-zinc-400 lg:col-span-3">{intelligence.data.note}</p>
        </div>}
      </section>
      <section className="mb-5 space-y-3" data-testid="product-profit-report">
        <h2 className="text-lg font-semibold text-white">Rentabilidade por produto</h2>
        {productProfit.isError && <p role="alert" className="text-red-400">{errMsg(productProfit.error)}</p>}
        {productProfit.data && <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Receita dos itens" value={brl(productProfit.data.revenue)} testid="product-profit-revenue" />
            <Stat label="Custo dos itens" value={brl(productProfit.data.cost)} testid="product-profit-cost" />
            <Stat label="Margem bruta em R$" value={brl(productProfit.data.profit)} testid="product-profit-gross" />
          </div>
          <Panel title="Produtos mais rentáveis">
            <div className="overflow-x-auto"><Table><TableHeader><TableRow>
              <TableHead>Produto</TableHead><TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">Lucro bruto</TableHead><TableHead className="text-right">Margem</TableHead>
            </TableRow></TableHeader><TableBody>
              {productProfit.data.products.map((p) => <TableRow key={p.product_id}>
                <TableCell>{p.name}</TableCell><TableCell className="text-right">{p.qty}</TableCell>
                <TableCell className="text-right">{brl(p.revenue)}</TableCell>
                <TableCell className="text-right">{brl(p.cost)}</TableCell>
                <TableCell className="text-right">{brl(p.profit)}</TableCell>
                <TableCell className="text-right">{p.margin_pct}%</TableCell>
              </TableRow>)}
            </TableBody></Table></div>
            {!productProfit.data.products.length && <p className="text-sm text-zinc-400">Nenhuma venda paga no período.</p>}
            <p className="mt-3 text-xs text-zinc-400">{productProfit.data.note}</p>
          </Panel>
        </>}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receita bruta" value={brl(d?.gross_revenue ?? 0)} hint={`${d?.orders ?? 0} pedidos`} testid="dre-gross" />
        <Stat label="CMV" value={brl(d?.cmv ?? 0)} hint={d?.gross_revenue ? `${((d.cmv / d.gross_revenue) * 100).toFixed(1)}% da receita` : undefined} testid="dre-cmv" />
        <Stat label="Lucro líquido" value={brl(d?.net_profit ?? 0)} testid="dre-net" accent={(d?.net_profit ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"} />
        <Stat label="Margem líquida" value={`${d?.margin_pct ?? 0}%`} testid="dre-margin" accent="text-primary" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Panel title="DRE simplificado">
          {d ? (
            <dl className="space-y-1 font-mono text-sm" data-testid="dre-statement">
              <L k="(+) Receita bruta" v={d.gross_revenue} strong />
              <L k="(−) Descontos" v={-d.discounts} />
              <L k="(−) Taxas de marketplace" v={-d.marketplace_fees} />
              <L k="(−) Taxas de cartão" v={-d.card_fees} />
              <L k="(−) Impostos (Simples 6%)" v={-d.taxes} />
              <L k="(=) Receita líquida" v={d.net_revenue} strong line />
              <L k="(−) CMV" v={-d.cmv} />
              <L k="(=) Lucro bruto" v={d.gross_profit} strong line />
              <L k="(−) Comissões garçons" v={-d.commissions} />
              {d.expenses_by_category.map((e) => <L key={e.name} k={`(−) ${EXP_LABEL[e.name as ExpenseCat] ?? e.name}`} v={-e.value} />)}
              {d.other_revenue > 0 && <L k="(+) Contas a receber recebidas" v={d.other_revenue} />}
              <L k="(=) Lucro líquido" v={d.net_profit} strong line big />
            </dl>
          ) : <Empty />}
        </Panel>
        <div className="grid gap-4">
          <Panel title="Faturamento diário">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d?.daily ?? []}>
                <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} width={60} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                <Bar dataKey="value" fill="#F97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Por canal">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={d?.by_source ?? []} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {(d?.by_source ?? []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                </PieChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Por pagamento">
              <ul className="space-y-1.5 text-sm">{(d?.by_payment ?? []).map((p) => <li key={p.name} className="flex justify-between"><span className="text-zinc-300">{p.name}</span><span className="font-mono">{brl(p.value)}</span></li>)}</ul>
            </Panel>
          </div>
        </div>
        <OptionRanking start={start} end={end} />
        <Panel title="Ranking de produtos">
          <ul className="divide-y divide-white/5 text-sm">
            {(d?.top_products ?? []).map((p, i) => (
              <li key={p.name} className="flex gap-3 py-1.5"><span className="font-mono text-zinc-500">{i + 1}</span><span className="flex-1">{p.name}</span><span className="font-mono text-zinc-400">{p.qty}x</span><span className="w-24 text-right font-mono">{brl(p.revenue)}</span></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Comissões de garçons">
          <ul className="space-y-1.5 text-sm" data-testid="dre-commissions">
            {(d?.commission_list ?? []).map((c) => (
              <li key={c.employee_id} className="flex justify-between"><span>{c.name} <span className="text-xs text-zinc-500">({c.pct}% de {brl(c.sales)})</span></span><span className="font-mono text-primary">{brl(c.commission)}</span></li>
            ))}
            {d && d.commission_list.length === 0 && <Empty text="Sem comissões no período." />}
          </ul>
        </Panel>
      </div>
      <SalesTrendsPanel start={start} end={end} />
      <SalesStockForecastPanel />
      <IntelligentInsightsPanel start={start} end={end} />
      <CashflowPanel start={start} end={end} />
      <ForecastPanel />
      <Despesas />
    </AppShell>
  );
}

function L({ k, v, strong, line, big }: { k: string; v: number; strong?: boolean; line?: boolean; big?: boolean }) {
  return (
    <div className={cn("flex justify-between py-1", line && "border-t border-white/10 pt-2", strong ? "text-white" : "text-zinc-400", big && "text-lg")}>
      <dt className="font-sans">{k}</dt>
      <dd className={cn(v < 0 && !strong && "text-red-300/80", big && (v >= 0 ? "text-emerald-300" : "text-red-300"))}>{brl(v)}</dd>
    </div>
  );
}

function Despesas() {
  const q = useQuery({ queryKey: ["expenses"], queryFn: () => apiGet<Expense[]>("/expenses") });
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<ExpenseCat>("outros");
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState(isoLocal(new Date()));
  const inv = () => { void queryClient.invalidateQueries({ queryKey: ["expenses"] }); void queryClient.invalidateQueries({ queryKey: ["dre"] }); };
  const add = useMutation({
    mutationFn: () => apiPost<Expense>("/expenses", { description: desc, category: cat, amount: Number(amt.replace(",", ".")), date }),
    onSuccess: () => { toast.success("Despesa lançada"); setDesc(""); setAmt(""); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/expenses/${id}`), onSuccess: inv });
  return (
    <Panel title="Despesas operacionais" className="mt-4">
      <div className="mb-4 grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Input placeholder="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} data-testid="expense-description-input" />
        <Select value={cat} onValueChange={(v: string) => setCat(v as ExpenseCat)}>
          <SelectTrigger className="w-full" data-testid="expense-category-select"><SelectValue>{(v) => EXP_LABEL[v as ExpenseCat]}</SelectValue></SelectTrigger>
          <SelectContent>{(Object.keys(EXP_LABEL) as ExpenseCat[]).map((c) => <SelectItem key={c} value={c}>{EXP_LABEL[c]}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Valor" value={amt} inputMode="decimal" onChange={(e) => setAmt(e.target.value)} className="font-mono" data-testid="expense-amount-input" />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="expense-date-input" />
        <Button disabled={desc.trim().length < 2 || !Number(amt.replace(",", ".")) || add.isPending} onClick={() => add.mutate()} data-testid="expense-add-button"><Plus className="size-4" /> Lançar</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead className="text-right">Valor</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(q.data ?? []).map((x) => (
            <TableRow key={x.id} data-testid={`expense-row-${x.id}`}>
              <TableCell className="font-mono text-xs">{x.date.split("-").reverse().join("/")}</TableCell>
              <TableCell>{x.description}</TableCell>
              <TableCell className="text-zinc-400">{EXP_LABEL[x.category]}</TableCell>
              <TableCell className="text-right font-mono">{brl(x.amount)}</TableCell>
              <TableCell className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => del.mutate(x.id)} data-testid={`expense-delete-${x.id}`}><Trash2 /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

const FEE_KEYS = ["credito", "debito"].flatMap((m) => ["visa", "mastercard", "elo"].map((b) => `${m}:${b}`));

export function CardFeesPanel() {
  const q = useQuery({ queryKey: ["card-fees"], queryFn: () => apiGet<CardFees>("/settings/card-fees") });
  return q.data ? <CardFeesForm key={JSON.stringify(q.data.fees)} fees={q.data.fees} /> : null;
}

function CardFeesForm({ fees }: { fees: Record<string, number> }) {
  const [f, setF] = useState<Record<string, string>>(Object.fromEntries(FEE_KEYS.map((k) => [k, String(fees[k] ?? 0)])));
  const save = useMutation({
    mutationFn: () => apiPut<CardFees>("/settings/card-fees", { fees: Object.fromEntries(FEE_KEYS.map((k) => [k, Number(f[k].replace(",", ".")) || 0])) }),
    onSuccess: () => { toast.success("Taxas salvas"); void queryClient.invalidateQueries({ queryKey: ["card-fees"] }); void queryClient.invalidateQueries({ queryKey: ["dre"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Panel title="Taxas da maquininha por bandeira (%)" className="mt-4" actions={<Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="card-fees-save">Salvar taxas</Button>}>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {FEE_KEYS.map((k) => (
          <div key={k}>
            <p className="mb-1 text-xs text-zinc-400">{k.startsWith("credito") ? "Crédito" : "Débito"} · {k.split(":")[1] === "mastercard" ? "Master" : k.split(":")[1] === "visa" ? "Visa" : "Elo"}</p>
            <Input value={f[k]} inputMode="decimal" onChange={(e) => setF({ ...f, [k]: e.target.value })} className="font-mono" data-testid={`card-fee-${k.replace(":", "-")}`} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function OptionRanking({ start, end }: { start: string; end: string }) {
  const q = useQuery({ queryKey: ["option-rank", start, end], queryFn: () => apiGet<OptionRank[]>(`/reports/options?start=${start}&end=${end}`) });
  const groups = [...new Set((q.data ?? []).map((r) => r.group))];
  return (
    <Panel title="Ranking de opções (ponto, acompanhamentos, combos)" className="xl:col-span-2">
      {groups.length === 0 ? <Empty text="Nenhuma opção vendida no período." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="option-ranking">
          {groups.map((g) => {
            const rows = (q.data ?? []).filter((r) => r.group === g);
            const top = Math.max(...rows.map((r) => r.qty));
            return (
              <div key={g}>
                <p className="mb-2 text-sm font-medium text-white">{g}</p>
                {rows.map((r) => (
                  <div key={r.name} className="mb-1.5" data-testid={`option-rank-${g}-${r.name}`}>
                    <div className="flex justify-between text-xs"><span className="text-zinc-300">{r.name}</span><span className="font-mono text-white">{r.qty}x</span></div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.qty / top) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
