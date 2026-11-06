import { useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, useLocation } from "react-router-dom";
import {
  Armchair, Bike, Boxes, ChefHat, LayoutDashboard, LineChart, LogOut, Menu, QrCode, Receipt, ShoppingCart,
  Users, UtensilsCrossed, Wallet, WifiOff, Wifi, Flame, History, HandCoins, Settings, Printer, Contact, ArrowUpCircle, ArrowDownCircle, Tags, CreditCard, Smartphone,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { NAV, homeFor, useMe } from "@/lib/auth";
import { endSession } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/format";
import { setForcedOffline, syncQueue, useOffline } from "@/lib/offline";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

const ICONS: Record<string, typeof Menu> = {
  LayoutDashboard, ShoppingCart, Armchair, ChefHat, Bike, Wallet, Receipt, UtensilsCrossed, Boxes, LineChart, Users, QrCode, History, HandCoins, Settings, Printer, Contact, ArrowUpCircle, ArrowDownCircle, Tags, CreditCard, Smartphone,
};

function NavList({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((n) => n.roles.includes(role)).map((n, idx, arr) => {
        const Icon = ICONS[n.icon];
        const header = idx === 0 || arr[idx - 1].group !== n.group;
        return (
          <div key={n.to}>
          {header && <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600 first:mt-0" data-testid={`nav-group-${n.group}`}>{n.group}</p>}
          <NavLink
            to={n.to}
            end={n.to === "/"}
            onClick={onNavigate}
            data-testid={`nav-${n.to === "/" ? "painel" : n.to.slice(1)}`}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                isActive ? "bg-primary/12 text-primary" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {n.label}
          </NavLink>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5" data-testid="brand-link">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-white shadow-lg shadow-primary/30">
        <Flame className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block font-heading text-base font-semibold text-white" data-testid="brand-name">Apollo PDV</span>
        <span className="block text-[10px] uppercase tracking-[0.2em] text-zinc-500">PDV · Gestão</span>
      </span>
    </Link>
  );
}

export function OfflineBadge() {
  const { offline, forced, queue } = useOffline();
  const toggle = async () => {
    setForcedOffline(!forced);
    if (forced) {
      const r = await syncQueue();
      if (r.synced) toast.success(`${r.synced} venda(s) offline sincronizada(s)`);
    } else toast.message("Modo contingência ativado: vendas do PDV ficam salvas neste dispositivo");
  };
  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="offline-toggle"
      title="Alternar modo offline (contingência)"
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200",
        offline ? "animate-pulse-ring border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
      )}
    >
      {offline ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
      {offline ? "Offline" : "Online"}
      {queue.length > 0 && (
        <span data-testid="offline-queue-count" className="rounded-full bg-amber-400 px-1.5 font-mono text-[10px] text-black">
          {queue.length}
        </span>
      )}
    </button>
  );
}

export default function AppShell({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { data: me, isLoading, isError } = useMe();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { resolvedTheme, setTheme } = useTheme();

  if (isLoading) return <div className="grid min-h-screen place-items-center text-zinc-500">Carregando…</div>;
  if (isError || !me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const allowed = !roles || me.role === "admin" || roles.includes(me.role);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden">
        <Brand />
        <div className="mt-8 flex-1 overflow-y-auto">
          <NavList role={me.role} />
        </div>
        <UserCard name={me.name} role={me.role} />
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-white/5 bg-shell p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Brand />
          <div className="mt-8 flex-1 overflow-y-auto">
            <NavList role={me.role} onNavigate={() => setOpen(false)} />
          </div>
          <UserCard name={me.name} role={me.role} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b border-white/5 bg-background/95 px-4 py-2 backdrop-blur-xl lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-button">
            <Menu className="size-5" />
          </Button>
          <div className="shrink-0"><Brand /></div>
          <nav aria-label="Menu principal" className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex">
            {NAV.filter((item) => item.roles.includes(me.role)).map((item) => {
              const Icon = ICONS[item.icon];
              return <NavLink key={item.to} to={item.to} title={item.label} className={({ isActive }) => cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors", isActive ? "bg-primary/15 text-primary" : "text-zinc-400 hover:bg-white/5 hover:text-white")}><Icon className="size-4" /><span>{item.label}</span></NavLink>;
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <button type="button" aria-label={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} title={resolvedTheme === "dark" ? "Tema claro" : "Tema escuro"} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="rounded-lg border border-border p-2 text-foreground hover:bg-accent" data-testid="theme-toggle">{resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
            <OfflineBadge />
            <span className="hidden text-xs text-zinc-500 sm:inline" data-testid="header-user">{me.name}</span>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">
          {allowed ? children : (
            <div className="mx-auto mt-20 max-w-md text-center" data-testid="no-permission">
              <h2 className="text-2xl font-semibold text-white">Acesso restrito</h2>
              <p className="mt-2 text-zinc-400">Seu perfil ({ROLE_LABEL[me.role]}) não tem acesso a esta tela.</p>
              <Link to={homeFor(me.role)} className="mt-6 inline-block text-primary">Ir para minha tela</Link>
            </div>
          )}
        </main>
      </div>
      <Toaster richColors />
    </div>
  );
}

function UserCard({ name, role }: { name: string; role: Role }) {
  return (
    <div className="mt-4 rounded-xl border border-white/5 bg-panel p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-primary/15 font-heading text-sm font-semibold text-primary">
          {name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white" data-testid="current-user-name">{name}</p>
          <p className="truncate text-xs text-zinc-500" data-testid="current-user-role">{ROLE_LABEL[role]}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => void endSession()} data-testid="logout-button">
        <LogOut className="size-3.5" /> Trocar operador
      </Button>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        <h1 className="text-2xl font-semibold text-white sm:text-3xl" data-testid="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, testid, accent }: { label: string; value: string; hint?: string; testid: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-panel p-5 transition-transform duration-200 hover:-translate-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">{label}</p>
      <p className={cn("mt-2 font-mono text-2xl font-medium tracking-tight text-white", accent)} data-testid={testid}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
