import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { brl } from "@/lib/format";
import { useMe } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import type { Dre } from "@/lib/types";

type Weekday = { weekday: number; samples: number; average_revenue: number | null; average_orders: number | null; average_ticket: number | null };
const NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/** Read-only simulation; days without sales are not represented in the historical endpoint. */
export default function OpeningInsights({ dre }: { dre?: Dre }) {
  const { data: me } = useMe();
  const admin = me?.role === "admin";
  const [expanded, setExpanded] = useState(false);
  const [cost, setCost] = useState("");
  const history = useQuery({
    queryKey: ["opening-weekdays"],
    queryFn: () => apiGet<Weekday[]>("/reports/opening-weekdays"),
    enabled: admin && expanded,
  });
  const currentDre = useQuery({
    queryKey: ["dre", "current-month"],
    queryFn: () => apiGet<Dre>("/reports/dre"),
    enabled: admin && expanded && !dre,
  });
  if (!admin) return null;
  const report = dre ?? currentDre.data;
  const margin = report && report.gross_revenue > 0 ? (report.net_revenue - report.cmv - report.commissions) / report.gross_revenue : null;
  const extra = Number(cost.replace(",", "."));
  const validCost = cost.trim() !== "" && Number.isFinite(extra) && extra >= 0;
  return <details className="rounded-xl border border-border bg-panel p-4" onToggle={event => setExpanded(event.currentTarget.open)} data-testid="opening-insights">
    <summary className="cursor-pointer font-semibold">Compensa abrir a loja? · por dia da semana</summary>
    {expanded && <>
      <p className="my-3 text-sm text-muted-foreground">Simulação com vendas das últimas 12 semanas e margem de contribuição do DRE. Dias abertos sem vendas não aparecem no histórico; resultados não são garantia de lucro.</p>
      <label className="block max-w-xs text-sm">Custo evitável por dia aberto (R$)
        <Input inputMode="decimal" value={cost} onChange={event => setCost(event.target.value)} />
      </label>
      <p className="mt-2 text-xs text-muted-foreground">Informe apenas custos adicionais evitáveis ao não abrir; não inclua aluguel ou custos fixos inevitáveis.</p>
      {history.isPending && <p role="status">Consultando histórico…</p>}
      {history.isError && <p role="alert">Não foi possível consultar o histórico.</p>}
      {currentDre.isError && !dre && <p role="alert">Não foi possível consultar o DRE.</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {history.data?.map(day => {
          const contribution = day.average_revenue !== null && margin !== null ? day.average_revenue * margin : null;
          const result = contribution !== null && validCost && day.samples >= 4 ? contribution - extra : null;
          const tolerance = contribution !== null ? Math.max(10, Math.abs(contribution) * 0.05) : 10;
          return <article key={day.weekday} className="rounded-lg border border-border p-3 text-sm">
            <h3 className="font-semibold">{NAMES[day.weekday] ?? "Dia"} · {day.samples} dias com vendas</h3>
            <p>Faturamento médio: {day.average_revenue === null ? "—" : brl(day.average_revenue)}</p>
            <p>Pedidos médios: {day.average_orders ?? "—"} · Ticket: {day.average_ticket === null ? "—" : brl(day.average_ticket)}</p>
            <p>Contribuição estimada: {contribution === null ? "—" : brl(contribution)}</p>
            <p className="font-medium">{result === null ? day.samples < 4 ? "Histórico insuficiente" : "Informe custo e confira DRE" : `${Math.abs(result) <= tolerance ? "Atenção" : result > 0 ? "Compensa abrir" : "Pode não compensar"} · ${brl(result)}`}</p>
          </article>;
        })}
      </div>
    </>}
  </details>;
}
