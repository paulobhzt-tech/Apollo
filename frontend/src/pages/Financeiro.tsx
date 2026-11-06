import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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

const EXP_LABEL: Record<ExpenseCat, string> = {
  aluguel: "Aluguel", salarios: "Salários", energia: "Energia", agua: "Água", marketing: "Marketing", manutencao: "Manutenção", impostos: "Impostos", outros: "Outros",
};
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Financeiro() {
  const now = new Date();
  const [start, setStart] = useState(isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [end, setEnd] = useState(isoLocal(now));
  const dre = useQuery({ queryKey: ["dre", start, end], queryFn: () => apiGet<Dre>(`/reports/dre?start=${start}&end=${end}`) });
  const d = dre.isError ? undefined : dre.data;
  const intelligence = useQuery({ queryKey: ["sales-intelligence", start, end], queryFn: () => apiGet<{ top: { product_id: string; name: string; qty: number; revenue: number }[]; least: { product_id: string; name: string; qty: number; revenue: number }[]; unsold: { id: string; name: string }[]; note: string }>(`/reports/sales-intelligence?start=${start}&end=${end}`) });
  const productProfit = useQuery({ queryKey: ["product-profit", start, end], queryFn: () => apiGet<{ products: { product_id: string; name: string; qty: number; revenue: number; cost: number; profit: number; margin_pct: number }[]; profit: number; revenue: number; cost: number; note: string }>(`/reports/product-profit?start=${start}&end=${end}`) });
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
      {dre.isError && <p className="mb-4 text-sm text-red-400">{errMsg(dre.error)}</p>}
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
