import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api";
import { Link, NavLink, Navigate, useLocation } from "react-router-dom";
import {
  Bot, Armchair, Bike, Boxes, ChefHat, LayoutDashboard, LineChart, LogOut, Menu, Music, QrCode, Receipt, ShoppingCart,
  Users, UtensilsCrossed, Wallet, WifiOff, Wifi, Flame, History, HandCoins, Settings, Printer, Contact, ArrowUpCircle, ArrowDownCircle, Tags, CreditCard, Smartphone, LockKeyhole, Search, Megaphone, ListOrdered, Ellipsis,
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

const PRINCIPAL_SHORTCUTS = ["/caixa", "/mesas", "/delivery", "/pdv", "/comanda-mobile", "/qrcodes", "/clientes", "/"];

const PRINCIPAL_LABELS: Record<string, string> = {
  "/caixa": "Abrir/Fechar Caixa",
  "/pdv": "Caixa/PDV",
  "/mesas": "Mesas/Comandas",
  "/comanda-mobile": "Fila de Atendimento",
  "/clientes": "Clientes",
  "/qrcodes": "Cardápio Digital",
};

const ICONS: Record<string, typeof Menu> = {
  Bot, LayoutDashboard, Music, ShoppingCart, Armchair, ChefHat, Bike, Wallet, Receipt, UtensilsCrossed, Boxes, LineChart, Users, QrCode, History, HandCoins, Settings, Printer, Contact, ArrowUpCircle, ArrowDownCircle, Tags, CreditCard, Smartphone, LockKeyhole, Search, Megaphone, ListOrdered,
};

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

const SIZES = { small: "Pequeno", medium: "Médio", large: "Grande" } as const;
const ACCENTS = { apollo: "Laranja Apollo", blue: "Azul", teal: "Verde", violet: "Violeta" } as const;
type MenuSize = keyof typeof SIZES;
type MenuAccent = keyof typeof ACCENTS;
type MenuTheme = "light" | "dark";

interface MenuSettings {
  shortcuts: string[] | null;
  iconSize: MenuSize;
  buttonSize: MenuSize;
  accent: MenuAccent;
  theme: MenuTheme | null;
}

const DEFAULT_MENU: MenuSettings = { shortcuts: null, iconSize: "medium", buttonSize: "medium", accent: "apollo", theme: null };
const menuStorageKey = (id: string) => `apollo-menu:${id}`;
const validPaths = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((path): path is string => typeof path === "string" && NAV.some((item) => item.to === path)))]
  : null;
const isSize = (value: unknown): value is MenuSize => typeof value === "string" && Object.hasOwn(SIZES, value);
const isAccent = (value: unknown): value is MenuAccent => typeof value === "string" && Object.hasOwn(ACCENTS, value);

function readMenu(id: string): MenuSettings {
  try {
    const saved: Partial<MenuSettings> | null = JSON.parse(localStorage.getItem(menuStorageKey(id)) ?? "null");
    if (saved) return {
      shortcuts: validPaths(saved.shortcuts),
      iconSize: isSize(saved.iconSize) ? saved.iconSize : DEFAULT_MENU.iconSize,
      buttonSize: isSize(saved.buttonSize) ? saved.buttonSize : DEFAULT_MENU.buttonSize,
      accent: isAccent(saved.accent) ? saved.accent : DEFAULT_MENU.accent,
      theme: saved.theme === "light" || saved.theme === "dark" ? saved.theme : null,
    };
  } catch {
    return DEFAULT_MENU;
  }
  return DEFAULT_MENU;
}

function defaultShortcutOrder(items: NavItem[], operatorId: string) {
  let legacy: string[] = [];
  try {
    legacy = validPaths(JSON.parse(localStorage.getItem(`apollo-menu-shortcuts:${operatorId}`) ?? "null")) ?? [];
  } catch {
    // Invalid legacy data falls back to the standard menu order.
  }
  return [...new Set([...legacy, ...PRINCIPAL_SHORTCUTS, ...items.map((item) => item.to)])];
}

function MenuPreferences({ items, settings, defaults, theme, onChange, onReset }: {
  items: NavItem[];
  settings: MenuSettings;
  defaults: string[];
  theme: MenuTheme;
  onChange: (settings: MenuSettings) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const selected = settings.shortcuts ?? defaults;
  const ordered = selected.flatMap((path) => items.filter((item) => item.to === path));
  const unselected = items.filter((item) => !selected.includes(item.to));
  const labelFor = (item: NavItem) => PRINCIPAL_LABELS[item.to] ?? item.label;

  function toggle(path: string) {
    onChange({ ...settings, shortcuts: selected.includes(path)
      ? selected.filter((item) => item !== path) : [...selected, path] });
  }

  function move(index: number, offset: number) {
    const reordered = ordered.map((item) => item.to);
    const target = index + offset;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    onChange({ ...settings, shortcuts: [...reordered, ...selected.filter((path) => !reordered.includes(path) && !items.some((item) => item.to === path))] });
  }

  return <>
    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
      <Settings className="size-4 shrink-0" aria-hidden="true" /> Personalizar menu
    </Button>
    <Dialog open={editing} onOpenChange={setEditing}>
      <DialogContent className="flex max-h-[90dvh] max-w-xl flex-col overflow-hidden">
        <DialogTitle>Atalhos do meu menu</DialogTitle>
        <div data-testid="menu-preferences-options" className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain pr-1">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Tamanho dos ícones
              <select className="min-h-10 rounded-md border border-border bg-elevated px-2" value={settings.iconSize}
                onChange={(event) => { if (isSize(event.target.value)) onChange({ ...settings, iconSize: event.target.value }); }}>
                {Object.entries(SIZES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Tamanho dos botões
              <select className="min-h-10 rounded-md border border-border bg-elevated px-2" value={settings.buttonSize}
                onChange={(event) => { if (isSize(event.target.value)) onChange({ ...settings, buttonSize: event.target.value }); }}>
                {Object.entries(SIZES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Tema
              <select className="min-h-10 rounded-md border border-border bg-elevated px-2" value={theme}
                onChange={(event) => onChange({ ...settings, theme: event.target.value === "light" ? "light" : "dark" })}>
                <option value="light">Claro</option><option value="dark">Escuro</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">Cor do menu
              <select className="min-h-10 rounded-md border border-border bg-elevated px-2" value={settings.accent}
                onChange={(event) => { if (isAccent(event.target.value)) onChange({ ...settings, accent: event.target.value }); }}>
                {Object.entries(ACCENTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-semibold">Atalhos exibidos e ordem</legend>
            {[...ordered, ...unselected].map((item, index) => <div key={item.to} className="flex min-w-0 items-center gap-1 rounded-md px-2 hover:bg-muted">
              <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.includes(item.to)} onChange={() => toggle(item.to)} />
                <span className="wrap-anywhere">{labelFor(item)}</span>
              </label>
              {index < ordered.length && <>
                <Button type="button" size="icon-sm" variant="ghost" disabled={index === 0} aria-label={`Subir ${labelFor(item)}`} onClick={() => move(index, -1)}>↑</Button>
                <Button type="button" size="icon-sm" variant="ghost" disabled={index === ordered.length - 1} aria-label={`Descer ${labelFor(item)}`} onClick={() => move(index, 1)}>↓</Button>
              </>}
            </div>)}
          </fieldset>
        </div>
        <Button type="button" variant="outline" onClick={onReset}>Restaurar padrão</Button>
      </DialogContent>
    </Dialog>
  </>;
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
  const operatorId = me?.id;
  const savedMenu = useMemo(() => operatorId ? readMenu(operatorId) : DEFAULT_MENU, [operatorId]);
  const [editedMenu, setEditedMenu] = useState<{ id: string; settings: MenuSettings } | null>(null);
  const menu = editedMenu?.id === operatorId && editedMenu ? editedMenu.settings : savedMenu;
  const menuTheme = menu.theme ?? "dark";
  useEffect(() => {
    if (operatorId) setTheme(menuTheme);
  }, [operatorId, menuTheme, setTheme]);

  const saveMenu = (settings: MenuSettings) => {
    if (!operatorId) return;
    try {
      localStorage.setItem(menuStorageKey(operatorId), JSON.stringify(settings));
    } catch {
      toast.error("O dispositivo não pôde salvar o menu.");
      return;
    }
    setEditedMenu({ id: operatorId, settings });
  };
  const defaultOrder = useMemo(() => defaultShortcutOrder(NAV, operatorId ?? ""), [operatorId]);
  const backupChoice = useQuery({ queryKey: ["backup-destination"], queryFn: () => apiGet<{ destination: "pc" | "google_drive" | null }>("/settings/backup-destination"), enabled: me?.role === "admin", staleTime: 60000 });

  if (isLoading) return <div className="grid min-h-screen place-items-center text-zinc-500">Carregando…</div>;
  if (isError || !me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const items = NAV.filter((item) => item.roles.includes(me.role));
  const currentItem = items.find((item) => item.to === activePath(loc.pathname));
  const groups = RIBBON_GROUPS.filter(({ label }) => items.some((item) => ribbonGroup(item) === label) ||
    (label === "Principal" && items.some((item) => PRINCIPAL_SHORTCUTS.includes(item.to))));
  const visibleGroup = activeRibbon ?? (currentItem ? ribbonGroup(currentItem) : groups[0]?.label);
  const groupItems = items.filter((item) => ribbonGroup(item) === visibleGroup);
  const availableShortcuts = visibleGroup === "Principal"
    ? items.filter((item) => PRINCIPAL_SHORTCUTS.includes(item.to) || groupItems.includes(item))
    : groupItems;
  const shortcuts = (menu.shortcuts ?? defaultOrder).flatMap((path) => availableShortcuts.filter((item) => item.to === path));
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
        <header className="relative z-30 lg:sticky lg:top-0 @container border-b border-border bg-shell text-foreground" data-testid="apollo-ribbon" data-menu-accent={menu.accent}>
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
            <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={() => setOpen(true)} aria-label="Abrir todas as funções (Ctrl+K)" title="Buscar funções (Ctrl+K)" data-testid="mobile-menu-button"><Menu className="size-5" /></Button>
            <Brand />
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setMenuSearch(""); setOpen(true); }}><Search className="size-4" /> Pesquisar</Button>
              <OfflineBadge />
              <DisplayZoom />
              <MenuPreferences key={me.id} items={items} settings={menu} defaults={defaultOrder} theme={menuTheme}
                onChange={saveMenu} onReset={() => {
                  try {
                    localStorage.removeItem(`apollo-menu-shortcuts:${me.id}`);
                  } catch {
                    toast.error("O dispositivo não pôde restaurar o menu.");
                    return;
                  }
                  saveMenu({ ...DEFAULT_MENU, shortcuts: defaultShortcutOrder(NAV, me.id), theme: "dark" });
                }} />
              <button type="button" onClick={() => saveMenu({ ...menu, theme: resolvedTheme === "dark" ? "light" : "dark" })}
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
          {visibleGroup && <nav aria-label="Seções do sistema" data-testid="top-menu-groups" className="border-b border-border px-2 py-1 sm:px-4">
            <label className="flex items-center gap-2 @min-[46rem]:hidden">
              <span className="text-xs text-muted-foreground">Seção</span>
              <select aria-label="Seção do menu" value={visibleGroup} onChange={(event) => setActiveRibbon(groups.find(({ label }) => label === event.target.value)?.label ?? null)}
                className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-elevated px-2 text-sm font-semibold">
                {groups.map(({ label }) => <option key={label}>{label}</option>)}
              </select>
            </label>
            <div className="hidden items-stretch gap-1 @min-[46rem]:flex">
              {groups.map(({ label, icon: GroupIcon }) => (
                <button key={label} type="button" onClick={() => setActiveRibbon(label)} aria-pressed={visibleGroup === label}
                  className="flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-b-2 border-transparent px-2 text-xs font-semibold text-muted-foreground uppercase hover:bg-muted aria-pressed:border-[var(--apollo-menu-accent,var(--primary))] aria-pressed:bg-muted aria-pressed:text-foreground @min-[65rem]:px-3">
                  <GroupIcon className="hidden size-4 shrink-0 text-primary @min-[65rem]:block" aria-hidden="true" />{label}
                </button>
              ))}
            </div>
          </nav>}
          <RibbonShortcuts items={shortcuts} available={availableShortcuts} settings={menu} principal={visibleGroup === "Principal"} />
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

const SHORTCUT_COLORS: Record<string, string> = {
  "/caixa": "text-emerald-700 dark:text-emerald-400",
  "/mesas": "text-amber-700 dark:text-amber-400",
  "/delivery": "text-cyan-700 dark:text-cyan-400",
  "/pdv": "text-orange-700 dark:text-orange-400",
  "/comanda-mobile": "text-violet-700 dark:text-violet-400",
  "/qrcodes": "text-blue-700 dark:text-blue-400",
  "/clientes": "text-teal-700 dark:text-teal-400",
};

const ICON_SIZES = { small: "1rem", medium: "1.5rem", large: "2rem" };
const BUTTON_SIZES = { small: "2.75rem", medium: "3.5rem", large: "4.25rem" };

function RibbonShortcuts({ items, available, principal, settings }: {
  items: NavItem[]; available: NavItem[]; principal: boolean; settings: MenuSettings;
}) {
  const [open, setOpen] = useState(false);
  return <nav aria-label="Atalhos do sistema" data-testid="top-menu-shortcuts"
    style={{ "--menu-icon-size": ICON_SIZES[settings.iconSize], "--menu-button-size": BUTTON_SIZES[settings.buttonSize] } as CSSProperties}
    className="flex min-w-0 items-stretch gap-1 bg-elevated px-2 py-1 sm:px-4">
    <div className="flex min-w-0 flex-1 items-stretch gap-1 [&>a:nth-child(n+3)]:hidden @min-[29rem]:[&>a:nth-child(-n+4)]:flex @min-[46rem]:[&>a:nth-child(-n+6)]:flex @min-[64rem]:[&>a:nth-child(-n+8)]:flex @min-[85rem]:[&>a:nth-child(-n+10)]:flex">
      {items.map((item) => <RibbonShortcut key={item.to} item={item} label={principal ? PRINCIPAL_LABELS[item.to] : undefined} />)}
    </div>
    <Button type="button" variant="ghost" className="h-auto shrink-0 gap-1 px-2 text-xs" onClick={() => setOpen(true)}>
      <Ellipsis className="size-4" aria-hidden="true" /> Mais atalhos
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle>Atalhos da seção</DialogTitle>
        <div className="grid gap-1 sm:grid-cols-2">
          {available.map((item) => <RibbonShortcut key={item.to} item={item} label={principal ? PRINCIPAL_LABELS[item.to] : undefined} compact onNavigate={() => setOpen(false)} />)}
        </div>
      </DialogContent>
    </Dialog>
  </nav>;
}

function RibbonShortcut({ item, label = item.label, compact, onNavigate }: { item: NavItem; label?: string; compact?: boolean; onNavigate?: () => void }) {
  const Icon = label === "Fila de Atendimento" ? ListOrdered : ICONS[item.icon] ?? LayoutDashboard;
  return <NavLink to={label === "Fila de Atendimento" ? "/comanda-mobile?fila=1" : item.to} end={item.to === "/"} onClick={onNavigate}
    className={({ isActive }) => cn("flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs leading-tight hover:bg-muted",
      compact ? "justify-start text-left" : "min-h-(--menu-button-size) max-w-40 flex-col text-center",
      isActive ? "bg-muted text-foreground" : "text-muted-foreground")}>
    <Icon className={cn("shrink-0", compact ? "size-5" : "size-(--menu-icon-size)", SHORTCUT_COLORS[item.to] ?? "text-primary")} aria-hidden="true" />
    <span className="min-w-0 wrap-anywhere">{label}</span>
  </NavLink>;
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
