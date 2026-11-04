import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { HandCoins, History, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { apiGet, apiPost } from "@/lib/api";
import { BRAND_LABEL, brl, errMsg, fmtDateTime, payLabel } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { CardBrand, CustomerMove, FiadoCustomer, FiadoCustomerIn } from "@/lib/types";
import { cn } from "@/lib/utils";

const inv = () => ["customers", "customer-moves", "cash"].forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));
const num = (s: string) => Number(s.replace(",", ".")) || 0;
const MOVE: Record<CustomerMove["type"], { label: string; cls: string; sign: string }> = {
  compra: { label: "Compra fiado", cls: "text-red-300", sign: "+" },
  pagamento: { label: "Pagamento", cls: "text-emerald-300", sign: "−" },
  estorno: { label: "Estorno", cls: "text-sky-300", sign: "−" },
};

export default function Fiado() {
  const q = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<FiadoCustomer[]>("/customers") });
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<FiadoCustomer | null>(null);
  const [history, setHistory] = useState<FiadoCustomer | null>(null);
  const list = (q.data ?? []).filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));
  const owed = (q.data ?? []).reduce((t, c) => t + c.balance, 0);

  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Conta Fiado" subtitle="Clientes com crédito na casa: quem deve, quanto e o histórico de cada um" actions={
        <>
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <Input placeholder="Buscar cliente" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 pl-9" data-testid="fiado-search-input" /></div>
          <Button onClick={() => setCreating(true)} data-testid="fiado-new-customer-button"><Plus className="size-4" /> Novo cliente</Button>
        </>
      } />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total a receber" value={brl(owed)} testid="fiado-total-owed" accent="text-red-300" />
        <Stat label="Clientes devendo" value={String((q.data ?? []).filter((c) => c.balance > 0.009).length)} hint={`${q.data?.length ?? 0} cadastrados`} testid="fiado-debtors" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => (
          <article key={c.id} className="rounded-2xl border border-white/5 bg-panel p-4" data-testid={`fiado-customer-${c.id}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-white">{c.name}</p>
                <p className="text-xs text-zinc-500">{c.phone || "Sem telefone"}{c.credit_limit > 0 && ` · limite ${brl(c.credit_limit)}`}</p>
              </div>
              <p className={cn("font-mono text-xl", c.balance > 0.009 ? "text-red-300" : "text-emerald-300")} data-testid={`fiado-balance-${c.id}`}>{brl(c.balance)}</p>
            </div>
            {c.credit_limit > 0 && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (c.balance / c.credit_limit) * 100)}%` }} />
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="flex-1" disabled={c.balance <= 0.009} onClick={() => setReceiving(c)} data-testid={`fiado-receive-${c.id}`}><HandCoins className="size-3.5" /> Receber</Button>
              <Button size="sm" variant="outline" onClick={() => setHistory(c)} data-testid={`fiado-history-${c.id}`}><History className="size-3.5" /> Histórico</Button>
            </div>
          </article>
        ))}
        {list.length === 0 && <p className="col-span-full py-10 text-center text-sm text-zinc-500">Nenhum cliente encontrado.</p>}
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-sm" data-testid="fiado-customer-dialog">{creating && <CustomerForm onClose={() => setCreating(false)} />}</DialogContent>
      </Dialog>
      <Dialog open={!!receiving} onOpenChange={(v) => !v && setReceiving(null)}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-sm" data-testid="fiado-receive-dialog">{receiving && <ReceiveForm c={receiving} onClose={() => setReceiving(null)} />}</DialogContent>
      </Dialog>
      <Sheet open={!!history} onOpenChange={(v) => !v && setHistory(null)}>
        <SheetContent className="w-full overflow-y-auto border-white/5 bg-shell p-5 sm:max-w-md" data-testid="fiado-history-sheet">
          {history && <HistoryList c={history} />}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function CustomerForm({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", cpf: "", limit: "" });
  const m = useMutation({
    mutationFn: () => apiPost<FiadoCustomer>("/customers", { name: f.name, phone: f.phone, cpf: f.cpf, credit_limit: num(f.limit) } satisfies FiadoCustomerIn),
    onSuccess: () => { toast.success("Cliente cadastrado"); inv(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">Novo cliente fiado</DialogTitle></DialogHeader>
      <Input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="fiado-name-input" />
      <Input placeholder="Telefone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="fiado-phone-input" />
      <Input placeholder="CPF (opcional)" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} data-testid="fiado-cpf-input" />
      <div><Label className="text-xs text-zinc-400">Limite de crédito (R$, 0 = sem limite)</Label>
        <Input value={f.limit} inputMode="decimal" onChange={(e) => setF({ ...f, limit: e.target.value })} className="mt-1 font-mono" data-testid="fiado-limit-input" /></div>
      <Button disabled={f.name.trim().length < 2 || m.isPending} onClick={() => m.mutate()} data-testid="fiado-save-customer">Salvar</Button>
    </>
  );
}

function ReceiveForm({ c, onClose }: { c: FiadoCustomer; onClose: () => void }) {
  const [amount, setAmount] = useState(c.balance.toFixed(2));
  const [method, setMethod] = useState<"dinheiro" | "pix" | "credito" | "debito">("dinheiro");
  const [brand, setBrand] = useState<CardBrand | null>(null);
  const card = method === "credito" || method === "debito";
  const m = useMutation({
    mutationFn: () => apiPost<FiadoCustomer>(`/customers/${c.id}/receive`, { amount: num(amount), method, brand: card ? brand : null, note: "" }),
    onSuccess: (r) => { toast.success(`Recebido · saldo de ${r.name}: ${brl(r.balance)}`); inv(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">Receber de {c.name}</DialogTitle></DialogHeader>
      <p className="text-sm text-zinc-400">Saldo devedor: <span className="font-mono text-red-300">{brl(c.balance)}</span></p>
      <Input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} className="font-mono" data-testid="fiado-receive-amount" />
      <div className="grid grid-cols-4 gap-2">
        {(["dinheiro", "pix", "credito", "debito"] as const).map((k) => (
          <Button key={k} size="sm" variant={method === k ? "default" : "outline"} onClick={() => setMethod(k)} data-testid={`fiado-receive-method-${k}`}>{payLabel(k)}</Button>
        ))}
      </div>
      {card && (
        <div className="grid grid-cols-3 gap-2">
          {(["visa", "mastercard", "elo"] as const).map((b) => (
            <Button key={b} size="sm" variant={brand === b ? "default" : "outline"} onClick={() => setBrand(b)} data-testid={`fiado-receive-brand-${b}`}>{BRAND_LABEL[b]}</Button>
          ))}
        </div>
      )}
      <Button disabled={!num(amount) || (card && !brand) || m.isPending} onClick={() => m.mutate()} data-testid="fiado-receive-confirm">Confirmar recebimento</Button>
    </>
  );
}

function HistoryList({ c }: { c: FiadoCustomer }) {
  const q = useQuery({ queryKey: ["customer-moves", c.id], queryFn: () => apiGet<CustomerMove[]>(`/customers/${c.id}/moves`) });
  return (
    <>
      <SheetTitle className="font-heading text-xl text-white">{c.name}</SheetTitle>
      <p className="text-sm text-zinc-400">Saldo atual <span className="font-mono text-white">{brl(c.balance)}</span></p>
      <ul className="mt-4 space-y-2">
        {(q.data ?? []).map((m) => (
          <li key={m.id} className="rounded-xl bg-panel px-3 py-2 text-sm" data-testid={`fiado-move-${m.id}`}>
            <div className="flex justify-between"><span className="text-white">{MOVE[m.type].label}{m.order_number && ` · #${m.order_number}`}</span>
              <span className={cn("font-mono", MOVE[m.type].cls)}>{MOVE[m.type].sign} {brl(m.amount)}</span></div>
            <p className="text-xs text-zinc-500">{fmtDateTime(m.at)}{m.method && ` · ${payLabel(m.method, m.brand)}`}{m.by_name && ` · ${m.by_name}`}{m.note && ` · ${m.note}`}</p>
          </li>
        ))}
        {q.data?.length === 0 && <p className="text-sm text-zinc-500">Sem movimentações.</p>}
      </ul>
    </>
  );
}
