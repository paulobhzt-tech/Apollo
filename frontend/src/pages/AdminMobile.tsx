import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, ShieldCheck, Smartphone, ArrowRight } from "lucide-react";
import AppShell from "@/components/AppShell";
import { NAV, useMe } from "@/lib/auth";
import { Input } from "@/components/ui/input";

const GROUPS = ["Operação", "Financeiro", "Cadastros", "Relatórios", "Sistema"] as const;

/** Admin-only mobile home. Links reuse existing role-checked modules and APIs. */
export default function AdminMobile() {
  const { data: me } = useMe();
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const items = NAV.filter((item) => item.to !== "/" && item.to !== "/admin-mobile" && item.roles.includes("admin") && (!query || item.label.toLocaleLowerCase("pt-BR").includes(query)));
  return <AppShell roles={["admin"]}>
    <main className="mx-auto w-full max-w-4xl space-y-5 px-3 pb-24 pt-4 sm:px-6" data-testid="admin-mobile-home">
      <header className="rounded-2xl border border-border bg-elevated p-5">
        <div className="flex items-center gap-3"><ShieldCheck aria-hidden="true" className="size-8 text-primary" /><div><h1 className="text-xl font-bold">Apollo Administrador</h1><p className="text-sm text-muted-foreground">Gestão completa no celular e tablet</p></div></div>
        <p className="mt-3 text-sm">Operador: {me?.name ?? "Administrador"} · Acesso conforme suas permissões</p>
      </header>
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
    </main>
  </AppShell>;
}
