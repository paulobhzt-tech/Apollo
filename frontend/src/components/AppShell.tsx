import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api";
import { Link, NavLink, Navigate, useLocation } from "react-router-dom";
import {
  Bot, Armchair, Bike, Boxes, ChefHat, LayoutDashboard, LineChart, LogOut, Menu, Music, QrCode, Receipt, ShoppingCart,
  Users, UtensilsCrossed, Wallet, WifiOff, Wifi, Flame, History, HandCoins, Settings, Printer, Contact, ArrowUpCircle, ArrowDownCircle, Tags, CreditCard, Smartphone, LockKeyhole, Search, Megaphone, CalendarClock, MessageCircle, ListOrdered,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { NAV, homeFor, useMe, type NavItem } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { endSession } from "@/lib/session";
import { errMsg, ROLE_LABEL } from "@/lib/format";
import { setForcedOffline, syncQueue, useOffline } from "@/lib/offline";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

const RIBBON_GROUPS = [
  { label: "Principal", icon: ShoppingCart },
  { label: "Produtos", icon: Boxes },
  { label: "Marketing", icon: Megaphone },
  { label: "Financeiro", icon: Wallet },
  { label: "Relatórios", icon: LineChart },
  { label: "Apps", icon: Smartphone },
  { label: "Configurações", icon: Settings },
] as const;

type RibbonGroup = (typeof RIBBON_GROUPS)[number]["label"];

function ribbonGroup(item: NavItem): RibbonGroup {
  switch (item.to) {
    case "/produtos": case "/estoque": return "Produtos";
    case "/musica-ao-vivo": return "Marketing";
    case "/comanda-mobile": case "/cozinha": case "/impressao": case "/apollo-ia": return "Apps";
    case "/funcionarios": case "/config": return "Configurações";
    case "/auditoria": return "Relatórios";
    case "/caixa": return "Principal";
  }
  return item.group === "Financeiro" || item.group === "Relatórios" ? item.group : "Principal";
}

const PRINCIPAL_SHORTCUTS = [
  { label: "Caixa", paths: ["/caixa", "/pdv"] },
  { label: "Pedidos", paths: ["/mesas", "/delivery", "/comanda-mobile"] },
  { label: "Clientes", paths: ["/clientes", "/qrcodes"] },
  { label: "Atendimento", paths: [] },
];

const PRINCIPAL_LABELS: Record<string, string> = {
  "/caixa": "Abrir/Fechar Caixa",
  "/pdv": "Caixa/PDV",
  "/mesas": "Mesas/Comandas",
  "/comanda-mobile": "Fila de Atendimento",
  "/clientes": "Clientes",
  "/qrcodes": "Cardápio Digital",
};

const ICONS: Record<string, typeof Menu> = {
  Bot, LayoutDashboard, Music, ShoppingCart, Armchair, ChefHat, Bike, Wallet, Receipt, UtensilsCrossed, Boxes, LineChart, Users, QrCode, History, HandCoins, Settings, Printer, Contact, ArrowUpCircle, ArrowDownCircle, Tags, CreditCard, Smartphone, LockKeyhole, Search, Megaphone, CalendarClock, MessageCircle, ListOrdered,
};

const DEFAULT_SHORTCUTS = ["/mesas", "/pdv", "/estoque"];
const ZOOM_LEVELS = [90, 100, 110, 125, 150, 175];

function DisplayZoom() {
  const key = "apollo-display-zoom";
  const [zoom, setZoom] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      return ZOOM_LEVELS.includes(saved) ? saved : 100;
    } catch {
      return 100;
    }
  });

  useEffect(() => {
    document.documentElement.style.setProperty("--apollo-display-zoom", `${zoom}%`);
    return () => { document.documentElement.style.removeProperty("--apollo-display-zoom"); };
  }, [zoom]);

  return (
    <label className="flex min-h-10 items-center gap-1.5 text-xs text-muted-foreground">
      Zoom
      <select aria-label="Zoom da interface" value={zoom}
        className="min-h-10 rounded-md border border-border bg-elevated px-1.5 text-foreground"
        onChange={(event) => {
          const value = Number(event.target.value);
          setZoom(value);
          try {
            localStorage.setItem(key, String(value));
          } catch {
            toast.error("O dispositivo não pôde salvar o zoom.");
          }
        }}>
        {ZOOM_LEVELS.map((value) => <option key={value} value={value}>{value}%</option>)}
      </select>
    </label>
  );
}

const activePath = (path: string) => path === "/fornecedores" ? "/clientes" : path;

function MenuPreferences({ items, operatorId }: { items: NavItem[]; operatorId: string }) {
  const storageKey = `apollo-menu-shortcuts:${operatorId}`;
  const [pins, setPins] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? JSON.stringify(DEFAULT_SHORTCUTS));
      return Array.isArray(saved) ? saved.filter((path): path is string => typeof path === "string") : DEFAULT_SHORTCUTS;
    } catch {
      return DEFAULT_SHORTCUTS;
    }
  });
  const loc = useLocation();
  const [editing, setEditing] = useState(false);
  const pinned = [...new Set(pins)].flatMap((path) => items.filter((item) => item.to === path));

  function toggle(path: string) {
    const next = pins.includes(path) ? pins.filter((pin) => pin !== path) : [...pins, path];
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setPins(next);
    } catch {
      toast.error("O dispositivo não pôde salvar os atalhos.");
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 border-t border-border px-2 py-1 sm:px-4">
      <Button type="button" variant="ghost" className="min-h-11 gap-2 px-2 text-xs" onClick={() => setEditing(true)}>
        <Settings className="size-4 shrink-0" aria-hidden="true" /> Personalizar menu
      </Button>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden">
          <DialogTitle>Atalhos do meu menu</DialogTitle>
          <div data-testid="menu-preferences-options" className="grid min-h-0 gap-3 overflow-y-auto overscroll-contain pr-1">
            {RIBBON_GROUPS.map(({ label: group }) => {
              const groupItems = items.filter((item) => ribbonGroup(item) === group);
              return groupItems.length > 0 && <fieldset key={group} className="grid gap-1">
                <legend className="text-xs font-semibold text-muted-foreground">{group}</legend>
                {groupItems.map((item) => (
                  <label key={item.to} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted">
                    <input type="checkbox" checked={pins.includes(item.to)} onChange={() => toggle(item.to)} />
                    {item.label}
                  </label>
                ))}
              </fieldset>;
            })}
          </div>
        </DialogContent>
      </Dialog>
      {pinned.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        return <NavLink key={item.to} to={item.to} end={item.to === "/"}
          aria-current={item.to === activePath(loc.pathname) ? "page" : undefined}
          className="flex min-h-11 min-w-0 items-center gap-1.5 rounded px-2 text-xs hover:bg-muted aria-[current=page]:bg-muted">
          <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 wrap-anywhere">{item.label}</span>
        </NavLink>;
      })}
    </div>
  );
}

const normalizeMenuSearch = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");

function NavList({ role, onNavigate, search = "" }: { role: Role; onNavigate?: () => void; search?: string }) {
  const normalizedSearch = normalizeMenuSearch(search.trim());
  return (
    <nav className="flex flex-col gap-1">
      {RIBBON_GROUPS.flatMap(({ label }) => NAV.filter((n) => ribbonGroup(n) === label && n.roles.includes(role) && (!normalizedSearch || normalizeMenuSearch(`${n.label} ${label} ${PRINCIPAL_LABELS[n.to] ?? ""}`).includes(normalizedSearch)))).map((n, idx, arr) => {
        const Icon = ICONS[n.icon];
        const header = idx === 0 || ribbonGroup(arr[idx - 1]) !== ribbonGroup(n);
        return (
          <div key={n.to}>
          {header && <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600 first:mt-0" data-testid={`nav-group-${n.group}`}>{ribbonGroup(n)}</p>}
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
  const [activeRibbon, setActiveRibbon] = useState<RibbonGroup | null>(null);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setActiveRibbon(null); }, [loc.pathname]);
  // Keyboard-first navigation without changing the currently selected operator.
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenuSearch("");
        setOpen(true);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);
  useEffect(() => {
    if (!open) return;
    const input = document.getElementById("apollo-menu-search");
    if (input instanceof HTMLInputElement) input.focus();
  }, [open]);
  const { resolvedTheme, setTheme } = useTheme();
  const backupChoice = useQuery({ queryKey: ["backup-destination"], queryFn: () => apiGet<{ destination: "pc" | "google_drive" | null }>("/settings/backup-destination"), enabled: me?.role === "admin", staleTime: 60000 });

  if (isLoading) return <div className="grid min-h-screen place-items-center text-zinc-500">Carregando…</div>;
  if (isError || !me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const items = NAV.filter((item) => item.roles.includes(me.role));
  const currentItem = items.find((item) => item.to === activePath(loc.pathname));
  const visibleGroup = activeRibbon ?? (currentItem ? ribbonGroup(currentItem) : "Principal");
  const allowed = !roles || me.role === "admin" || roles.includes(me.role);

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-background">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-white/5 bg-shell p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Brand />
          <label htmlFor="apollo-menu-search" className="mt-5 text-xs text-zinc-400">Buscar função</label>
          <input id="apollo-menu-search" data-testid="menu-search" type="search" value={menuSearch} onChange={(event) => setMenuSearch(event.target.value)} placeholder="Buscar no Apollo..." className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary" />
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <NavList role={me.role} search={menuSearch} onNavigate={() => setOpen(false)} />
          </div>
          <UserCard name={me.name} role={me.role} onManage={() => { setOpen(false); setOperatorOpen(true); }} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {me.role === "admin" && backupChoice.data && !backupChoice.data.destination && loc.pathname !== "/config" && (
          <Link to="/config?tab=backup" className="bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black" data-testid="backup-setup-required">
            Configuração obrigatória: escolha backup no Google Drive ou no PC em Configurações → Backup.
          </Link>
        )}
        <header className="relative z-30 lg:sticky lg:top-0 border-b border-border bg-shell text-foreground" data-testid="apollo-ribbon">
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
            <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={() => setOpen(true)} aria-label="Abrir todas as funções (Ctrl+K)" title="Buscar funções (Ctrl+K)" data-testid="mobile-menu-button"><Menu className="size-5" /></Button>
            <Brand />
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setMenuSearch(""); setOpen(true); }}><Search className="size-4" /> Pesquisar</Button>
              <OfflineBadge />
              <DisplayZoom />
              <button type="button" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                aria-label={resolvedTheme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
                className="grid size-10 shrink-0 place-items-center rounded-lg text-foreground hover:bg-muted" data-testid="theme-toggle">
                {resolvedTheme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              </button>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <span className="max-w-40 truncate px-1 text-xs text-foreground" title={me.name}>{me.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setOperatorOpen(true)} className="h-auto min-h-9 whitespace-normal">
                  <LockKeyhole className="size-4 shrink-0" /> Bloquear ou trocar operador
                </Button>
              </div>
            </div>
          </div>
          <nav aria-label="Seções do sistema" data-testid="top-menu-groups" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,5.75rem),1fr))] gap-1 px-2 py-1 sm:px-4">
            {RIBBON_GROUPS.filter(({label}) => items.some(n => ribbonGroup(n) === label)).map(({label, icon: GroupIcon}) => {
              const selected = visibleGroup === label;
              return <button key={label} type="button" onClick={() => setActiveRibbon(label)}
                className={cn("flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[10px] font-medium transition-colors hover:bg-muted sm:text-xs", selected ? "bg-muted text-foreground" : "text-muted-foreground")}
                aria-pressed={selected}><GroupIcon className="size-4 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 wrap-anywhere">{label}</span></button>;
            })}
          </nav>
          <nav aria-label="Atalhos do sistema" data-testid="top-menu-shortcuts" className="flex min-w-0 flex-wrap gap-2 bg-elevated px-2 py-1 sm:px-4">
            {visibleGroup === "Principal" ? <>
              {PRINCIPAL_SHORTCUTS.map(({ label, paths }) => {
                const shortcuts = paths.flatMap((path) => items.filter((item) => item.to === path));
                if (label !== "Atendimento" && !shortcuts.length) return null;
                if (label === "Atendimento" && me.role !== "admin" && me.role !== "caixa") return null;
                return <div key={label} role="group" aria-label={label} className="min-w-0 rounded-md border border-border px-1.5">
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {shortcuts.map((item) => <RibbonShortcut key={item.to} item={item} label={PRINCIPAL_LABELS[item.to]} />)}
                    {label === "Pedidos" && items.some((item) => item.to === "/delivery") &&
                      <PendingShortcut icon={CalendarClock} label="Agendados" />}
                    {label === "Atendimento" && <PendingShortcut icon={MessageCircle} label="WhatsApp" />}
                  </div>
                  <p className="pb-0.5 text-center text-[10px] text-muted-foreground">{label}</p>
                </div>;
              })}
              {items.filter((item) => item.to === "/").map((item) => <RibbonShortcut key={item.to} item={item} />)}
            </> : items.filter((item) => ribbonGroup(item) === visibleGroup).map((item) => <RibbonShortcut key={item.to} item={item} />)}
          </nav>
          <MenuPreferences key={me.id} operatorId={me.id} items={items} />
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 lg:px-5">
          {allowed ? children : (
            <div className="mx-auto mt-20 max-w-md text-center" data-testid="no-permission">
              <h2 className="text-2xl font-semibold text-white">Acesso restrito</h2>
              <p className="mt-2 text-zinc-400">Seu perfil ({ROLE_LABEL[me.role]}) não tem acesso a esta tela.</p>
              <Link to={homeFor(me.role)} className="mt-6 inline-block text-primary">Ir para minha tela</Link>
            </div>
          )}
        </main>
      </div>
      <OperatorDialog open={operatorOpen} onOpenChange={setOperatorOpen} name={me.name} role={me.role} />
      <Toaster richColors />
    </div>
  );
}

function RibbonShortcut({ item, label = item.label }: { item: NavItem; label?: string }) {
  const Icon = label === "Fila de Atendimento" ? ListOrdered : ICONS[item.icon] ?? LayoutDashboard;
  return <NavLink to={label === "Fila de Atendimento" ? "/comanda-mobile?fila=1" : item.to} end={item.to === "/"} title={label}
    className={({ isActive }) => cn("flex min-h-11 min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs leading-tight hover:bg-muted", isActive ? "bg-muted text-foreground" : "text-muted-foreground")}>
    <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /><span className="wrap-anywhere">{label}</span>
  </NavLink>;
}

function PendingShortcut({ icon: Icon, label }: { icon: typeof Menu; label: string }) {
  return <span className="flex min-h-11 items-center gap-1.5 px-2 text-xs text-muted-foreground" aria-disabled="true">
    <Icon className="size-4 shrink-0" aria-hidden="true" />
    <span>{label}<small className="block">Indisponível</small></span>
  </span>;
}

function OperatorDialog({ open, onOpenChange, name, role }: { open: boolean; onOpenChange: (open: boolean) => void; name: string; role: Role }) {
  const terminal = useQuery({
    queryKey: ["operator-terminal"],
    queryFn: () => apiGet<{ authorized: boolean }>("/auth/operator-terminal"),
    enabled: open && role === "admin",
    retry: false,
  });
  const updateTerminal = useMutation({
    mutationFn: (authorized: boolean) => apiPut<{ authorized: boolean }>("/auth/operator-terminal", { authorized }),
    onSuccess: (result) => queryClient.setQueryData(["operator-terminal"], result),
    onError: (error) => toast.error(errMsg(error)),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogTitle>Operador atual</DialogTitle>
      <p className="wrap-anywhere">{name} · {ROLE_LABEL[role]}</p>
      <div className="grid gap-2">
        <Button onClick={endSession}><LockKeyhole className="size-4" /> Bloquear ou trocar operador</Button>
        <Button variant="outline" onClick={endSession} data-testid="logout-button"><LogOut className="size-4" /> Sair</Button>
      </div>
      {role === "admin" && terminal.data && <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs text-muted-foreground">O seletor do login mostra os operadores ativos neste terminal autorizado.</p>
        <Button variant="outline" className="h-auto min-h-9 whitespace-normal" disabled={updateTerminal.isPending}
          onClick={() => updateTerminal.mutate(!terminal.data.authorized)}>
          {terminal.data.authorized ? "Desautorizar lista neste terminal" : "Autorizar lista neste terminal"}
        </Button>
      </div>}
    </DialogContent>
  </Dialog>;
}

function UserCard({ name, role, onManage }: { name: string; role: Role; onManage: () => void }) {
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
      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onManage}>
        <LockKeyhole className="size-3.5" /> Gerenciar operador
      </Button>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0 wrap-anywhere">
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
      <p className={cn("mt-2 wrap-anywhere font-mono text-2xl font-medium tracking-tight text-white", accent)} data-testid={testid}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
