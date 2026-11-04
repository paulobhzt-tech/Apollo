import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Bell, Clock, Minus, Pencil, Plus, QrCode, Receipt, Send, Trash2, Users, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import ProductGrid from "@/components/ProductGrid";
import PaymentDialog from "@/components/PaymentDialog";
import InvoiceDialog from "@/components/InvoiceDialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { brl, canCancel, errMsg, fmtTime, kindLabel, minutesSince, tableLabel } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { Category, Invoice, Order, PayIn, Product, SaleResult, Table, TableIn } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const tables = useQuery({ queryKey: ["tables"], queryFn: () => apiGet<Table[]>("/tables"), refetchInterval: 8000 });
  const [selId, setSelId] = useState<string | null>(null);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [kind, setKind] = useState<Kind>("mesa");
  const [creating, setCreating] = useState(false);
  const all = tables.isError ? [] : tables.data ?? [];
  const list = all.filter((t) => t.kind === kind);
  const sel = all.find((t) => t.id === selId) ?? null;
  const counts = list.reduce<Record<string, number>>((a, t) => ({ ...a, [t.status]: (a[t.status] ?? 0) + 1 }), {});
  const canCreate = me?.role === "admin" || me?.role === "caixa";

  return (
    <AppShell roles={["caixa", "garcom"]}>
      <PageHeader title="Mesas & Comandas" subtitle="Toque em uma mesa ou comanda para lançar itens no celular ou tablet" actions={
        <>
          <div className="flex gap-1 rounded-xl border border-white/8 p-1">
            {(["mesa", "comanda"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} data-testid={`kind-tab-${k}`}
                className={cn("rounded-lg px-4 py-1.5 text-sm transition-colors duration-150", kind === k ? "bg-primary text-white" : "text-zinc-400 hover:text-white")}>
                {k === "mesa" ? "Mesas" : "Comandas"} ({all.filter((t) => t.kind === k).length})
              </button>
            ))}
          </div>
          {canCreate && (
            <Button onClick={() => setCreating(true)} data-testid="new-table-open-button"><Plus className="size-4" /> Nova {kind === "mesa" ? "mesa" : "comanda"}</Button>
          )}
        </>
      } />
      <div className="mb-4 flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5 text-zinc-400"><span className={cn("size-2 rounded-full", s.dot)} />{s.label} ({counts[k] ?? 0})</span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6" data-testid="tables-grid">
        {list.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-zinc-500" data-testid="tables-empty">
            Nenhuma {kind} cadastrada.{canCreate && " Clique em “Nova " + kind + "” para criar."}
          </p>
        )}
        {list.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelId(t.id)}
            data-testid={`${t.kind === "comanda" ? "comanda" : "table"}-card-${t.number}`}
            className={cn("relative rounded-2xl border p-4 text-left transition-transform duration-200 hover:-translate-y-0.5 animate-rise", STATUS[t.status].cls)}
          >
            {t.call && (
              <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white animate-pulse-ring" data-testid={`table-call-${t.number}`}>
                <Bell className="size-3" />{t.call === "conta" ? "Conta" : "Garçom"}
              </span>
            )}
            <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">{kindLabel(t.kind)}</p>
            <p className="font-heading text-4xl font-semibold text-white">{String(t.number).padStart(2, "0")}</p>
            {t.name && <p className="truncate text-sm font-medium text-primary" data-testid={`table-name-${t.number}`}>{t.name}</p>}
            <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-300"><span className={cn("size-2 rounded-full", STATUS[t.status].dot)} />{STATUS[t.status].label}</p>
            {t.order_id ? (
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1"><Users className="size-3" />{t.people}</span>
                <span className="flex items-center gap-1"><Clock className="size-3" />{minutesSince(t.opened_at)}min</span>
                <span className="font-mono text-sm text-white">{brl(t.total)}</span>
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">{t.customer_name || `${t.seats} lugares`}</p>
            )}
          </button>
        ))}
      </div>
      <TableSheet table={sel} onClose={() => setSelId(null)} onQr={setQrTable} tables={all} canDelete={canCreate} />
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
    <div className="mt-4 flex gap-2">
      <Input value={name} placeholder={`Nome da ${table.kind} (ex: Varanda, João)`} onChange={(e) => setName(e.target.value)} data-testid="table-rename-input" />
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

interface Pending { product: Product; qty: number; notes: string }

function TableSheet({ table, onClose, onQr, tables, canDelete }: { table: Table | null; onClose: () => void; onQr: (t: Table) => void; tables: Table[]; canDelete: boolean }) {
  const open = !!table;
  const { data: me } = useMe();
  const order = useQuery({
    queryKey: ["table-order", table?.id],
    queryFn: () => apiGet<Order | null>(`/tables/${table!.id}/order`),
    enabled: open && !!table?.order_id,
    refetchInterval: 8000,
  });
  const products = useQuery({ queryKey: ["products"], queryFn: () => apiGet<Product[]>("/products"), enabled: open });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories"), enabled: open });
  const [people, setPeople] = useState("2");
  const [name, setName] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [adding, setAdding] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [transferTo, setTransferTo] = useState("");

  const onErr = (e: unknown) => toast.error(errMsg(e));
  const openT = useMutation({
    mutationFn: () => apiPost<Table>(`/tables/${table!.id}/open`, { people: Number(people) || 1, customer_name: name }),
    onSuccess: () => { toast.success(`${tableLabel(table!)} aberta`); setAdding(true); invalidateTables(); },
    onError: onErr,
  });
  const send = useMutation({
    mutationFn: () => apiPost<Order>(`/tables/${table!.id}/items`, { items: pending.map((p) => ({ product_id: p.product.id, qty: p.qty, notes: p.notes })) }),
    onSuccess: () => { toast.success("Itens enviados para a cozinha"); setPending([]); setAdding(false); invalidateTables(); },
    onError: onErr,
  });
  const cancelItem = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiPost<Order>(`/tables/${table!.id}/items/${id}/cancel`, { reason }),
    onSuccess: () => { toast.success("Item cancelado"); invalidateTables(); },
    onError: onErr,
  });
  const status = useMutation({
    mutationFn: (s: string) => apiPatch<Table>(`/tables/${table!.id}/status`, { status: s }),
    onSuccess: () => invalidateTables(),
    onError: onErr,
  });
  const clearCall = useMutation({ mutationFn: () => apiPost<Table>(`/tables/${table!.id}/clear-call`), onSuccess: invalidateTables });
  const transfer = useMutation({
    mutationFn: () => apiPost<Table>(`/tables/${table!.id}/transfer`, { target_table_id: transferTo }),
    onSuccess: (t) => { toast.success(`Transferida para ${tableLabel(t)}`); setTransferTo(""); invalidateTables(); onClose(); },
    onError: onErr,
  });
  const pay = useMutation({
    mutationFn: (p: PayIn) => apiPost<SaleResult>(`/tables/${table!.id}/pay`, p),
    onSuccess: (r) => {
      toast.success(`${tableLabel(table!)} fechada${r.order.change ? ` · Troco ${brl(r.order.change)}` : ""}`);
      setPayOpen(false); invalidateTables(); onClose();
      if (r.invoice) setInvoice(r.invoice);
    },
    onError: onErr,
  });

  const addPending = (p: Product) => setPending((c) => {
    const i = c.findIndex((x) => x.product.id === p.id);
    return i >= 0 ? c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)) : [...c, { product: p, qty: 1, notes: "" }];
  });
  const o = table?.order_id ? order.data ?? null : null;
  const items = (o?.items ?? []);

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) { onClose(); setAdding(false); setPending([]); } }}>
        <SheetContent side="right" className="w-full overflow-y-auto border-white/5 bg-shell p-0 sm:max-w-xl" data-testid="table-sheet">
          {table && (
            <div className="flex min-h-full flex-col p-5">
              <div className="flex items-start justify-between pr-8">
                <div>
                  <SheetTitle className="font-heading text-2xl text-white" data-testid="table-sheet-title">{tableLabel(table)}</SheetTitle>
                  <p className="text-sm text-zinc-400">
                    {STATUS[table.status].label}
                    {table.waiter_name && ` · ${table.waiter_name}`}
                    {table.opened_at && ` · aberta ${fmtTime(table.opened_at)}`}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onQr(table)} data-testid="table-qr-button"><QrCode className="size-4" /> QR</Button>
              </div>
              <RenameRow key={table.id + table.name} table={table} canDelete={canDelete} onDeleted={onClose} />

              {table.call && (
                <div className="mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-orange-200">
                  <span className="flex items-center gap-2"><Bell className="size-4" /> Cliente {table.call === "conta" ? "pediu a conta" : "chamou o garçom"}</span>
                  <Button size="xs" variant="outline" onClick={() => clearCall.mutate()} data-testid="table-clear-call">Atendido</Button>
                </div>
              )}

              {!table.order_id ? (
                <div className="mt-6 space-y-4 rounded-2xl border border-white/5 bg-panel p-4">
                  <p className="text-sm text-zinc-300">Abrir {table.kind === "comanda" ? "comanda" : "mesa"}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs text-zinc-400">Pessoas</Label><Input value={people} onChange={(e) => setPeople(e.target.value)} inputMode="numeric" className="mt-1" data-testid="open-table-people-input" /></div>
                    <div><Label className="text-xs text-zinc-400">Cliente</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" data-testid="open-table-name-input" /></div>
                  </div>
                  <Button className="w-full" onClick={() => openT.mutate()} disabled={openT.isPending} data-testid="open-table-button">Abrir {table.kind === "comanda" ? "comanda" : "mesa"}</Button>
                  <div className="flex gap-2">
                    {table.status === "reservada"
                      ? <Button variant="outline" size="sm" onClick={() => status.mutate("livre")} data-testid="table-unreserve-button">Liberar reserva</Button>
                      : <Button variant="outline" size="sm" onClick={() => status.mutate("reservada")} data-testid="table-reserve-button">Marcar reservada</Button>}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-5 space-y-2" data-testid="table-order-items">
                    {items.map((i) => (
                      <div key={i.id} className={cn("flex items-center gap-3 rounded-xl bg-panel px-3 py-2.5 text-sm", i.cancelled && "opacity-40 line-through")}>
                        <span className="font-mono text-zinc-400">{i.qty}x</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-white">{i.name}</p>
                          {(i.notes || i.cancel_reason) && <p className="truncate text-xs text-amber-300">{i.cancel_reason || i.notes}</p>}
                        </div>
                        <span className="font-mono text-zinc-200">{brl(i.qty * i.unit_price)}</span>
                        {!i.cancelled && canCancel(me) && (
                          <button type="button" data-testid={`cancel-item-${i.id}`} onClick={() => {
                            const reason = window.prompt("Motivo do cancelamento:");
                            if (reason && reason.trim().length >= 3) cancelItem.mutate({ id: i.id, reason });
                          }}><X className="size-4 text-zinc-500 hover:text-red-400" /></button>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Comanda vazia. Adicione itens.</p>}
                  </div>
                  <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-3">
                    <span className="text-sm text-zinc-400">Subtotal (+10% serviço opcional)</span>
                    <span className="font-mono text-2xl text-white" data-testid="table-order-total">{brl(o?.total ?? table.total)}</span>
                  </div>

                  {adding ? (
                    <div className="mt-4 space-y-3 rounded-2xl border border-primary/20 bg-panel p-3">
                      <ProductGrid products={products.data ?? []} categories={categories.data ?? []} onAdd={addPending} compact />
                      {pending.map((p, i) => (
                        <div key={p.product.id} className="flex items-center gap-2 text-sm" data-testid={`pending-line-${i}`}>
                          <Button size="icon-xs" variant="outline" onClick={() => setPending((c) => c.flatMap((x, j) => j !== i ? [x] : x.qty <= 1 ? [] : [{ ...x, qty: x.qty - 1 }]))}><Minus /></Button>
                          <span className="w-5 text-center font-mono">{p.qty}</span>
                          <Button size="icon-xs" variant="outline" onClick={() => addPending(p.product)}><Plus /></Button>
                          <span className="flex-1 truncate">{p.product.name}</span>
                          <Input value={p.notes} placeholder="Obs." onChange={(e) => setPending((c) => c.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))} className="h-7 w-28 text-xs" data-testid={`pending-notes-${i}`} />
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => { setAdding(false); setPending([]); }}>Cancelar</Button>
                        <Button className="flex-1" disabled={!pending.length || send.isPending} onClick={() => send.mutate()} data-testid="send-to-kitchen-button">
                          <Send className="size-4" /> Enviar {pending.reduce((s, p) => s + p.qty, 0)} itens
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button className="mt-4 h-12" onClick={() => setAdding(true)} data-testid="add-items-button"><Plus className="size-4" /> Adicionar itens</Button>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => status.mutate("conta")} disabled={table.status === "conta"} data-testid="request-bill-button">
                      <Receipt className="size-4" /> Pré-conta
                    </Button>
                    <Button variant="secondary" onClick={() => setPayOpen(true)} disabled={!items.some((i) => !i.cancelled)} data-testid="close-table-button">
                      Fechar conta
                    </Button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Select value={transferTo} onValueChange={(v: string) => setTransferTo(v)}>
                      <SelectTrigger className="flex-1" data-testid="transfer-select"><SelectValue placeholder="Transferir para…">{(v) => v ? (() => { const x = tables.find((t) => t.id === v); return x ? tableLabel(x) : ""; })() : "Transferir para…"}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {tables.filter((t) => t.status === "livre").map((t) => <SelectItem key={t.id} value={t.id}>{tableLabel(t)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" disabled={!transferTo} onClick={() => transfer.mutate()} data-testid="transfer-button"><ArrowRightLeft className="size-4" /></Button>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} subtotal={o?.subtotal ?? 0} defaultService={10}
        title={`Fechamento · ${table ? tableLabel(table) : ""}`} pending={pay.isPending} onConfirm={(p) => pay.mutate(p)} />
      <InvoiceDialog invoice={invoice} onClose={() => setInvoice(null)} />
    </>
  );
}
