import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { brl } from "@/lib/format";
import type { Dre } from "@/lib/types";

interface Costs {
  start: string;
  end: string;
  planned: number;
  paid: number;
  overdue: number;
  upcoming: number;
  fixed: number;
  fixed_count: number;
}

export default function OperatingCosts({ dre }: { dre?: Dre }) {
  const { data: me } = useMe();
  const [days, setDays] = useState("");
  const admin = me?.role === "admin";
  const costs = useQuery({ queryKey: ["operating-costs"], queryFn: () => apiGet<Costs>("/reports/operating-costs"), enabled: admin });
  const currentDre = useQuery({ queryKey: ["dre", "current-month"], queryFn: () => apiGet<Dre>("/reports/dre"), enabled: admin && !dre });
  if (!admin) return null;
  const report = dre ?? currentDre.data;
  const values = costs.data;
  const dayCount = Number(days);
  const margin = report && report.gross_revenue > 0 ? (report.net_revenue - report.cmv - report.commissions) / report.gross_revenue : 0;
  const fixed = values?.fixed_count ? values.fixed : null;
  const daily = fixed !== null && Number.isInteger(dayCount) && dayCount > 0 && dayCount <= 31 ? fixed / dayCount : null;
  return <section className="mb-5 space-y-3 rounded-xl border border-border bg-panel p-4" aria-label="Custos e metas do mês">
    <h2 className="font-semibold">Custos e metas do mês</h2>
    {costs.isPending && <p role="status">Consultando Contas a Pagar…</p>}
    {costs.isError && <p role="alert">Não foi possível consultar Contas a Pagar.</p>}
    {values && <>
      <p className="text-sm text-muted-foreground">Fonte: Contas a Pagar com vencimento no mês atual. Pago mostra o valor liquidado dessas contas, mesmo que a data de pagamento esteja em outro mês. O DRE continua usando a data do pagamento.</p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Previsto", values.planned], ["Pago", values.paid], ["Vencido", values.overdue], ["A vencer", values.upcoming]].map(([label, amount]) =>
          <div key={label}><dt>{label}</dt><dd className="font-mono">{brl(Number(amount))}</dd></div>)}
      </dl>
      <label className="block max-w-xs text-sm">Dias abertos no mês
        <Input type="number" min={1} max={31} value={days} onChange={(event) => setDays(event.target.value)} />
      </label>
      <p>Custo fixo cadastrado · {fixed === null ? "Nenhuma conta classificada" : brl(fixed)}</p>
      <p>Custo fixo por dia · {daily === null ? "Dados insuficientes" : brl(daily)}</p>
      <p>Ponto de equilíbrio mensal · {fixed !== null && margin > 0 ? brl(fixed / margin) : "Dados insuficientes"}</p>
      <p>Resultado operacional registrado no DRE · {report ? brl(report.net_profit) : "Dados insuficientes"}</p>
      <p>Meta diária estimada · {daily !== null && margin > 0 ? brl(daily / margin) : "Dados insuficientes"}</p>
      <p className="text-xs text-muted-foreground">A meta usa a margem de contribuição do DRE consultado, após CMV e comissões.</p>
    </>}
  </section>;
}
