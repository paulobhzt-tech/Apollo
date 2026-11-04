import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { brl, errMsg, payLabel } from "@/lib/format";
import { usePayMethods } from "@/lib/payMethods";
import { queryClient } from "@/lib/queryClient";
import type { AccountCategory, Bill, BillIn, BillKind, BillPayIn, BillSummary, OkOut, Supplier, FiadoCustomer } from "@/lib/types";
import { cn } from "@/lib/utils";

const today = () => new Date().toLocaleDateString("sv-SE");
const fmtD = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const num = (s: string) => Number(s.replace(",", ".")) || 0;
const inv = () => { void queryClient.invalidateQueries({ queryKey: ["bills"] }); void queryClient.invalidateQueries({ queryKey: ["bills-summary"] }); };
type Filter = "aberto" | "vencido" | "pago" | "todas";

export default function Contas() {
  const kind: BillKind = useLocation().pathname.includes("receber") ? "receber" : "pagar";
  const T = kind === "pagar" ? { title: "Contas a Pagar", party: "Fornecedor", act: "Pagar", done: "Paga" } : { title: "Contas a Receber", party: "Cliente", act: "Receber", done: "Recebida" };
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const [filter, setFilter] = useState<Filter>("aberto");
  const [editing, setEditing] = useState<Bill | "new" | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const bills = useQuery({ queryKey: ["bills", kind], queryFn: () => apiGet<Bill[]>(`/bills?kind=${kind}`) });
  const sum = useQuery({ queryKey: ["bills-summary"], queryFn: () => apiGet<BillSummary>("/bills/summary") });
  const act = useMutation({
    mutationFn: async ({ b, a }: { b: Bill; a: "reopen" | "cancel" | "delete" }): Promise<unknown> => (a === "delete" ? apiDelete<OkOut>(`/bills/${b.id}`) : apiPost<Bill>(`/bills/${b.id}/${a}`)),
    onSuccess: () => { toast.success("Conta atualizada"); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const t = today();
  const list = (bills.data ?? []).filter((b) =>
    filter === "todas" ? true : filter === "pago" ? b.status === "pago" : filter === "vencido" ? b.status === "aberto" && b.due_date < t : b.status === "aberto");
  const total = list.reduce((s, b) => s + (b.status === "pago" ? b.paid_amount : b.amount), 0);
  const s = sum.data;
  const cards = kind === "pagar"
    ? [["Em aberto", s?.pagar_aberto], ["Vencidas", s?.pagar_vencido], ["Vencem hoje", s?.pagar_hoje]]
    : [["Em aberto", s?.receber_aberto], ["Vencidas", s?.receber_vencido], ["Fiado a receber", s?.fiado_aberto]];

  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title={T.title} subtitle={kind === "pagar" ? "Boletos, fornecedores e despesas com vencimento. As pagas entram no DRE." : "Valores a receber com vencimento (encomendas, eventos, convênios). As recebidas entram no DRE."}
        actions={isAdmin && <Button onClick={() => setEditing("new")} data-testid="bill-new-button"><Plus className="size-4" /> Nova conta</Button>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {cards.map(([l, v], i) => (
          <div key={l as string} className={cn("rounded-2xl border border-white/5 bg-panel px-4 py-3", i === 1 && (v as number) > 0 && "border-red-400/30")} data-testid={`bill-card-${i}`}>
            <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">{l}</p>
            <p className={cn("mt-1 font-mono text-2xl", i === 1 && (v as number) > 0 ? "text-red-300" : "text-white")}>{brl((v as number) ?? 0)}</p>
          </div>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(["aberto", "vencido", "pago", "todas"] as Filter[]).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} data-testid={`bill-filter-${f}`}
            className={cn("rounded-full border px-3 py-1 text-sm transition-colors duration-150", filter === f ? "border-primary bg-primary/15 text-white" : "border-white/10 text-zinc-400 hover:border-white/30")}>
            {{ aberto: "Em aberto", vencido: "Vencidas", pago: kind === "pagar" ? "Pagas" : "Recebidas", todas: "Todas" }[f]}
          </button>
        ))}
        <span className="ml-auto text-sm text-zinc-400" data-testid="bill-list-total">{list.length} conta(s) · {brl(total)}</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-panel">
        <Table>
          <TableHeader><TableRow><TableHead>Vencimento</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead>{T.party}</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {list.map((b) => {
              const late = b.status === "aberto" && b.due_date < t;
              return (
                <TableRow key={b.id} data-testid={`bill-row-${b.id}`}>
                  <TableCell className={cn("font-mono text-sm", late ? "text-red-300" : "text-zinc-300")}>{fmtD(b.due_date)}</TableCell>
                  <TableCell><p className="text-white">{b.description}</p>{b.notes && <p className="text-xs text-zinc-500">{b.notes}</p>}</TableCell>
                  <TableCell className="text-zinc-300">{b.category_name || "—"}</TableCell>
                  <TableCell className="text-zinc-300">{b.party || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-white">{brl(b.status === "pago" ? b.paid_amount : b.amount)}</TableCell>
                  <TableCell data-testid={`bill-status-${b.id}`}>
                    {b.status === "pago" ? <Badge className="bg-emerald-500/15 text-emerald-300">{T.done} {fmtD(b.paid_date)} · {payLabel(b.payment_method)}</Badge>
                      : b.status === "cancelado" ? <Badge variant="outline">Cancelada</Badge>
                      : late ? <Badge className="bg-red-500/15 text-red-300">Vencida</Badge> : <Badge variant="outline">Em aberto</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {b.status === "aberto" && <Button size="sm" onClick={() => setPaying(b)} data-testid={`bill-pay-${b.id}`}><CheckCircle2 className="size-3.5" /> {T.act}</Button>}
                    {isAdmin && b.status === "aberto" && <Button size="icon-sm" variant="ghost" onClick={() => setEditing(b)} data-testid={`bill-edit-${b.id}`}><Pencil /></Button>}
                    {isAdmin && b.status === "aberto" && <Button size="icon-sm" variant="ghost" title="Cancelar" onClick={() => window.confirm("Cancelar esta conta?") && act.mutate({ b, a: "cancel" })} data-testid={`bill-cancel-${b.id}`}><Ban /></Button>}
                    {isAdmin && b.status !== "aberto" && <Button size="icon-sm" variant="ghost" title="Reabrir" onClick={() => act.mutate({ b, a: "reopen" })} data-testid={`bill-reopen-${b.id}`}><RotateCcw /></Button>}
                    {isAdmin && <Button size="icon-sm" variant="ghost" onClick={() => window.confirm("Apagar esta conta?") && act.mutate({ b, a: "delete" })} data-testid={`bill-delete-${b.id}`}><Trash2 /></Button>}
                  </TableCell>
                </TableRow>
              );
            })}
            {!list.length && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-zinc-500" data-testid="bills-empty">Nenhuma conta neste filtro.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-lg" data-testid="bill-dialog">
          {editing && <BillForm kind={kind} bill={editing === "new" ? null : editing} partyLabel={T.party} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!paying} onOpenChange={(v) => !v && setPaying(null)}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-sm" data-testid="bill-pay-dialog">
          {paying && <PayForm bill={paying} label={T.act} onClose={() => setPaying(null)} />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function BillForm({ kind, bill, partyLabel, onClose }: { kind: BillKind; bill: Bill | null; partyLabel: string; onClose: () => void }) {
  const cats = useQuery({ queryKey: ["account-categories"], queryFn: () => apiGet<AccountCategory[]>("/account-categories") });
  const parties = useQuery({
    queryKey: [kind === "pagar" ? "suppliers" : "customers"],
    queryFn: async (): Promise<{ id: string; name: string }[]> => (kind === "pagar" ? apiGet<Supplier[]>("/suppliers") : apiGet<FiadoCustomer[]>("/customers")),
  });
  const [f, setF] = useState({ description: bill?.description ?? "", category_id: bill?.category_id ?? "", party: bill?.party ?? "", amount: bill ? String(bill.amount) : "", due_date: bill?.due_date ?? today(), notes: bill?.notes ?? "", repeat: "1" });
  const save = useMutation({
    mutationFn: () => {
      const body: BillIn = { kind, description: f.description, category_id: f.category_id, party: f.party, amount: num(f.amount), due_date: f.due_date, notes: f.notes, repeat_months: Math.max(1, Math.min(24, Number(f.repeat) || 1)) };
      return bill ? apiPut<Bill>(`/bills/${bill.id}`, body).then((b) => [b]) : apiPost<Bill[]>("/bills", body);
    },
    onSuccess: () => { toast.success(bill ? "Conta atualizada" : "Conta lançada"); inv(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const myCats = (cats.data ?? []).filter((c) => c.kind === kind);
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{bill ? "Editar conta" : kind === "pagar" ? "Nova conta a pagar" : "Nova conta a receber"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label className="text-xs text-zinc-400">Descrição</Label><Input className="mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={kind === "pagar" ? "Ex.: Boleto carne semana" : "Ex.: Encomenda festa"} data-testid="bill-description-input" /></div>
        <div><Label className="text-xs text-zinc-400">Valor (R$)</Label><Input className="mt-1 font-mono" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="bill-amount-input" /></div>
        <div><Label className="text-xs text-zinc-400">Vencimento</Label><Input className="mt-1" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} data-testid="bill-due-input" /></div>
        <div><Label className="text-xs text-zinc-400">Categoria</Label>
          <Select value={f.category_id || "__none"} onValueChange={(v: string) => setF({ ...f, category_id: v === "__none" ? "" : v })}>
            <SelectTrigger className="mt-1 w-full" data-testid="bill-category-select"><SelectValue>{(v) => myCats.find((c) => c.id === v)?.name ?? "Sem categoria"}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="__none">Sem categoria</SelectItem>{myCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs text-zinc-400">{partyLabel}</Label>
          <Input className="mt-1" list="bill-parties" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} placeholder="Digite ou escolha" data-testid="bill-party-input" />
          <datalist id="bill-parties">{(parties.data ?? []).map((p) => <option key={p.id} value={p.name} />)}</datalist></div>
        {!bill && <div><Label className="text-xs text-zinc-400">Repetir por (meses)</Label><Input className="mt-1" inputMode="numeric" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value.replace(/\D/g, "") })} data-testid="bill-repeat-input" /></div>}
        <div className="sm:col-span-2"><Label className="text-xs text-zinc-400">Observações</Label><Textarea className="mt-1" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="bill-notes-input" /></div>
      </div>
      <Button className="mt-2 h-11" disabled={f.description.trim().length < 2 || num(f.amount) <= 0 || !f.due_date || save.isPending} onClick={() => save.mutate()} data-testid="bill-save-button">Salvar</Button>
    </>
  );
}

function PayForm({ bill, label, onClose }: { bill: Bill; label: string; onClose: () => void }) {
  const methods = usePayMethods();
  const [f, setF] = useState({ paid_date: today(), amount: String(bill.amount), method: "pix" });
  const pay = useMutation({
    mutationFn: () => apiPost<Bill>(`/bills/${bill.id}/pay`, { paid_date: f.paid_date, paid_amount: num(f.amount), payment_method: f.method } satisfies BillPayIn),
    onSuccess: () => { toast.success(`Conta ${label === "Pagar" ? "paga" : "recebida"}`); inv(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const opts = (methods.data ?? []).filter((m) => m.active && m.key !== "fiado");
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{label}: {bill.description}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label className="text-xs text-zinc-400">Valor {label === "Pagar" ? "pago" : "recebido"}</Label><Input className="mt-1 font-mono" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="bill-paid-amount-input" /></div>
        <div><Label className="text-xs text-zinc-400">Data</Label><Input className="mt-1" type="date" value={f.paid_date} onChange={(e) => setF({ ...f, paid_date: e.target.value })} data-testid="bill-paid-date-input" /></div>
        <div><Label className="text-xs text-zinc-400">Forma de pagamento</Label>
          <Select value={f.method} onValueChange={(v: string) => setF({ ...f, method: v })}>
            <SelectTrigger className="mt-1 w-full" data-testid="bill-method-select"><SelectValue>{(v) => opts.find((m) => m.key === v)?.name ?? payLabel(v as string)}</SelectValue></SelectTrigger>
            <SelectContent>{opts.map((m) => <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>)}<SelectItem value="boleto">Boleto</SelectItem><SelectItem value="transferencia">Transferência</SelectItem></SelectContent>
          </Select></div>
      </div>
      <Button className="mt-2 h-11" disabled={num(f.amount) <= 0 || pay.isPending} onClick={() => pay.mutate()} data-testid="bill-pay-confirm-button"><CheckCircle2 className="size-4" /> Confirmar</Button>
    </>
  );
}
