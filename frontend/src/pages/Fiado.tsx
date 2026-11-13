import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { HandCoins, History, MessageCircle, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { apiGet, apiPost } from "@/lib/api";
import { BRAND_LABEL, brl, errMsg, fmtDateTime, payLabel } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { CardBrand, CustomerMove, FiadoCustomer, FiadoCustomerIn, GeneralSettings } from "@/lib/types";
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
  const settings = useQuery({ queryKey: ["settings-general"], queryFn: () => apiGet<GeneralSettings>("/settings/general") });
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<FiadoCustomer | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [onlyDebt, setOnlyDebt] = useState(false);
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
  const term = normalize(search.trim());
  const list = (q.data ?? []).filter((c) => (!onlyDebt || c.balance > 0.009) &&
    (!term || normalize(c.name).includes(term) || c.phone.includes(term)));
  const selected = list.find((customer) => customer.id === selectedId) ?? list[0];
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
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,2fr)_minmax(0,3fr)]">
        <section aria-label="Clientes da conta fiado" className="min-w-0 space-y-2">
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={onlyDebt} onChange={(event) => setOnlyDebt(event.target.checked)} /> Ocultar clientes com saldo zerado</label>
          {q.isError && <p role="alert">Não foi possível consultar os clientes.</p>}
        {list.map((c) => (
          <article key={c.id} className={cn("rounded-2xl border bg-panel p-4", selected?.id === c.id ? "border-primary" : "border-border")} data-testid={`fiado-customer-${c.id}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-white">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.credit_limit > 0 ? `Limite ${brl(c.credit_limit)}` : "Sem limite"} · {c.balance > 0.009 ? "Em aberto" : "Quitado"}</p>
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
              <Button size="sm" variant="outline" aria-pressed={selected?.id === c.id} onClick={() => setSelectedId(c.id)} data-testid={`fiado-history-${c.id}`}><History className="size-3.5" /> Histórico</Button>
              <Button size="sm" variant="outline" className="border-emerald-500/30 text-emerald-300" disabled={c.balance <= 0.009 || !c.phone}
                onClick={() => window.open(waLink(c, settings.data), "_blank")} data-testid={`fiado-whatsapp-${c.id}`} title={c.phone ? "Cobrar no WhatsApp" : "Cliente sem telefone"}>
                <MessageCircle className="size-3.5" />
              </Button>
            </div>
          </article>
        ))}
        {!q.isPending && !q.isError && list.length === 0 && <p className="py-6 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
        </section>
        <section aria-label="Extrato de fiado" className="min-w-0 rounded-2xl border border-border bg-elevated p-4">
          {selected ? <HistoryList c={selected} /> : <p className="text-sm text-muted-foreground">Selecione um cliente para consultar o extrato.</p>}
        </section>
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-sm" data-testid="fiado-customer-dialog">{creating && <CustomerForm onClose={() => setCreating(false)} />}</DialogContent>
      </Dialog>
      <Dialog open={!!receiving} onOpenChange={(v) => !v && setReceiving(null)}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-sm" data-testid="fiado-receive-dialog">{receiving && <ReceiveForm c={receiving} onClose={() => setReceiving(null)} />}</DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CustomerForm({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", cpf: "", cnpj: "", limit: "" });
  const m = useMutation({
    mutationFn: () => apiPost<FiadoCustomer>("/customers", { name: f.name, phone: f.phone, cpf: f.cpf, cnpj: f.cnpj, credit_limit: num(f.limit) } satisfies FiadoCustomerIn),
    onSuccess: () => { toast.success("Cliente cadastrado"); inv(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">Novo cliente fiado</DialogTitle></DialogHeader>
      <Input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="fiado-name-input" />
      <Input placeholder="Telefone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="fiado-phone-input" />
      <Input placeholder="CPF (opcional)" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} data-testid="fiado-cpf-input" />
      <Input placeholder="CNPJ (opcional)" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} data-testid="fiado-cnpj-input" />
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
      <h2 className="font-heading text-xl text-foreground">Extrato · {c.name}</h2>
      {q.isPending && <p role="status">Carregando extrato…</p>}
      {q.isError && <p role="alert">Não foi possível consultar o extrato.</p>}
      <p className="text-sm text-zinc-400">Saldo atual <span className="font-mono text-white">{brl(c.balance)}</span></p>
      {!!q.data?.length && <div className="mt-4">
        <div aria-hidden="true" className="hidden gap-2 border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <span>Data e hora</span><span>Histórico</span><span className="text-right">Fiado</span><span className="text-right">Pago</span><span className="text-right">Estorno</span>
        </div>
        <ul className="divide-y divide-border">
          {q.data.map((m) => <li key={m.id} className="grid min-w-0 gap-2 px-3 py-3 text-sm xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_repeat(3,minmax(0,1fr))]" data-testid={`fiado-move-${m.id}`}>
            <time dateTime={m.at} className="break-words text-xs text-muted-foreground">{fmtDateTime(m.at)}</time>
            <div className="min-w-0 break-words">
              <p className="font-medium text-foreground">{MOVE[m.type].label}{m.order_number && ` · #${m.order_number}`}</p>
              <p className="text-xs text-muted-foreground">{[m.method && payLabel(m.method, m.brand), m.by_name, m.note].filter(Boolean).join(" · ")}</p>
            </div>
            {(["compra", "pagamento", "estorno"] as const).map((type) => <div key={type} className={cn("break-words text-right font-mono text-foreground", m.type !== type && "hidden xl:block")}>
              {m.type === type ? <><span className="sr-only">{MOVE[type].label} </span>{MOVE[type].sign} {brl(m.amount)}</> : <span aria-hidden="true">—</span>}
            </div>)}
          </li>)}
        </ul>
      </div>}
      {q.data?.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Sem movimentações.</p>}
    </>
  );
}

function waLink(c: FiadoCustomer, st?: GeneralSettings) {
  let phone = c.phone.replace(/\D/g, "");
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  const pix = st?.pix_key ? `\n\nPague via PIX 👉 *${st.pix_key}*${st.pix_holder ? ` (${st.pix_holder})` : ""}` : "";
  const msg = `Olá, ${c.name.split(" ")[0]}! Aqui é da *Espeteria Churras Buguer* 🔥\nSeu saldo em aberto na conta fiado é de *${brl(c.balance)}*.${pix}\n\nQualquer dúvida é só chamar. Obrigado!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
