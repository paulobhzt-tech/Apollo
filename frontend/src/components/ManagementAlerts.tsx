import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { brl } from "@/lib/format";

type StockForecast = {
  restock_suggestions: { ingredient_id: string; name: string; unit: string; stock: number; daily_usage: number; suggested_purchase: number; days_cover: number | null }[];
  note: string;
};
type ProductProfit = {
  products: { product_id: string; name: string; qty: number; revenue: number; cost: number; profit: number; margin_pct: number }[];
  note: string;
};
const isoLocal = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Read-only management alerts derived from existing reports, not inventory mutations. */
export default function ManagementAlerts() {
  const { data: me } = useMe();
  const admin = me?.role === "admin";
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState("20");
  const now = new Date();
  const start = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = isoLocal(now);
  const stock = useQuery({
    queryKey: ["sales-stock-forecast", "28"],
    queryFn: () => apiGet<StockForecast>("/reports/sales-stock-forecast?days=28"),
    enabled: admin && expanded,
  });
  const profit = useQuery({
    queryKey: ["product-profit", start, end],
    queryFn: () => apiGet<ProductProfit>(`/reports/product-profit?start=${start}&end=${end}`),
    enabled: admin && expanded,
  });
  if (!admin) return null;
  const threshold = Number(limit.replace(",", "."));
  const validThreshold = limit.trim() !== "" && Number.isFinite(threshold) && threshold >= 0 && threshold <= 100;
  const restock = stock.data?.restock_suggestions.filter(item => item.suggested_purchase > 0) ?? [];
  const lowMargin = validThreshold ? profit.data?.products.filter(item => item.qty > 0 && item.margin_pct < threshold) ?? [] : [];
  return <details className="rounded-xl border border-border bg-panel p-4" onToggle={event => setExpanded(event.currentTarget.open)} data-testid="management-alerts">
    <summary className="cursor-pointer font-semibold">Alertas gerenciais · estoque e margem</summary>
    {expanded && <div className="mt-3 space-y-4 text-sm">
      <p className="text-muted-foreground">Indicadores consultivos, sem baixas ou compras automáticas. Reposição baseada no consumo histórico dos últimos 28 dias; margem bruta baseada nas vendas pagas do mês.</p>
      <section className="space-y-2">
        <h3 className="font-semibold">Sugestões de reposição para 7 dias</h3>
        {stock.isPending && <p role="status">Consultando estoque…</p>}
        {stock.isError && <p role="alert">Não foi possível consultar a previsão de estoque.</p>}
        {stock.data && (restock.length ? <ul className="space-y-2">{restock.map(item => <li key={item.ingredient_id} className="rounded-lg border border-border p-3"><strong>{item.name}</strong> · Estoque: {item.stock} {item.unit} · Compra sugerida: {item.suggested_purchase} {item.unit}{item.days_cover !== null ? ` · Cobertura: ${item.days_cover} dias` : ""}</li>)}</ul> : <p>Nenhuma reposição sugerida com os dados disponíveis.</p>)}
        {stock.data && <p className="text-xs text-muted-foreground">{stock.data.note}</p>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Produtos com margem bruta baixa</h3>
        <label className="flex items-center gap-2">Alertar abaixo de (%)
          <input className="w-20 rounded border border-border bg-background px-2 py-1" aria-label="Limite de margem percentual" inputMode="decimal" value={limit} onChange={event => setLimit(event.target.value)} />
        </label>
        {!validThreshold && <p role="alert">Informe um percentual entre 0 e 100.</p>}
        {profit.isPending && <p role="status">Consultando margens…</p>}
        {profit.isError && <p role="alert">Não foi possível consultar a rentabilidade por produto.</p>}
        {profit.data && validThreshold && (lowMargin.length ? <ul className="space-y-2">{lowMargin.map(item => <li key={item.product_id} className="rounded-lg border border-border p-3"><strong>{item.name}</strong> · Margem: {item.margin_pct}% · Contribuição bruta: {brl(item.profit)} · {item.qty} unidades</li>)}</ul> : <p>Nenhum produto vendido abaixo do limite informado neste mês.</p>)}
        {profit.data && <p className="text-xs text-muted-foreground">{profit.data.note}</p>}
      </section>
      <p className="text-xs text-muted-foreground">Sem histórico suficiente, a ausência de alertas não comprova estoque saudável ou rentabilidade positiva.</p>
    </div>}
  </details>;
}
