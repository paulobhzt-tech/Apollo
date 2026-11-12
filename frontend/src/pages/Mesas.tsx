import SaleQuantityInput from "@/components/SaleQuantityInput";
import { type SetStateAction, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Bell, Clock, Minus, Pencil, Plus, QrCode, Receipt, RefreshCw, Search, Send, Trash2, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import ProductGrid from "@/components/ProductGrid";
import OptionsDialog, { type Picked } from "@/components/OptionsDialog";
import PaymentDialog from "@/components/PaymentDialog";
import InvoiceDialog from "@/components/InvoiceDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { brl, canCancel, errMsg, fmtTime, kindLabel, minutesSince, tableLabel, uid } from "@/lib/format";
import { useOperatorDraft } from "@/lib/operator-draft";
import { queryClient } from "@/lib/queryClient";
import type { Category, ChosenOption, Invoice, KitchenTicket, Order, PayIn, Product, SaleResult, Table, TableIn } from "@/lib/types";
import { cn } from "@/lib/utils";
import { groupItems } from "@/lib/group";
import PreBillDialog from "@/components/PreBillDialog";
import RemoveItemDialog, { type RemoveRequest } from "@/components/RemoveItemDialog";
import { type GroupedItem } from "@/lib/group";
import { getReceiptPref, printSimpleReceipt } from "@/lib/receipt";

type Kind = Table["kind"];

const STATUS: Record<Table["status"], { label: string; cls: string; dot: string }> = {
  livre: { label: "Livre", cls: "border-emerald-400/25 bg-emerald-400/5", dot: "bg-emerald-400" },
  ocupada: { label: "Ocupada", cls: "border-amber-400/40 bg-amber-400/8", dot: "bg-amber-400" },
  conta: { label: "Conta pedida", cls: "border-cyan-400/40 bg-cyan-400/8", dot: "bg-cyan-400" },
  reservada: { label: "Reservada", cls: "border-violet-400/40 bg-violet-400/8", dot: "bg-violet-400" },
};

const invalidateTables = () => {
  void queryClient.invalidateQueries({ queryKey: ["tables"] });
  void queryClient.invalidateQueries({ queryKey: ["table-order"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
};

export default function Mesas() {
  const { data: me } = useMe();
  const { pathname, search } = useLocation();
  const mobileMode = pathname === "/comanda-mobile";
  const queueView = mobileMode && new URLSearchParams(search).get("fila") === "1";
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const tables = useQuery({ queryKey: ["tables"], queryFn: () => apiGet<Table[]>("/tables"), refetchInterval: 8000, refetchOnWindowFocus: "always" });
  const splitAlerts = useQuery({
    queryKey: ["pending-split-requests"],
    queryFn: () => apiGet<{ table_id: string; number: number; kind: string; subtotal: number }[]>("/tables/split-requests/pending"),
    enabled: me?.role === "admin" || me?.role === "caixa",
    refetchInterval: 8000,
  });
  const pendingSplits = splitAlerts.data ?? [];
  const [showReady, setShowReady] = useState(true);
  const readyTickets = useQuery({ queryKey: ["waiter-ready-tickets"], queryFn: () => apiGet<KitchenTicket[]>("/kds/tickets"), refetchInterval: 5000, enabled: mobileMode && showReady });
  const ready = (readyTickets.data ?? []).filter(ticket => ticket.status === "pronto");
  const myReady = ready.filter((ticket) => (tables.data ?? []).some((t) => t.order_id === ticket.order_id && t.waiter_id === me?.id));
  const [selId, setSelId] = useState<string | null>(null);
  const [drafts, setDrafts] = useOperatorDraft<Record<string, Pending[]>>(`apollo-table-drafts:${me?.id}`, {});
  useEffect(() => {
    if (!Object.keys(drafts).length) return;
    window.addEventListener("beforeunload", guardWorkspaceUnload);
    return () => window.removeEventListener("beforeunload", guardWorkspaceUnload);
  }, [drafts]);
  const [mobileSearch, setMobileSearch] = useState("");
  const [desktopSearch, setDesktopSearch] = useState("");
  const [desktopStatus, setDesktopStatus] = useState<"todas" | Table["status"]>("todas");
  const [desktopSort, setDesktopSort] = useState<"numero" | "tempo" | "valor">("numero");
  const [mobileFilter, setMobileFilter] = useState<"todas" | "minhas" | "ocupadas" | "livres">(queueView ? "ocupadas" : "todas");
  useEffect(() => { setMobileFilter(queueView ? "ocupadas" : "todas"); }, [queueView]);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [kind, setKind] = useState<Kind>("mesa");
  const [mobileSection, setMobileSection] = useState<"mesa" | "comanda" | "fechar">("mesa");
  const [creating, setCreating] = useState(false);
  const all = tables.isError ? [] : tables.data ?? [];
  const list = all.filter((t) => {
    if (t.kind !== kind && !(mobileMode && mobileSection === "fechar")) return false;
    if (mobileMode && mobileSection === "fechar" && t.status !== "ocupada" && t.status !== "conta") return false;
    if (!mobileMode) {
      const term = desktopSearch.trim().toLocaleLowerCase("pt-BR");
      if (desktopStatus !== "todas" && t.status !== desktopStatus) return false;
      return !term || [String(t.number), t.name ?? "", t.customer_name ?? ""].some((v) => v.toLocaleLowerCase("pt-BR").includes(term));
    }
    const term = mobileSearch.trim().toLocaleLowerCase("pt-BR");
    if (term && ![String(t.number), t.name ?? "", t.customer_name ?? ""].some((v) => v.toLocaleLowerCase("pt-BR").includes(term))) return false;
    if (mobileFilter === "minhas" && t.waiter_id !== me?.id) return false;
    if (mobileFilter === "ocupadas" && t.status !== "ocupada" && t.status !== "conta") return false;
    if (mobileFilter === "livres" && t.status !== "livre") return false;
    return true;
  });
  const sortedList = [...list].sort((a, b) => desktopSort === "valor" ? (b.total ?? 0) - (a.total ?? 0) || a.number - b.number : desktopSort === "tempo" ? (b.opened_at ? minutesSince(b.opened_at, clock) : 0) - (a.opened_at ? minutesSince(a.opened_at, clock) : 0) || a.number - b.number : a.number - b.number);
  const sel = tables.data?.find((t) => t.id === selId) ?? null;
  const keyForDraft = (table: Table) => table.order_id ? JSON.stringify([me?.id, table.id, table.order_id]) : null;
  const draftKey = sel ? keyForDraft(sel) : null;
  const storeDraft = (update: SetStateAction<Pending[]>) => {
    if (!draftKey) return;
    setDrafts((previous) => {
      const items = typeof update === "function" ? update(previous[draftKey] ?? []) : update;
      if (items.length) return { ...previous, [draftKey]: items };
      if (!previous[draftKey]) return previous;
      const next = { ...previous };
      delete next[draftKey];
      return next;
    });
  };
  const counts = list.reduce<Record<string, number>>((a, t) => ({ ...a, [t.status]: (a[t.status] ?? 0) + 1 }), {});
  const canCreate = me?.role === "admin" || me?.role === "caixa";

  return (
    <AppShell roles={["caixa", "garcom"]}>
      <PageHeader title={queueView ? "Fila de Atendimento" : mobileMode ? "Comanda Mobile" : "Mesas & Comandas"} subtitle={mobileMode ? "Atendimento do garçom · selecione a mesa para lançar pedidos e acompanhar o consumo" : "Toque em uma mesa ou comanda para lançar itens no celular ou tablet"} actions={
        <>
          {mobileMode ? <nav aria-label="Atendimento do garçom" className="grid w-full grid-cols-3 gap-1 rounded-xl border border-border p-1" data-testid="waiter-mobile-navigation">
            {([["mesa", "Mesas"], ["comanda", "Comandas"], ["fechar", "Fechar conta"]] as const).map(([section, label]) => <button key={section} type="button" aria-current={mobileSection === section ? "page" : undefined} className={cn("min-h-12 rounded-lg px-2 text-sm font-semibold", mobileSection === section ? "bg-primary text-white" : "bg-muted text-foreground")} onClick={() => { setMobileSection(section); setKind(section === "comanda" ? "comanda" : "mesa"); setMobileFilter("todas"); setMobileSearch(""); }} data-testid={`waiter-tab-${section}`}>{label}</button>)}
          </nav> : <div className="flex gap-1 rounded-xl border border-white/8 p-1">
            {(["mesa", "comanda"] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} data-testid={`kind-tab-${k}`} className={cn("rounded-lg px-4 py-1.5 text-sm", kind === k ? "bg-primary text-white" : "text-zinc-400 hover:text-white")}>{k === "mesa" ? "Mesas" : "Comandas"} ({all.filter((t) => t.kind === k).length})</button>)}
          </div>}
          {canCreate && (!mobileMode || mobileSection !== "fechar") && (
            <Button onClick={() => setCreating(true)} data-testid="new-table-open-button"><Plus className="size-4" /> Nova {kind === "mesa" ? "mesa" : "comanda"}</Button>
          )}
        </>
      } />
      {pendingSplits.length > 0 && (
        <div role="status" className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4" data-testid="pending-qr-splits">
          <p className="font-semibold text-amber-200">Divisões de conta aguardando o caixa ({pendingSplits.length})</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingSplits.map(request => <Button key={request.table_id} variant="outline" size="sm"
              onClick={() => { setKind(request.kind === "comanda" ? "comanda" : "mesa"); setSelId(request.table_id); }}>
              {request.kind === "comanda" ? "Comanda" : "Mesa"} {request.number} · {brl(request.subtotal)}
            </Button>)}
          </div>
          <p className="mt-2 text-xs text-zinc-400">Abra a mesa e selecione “Dividir conta por itens” para conferir a solicitação.</p>
        </div>
      )}
      {mobileMode && mobileSection === "fechar" && <p role="status" className="mb-3 rounded-xl border border-border bg-muted p-3 text-sm" data-testid="waiter-close-guidance">Selecione uma mesa ou comanda para conferir a pré-conta e solicitar o fechamento. O recebimento e a baixa financeira continuam autorizados somente ao caixa.</p>}
      {mobileMode && showReady && ready.length > 0 && (
        <div role="status" className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4" data-testid="mobile-ready-orders">
          <p className="font-semibold text-emerald-300">Pedidos prontos para entregar ({ready.length}){myReady.length > 0 && ` · ${myReady.length} de suas mesas`}</p>
          <ul className="mt-2 space-y-1 text-sm text-white">{ready.map(ticket => <li key={ticket.id}>#{ticket.order_number} · {ticket.label}</li>)}</ul>
          <Link to="/cozinha" className="mt-3 inline-block text-sm font-semibold text-emerald-300 underline">Abrir monitor de preparo</Link>
        </div>
      )}
      {mobileMode && <div className="mb-4 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3" data-testid="mobile-quick-filter">
        <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">Atendimento rápido</p><Button size="sm" variant="outline" onClick={() => { void tables.refetch(); if (showReady) void readyTickets.refetch(); }}>Atualizar</Button></div>
        <label className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showReady} onChange={(event) => setShowReady(event.target.checked)} /> Exibir avisos de pedidos prontos
        </label>
        <Input aria-label="Buscar mesa, comanda ou cliente" placeholder="Buscar número, mesa ou cliente..." value={mobileSearch} onChange={(e) => setMobileSearch(e.target.value)} data-testid="mobile-table-search" />
        <div className="flex flex-wrap gap-2">{([["todas", "Todas"], ["minhas", "Minhas mesas"], ["ocupadas", "Em atendimento"], ["livres", "Livres"]] as const).map(([value, label]) => <Button key={value} size="sm" variant={mobileFilter === value ? "default" : "outline"} onClick={() => setMobileFilter(value)}>{label}</Button>)}</div>
      </div>}
      {!mobileMode && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="tables-summary">
          {([
            { label: "Em andamento", status: "ocupada", color: "border-emerald-500/40 text-emerald-300" },
            { label: "Contas solicitadas", status: "conta", color: "border-amber-500/40 text-amber-300" },
            { label: "Livres", status: "livre", color: "border-zinc-500/40 text-zinc-200" },
            { label: "Reservadas", status: "reservada", color: "border-violet-500/40 text-violet-300" },
          ] as const).map(item => (
            <button key={item.status} type="button" onClick={() => setDesktopStatus(desktopStatus === item.status ? "todas" : item.status)}
              aria-pressed={desktopStatus === item.status} className={cn("rounded-md border bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/10", item.color, desktopStatus === item.status && "ring-2 ring-primary")}>
              <span className="block text-xs">{item.label}</span>
              <span className="mt-1 block text-2xl font-bold tabular-nums">{all.filter(t => t.kind === kind && t.status === item.status).length}</span>
            </button>
          ))}
        </div>
      )}
      {!mobileMode && (
        <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-white/10 pb-4" data-testid="desktop-tables-toolbar">
          <Input aria-label="Pesquisar mesas e comandas" placeholder="Pesquisar mesa, comanda ou cliente..." value={desktopSearch}
            onChange={(e) => setDesktopSearch(e.target.value)} className="w-full max-w-sm rounded-sm bg-zinc-900/60 sm:w-80" />
          <label className="flex items-center gap-2 text-xs text-zinc-300">Ordenar por
            <select aria-label="Ordenar mesas" value={desktopSort} onChange={(e) => setDesktopSort(e.target.value as typeof desktopSort)} className="rounded border border-white/15 bg-zinc-800 px-2 py-2 text-white">
              <option value="numero">Número</option><option value="tempo">Maior tempo</option><option value="valor">Maior valor</option>
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={() => void tables.refetch()} disabled={tables.isFetching} data-testid="refresh-tables"><RefreshCw className={cn("size-4", tables.isFetching && "animate-spin")} /> Atualizar</Button>
          {desktopStatus !== "todas" && <Button variant="ghost" size="sm" onClick={() => setDesktopStatus("todas")}>Limpar filtro</Button>}
          <div className="ml-auto hidden items-center gap-2 text-xs text-zinc-400 xl:flex">
            <span className="inline-block size-2 rounded-full bg-emerald-500" /> Em andamento
            <span className="ml-2 inline-block size-2 rounded-full bg-zinc-500" /> Livre
            <span className="ml-2 inline-block size-2 rounded-full bg-amber-500" /> Conta pedida
          </div>
        </div>
      )}
      {mobileMode && <div className="mb-4 flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5 text-zinc-400"><span className={cn("size-2 rounded-full", s.dot)} />{s.label} ({counts[k] ?? 0})</span>
        ))}
      </div>}
      {tables.isError && <div role="alert" className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">Não foi possível carregar as mesas. Confira a conexão e tente atualizar.</div>}
      {tables.isLoading && <p role="status" className="mb-3 text-sm text-zinc-400">Carregando mesas e comandas…</p>}
      {!tables.isLoading && !tables.isError && list.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500" data-testid="tables-empty">
          {mobileMode ? "Nenhuma mesa ou comanda corresponde aos filtros." : `Nenhuma ${kind} encontrada.`}
        </p>
      )}
      {([
        { title: "Pedidos em andamento", items: sortedList.filter(t => t.status === "ocupada"), color: "bg-[#298858]" },
        { title: "Contas solicitadas", items: sortedList.filter(t => t.status === "conta"), color: "bg-[#a87322]" },
        { title: "Mesas reservadas", items: list.filter(t => t.status === "reservada"), color: "bg-[#62518d]" },
        { title: kind === "mesa" ? "Mesas livres" : "Comandas livres", items: list.filter(t => t.status === "livre"), color: "bg-[#656565]" },
      ]).filter(group => group.items.length > 0).map(group => (
        <section key={group.title} className="mb-5" aria-label={group.title}>
          <h2 className="mb-3 text-sm font-semibold text-foreground">{group.title} ({group.items.length})</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 xl:grid-cols-10 2xl:grid-cols-12" data-testid="tables-grid">
            {group.items.map(t => (
              <button key={t.id} type="button" onClick={() => setSelId(t.id)}
                data-testid={`${t.kind === "comanda" ? "comanda" : "table"}-card-${t.number}`}
                className={cn("relative flex min-h-28 flex-col items-center justify-between p-2 text-center text-white transition-all hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", group.color)}>
                <span className="text-[10px] font-medium">{t.status === "livre" ? "ABRIR" : t.status === "reservada" ? "RESERVADA" :
                  [t.status === "conta" ? "CONTA" : "", t.opened_at ? `${minutesSince(t.opened_at, clock)} min` : ""].filter(Boolean).join(" · ")}</span>
                {t.call && <Bell className="absolute right-1 top-1 size-3 animate-pulse" aria-label="Chamada pendente" />}
                <span className="text-2xl font-bold tabular-nums">{String(t.number).padStart(2, "0")}</span>
                <span className="w-full truncate text-xs tabular-nums">{t.order_id ? brl(t.total) : (t.name || t.customer_name || " ")}</span>
                {t.waiter_name && t.order_id && <span className="w-full truncate text-[10px]" title={t.waiter_name}>{t.waiter_name}</span>}
                {drafts[keyForDraft(t) ?? ""]?.length > 0 && <span className="text-xs font-medium">Rascunho</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
      {canCreate && (!mobileMode || mobileSection !== "fechar") && !tables.isError && list.length > 0 && (
        <button type="button" onClick={() => setCreating(true)} data-testid="add-more-tile"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-5 text-sm text-zinc-400 transition-colors duration-150 hover:border-primary/50 hover:text-white">
          <Plus className="size-4" /> Adicionar mais {kind === "mesa" ? "mesas" : "comandas"}
        </button>
      )}
      {sel && <TableWorkspace key={sel.id} clock={clock} table={sel} onClose={() => setSelId(null)}
        onQr={setQrTable} qrOpen={!!qrTable} tables={all} canDelete={canCreate}
        draft={draftKey ? drafts[draftKey] : undefined} onDraftChange={storeDraft} />}
      <QrDialog table={qrTable} onClose={() => setQrTable(null)} />
      <NewTableDialog open={creating} kind={kind} existing={all.filter((t) => t.kind === kind)} onClose={() => setCreating(false)} />
    </AppShell>
  );
}

function NewTableDialog({ open, kind, existing, onClose }: { open: boolean; kind: Kind; existing: Table[]; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-white/10 bg-elevated sm:max-w-sm" data-testid="new-table-dialog">
        {open && <NewTableForm kind={kind} existing={existing} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function NewTableForm({ kind, existing, onClose }: { kind: Kind; existing: Table[]; onClose: () => void }) {
  const next = existing.reduce((m, t) => Math.max(m, t.number), kind === "comanda" ? 100 : 0) + 1;
  const [num, setNum] = useState(String(next));
  const [qty, setQty] = useState("1");
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("4");
  const create = useMutation({
    mutationFn: async () => {
      const start = Number(num);
      const n = Math.min(Math.max(Number(qty) || 1, 1), 50);
      for (let i = 0; i < n; i++) {
        const body: TableIn = { number: start + i, kind, name: n === 1 ? name : name ? `${name} ${i + 1}` : "", seats: Number(seats) || 1 };
        await apiPost<Table>("/tables", body);
      }
      return n;
    },
    onSuccess: (n) => { toast.success(`${n} ${kind === "mesa" ? "mesa(s)" : "comanda(s)"} criada(s)`); invalidateTables(); onClose(); },
    onError: (e) => { toast.error(errMsg(e)); invalidateTables(); },
  });
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">Nova {kind}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs text-zinc-400">Número inicial</Label><Input value={num} inputMode="numeric" onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} className="mt-1 font-mono" data-testid="new-table-number" /></div>
        <div><Label className="text-xs text-zinc-400">Quantidade</Label><Input value={qty} inputMode="numeric" onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className="mt-1 font-mono" data-testid="new-table-qty" /></div>
        <div className="col-span-2"><Label className="text-xs text-zinc-400">Nome (opcional)</Label><Input value={name} placeholder={kind === "mesa" ? "Ex: Varanda, Salão VIP" : "Ex: Balcão bar"} onChange={(e) => setName(e.target.value)} className="mt-1" data-testid="new-table-name" /></div>
        {kind === "mesa" && <div><Label className="text-xs text-zinc-400">Lugares</Label><Input value={seats} inputMode="numeric" onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))} className="mt-1 font-mono" data-testid="new-table-seats" /></div>}
      </div>
      <Button disabled={!Number(num) || create.isPending} onClick={() => create.mutate()} data-testid="new-table-save">
        {create.isPending ? "Criando…" : `Criar ${Number(qty) > 1 ? `${qty} ${kind}s` : kind}`}
      </Button>
    </>
  );
}

function RenameRow({ table, canDelete, onDeleted }: { table: Table; canDelete: boolean; onDeleted: () => void }) {
  const [name, setName] = useState(table.name);
  const save = useMutation({
    mutationFn: () => apiPut<Table>(`/tables/${table.id}`, { name, seats: table.seats }),
    onSuccess: () => { toast.success("Nome atualizado"); invalidateTables(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: () => apiDelete(`/tables/${table.id}`),
    onSuccess: () => { toast.success(`${kindLabel(table.kind)} removida`); invalidateTables(); onDeleted(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Input aria-label="Nome da mesa ou salão" className="min-w-0 grow basis-[12rem]" value={name} placeholder={`Nome da ${table.kind} (ex: Varanda, João)`} onChange={(e) => setName(e.target.value)} data-testid="table-rename-input" />
      <Button variant="outline" disabled={name === table.name || save.isPending} onClick={() => save.mutate()} data-testid="table-rename-save"><Pencil className="size-4" /> Salvar</Button>
      {canDelete && !table.order_id && (
        <Button variant="ghost" onClick={() => window.confirm(`Excluir ${tableLabel(table)}?`) && del.mutate()} data-testid="table-delete-button"><Trash2 className="size-4" /></Button>
      )}
    </div>
  );
}

export function QrDialog({ table, onClose }: { table: Table | null; onClose: () => void }) {
  const url = table ? `${window.location.origin}/cardapio/${table.id}` : "";
  return (
    <Dialog open={!!table} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-white/10 bg-elevated sm:max-w-sm" data-testid="qr-dialog">
        <DialogHeader><DialogTitle className="font-heading text-white">QR Code · {table ? tableLabel(table) : ""}</DialogTitle></DialogHeader>
        <div className="print-area flex flex-col items-center gap-3 rounded-2xl bg-white p-6 text-black">
          <p className="font-heading text-lg font-semibold">Espeteria Churras Buguer</p>
          {table && <QRCodeSVG value={url} size={200} data-testid="qr-code-svg" />}
          <p className="text-sm">{table ? tableLabel(table) : ""} · Aponte a câmera e peça pelo celular</p>
        </div>
        <p className="break-all text-center text-xs text-zinc-500" data-testid="qr-url">{url}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => window.print()} data-testid="qr-print-button">Imprimir</Button>
          <a href={url} target="_blank" rel="noreferrer" className="flex-1"><Button className="w-full" data-testid="qr-open-button">Abrir cardápio</Button></a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Pending { key: string; product: Product; qty: number; notes: string; options: ChosenOption[]; labels: string[]; extra: number; customerName: string }

function guardWorkspaceUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = true;
}

function TableWorkspace({ clock, table, onClose, onQr, qrOpen, tables, canDelete, draft, onDraftChange }: {
  clock: number; table: Table; onClose: () => void; onQr: (t: Table) => void; qrOpen: boolean;
  tables: Table[]; canDelete: boolean; draft?: Pending[]; onDraftChange: (items: SetStateAction<Pending[]>) => void;
}) {
  const { data: me } = useMe();
  const order = useQuery({
    queryKey: ["table-order", table.id, table.order_id],
    queryFn: () => apiGet<Order | null>(`/tables/${table!.id}/order`),
    enabled: !!table.order_id,
    refetchInterval: 8000,
  });
  const products = useQuery({ queryKey: ["products"], queryFn: () => apiGet<Product[]>("/products") });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories") });
  const [people, setPeople] = useState("2");
  const [name, setName] = useState("");
  const pending = draft ?? [];
  const setPending = onDraftChange;
  const [adding, setAdding] = useState(!!draft?.length);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  const [preBill, setPreBill] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [showItemTimes, setShowItemTimes] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [removing, setRemoving] = useState<GroupedItem | null>(null);

  const onErr = (e: unknown) => toast.error(errMsg(e));
  const openT = useMutation({
    mutationFn: () => apiPost<Table>(`/tables/${table!.id}/open`, { people: Number(people) || 1, customer_name: name }),
    onSuccess: () => { toast.success(`${tableLabel(table!)} aberta`); setAdding(true); invalidateTables(); },
    onError: (error) => { onErr(error); invalidateTables(); },
  });
  const send = useMutation({
    mutationFn: () => apiPost<Order>(`/tables/${table!.id}/items`, { items: pending.map((p) => ({ product_id: p.product.id, qty: p.qty, notes: p.notes, options: p.options, customer_name: p.customerName })) }),
    onSuccess: () => { toast.success("Itens enviados para a cozinha"); setReviewOpen(false); setPending([]); setAdding(false); invalidateTables(); },
    onError: onErr,
  });

  const removeItems = useMutation({
    mutationFn: async (r: RemoveRequest) => {
      for (const l of r.lines) await apiPost<Order>(`/tables/${table!.id}/items/${l.id}/cancel`, { reason: r.reason, manager_pin: r.manager_pin, qty: l.qty });
    },
    onSuccess: (_d, r) => { toast.success(`${r.lines.reduce((s, l) => s + l.qty, 0)} un. apagada(s)`); setRemoving(null); invalidateTables(); },
    onError: (e) => { onErr(e); invalidateTables(); },
  });
  const status = useMutation({
    mutationFn: (s: string) => apiPatch<Table>(`/tables/${table!.id}/status`, { status: s }),
    onSuccess: () => invalidateTables(),
    onError: onErr,
  });
  const release = useMutation({
    mutationFn: () => apiPost<Table>(`/tables/${table!.id}/release`),
    onSuccess: () => { toast.success(`${tableLabel(table!)} liberada`); invalidateTables(); onClose(); },
    onError: onErr,
  });
  const cancelTable = useMutation({
    mutationFn: (b: { reason: string; manager_pin?: string }) => apiPost<Table>(`/tables/${table!.id}/cancel`, b),
    onSuccess: () => { toast.success(`${tableLabel(table!)} cancelada e liberada`); invalidateTables(); onClose(); },
    onError: onErr,
  });
  const clearCall = useMutation({ mutationFn: () => apiPost<Table>(`/tables/${table!.id}/clear-call`), onSuccess: invalidateTables });
  const transfer = useMutation({
    mutationFn: () => apiPost<Table>(`/tables/${table!.id}/transfer`, { target_table_id: transferTo }),
    onSuccess: (t) => { toast.success(`Transferida para ${tableLabel(t)}`); setTransferTo(""); invalidateTables(); onClose(); },
    onError: onErr,
  });
  const merge = useMutation({
    mutationFn: () => apiPost<Table>(`/tables/${table!.id}/merge`, { target_table_id: mergeTo }),
    onSuccess: (t) => { toast.success(`Comandas reunidas em ${tableLabel(t)}`); setMergeTo(""); invalidateTables(); onClose(); },
    onError: onErr,
  });
  const pay = useMutation({
    mutationFn: (p: PayIn) => apiPost<SaleResult>(`/tables/${table!.id}/pay`, p),
    onSuccess: (r) => {
      toast.success(`${tableLabel(table!)} fechada${r.order.change ? ` · Troco ${brl(r.order.change)}` : ""}`);
      setPayOpen(false); invalidateTables();
      if (getReceiptPref()) void printSimpleReceipt(r.order);
      if (r.invoice) setInvoice(r.invoice);
    },
    onError: onErr,
  });

  const [optFor, setOptFor] = useState<Product | null>(null);
  const push = (p: Product, picked?: Picked) => setPending((c) => {
    if (!picked) {
      const i = c.findIndex((l) => l.product.id === p.id && !l.notes && !l.options.length && !l.customerName);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: Math.min(99, Number((l.qty + 1).toFixed(4))) } : l));
    }
    return [...c, { key: uid(), product: p, qty: 1, notes: "", customerName: "", options: picked?.options ?? [], labels: picked?.labels ?? [], extra: picked?.extra ?? 0 }];
  });
  const addPending = (p: Product) => (p.options?.length ? setOptFor(p) : push(p));
  const o = table?.order_id ? order.data ?? null : null;
  const items = (o?.items ?? []);
  const visibleProducts = (products.data ?? []).filter((p) => p.active && (p.channels?.includes("comanda") ?? true) && (!productSearch.trim() || [p.name, p.code, p.description].some((v) => v?.toLocaleLowerCase("pt-BR").includes(productSearch.trim().toLocaleLowerCase("pt-BR")))));

  const busy = openT.isPending || send.isPending || removeItems.isPending || status.isPending ||
    release.isPending || cancelTable.isPending || transfer.isPending || merge.isPending || pay.isPending;
  const nestedOpen = qrOpen || partialOpen || payOpen || preBill || !!invoice || !!removing || !!optFor;
  const editingOpening = !table.order_id && (people !== "2" || !!name.trim());
  const [editingCustomers, setEditingCustomers] = useState(false);
  const requestClose = () => {
    if (busy || nestedOpen || queryClient.isMutating()) return;
    if ((editingOpening || editingCustomers) && !window.confirm("Descartar os dados de atendimento ainda não salvos?")) return;
    onClose();
  };
  useEffect(() => {
    if (!busy && !partialOpen) return;
    const guard = (event: BeforeUnloadEvent) => guardWorkspaceUnload(event);
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy, partialOpen]);

  const content = (
          <div className="@container min-w-0 text-foreground">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 pr-14">
              <div className="min-w-0 wrap-anywhere">
                <DialogTitle className="font-heading text-xl leading-tight" data-testid="table-sheet-title">
                  Atendimento — {kindLabel(table.kind)} {table.number}
                </DialogTitle>
                {table.name && <p className="mt-1 text-sm font-medium">{table.name}</p>}
                <p className="mt-1 text-sm text-muted-foreground">{STATUS[table.status].label}{o ? ` · Pedido #${o.number}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={requestClose} disabled={busy || partialOpen} data-testid="table-workspace-close">Voltar</Button>
              </div>
            </header>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] @min-[50rem]:grid-cols-[minmax(12rem,1fr)_minmax(0,3fr)]">
              <aside className="min-w-0 space-y-3 border-b border-border bg-muted/30 p-4 wrap-anywhere @min-[50rem]:border-r @min-[50rem]:border-b-0">
                <p className="flex items-start gap-2 text-sm"><Clock className="size-4 shrink-0" /> <span>{table.opened_at ? `${minutesSince(table.opened_at, clock)} min de ocupação · desde ${fmtTime(table.opened_at)}` : "Aguardando abertura"}</span></p>
                <p className="flex items-start gap-2 text-sm"><Users className="size-4 shrink-0" /> <span>{table.people ?? 0} cliente(s){table.waiter_name ? ` · Garçom: ${table.waiter_name}` : " · Garçom não atribuído"}</span></p>
                {table.customer_name && <p className="text-sm text-muted-foreground">{table.customer_name}</p>}
                <Button variant="outline" onClick={() => onQr(table)} data-testid="table-qr-button"><QrCode className="size-4" /> QR {table.kind === "mesa" ? "da mesa" : "da comanda"}</Button>
              </aside>
              <div className="min-w-0 p-4 wrap-anywhere [&_button]:whitespace-normal">
              <RenameRow key={table.id + table.name} table={table} canDelete={canDelete} onDeleted={onClose} />

              {table.call && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-orange-200">
                  <span className="flex items-center gap-2"><Bell className="size-4" /> Cliente {table.call === "conta" ? "pediu a conta" : "chamou o garçom"}</span>
                  <Button size="xs" variant="outline" onClick={() => clearCall.mutate()} data-testid="table-clear-call">Atendido</Button>
                </div>
              )}

              {!table.order_id ? (
                <div className="mt-6 space-y-4 rounded-2xl border border-white/5 bg-panel p-4">
                  <p className="text-sm text-zinc-300">Abrir {table.kind === "comanda" ? "comanda" : "mesa"}</p>
                  <div className="grid gap-3 @min-[35rem]:grid-cols-2">
                    <div><Label htmlFor="table-people" className="text-sm text-muted-foreground">Pessoas</Label><Input id="table-people" value={people} onChange={(e) => setPeople(e.target.value)} inputMode="numeric" className="mt-1" data-testid="open-table-people-input" /></div>
                    <div><Label htmlFor="table-customer" className="text-sm text-muted-foreground">Cliente</Label><Input id="table-customer" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" data-testid="open-table-name-input" /></div>
                  </div>
                  <Button className="w-full" onClick={() => openT.mutate()} disabled={openT.isPending} data-testid="open-table-button">Abrir {table.kind === "comanda" ? "comanda" : "mesa"}</Button>
                  <div className="flex flex-wrap gap-2">
                    {(["livre", "ocupada", "reservada"] as const).map((st) => (
                      <Button key={st} size="sm" variant={table.status === st ? "default" : "outline"} disabled={status.isPending}
                        onClick={() => status.mutate(st)} data-testid={`table-status-${st}`}>{STATUS[st].label}</Button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <TableCustomers key={table.id + (table.order_id ?? "")} table={table} onDirtyChange={setEditingCustomers} />
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2"><strong className="text-sm text-foreground">Itens do Pedido ({items.filter((i) => !i.cancelled).reduce((s, i) => s + i.qty, 0)})</strong></div>
                    <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Itens · {items.filter((i) => !i.cancelled).reduce((s, i) => s + i.qty, 0)} un.</span>
                    <button type="button" onClick={() => setGrouped((g) => !g)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300 transition-colors duration-150 hover:border-primary/50" data-testid="toggle-group-items">
                      {grouped ? "Ver item a item (cancelar)" : "Agrupar quantidades"}
                    </button>
                  </div>
                  <label className="mt-2 flex min-h-10 items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showItemTimes} onChange={(event) => setShowItemTimes(event.target.checked)} data-testid="toggle-item-times" /> Mostrar horário dos lançamentos</label>
                  {grouped ? (
                    <div className="mt-2 space-y-0 divide-y divide-white/10 rounded-sm border border-white/10" data-testid="table-order-grouped">
                      {groupItems(items).map((g) => (
                        <div key={g.key} className="flex flex-wrap items-center gap-3 bg-muted/35 px-3 py-3 text-sm" data-testid="grouped-line">
                          <span className="min-w-8 font-mono text-primary" data-testid="grouped-line-qty">{g.qty}x</span>
                          <div className="min-w-0 grow basis-[8rem]">
                            <p className="wrap-anywhere text-foreground">{g.name}</p>
                            {g.options.length > 0 && <p className="truncate text-xs text-primary">{g.options.join(" · ")}</p>}
                            {g.notes.length > 0 && <p className="truncate text-xs text-amber-300">{g.notes.join(" · ")}</p>}
                            <p className="text-xs text-zinc-400">Cliente: {g.customer_name || "Mesa inteira"}{g.ordered_by ? ` · Lançado por: ${g.ordered_by}` : ""}{showItemTimes && g.lines.some((line) => line.ordered_at) ? ` · Horário: ${g.lines.filter((line) => line.ordered_at).map((line) => fmtTime(line.ordered_at!)).join(", ")}` : ""}</p>
                          </div>
                          <span className="font-mono text-xs text-zinc-500">{brl(g.unit_price)}</span>
                          <span className="font-mono text-zinc-200">{brl(g.total)}</span>
                          <button type="button" onClick={() => setRemoving(g)} aria-label={`Apagar ${g.name}`} data-testid={`grouped-remove-${g.lines[0]?.id}`}
                            className="rounded-lg p-1 text-zinc-500 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="size-4" /></button>
                        </div>
                      ))}
                      {items.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Comanda vazia. Adicione itens.</p>}
                    </div>
                  ) : (
                  <div className="mt-2 space-y-2" data-testid="table-order-items">
                    {items.map((i) => (
                      <div key={i.id} className={cn("flex items-center gap-3 rounded-xl bg-panel px-3 py-2.5 text-sm", i.cancelled && "opacity-40 line-through")}>
                        <span className="font-mono text-zinc-400">{i.qty}x</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-foreground">{i.name}</p>
                          {i.options?.length > 0 && <p className="truncate text-xs text-primary">{i.options.join(" · ")}</p>}
                          {(i.notes || i.cancel_reason) && <p className="truncate text-xs text-amber-300">{i.cancel_reason || i.notes}</p>}
                          <p className="text-xs text-zinc-400">Cliente: {i.customer_name || "Mesa inteira"}{i.ordered_by ? ` · Lançado por: ${i.ordered_by}` : ""}{showItemTimes && i.ordered_at ? ` · Horário: ${fmtTime(i.ordered_at)}` : ""}</p>
                        </div>
                        <span className="font-mono text-zinc-200">{brl(i.qty * i.unit_price)}</span>
                        {!i.cancelled && (
                          <button type="button" data-testid={`cancel-item-${i.id}`} aria-label={`Apagar ${i.name}`}
                            onClick={() => setRemoving(groupItems([i])[0] ?? null)}><Trash2 className="size-4 text-zinc-500 hover:text-red-400" /></button>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Comanda vazia. Adicione itens.</p>}
                  </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-y border-white/10 bg-muted/35 px-3 py-4">
                    <span className="text-sm text-zinc-400">Subtotal (+10% serviço opcional)</span>
                    <span className="font-mono text-2xl text-foreground" data-testid="table-order-total">{brl(o?.total ?? table.total)}</span>
                  </div>

                  {adding ? (
                    <fieldset disabled={send.isPending} className="mt-4 min-w-0 space-y-3 rounded-2xl border border-primary/20 bg-panel p-3">
                      <label className="flex items-center gap-2 rounded-md border border-white/15 bg-background px-3"><Search className="size-4 text-zinc-400" /><Input autoFocus aria-label="Buscar produto na comanda" placeholder="Buscar produto por nome ou código..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="border-0 bg-transparent shadow-none" data-testid="table-product-search" /></label>
                      <ProductGrid products={visibleProducts} categories={categories.data ?? []} onAdd={addPending} compact />
                      {visibleProducts.length === 0 && <p className="text-xs text-amber-200">Nenhum produto encontrado. Confira o nome ou código.</p>}
                      <p className="text-xs text-zinc-400">Novo pedido: ajuste quantidades, cliente e observações antes de revisar. O operador será registrado automaticamente.</p>
                      {pending.map((p, i) => (
                        <div key={p.key} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`pending-line-${i}`}>
                          <Button size="icon-xs" variant="outline" onClick={() => setPending((c) => c.flatMap((x, j) => j !== i ? [x] : x.qty <= 1 ? [] : [{ ...x, qty: Number((x.qty - 1).toFixed(4)) }]))}><Minus /></Button>
                          <SaleQuantityInput qty={p.qty} unit={p.product.sale_unit}
                            onChange={(qty) => setPending((current) => current.map((line) => line.key === p.key ? { ...line, qty } : line))} />
                          <Button size="icon-xs" variant="outline" onClick={() => setPending((c) => c.map((x, j) => (j === i ? { ...x, qty: Math.min(99, Number((x.qty + 1).toFixed(4))) } : x)))}><Plus /></Button>
                          <span className="min-w-0 basis-full wrap-anywhere">{p.product.name}{p.labels.length > 0 && <span className="block text-xs text-primary">{p.labels.join(" · ")}</span>}</span>
                          <select aria-label="Cliente responsável pelo item" value={p.customerName} onChange={e => setPending(old => old.map((line, j) => j === i ? { ...line, customerName: e.target.value } : line))}
                            className="w-full min-w-0 rounded-md border border-white/15 bg-panel px-2 py-1 text-xs" data-testid={`pending-customer-${i}`}>
                            <option value="">Mesa inteira</option>
                            {(table.customers ?? []).map(customer => <option key={customer} value={customer}>{customer}</option>)}
                          </select>
                          <Input value={p.notes} placeholder="Observação: sem cebola, ponto da carne..." aria-label={`Observação do item ${p.product.name}`} onChange={(e) => setPending((c) => c.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))} className="w-full text-sm" data-testid={`pending-notes-${i}`} />
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" disabled={send.isPending} onClick={() => {
                          if (!pending.length || window.confirm("Descartar os itens ainda não enviados?")) { setAdding(false); setPending([]); }
                        }}>Cancelar</Button>
                        <Button className="flex-1" disabled={!pending.length || send.isPending} onClick={() => setReviewOpen(true)} data-testid="send-to-kitchen-button">
                          <Send className="size-4" /> Revisar {pending.reduce((s, p) => s + p.qty, 0)} itens
                        </Button>
                      </div>
                    </fieldset>
                  ) : (
                    <Button className="mt-4 h-auto min-h-12" onClick={() => { setProductSearch(""); setAdding(true); }} data-testid="add-items-button"><Plus className="size-4" /> Adicionar produtos</Button>
                  )}

                  <div className="mt-3 grid gap-2 @min-[35rem]:grid-cols-2">
                    <Button variant="outline" onClick={() => setPreBill(true)} disabled={!items.some((i) => !i.cancelled)} data-testid="request-bill-button">
                      <Receipt className="size-4" /> Pré-conta
                    </Button>
                    {me?.role === "garcom" && <Button className="h-auto min-h-12" variant="outline" onClick={() => { if (window.confirm("Solicitar fechamento desta conta ao caixa?")) status.mutate("conta"); }} disabled={status.isPending || !!pending.length || !items.some((i) => !i.cancelled) || table.status === "conta"} data-testid="waiter-request-close"><Receipt className="size-4" /> {table.status === "conta" ? "Conta solicitada" : "Solicitar fechamento"}</Button>}
                    <Button className="h-auto min-h-12 bg-emerald-700 font-semibold text-white hover:bg-emerald-600" onClick={() => setPayOpen(true)} disabled={!!pending.length || !items.some((i) => !i.cancelled) || !["admin", "caixa"].includes(me?.role ?? "") || pay.isPending} data-testid="close-table-button">
                      <Receipt className="size-4" /> PAGAMENTO
                    </Button>
                  </div>
                  {["admin", "caixa"].includes(me?.role ?? "") && <Button className="mt-2 w-full" variant="outline" disabled={!!pending.length || !items.some((i) => !i.cancelled)} onClick={() => setPartialOpen(true)}>Dividir por cliente ou itens</Button>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Select value={transferTo} onValueChange={(v: string) => setTransferTo(v)}>
                      <SelectTrigger className="min-w-0 flex-1" data-testid="transfer-select"><SelectValue placeholder="Transferir para…">{(v) => v ? (() => { const x = tables.find((t) => t.id === v); return x ? tableLabel(x) : ""; })() : "Transferir para…"}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {tables.filter((t) => t.status === "livre").map((t) => <SelectItem key={t.id} value={t.id}>{tableLabel(t)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" disabled={!!pending.length || transfer.isPending || !transferTo} onClick={() => transfer.mutate()} data-testid="transfer-button"><ArrowRightLeft className="size-4" /></Button>
                  </div>
                  {(me?.role === "admin" || me?.role === "caixa") && <div className="mt-3 space-y-2 rounded-lg border border-white/10 p-3" data-testid="merge-tables-panel">
                    <p className="text-xs text-zinc-300">Juntar contas — escolha a mesa que receberá todos os itens</p>
                    <div className="flex flex-wrap gap-2">
                      <Select value={mergeTo} onValueChange={(v: string) => setMergeTo(v)}>
                        <SelectTrigger className="min-w-0 flex-1" data-testid="merge-select"><SelectValue placeholder="Mesa de destino">{(v) => v ? (() => { const x = tables.find(t => t.id === v); return x ? tableLabel(x) : ""; })() : "Mesa de destino"}</SelectValue></SelectTrigger>
                        <SelectContent>{tables.filter(t => t.id !== table.id && !!t.order_id).map(t => <SelectItem key={t.id} value={t.id}>{tableLabel(t)}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button variant="outline" data-testid="merge-button" disabled={!!pending.length || !mergeTo || merge.isPending} onClick={() => { const dst = tables.find(t => t.id === mergeTo); if (dst && window.confirm(`Juntar ${tableLabel(table)} em ${tableLabel(dst)}? Os itens serão transferidos e a mesa de origem será liberada.`)) merge.mutate(); }}>Juntar</Button>
                    </div>
                    <p className="text-xs text-zinc-500">Disponível para caixa e administrador. Requer banco de dados com transações.</p>
                  </div>}
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button size="sm" variant="outline" disabled={status.isPending}
                      onClick={() => status.mutate(table.status === "conta" ? "ocupada" : "conta")} data-testid="table-toggle-status-button">
                      {table.status === "conta" ? "Voltar p/ ocupada" : "Marcar conta"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={!!pending.length || release.isPending || items.some((i) => !i.cancelled)}
                      title={items.some((i) => !i.cancelled) ? "Só libera sem consumo: feche a conta ou cancele" : ""}
                      onClick={() => release.mutate()} data-testid="table-release-button">Liberar</Button>
                    <Button size="sm" variant="destructive" disabled={!!pending.length || cancelTable.isPending} data-testid="table-cancel-button" onClick={() => {
                      const reason = window.prompt(`Motivo do cancelamento de ${tableLabel(table)}:`);
                      if (!reason || reason.trim().length < 3) return;
                      const manager_pin = canCancel(me) ? undefined : window.prompt("Sem permissão. PIN do gerente para autorizar:") ?? "";
                      cancelTable.mutate({ reason, manager_pin });
                    }}>Cancelar {table.kind === "comanda" ? "comanda" : "mesa"}</Button>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
  );

  return (
    <>
      <Dialog open onOpenChange={(value) => { if (!value) requestClose(); }} disablePointerDismissal>
        <DialogContent overlayClassName="bg-black/55"
          className="w-[calc(100%-1rem)] max-h-[90dvh] max-w-[min(calc(100%-1rem),900px)] grid-cols-[minmax(0,1fr)] gap-0 overflow-y-auto overscroll-contain border border-border bg-elevated p-0 sm:max-w-[min(calc(100%-2rem),900px)]"
          data-testid="table-sheet">
          {content}
        </DialogContent>
      </Dialog>
      <Dialog open={reviewOpen} onOpenChange={(open) => { if (!send.isPending) setReviewOpen(open); }}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" data-testid="waiter-review-dialog">
          <DialogHeader><DialogTitle>Revisar pedido antes de enviar</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{tableLabel(table)} · Confira itens, quantidades e observações. Nenhum item foi enviado ainda.</p>
          <div className="space-y-2">{pending.map((p) => <div key={p.key} className="rounded-lg border border-border p-3 text-sm"><div className="flex justify-between gap-3"><strong>{p.qty} × {p.product.name}</strong><span>{brl(p.qty * p.product.price)}</span></div>{p.labels.length > 0 && <p className="text-muted-foreground">{p.labels.join(" · ")}</p>}{p.customerName && <p>Cliente: {p.customerName}</p>}{p.notes.trim() && <p className="font-medium text-amber-500">Obs.: {p.notes}</p>}</div>)}</div>
          <p className="text-right font-semibold">Total dos novos itens: {brl(pending.reduce((sum, p) => sum + p.qty * p.product.price, 0))}</p>
          <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" disabled={send.isPending} onClick={() => setReviewOpen(false)}>Editar itens</Button><Button type="button" disabled={!pending.length || send.isPending} onClick={() => send.mutate()} data-testid="waiter-confirm-send"><Send className="size-4" /> Confirmar envio</Button></div>
        </DialogContent>
      </Dialog>
      <RemoveItemDialog group={removing} needsPin={!canCancel(me)} pending={removeItems.isPending} onClose={() => setRemoving(null)} onConfirm={(r) => removeItems.mutate(r)} />
      {table && preBill && (
        <PreBillDialog table={table} order={o} open={preBill} onClose={() => setPreBill(false)}
          onPrinted={() => { if (table.status !== "conta") status.mutate("conta"); setPreBill(false); }} />
      )}
      {table && <PartialBillDialog key={table.id} table={table} items={items} open={partialOpen} onClose={() => setPartialOpen(false)} />}
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} subtotal={o?.subtotal ?? 0} items={o?.items.filter((item) => !item.cancelled)} defaultService={10}
        title={`Fechamento · ${table ? tableLabel(table) : ""}`} pending={pay.isPending} onConfirm={(p) => pay.mutate(p)} />
      <InvoiceDialog invoice={invoice} onClose={() => setInvoice(null)} />
      <OptionsDialog product={optFor} onClose={() => setOptFor(null)} onConfirm={push} />
    </>
  );
}

interface PartialBillPreview {
  order_id: string;
  subtotal: number;
  remaining_subtotal: number;
  items: { item_id: string; name: string; qty: number }[];
}

function PartialBillDialog({ table, items, open, onClose }: { table: Table; items: Order["items"]; open: boolean; onClose: () => void }) {
  const tableId = table.id;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const customers = table.customers ?? [];
  const selectCustomer = (name: string) => {
    setSelectedCustomer(name);
    setQuantities(name ? Object.fromEntries(items.filter(i => !i.cancelled && i.customer_name === name).map(i => [i.id, i.qty])) : {});
    setPreview(null);
  };
  const [preview, setPreview] = useState<PartialBillPreview | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [clientRef, setClientRef] = useState(() => uid());
  const request = useQuery({
    queryKey: ["table-split-request", tableId],
    queryFn: () => apiGet<{ request: { id: string; quantities: Record<string, number>; subtotal: number } | null }>(`/tables/${tableId}/split-request`),
    enabled: open,
    refetchInterval: 8000,
  });
  const dismiss = useMutation({
    mutationFn: () => apiDelete(`/tables/${tableId}/split-request`),
    onSuccess: () => { toast.success("Solicitação removida"); void request.refetch(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const importRequest = () => {
    const q = request.data?.request?.quantities;
    if (!q) return;
    const valid = Object.fromEntries(items.filter(i => !i.cancelled && q[i.id] > 0).map(i => [i.id, Math.min(i.qty, q[i.id])]));
    if (!Object.keys(valid).length) { toast.error("Itens não estão mais disponíveis"); return; }
    setSelectedCustomer(""); setQuantities(valid); setPreview(null);
    toast.info("Itens carregados. Confira e calcule antes de receber.");
  };
  const available = items.filter((i) => !i.cancelled);
  const calculation = useMutation({
    mutationFn: (selection: Record<string, number>) => apiPost<PartialBillPreview>(
      `/tables/${tableId}/partial-bill/preview`, { quantities: selection }),
    onSuccess: setPreview,
    onError: (e) => toast.error(errMsg(e)),
  });
  const payment = useMutation({
    mutationFn: ({ payment: p, quote }: { payment: PayIn; quote: PartialBillPreview }) =>
      apiPost<SaleResult>(`/tables/${tableId}/partial-bill/pay`, {
        quantities: Object.fromEntries(quote.items.map(item => [item.item_id, item.qty])),
        payment: { ...p, emit_invoice: false },
        client_ref: clientRef,
        customer_name: selectedCustomer,
        expected_order_id: quote.order_id,
        expected_subtotal: quote.subtotal,
      }),
    onSuccess: (result) => {
      toast.success(`Pagamento parcial registrado: ${brl(result.order.total)}`);
      if (getReceiptPref()) void printSimpleReceipt(result.order);
      setPayOpen(false); setPreview(null); setQuantities({}); setSelectedCustomer(""); setClientRef(uid());
      invalidateTables(); void queryClient.invalidateQueries({ queryKey: ["pending-split-requests"] }); onClose();
    },
    onError: (e) => {
      toast.error(errMsg(e));
      if (e instanceof ApiError && e.status === 409) {
        setPayOpen(false); setPreview(null); invalidateTables();
      }
    },
  });
  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto border-white/10 bg-elevated sm:max-w-lg">
        <DialogHeader><DialogTitle>Divisão da conta por itens</DialogTitle></DialogHeader>
        <p className="text-sm text-zinc-400">Selecione um cliente para carregar automaticamente os itens dele. Confira os itens compartilhados antes de receber.</p>
        <div className="space-y-1">
          <Label htmlFor="partial-bill-customer">Cliente responsável pelo pagamento</Label>
          <select id="partial-bill-customer" disabled={calculation.isPending || payOpen} value={selectedCustomer} onChange={e => selectCustomer(e.target.value)}
            className="w-full min-w-0 rounded-md border border-white/15 bg-panel p-3 text-sm" data-testid="partial-bill-customer">
            <option value="">Seleção manual / itens compartilhados</option>
            {customers.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        {request.data?.request && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3" data-testid="cashier-qr-split-request">
          <p className="text-sm font-semibold text-amber-200">Divisão solicitada pelo QR Code</p>
          <p className="mt-1 text-sm">Valor informado pelo cliente: {brl(request.data.request.subtotal)}</p>
          <p className="mt-1 text-xs text-zinc-400">Confira os itens e preços atuais antes de receber.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" className="h-auto min-h-8 whitespace-normal" disabled={calculation.isPending || payOpen} onClick={importRequest}>Carregar itens solicitados</Button>
            <Button size="sm" variant="outline" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>Descartar</Button>
          </div>
        </div>}
        <div className="space-y-2">
          {available.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-panel p-3">
              <span className="min-w-0 text-sm wrap-anywhere">{item.name} · {brl(item.unit_price)} (até {item.qty})<span className="block text-xs text-zinc-400">{item.customer_name || "Mesa inteira"}</span></span>
              <Input className="w-20 shrink-0" type="number" min={0} max={item.qty} step={item.sale_unit === "kg" || item.sale_unit === "L" ? "0.0001" : "1"} disabled={calculation.isPending || payOpen || (!!selectedCustomer && !!item.customer_name && item.customer_name !== selectedCustomer)} value={quantities[item.id] ?? 0}
                onChange={(e) => { setQuantities((old) => ({ ...old, [item.id]: Math.max(0, Math.min(item.qty, Number(e.target.value) || 0)) })); setPreview(null); }} />
            </div>
          ))}
        </div>
        <Button disabled={calculation.isPending || !Object.values(quantities).some((v) => v > 0)}
          onClick={() => calculation.mutate(Object.fromEntries(Object.entries(quantities).filter(([, qty]) => qty > 0)))}>Calcular divisão</Button>
        {preview && <div className="rounded-xl border border-white/10 p-3 text-sm">
          <p>Selecionado: <strong>{brl(preview.subtotal)}</strong></p>
          <p>Restante na mesa: <strong>{brl(preview.remaining_subtotal)}</strong></p>
          <p className="mt-2 text-amber-300">Pagamento parcial não fiscal. Descontos e taxa de serviço disponíveis; fiado não habilitado.</p>
          <Button className="mt-3 h-auto min-h-9 w-full whitespace-normal" onClick={() => setPayOpen(true)}>Receber itens selecionados</Button>
        </div>}
      </DialogContent>
    </Dialog>
    <PaymentDialog open={payOpen} onOpenChange={setPayOpen} subtotal={preview?.subtotal ?? 0} items={preview?.items} defaultService={10} partialMode title="Recebimento parcial (não fiscal)" pending={payment.isPending} onConfirm={(p) => { if (preview) payment.mutate({ payment: p, quote: preview }); }} />
    </>
  );
}

function TableCustomers({ table, onDirtyChange }: { table: Table; onDirtyChange: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<string[]>(table.customers?.length ? table.customers : table.customer_name ? [table.customer_name] : []);
  const [names, setNames] = useState(saved);
  useEffect(() => {
    onDirtyChange(Boolean(draft.trim()) || JSON.stringify(names) !== JSON.stringify(saved));
    return () => onDirtyChange(false);
  }, [draft, names, onDirtyChange, saved]);
  const save = useMutation({
    mutationFn: (customers: string[]) => apiPut<Table>(`/tables/${table.id}/customers`, { customers }),
    onSuccess: (updated) => { setSaved(updated.customers ?? []); setNames(updated.customers ?? []); invalidateTables(); toast.success("Clientes da mesa atualizados"); },
    onError: (error) => toast.error(errMsg(error)),
  });
  const add = () => {
    const name = draft.trim();
    if (!name || name.length > 80 || names.some(n => n.toLowerCase() === name.toLowerCase())) {
      toast.error("Informe um nome válido, sem duplicar clientes"); return;
    }
    if (names.length >= 50) { toast.error("Limite de 50 clientes por mesa"); return; }
    setNames(old => [...old, name]); setDraft("");
  };
  return <section className="mt-4 rounded-xl border border-white/10 bg-panel p-3" data-testid="table-customers">
    <p className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4" /> Clientes nesta mesa ({names.length})</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {names.map((name, index) => <span key={index} className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs">
        {name}<button type="button" aria-label={`Remover ${name}`} onClick={() => setNames(old => old.filter((_, i) => i !== index))} className="text-red-300">×</button>
      </span>)}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Input className="min-w-0 grow basis-[12rem]" value={draft} maxLength={80} placeholder="Nome do cliente" onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} data-testid="table-customer-name" />
      <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>Adicionar</Button>
    </div>
    <Button className="mt-2 w-full" type="button" disabled={save.isPending} onClick={() => save.mutate(names)} data-testid="table-save-customers">Salvar clientes</Button>
    <p className="mt-2 text-xs text-zinc-400">Todos compartilham a mesma mesa e comanda. A divisão de pagamentos continua disponível no caixa.</p>
  </section>;
}
