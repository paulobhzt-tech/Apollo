import OperatingCosts from "@/components/OperatingCosts";
import OpeningInsights from "@/components/OpeningInsights";
import ManagementAlerts from "@/components/ManagementAlerts";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, ShieldCheck, Smartphone, ArrowRight } from "lucide-react";
import AppShell, { Stat } from "@/components/AppShell";
import { apiGet } from "@/lib/api";
import { brl } from "@/lib/format";
import type { Dre } from "@/lib/types";
import { NAV, useMe } from "@/lib/auth";
import { Input } from "@/components/ui/input";

const GROUPS = ["Operação", "Financeiro", "Cadastros", "Relatórios", "Sistema"] as const;

/** Admin-only mobile home. Links reuse existing role-checked modules and APIs. */
export default function AdminMobile() {
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const dre = useQuery({
    queryKey: ["dre", "current-month"],
    queryFn: () => apiGet<Dre>("/reports/dre"),
    enabled: isAdmin,
  });
  const forecast = useQuery({
    queryKey: ["forecast", "3"],
    queryFn: () => apiGet<{ average_monthly_profit: number }>("/reports/forecast?months=3"),
    enabled: isAdmin,
  });
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const items = NAV.filter((item) => item.to !== "/" && item.to !== "/admin-mobile" && item.roles.includes("admin") && (!query || item.label.toLocaleLowerCase("pt-BR").includes(query)));
  return <AppShell roles={["admin"]}>
    <main className="mx-auto w-full max-w-4xl space-y-5 px-3 pb-24 pt-4 sm:px-6" data-testid="admin-mobile-home">
      <header className="rounded-2xl border border-border bg-elevated p-5">
        <div className="flex items-center gap-3"><ShieldCheck aria-hidden="true" className="size-8 text-primary" /><div><h1 className="text-xl font-bold">Apollo Administrador</h1><p className="text-sm text-muted-foreground">Gestão completa no celular e tablet</p></div></div>
        <p className="mt-3 text-sm">Operador: {me?.name ?? "Administrador"} · Acesso conforme suas permissões</p>
      </header>
      <section aria-labelledby="admin-financial-summary" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="admin-financial-summary" className="text-base font-semibold">Resumo financeiro</h2>
          <Link to="/financeiro" className="text-sm font-medium text-primary underline">Abrir financeiro</Link>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat label="Faturamento bruto no mês" testid="admin-month-revenue" value={dre.isError ? "Indisponível" : dre.data ? brl(dre.data.gross_revenue) : "Carregando"} />
          <Stat label="Despesas operacionais no mês" testid="admin-month-expenses" value={dre.isError ? "Indisponível" : dre.data ? brl(dre.data.expenses) : "Carregando"} />
          <Stat label="Lucro mensal projetado" testid="admin-profit-forecast" value={forecast.isError ? "Indisponível" : forecast.data ? brl(forecast.data.average_monthly_profit) : "Carregando"} />
        </div>
        <p className="text-xs text-muted-foreground">Projeção pela média dos últimos três meses completos.</p>
      </section>
      <label className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-background px-3">
        <Search className="size-5 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Buscar módulo administrativo" className="border-0 shadow-none" placeholder="Buscar mesas, caixa, estoque, relatórios..." value={search} onChange={(event) => setSearch(event.target.value)} data-testid="admin-mobile-search" />
      </label>
      {GROUPS.map((group) => {
        const entries = items.filter((item) => item.group === group);
        if (!entries.length) return null;
        return <section key={group} aria-label={group} className="space-y-2">
          <h2 className="px-1 text-base font-semibold">{group}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {entries.map((item) => <Link key={item.to} to={item.to} className="flex min-h-24 flex-col justify-between rounded-xl border border-border bg-elevated p-3 text-sm font-medium transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" data-testid={`admin-module-${item.to.slice(1)}`}>
              <Smartphone className="size-5 text-primary" aria-hidden="true" />
              <span className="flex items-end justify-between gap-1">{item.label}<ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></span>
            </Link>)}
          </div>
        </section>;
      })}
      {!items.length && <p role="status" className="rounded-xl border border-border p-4">Nenhum módulo encontrado.</p>}
      <OperatingCosts dre={dre.data} />
      <OpeningInsights dre={dre.data} />
    <ManagementAlerts />
    </main>
  </AppShell>;
}
