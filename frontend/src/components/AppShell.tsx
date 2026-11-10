import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Link, NavLink, Navigate, useLocation } from "react-router-dom";
import {
  Bot, Armchair, Bike, Boxes, ChefHat, LayoutDashboard, LineChart, LogOut, Menu, Music, QrCode, Receipt, ShoppingCart,
  Users, UtensilsCrossed, Wallet, WifiOff, Wifi, Flame, History, HandCoins, Settings, Printer, Contact, ArrowUpCircle, ArrowDownCircle, Tags, CreditCard, Smartphone, Star,
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

const RIBBON_GROUPS = [
  { label: "PRINCIPAL", group: "Operação", icon: ShoppingCart },
  { label: "CADASTROS", group: "Cadastros", icon: Boxes },
  { label: "FINANCEIRO", group: "Financeiro", icon: Wallet },
  { label: "RELATÓRIOS", group: "Relatórios", icon: LineChart },
  { label: "CONFIGURAÇÕES", group: "Sistema", icon: Settings },
] as const;

const ICONS: Record<string, typeof Menu> = {
  Bot, LayoutDashboard, Music, ShoppingCart, Armchair, ChefHat, Bike, Wallet, Receipt, UtensilsCrossed, Boxes, LineChart, Users, QrCode, History, HandCoins, Settings, Printer, Contact, ArrowUpCircle, ArrowDownCircle, Tags, CreditCard, Smartphone,
};

function NavList({ role, onNavigate, search = "" }: { role: Role; onNavigate?: () => void; search?: string }) {
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((n) => n.roles.includes(role) && (!normalizedSearch || `${n.label} ${n.group}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch))).map((n, idx, arr) => {
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
    if (!forced) {
      toast.message("Modo contingência ativado: vendas do PDV ficam salvas neste dispositivo");
      return;
    }
    try {
      const r = await syncQueue();
      if (r.synced) toast.success(`${r.synced} venda(s) offline sincronizada(s)`);
    } catch {
      toast.error("Não foi possível sincronizar. Confira a fila em Configurações.");
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="offline-toggle"
      title="Alternar modo offline (contingência)"
      aria-label={forced ? "Desativar modo offline manual" : "Ativar modo offline manual"}
      aria-pressed={forced}
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
  const [menuSearch, setMenuSearch] = useState("");
  const [desktopSearch, setDesktopSearch] = useState("");
  const [activeRibbon, setActiveRibbon] = useState<string | null>("Favoritos");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [editingFavorites, setEditingFavorites] = useState(false);
  useEffect(() => {
    if (!me?.id) return;
    try {
      const stored = localStorage.getItem(`apollo-menu-favorites:${me.id}`);
      const parsed: unknown = stored ? JSON.parse(stored) : null;
      setFavorites(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : ["/", "/pdv", "/mesas"]);
    } catch {
      setFavorites(["/", "/pdv", "/mesas"]);
    }
  }, [me?.id]);
  const toggleFavorite = (path: string) => {
    if (!me?.id) return;
    const next = favorites.includes(path) ? favorites.filter(x => x !== path) : [...favorites, path];
    setFavorites(next);
    try { localStorage.setItem(`apollo-menu-favorites:${me.id}`, JSON.stringify(next)); }
    catch { toast.error("Não foi possível salvar os favoritos neste dispositivo"); }
  };
  const loc = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const backupChoice = useQuery({ queryKey: ["backup-destination"], queryFn: () => apiGet<{ destination: "pc" | "google_drive" | null }>("/settings/backup-destination"), enabled: me?.role === "admin", staleTime: 60000 });

  if (isLoading) return <div className="grid min-h-screen place-items-center text-zinc-500">Carregando…</div>;
  if (isError || !me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const allowed = !roles || me.role === "admin" || roles.includes(me.role);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-shell p-4 lg:flex" aria-label="Menu principal do computador" data-testid="desktop-sidebar">
        <Brand />
        <label htmlFor="apollo-desktop-search" className="mt-6 text-xs text-zinc-400">Buscar função</label>
        <input id="apollo-desktop-search" data-testid="desktop-menu-search" type="search" value={desktopSearch} onChange={(event) => setDesktopSearch(event.target.value)} placeholder="Buscar no Apollo..." className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary" />
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <NavList role={me.role} search={desktopSearch} />
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
        {me.role === "admin" && backupChoice.data && !backupChoice.data.destination && loc.pathname !== "/config" && (
          <Link to="/config?tab=backup" className="bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black" data-testid="backup-setup-required">
            Configuração obrigatória: escolha backup no Google Drive ou no PC em Configurações → Backup.
          </Link>
        )}
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#252527] text-white" data-testid="apollo-ribbon">
          <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-white/10 px-2 sm:px-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-button"><Menu className="size-5" /></Button>
            <div className="mr-2 hidden shrink-0 sm:block lg:hidden"><Brand /></div>
            <nav aria-label="Seções do sistema" className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
              <button type="button" onClick={() => setActiveRibbon("Favoritos")}
                className={cn("flex shrink-0 items-center gap-1.5 px-3 py-3 text-[10px] font-medium transition-colors hover:bg-white/10 sm:text-xs", activeRibbon === "Favoritos" ? "bg-[#36363a] text-white" : "text-zinc-300")}
                aria-pressed={activeRibbon === "Favoritos"} data-testid="ribbon-favorites"><Star className="size-4 text-[#e6b44d]" />MEU MENU</button>
              {RIBBON_GROUPS.filter(({group}) => NAV.some(n => n.group === group && n.roles.includes(me.role))).map(({label, group, icon: GroupIcon}) => {
                const selected = activeRibbon ? activeRibbon === group : NAV.some(n => n.group === group && n.to === loc.pathname) || (group === "Operação" && loc.pathname === "/");
                return <button key={group} type="button" onClick={() => setActiveRibbon(group)}
                  className={cn("flex shrink-0 items-center gap-1.5 px-3 py-3 text-[10px] font-medium transition-colors hover:bg-white/10 sm:text-xs", selected ? "bg-[#36363a] text-white" : "text-zinc-300")}
                  aria-pressed={selected}><GroupIcon className="size-4 text-[#e6b44d]" aria-hidden="true" />{label}</button>;
              })}
            </nav>
            <button type="button" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="hidden shrink-0 items-center gap-2 text-xs text-zinc-200 hover:text-white sm:flex" data-testid="theme-toggle">
              {resolvedTheme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              <span className="hidden xl:inline">Modo {resolvedTheme === "dark" ? "Escuro" : "Claro"}</span>
            </button>
            <OfflineBadge />
            <button type="button" onClick={() => void endSession()} className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/20 px-2 py-2 text-xs text-zinc-200 hover:bg-white/10 hover:text-white" title={`Trocar operador — atual: ${me.name}`} data-testid="header-switch-operator" aria-label={`Trocar operador. Operador atual: ${me.name}`}>
              <LogOut className="size-4" aria-hidden="true" /><span className="hidden xl:inline">Trocar operador</span>
            </button>
          </div>
          {activeRibbon === "Favoritos" && <div className="flex items-center justify-end bg-[#303034] px-3 pt-1">
            <button type="button" onClick={() => setEditingFavorites(!editingFavorites)} data-testid="edit-favorites"
              className="rounded px-2 py-1 text-xs text-[#e6b44d] hover:bg-white/10">{editingFavorites ? "Concluir personalização" : "Personalizar meu menu"}</button>
          </div>}
          <nav aria-label="Atalhos do sistema" className="flex min-h-12 flex-wrap items-stretch gap-1 bg-[#303034] px-2 py-1.5 sm:px-4">
            {NAV.filter(n => n.roles.includes(me.role) && (
              activeRibbon ? n.group === activeRibbon :
              (NAV.find(item => item.to === loc.pathname)?.group ?? "Operação") === n.group
            )).map(n => {
              const Icon = ICONS[n.icon] ?? LayoutDashboard;
              return activeRibbon === "Favoritos" && editingFavorites
                ? <button key={n.to} type="button" onClick={() => toggleFavorite(n.to)} aria-pressed={favorites.includes(n.to)}
                    className={cn("flex min-w-24 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-center text-[11px] leading-tight", favorites.includes(n.to) ? "bg-[#414147] text-white" : "text-zinc-400 hover:bg-white/10")}
                    data-testid={`favorite-toggle-${n.to.slice(1) || "painel"}`}>
                    <Star className={cn("size-4 shrink-0", favorites.includes(n.to) ? "fill-[#e6b44d] text-[#e6b44d]" : "text-zinc-500")} /><span>{n.label}</span>
                  </button>
                : <NavLink key={n.to} to={n.to} title={n.label} onClick={() => { if (activeRibbon !== "Favoritos") setActiveRibbon(n.group); }}
                className={({isActive}) => cn("flex min-w-24 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-center text-[11px] leading-tight transition-colors hover:bg-white/10",isActive ? "bg-[#414147] text-white" : "text-zinc-200")}>
                <Icon className="size-4 shrink-0 text-[#e6b44d]" strokeWidth={1.8} /><span>{n.label}</span>
              </NavLink>;
            })}
          </nav>
        </header>
        <main className="flex-1 px-3 py-4 lg:px-5">
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
