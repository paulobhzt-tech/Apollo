import { setReceiptPref } from "@/lib/receipt";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cashAmount, catalogNumber } from "@/lib/catalog-form";
import { apiGet } from "@/lib/api";
import { usePayMethods } from "@/lib/payMethods";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, CreditCard, QrCode, Ticket, Trash2, UserRound, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BRAND_LABEL, brl, PAY_LABEL, payLabel } from "@/lib/format";
import type { CardBrand, FiadoCustomer, GeneralSettings, PayIn, PayMethod, Payment } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Banknote> = { dinheiro: Banknote, pix: QrCode, credito: CreditCard, debito: Wallet, fiado: UserRound };
const ORDER = ["dinheiro", "pix", "credito", "debito", "fiado"];
const BRANDS: CardBrand[] = ["visa", "mastercard", "elo"];
const BRAND_COLOR: Record<CardBrand, string> = { visa: "#1A1F71", mastercard: "#EB001B", elo: "#FFCB05" };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subtotal: number;
  items?: { name: string; qty: number }[];
  title: string;
  defaultService?: number;
  partialMode?: boolean;
  pending?: boolean;
  onConfirm: (p: PayIn) => void;
}

export default function PaymentDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto border-white/10 bg-elevated sm:max-w-[min(95vw,70rem)]" data-testid="payment-dialog">
        {props.open && <PaymentBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentBody({ subtotal, items = [], title, defaultService = 0, partialMode = false, pending, onConfirm }: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const settings = useQuery({ queryKey: ["settings-general"], queryFn: () => apiGet<GeneralSettings>("/settings/general") });
  const pixKeys = [settings.data?.pix_key, ...(settings.data?.pix_extra_keys ?? [])]
    .flatMap((key, index) => key?.trim() ? [{ key: key.trim(), label: index ? `Chave adicional ${index}` : "Chave principal" }] : []);
  const [selectedPix, setSelectedPix] = useState("");
  const pixKey = pixKeys.find((entry) => entry.label === selectedPix) ?? pixKeys[0];
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pixReceived, setPixReceived] = useState(false);
  const [discountReason, setDiscountReason] = useState("");
  const [percentage, setPercentage] = useState("");
  const [method, setMethod] = useState<PayMethod>("dinheiro");
  const cfg = usePayMethods();
  const METHODS = useMemo(() => {
    const list = cfg.data ?? ORDER.map((k, i) => ({ key: k, name: PAY_LABEL[k], active: true, sort: i }));
    return list.filter((m) => m.active && (!partialMode || m.key !== "fiado")).sort((a, b) => a.sort - b.sort).map((m) => ({ m: m.key, label: m.name, icon: ICONS[m.key] ?? Ticket }));
  }, [cfg.data, partialMode]);
  const [amount, setAmount] = useState("");
  const [brand, setBrand] = useState<CardBrand | null>(null);
  const isCard = method === "credito" || method === "debito";
  const [fiadoId, setFiadoId] = useState("");
  const customers = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<FiadoCustomer[]>("/customers"), enabled: method === "fiado" });
  const fiadoCust = customers.data?.find((c) => c.id === fiadoId);
  const [discount, setDiscount] = useState("");
  const [service, setService] = useState(defaultService > 0);
  const [splitN, setSplitN] = useState("1");
  const [emit, setEmit] = useState(!partialMode);
  const [docType, setDocType] = useState<"nfce" | "nfe">("nfce");
  const [cpf, setCpf] = useState("");

  const discountAmount = discount.trim() ? cashAmount(discount) : 0;
  const validDiscount = discountAmount !== null && discountAmount >= 0 && discountAmount <= subtotal;
  const disc = validDiscount ? discountAmount : 0;
  const serviceFee = service ? Math.round(subtotal * defaultService) / 100 : 0;
  const total = Math.round((subtotal - disc + serviceFee) * 100) / 100;
  const paid = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) / 100;
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const change = Math.max(0, Math.round((paid - total) * 100) / 100);
  const settled = total > 0 ? (remaining === 0 ? 100 : Math.min(99, Math.floor(100 * paid / total))) : 0;
  const n = Number(splitN);
  const people = Number.isInteger(n) && n > 1 && n <= 99 ? n : 1;
  const totalCents = Math.round(total * 100);
  const shareCents = Math.floor(totalCents / people);
  const extraShares = totalCents % people;
  const share = shareCents / 100;
  const percent = catalogNumber(percentage);
  const value = amount.trim() ? cashAmount(amount) : remaining;
  const valueCents = value === null ? 0 : Math.round(value * 100);
  const roundedValue = Number.isSafeInteger(valueCents) ? valueCents / 100 : 0;
  const methodsReady = METHODS.some((entry) => entry.m === method);
  const availableBrands = settings.data?.card_brands ?? BRANDS;
  const duplicatePix = method === "pix" && payments.some((payment) => payment.method === "pix" &&
    payment.details?.reference.trim().toLowerCase() === reference.trim().toLowerCase());
  const canAdd = !pending && validDiscount && methodsReady && roundedValue > 0 && remaining > 0 &&
    (method === "dinheiro" || roundedValue <= remaining) &&
    (!isCard || (brand !== null && availableBrands.includes(brand))) && (method !== "fiado" || !!fiadoId) &&
    (method !== "pix" || (pixReceived && !!reference.trim() && !duplicatePix));

  function selectMethod(next: PayMethod) {
    setMethod(next);
    setPixReceived(false);
    setReference("");
  }

  function add() {
    if (!canAdd) return;
    const details = method === "pix" || note.trim() || reference.trim() ? {
      note: note.trim(), reference: reference.trim(),
      pix_key_label: method === "pix" ? pixKey?.label ?? "" : "",
      pix_received: method === "pix" && pixReceived,
    } : undefined;
    setPayments((current) => [...current, { method, amount: roundedValue, brand: isCard ? brand : null, details }]);
    setAmount("");
    setNote("");
    setReference("");
    setPixReceived(false);
  }
  const cashChangeOk = change <= payments.filter((payment) => payment.method === "dinheiro").reduce((sum, payment) => sum + payment.amount, 0) + 0.001;
  const canConfirm = validDiscount && payments.length > 0 && remaining === 0 && cashChangeOk && !pending;

  function finish(print: boolean) {
    if (!canConfirm) return;
    setReceiptPref(print);
    onConfirm({ payments, discount: disc, discount_reason: disc > 0 ? discountReason.trim() : "",
      service_pct: service ? defaultService : 0, emit_invoice: emit, doc_type: docType,
      customer_cpf: cpf, fiado_customer_id: payments.some((payment) => payment.method === "fiado") ? fiadoId : null });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-heading text-xl text-white">{title}</DialogTitle>
      </DialogHeader>
      <div className="grid min-w-0 gap-4 md:grid-cols-[10rem_minmax(0,1fr)] xl:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]">
          <nav aria-label="Formas de pagamento" className="grid content-start grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-1">
            {METHODS.map(({ m, label, icon: Icon }) => (
              <button
                key={m}
                type="button"
                onClick={() => selectMethod(m)}
                disabled={pending}
                aria-pressed={method === m}
                data-testid={`payment-method-${m}`}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-xl border px-2 py-3 text-xs font-medium transition-colors duration-150 active:scale-95",
                  method === m ? "border-primary bg-primary/15 text-primary" : "border-white/8 bg-panel text-zinc-300 hover:border-white/20",
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </nav>
          <section className="min-w-0 space-y-4 rounded-xl border border-white/10 bg-panel p-4" aria-label="Lançar pagamento">
          <h3 className="text-base font-semibold">Lançar {payLabel(method)}</h3>
          {isCard && (
            <div className="space-y-1.5" data-testid="card-brand-picker">
              <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Bandeira do cartão</p>
              <div className="grid grid-cols-3 gap-2">
                {availableBrands.map((b) => (
                  <button key={b} type="button" onClick={() => setBrand(b)} data-testid={`card-brand-${b}`}
                    className={cn("flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors duration-150 active:scale-95",
                      brand === b ? "border-primary bg-primary/15 text-white" : "border-white/8 bg-panel text-zinc-300 hover:border-white/20")}>
                    <span className="h-3 w-5 rounded-sm" style={{ background: BRAND_COLOR[b] }} />{BRAND_LABEL[b]}
                  </button>
                ))}
              </div>
              {!brand && <p className="text-xs text-amber-300">Selecione a bandeira para adicionar o pagamento.</p>}
            </div>
          )}
          {method === "fiado" && (
            <div className="space-y-1.5" data-testid="fiado-customer-picker">
              <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Cliente da conta fiado</p>
              <Select value={fiadoId} onValueChange={(v: string) => setFiadoId(v)}>
                <SelectTrigger className="w-full" data-testid="fiado-customer-select">
                  <SelectValue>{(v) => customers.data?.find((c) => c.id === v)?.name ?? "Selecione o cliente"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · deve {brl(c.balance)}</SelectItem>)}
                </SelectContent>
              </Select>
              {fiadoCust && fiadoCust.credit_limit > 0 && <p className="text-xs text-zinc-500">Limite disponível: {brl(fiadoCust.credit_limit - fiadoCust.balance)}</p>}
              {customers.data?.length === 0 && <p className="text-xs text-amber-300">Cadastre clientes em “Conta Fiado”.</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Valor do pagamento" inputMode="decimal" placeholder={brl(remaining)} value={amount}
              onChange={(event) => { setAmount(event.target.value); setPixReceived(false); }} onKeyDown={(event) => { if (event.key === "Enter") add(); }}
              data-testid="payment-amount-input" className="min-w-28 flex-1 font-mono" />
            <Button variant="outline" disabled={!remaining} onClick={() => { setAmount(remaining.toFixed(2)); setPixReceived(false); }}>Usar saldo</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[2, 5, 10, 20, 50, 100].map((quick) => (
              <Button key={quick} variant="outline" size="sm" disabled={method !== "dinheiro" && quick > remaining}
                onClick={() => { setAmount(quick.toFixed(2)); setPixReceived(false); }} className="font-mono">{brl(quick)}</Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Percentual do total" className="w-28" inputMode="decimal" placeholder="% do total"
              value={percentage} onChange={(event) => setPercentage(event.target.value)} />
            <Button size="sm" variant="outline" disabled={percent === null || percent <= 0 || percent > 100 || !remaining}
              onClick={() => { if (percent !== null) { setAmount(Math.min(remaining, Math.round(totalCents * percent / 100) / 100).toFixed(2)); setPixReceived(false); } }}>Usar percentual</Button>
          </div>
          {method === "pix" && (
            <div className="space-y-3 rounded-lg border border-sky-400/25 p-3">
              <h4 className="font-medium">PIX manual</h4>
              {pixKeys.length ? <label className="block text-sm">Chave utilizada
                <select className="mt-1 block w-full rounded border border-white/15 bg-background p-2" value={pixKey?.label ?? ""}
                  onChange={(event) => { setSelectedPix(event.target.value); setPixReceived(false); }}>
                  {pixKeys.map(({ key, label }) => <option key={label} value={label}>{label} · {key}</option>)}
                </select>
              </label> : <p className="text-xs text-zinc-400">Cadastre as chaves em Configurações → Empresa & PIX.</p>}
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={pixReceived} onCheckedChange={(checked) => setPixReceived(!!checked)} />
                Confirmei o recebimento no extrato do estabelecimento
              </label>
              {duplicatePix && <p role="alert" className="text-sm text-red-300">Esta referência PIX já foi lançada.</p>}
            </div>
          )}
          <label className="block text-sm">{method === "pix" ? "ID da transação PIX" : "Referência do comprovante"}
            <Input className="mt-1" maxLength={120} value={reference} onChange={(event) => { setReference(event.target.value); setPixReceived(false); }} />
          </label>
          <label className="block text-sm">Observação do pagamento
            <Input className="mt-1" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <Button className="w-full" disabled={!canAdd} onClick={add} data-testid="payment-add-button">Adicionar pagamento</Button>
          </section>

          <section className="min-w-0 space-y-4 rounded-xl border border-white/10 bg-panel p-4 md:col-start-2 xl:col-start-auto" aria-label="Resumo do pedido">
            <h3 className="text-base font-semibold">Resumo do pedido</h3>
            {items.length > 0 && <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-zinc-300">
              {items.map((item, index) => <li key={index}>{item.qty} × {item.name}</li>)}
            </ul>}
            <h4 className="text-sm font-medium">Pagamentos lançados ({payments.length})</h4>
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-panel px-3 py-2 text-sm" data-testid={`payment-line-${i}`}>
                <span className="min-w-0 break-words">{payLabel(p.method, p.brand)}
                  {p.details?.reference && <small className="block text-zinc-400">Ref. {p.details.reference}</small>}
                </span>
                <span className="flex items-center gap-2 font-mono">
                  {brl(p.amount)}
                  <button type="button" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))} disabled={pending} aria-label="Remover pagamento" data-testid={`payment-remove-${i}`}>
                    <Trash2 className="size-3.5 text-zinc-500 hover:text-red-400" />
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400">Desconto (R$)</Label>
              <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1 font-mono" data-testid="payment-discount-input" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Dividir por</Label>
              <Input inputMode="numeric" value={splitN} onChange={(e) => setSplitN(e.target.value)} className="mt-1 font-mono" data-testid="payment-split-input" />
            </div>
          </div>
          {!validDiscount && <p role="alert" className="text-sm text-red-300">Informe um desconto entre zero e o subtotal.</p>}
          {disc > 0 && <label className="block text-sm">Justificativa do desconto
            <Input className="mt-1" maxLength={300} value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} />
          </label>}
          {people > 1 && <div className="space-y-1 text-sm">
            <p data-testid="payment-per-person">{people - extraShares} × {brl(share)}{extraShares > 0 && ` + ${extraShares} × ${brl((shareCents + 1) / 100)}`}</p>
            <div className="flex flex-wrap gap-2">
              {[shareCents, ...(extraShares ? [shareCents + 1] : [])].filter((cents) => cents > 0).map((cents) =>
                <Button key={cents} variant="outline" size="xs" disabled={cents / 100 > remaining} onClick={() => {
                  setAmount((cents / 100).toFixed(2)); setPixReceived(false);
                }}>Usar cota de {brl(cents / 100)}</Button>)}
            </div>
          </div>}
          {defaultService > 0 && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <Checkbox checked={service} onCheckedChange={(v) => setService(!!v)} data-testid="payment-service-checkbox" />
              Taxa de serviço {defaultService}%
            </label>
          )}
          <dl className="space-y-1.5 text-sm">
            <Row k="Subtotal" v={brl(subtotal)} />
            {disc > 0 && <Row k="Desconto" v={`- ${brl(disc)}`} />}
            {serviceFee > 0 && <Row k="Serviço" v={brl(serviceFee)} />}
            <div className="my-2 border-t border-white/10" />
            <Row k="Total" v={brl(total)} big testid="payment-total" />
            <Row k="Pago" v={brl(paid)} />
            <Row k="Restante" v={brl(remaining)} testid="payment-remaining" accent={remaining > 0 ? "text-amber-300" : "text-emerald-300"} />
            {change > 0 && <Row k="Troco" v={brl(change)} big testid="payment-change" accent="text-emerald-300" />}
          </dl>
          <div><label htmlFor="payment-progress" className="text-sm">{settled}% quitado</label>
            <progress id="payment-progress" value={settled} max={100} className="block w-full accent-primary" />
          </div>
          {!cashChangeOk && <p className="text-xs text-red-400">Troco só pode ser dado em dinheiro.</p>}
          <div className="space-y-2 rounded-xl border border-white/5 p-3">
            {!partialMode && <label className="flex items-center gap-2 text-sm text-zinc-300">
              <Checkbox checked={emit} onCheckedChange={(v) => setEmit(!!v)} data-testid="payment-emit-invoice-checkbox" />
              Emitir nota fiscal (simulada)
            </label>}
            {emit && (
              <div className="flex gap-2">
                {(["nfce", "nfe"] as const).map((d) => (
                  <Button key={d} size="xs" variant={docType === d ? "default" : "outline"} onClick={() => setDocType(d)} data-testid={`payment-doctype-${d}`}>
                    {d === "nfce" ? "NFC-e" : "NF-e"}
                  </Button>
                ))}
                <Input placeholder="CPF/CNPJ na nota" value={cpf} onChange={(e) => setCpf(e.target.value)} className="h-7 text-xs" data-testid="payment-cpf-input" />
              </div>
            )}
          </div>
          </section>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
        <Button variant="outline" disabled={!canConfirm} onClick={() => finish(true)}>Finalizar e imprimir</Button>
        <Button disabled={!canConfirm} data-testid="payment-confirm-button" onClick={() => finish(false)}>
          {pending ? "Processando…" : "Finalizar pedido"}
        </Button>
      </div>
    </>
  );
}

function Row({ k, v, big, testid, accent }: { k: string; v: string; big?: boolean; testid?: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-400">{k}</dt>
      <dd className={cn("font-mono", big ? "text-xl font-medium text-white" : "text-zinc-200", accent)} data-testid={testid}>{v}</dd>
    </div>
  );
}
