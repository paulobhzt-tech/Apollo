import { setReceiptPref } from "@/lib/receipt";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cashAmount, formatCurrencyTyping } from "@/lib/catalog-form";
import { equalBillShares, previewBillShare } from "@/lib/bill-split";
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
  items?: { name: string; qty: number; unit_price?: number }[];
  title: string;
  defaultService?: number;
  partialMode?: boolean;
  pending?: boolean;
  connectionRequired?: boolean;
  review?: { pending: boolean; consult: () => void };
  onConfirm: (p: PayIn) => void;
}

export default function PaymentDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (open || !props.pending) props.onOpenChange(open); }}>
      <DialogContent className="@container flex max-h-[96dvh] max-w-[calc(100%-0.75rem)] flex-col gap-0 border-border bg-elevated p-0 sm:max-w-[min(95vw,78rem)]" data-testid="payment-dialog">
        {props.open && <PaymentBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentBody({ subtotal, items = [], title, defaultService = 0, partialMode = false, pending, connectionRequired, review, onConfirm, onOpenChange }: Props) {
  const [panel, setPanel] = useState<"pay" | "order">("pay");
  const [itemPage, setItemPage] = useState(0);
  const lastItemPage = Math.max(0, Math.ceil(items.length / 6) - 1);
  const visibleItemPage = Math.min(itemPage, lastItemPage);
  const [payments, setPayments] = useState<Payment[]>([]);
  const settings = useQuery({ queryKey: ["settings-general"], queryFn: () => apiGet<GeneralSettings>("/settings/general") });
  const pixKeys = [settings.data?.pix_key, ...(settings.data?.pix_extra_keys ?? [])]
    .flatMap((key, index) => key?.trim() ? [{ key: key.trim(), label: index ? `Chave adicional ${index}` : "Chave principal" }] : []);
  const [selectedPix, setSelectedPix] = useState("");
  const pixKey = pixKeys.find((entry) => entry.label === selectedPix) ?? pixKeys[0];
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [confirmedPixAmount, setConfirmedPixAmount] = useState<number | null>(null);
  const [discountReason, setDiscountReason] = useState("");
  const [percentage, setPercentage] = useState("");
  const [method, setMethod] = useState<PayMethod>("dinheiro");
  const cfg = usePayMethods();
  const METHODS = useMemo(() => {
    const list = cfg.data ?? ORDER.map((k, i) => ({ key: k, name: PAY_LABEL[k], active: true, sort: i }));
    return list.filter((m) => m.active && (!partialMode || m.key !== "fiado")).sort((a, b) => a.sort - b.sort).map((m) => ({ m: m.key, label: m.name, icon: ICONS[m.key] ?? Ticket }));
  }, [cfg.data, partialMode]);
  const [amount, setAmount] = useState("");
  const [cardFields, setCardFields] = useState({ pos_terminal: "", authorization_code: "", nsu: "" });
  const [brand, setBrand] = useState<CardBrand | null>(null);
  const isCard = method === "credito" || method === "debito";
  const [fiadoId, setFiadoId] = useState("");
  const customers = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<FiadoCustomer[]>("/customers"), enabled: method === "fiado" });
  const fiadoCust = customers.data?.find((c) => c.id === fiadoId);
  const [discount, setDiscount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [service, setService] = useState(defaultService > 0);
  const [splitN, setSplitN] = useState("1");
  const [emit, setEmit] = useState(!partialMode);
  const [docType, setDocType] = useState<"nfce" | "nfe">("nfce");
  const [cpf, setCpf] = useState("");

  const percentageDiscount = previewBillShare(subtotal, "percentage", discountPercent);
  const discountAmount = discount.trim() ? cashAmount(discount) : 0;
  const validDiscount = discountAmount !== null && discountAmount >= 0 && discountAmount <= subtotal;
  const disc = validDiscount ? discountAmount : 0;
  const serviceFee = service ? Math.round(subtotal * defaultService) / 100 : 0;
  const total = Math.round((subtotal - disc + serviceFee) * 100) / 100;
  const paid = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) / 100;
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const change = Math.max(0, Math.round((paid - total) * 100) / 100);
  const { people, amount: share, extraAmount, extraPeople } = equalBillShares(total, Number(splitN));
  const percentShare = previewBillShare(total, "percentage", percentage);
  const hasFiadoPayment = payments.some((payment) => payment.method === "fiado");
  const value = amount.trim() ? cashAmount(amount) : remaining;
  const valueCents = value === null ? 0 : Math.round(value * 100);
  const roundedValue = Number.isSafeInteger(valueCents) ? valueCents / 100 : 0;
  const pixReceived = roundedValue > 0 && roundedValue === confirmedPixAmount;
  const methodsReady = METHODS.some((entry) => entry.m === method);
  const availableBrands = settings.data?.card_brands ?? BRANDS;
  const duplicatePix = method === "pix" && payments.some((payment) => payment.method === "pix" &&
    payment.details?.reference.trim().toLowerCase() === reference.trim().toLowerCase());
  const cardCodesValid = [cardFields.authorization_code, cardFields.nsu].every((code) => /^[a-z0-9._/-]*$/i.test(code.trim()));
  const cardDetails = isCard ? {
    pos_terminal: cardFields.pos_terminal.trim(), authorization_code: cardFields.authorization_code.trim(), nsu: cardFields.nsu.trim(),
  } : {};
  const canAdd = !pending && validDiscount && methodsReady && roundedValue > 0 && remaining > 0 &&
    (method === "dinheiro" || roundedValue <= remaining) &&
    (!isCard || (brand !== null && availableBrands.includes(brand) && cardCodesValid)) && (method !== "fiado" || !!fiadoCust) &&
    (method !== "pix" || (pixReceived && !!reference.trim() && !duplicatePix));

  function updateAmount(next: number) {
    setAmount(next.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setConfirmedPixAmount(null);
  }

  function selectMethod(next: PayMethod) {
    if (next === method) return;
    setMethod(next);
    setCardFields({ pos_terminal: "", authorization_code: "", nsu: "" });
    setConfirmedPixAmount(null);
    setReference("");
  }

  function add() {
    if (!canAdd) return;
    const details = method === "pix" || note.trim() || reference.trim() || Object.values(cardDetails).some(Boolean) ? {
      ...cardDetails,
      note: note.trim(), reference: reference.trim(),
      pix_key_label: method === "pix" ? pixKey?.label ?? "" : "",
      pix_received: method === "pix" && pixReceived,
    } : undefined;
    setPayments((current) => [...current, { method, amount: roundedValue, brand: isCard ? brand : null, details }]);
    setAmount("");
    setNote("");
    setCardFields({ pos_terminal: "", authorization_code: "", nsu: "" });
    setReference("");
    setConfirmedPixAmount(null);
  }
  const cashChangeOk = change <= payments.filter((payment) => payment.method === "dinheiro").reduce((sum, payment) => sum + payment.amount, 0) + 0.001;
  const canConfirm = validDiscount && (disc === 0 || discountReason.trim().length >= 3) && payments.length > 0 && remaining === 0 && cashChangeOk && !pending && !connectionRequired && !review;

  function finish(print: boolean) {
    if (!canConfirm) return;
    setReceiptPref(print);
    onConfirm({ payments, discount: disc, discount_reason: disc > 0 ? discountReason.trim() : "",
      service_pct: service ? defaultService : 0, emit_invoice: emit, doc_type: docType,
      customer_cpf: cpf, fiado_customer_id: hasFiadoPayment ? fiadoId : null });
  }

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 sm:px-5 sm:pr-14">
        <DialogTitle className="font-heading text-xl text-foreground">{title}</DialogTitle>
      </DialogHeader>
      <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] @min-[66rem]:grid-cols-[minmax(0,1fr)_14rem] @min-[66rem]:grid-rows-[minmax(0,1fr)]">
      <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain p-2 sm:p-3">
        <div role="group" aria-label="Seções do pagamento" className="mb-2 grid grid-cols-2 gap-1 @min-[52rem]:hidden">
          <Button size="sm" variant={panel === "pay" ? "default" : "outline"} aria-pressed={panel === "pay"} onClick={() => setPanel("pay")}>Pagamento</Button>
          <Button size="sm" variant={panel === "order" ? "default" : "outline"} aria-pressed={panel === "order"} onClick={() => setPanel("order")}>Consumo e ajustes</Button>
        </div>
        <div className="grid min-w-0 gap-2 @min-[52rem]:grid-cols-[8rem_minmax(0,1.15fr)_minmax(0,1fr)]">
          <nav aria-label="Formas de pagamento" className={cn("grid content-start grid-cols-2 gap-1 @min-[28rem]:grid-cols-3 @min-[52rem]:grid-cols-1", panel === "order" && "hidden @min-[52rem]:grid")}>
            <p className="col-span-full text-xs font-semibold text-muted-foreground">Formas de pagamento</p>
            {METHODS.map(({ m, label, icon: Icon }) => (
              <button
                key={m}
                type="button"
                onClick={() => selectMethod(m)}
                disabled={pending}
                aria-pressed={method === m}
                data-testid={`payment-method-${m}`}
                className={cn(
                  "flex min-h-9 min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs font-medium wrap-anywhere transition-colors duration-150 active:scale-95",
                  method === m ? "border-primary bg-primary/15 text-primary" : "border-border bg-panel text-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>
          <section className={cn("min-w-0 space-y-2 rounded-lg border border-border bg-panel p-2 sm:p-3", panel === "order" && "hidden @min-[52rem]:block")} aria-label="Lançar pagamento">
          <h3 className="text-base font-semibold">Lançar {payLabel(method)}</h3>
          {isCard && (
            <div className="space-y-1.5" data-testid="card-brand-picker">
              <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Bandeira do cartão</p>
              <div className="grid grid-cols-3 gap-2">
                {availableBrands.map((b) => (
                  <button key={b} type="button" onClick={() => setBrand(b)} aria-pressed={brand === b} disabled={pending} data-testid={`card-brand-${b}`}
                    className={cn("flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors duration-150 active:scale-95",
                      brand === b ? "border-primary bg-primary/15 text-white" : "border-white/8 bg-panel text-zinc-300 hover:border-white/20")}>
                    <span className="h-3 w-5 rounded-sm" style={{ background: BRAND_COLOR[b] }} />{BRAND_LABEL[b]}
                  </button>
                ))}
              </div>
              {!brand && <p className="text-xs text-amber-300">Selecione a bandeira para adicionar o pagamento.</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ["pos_terminal", "Terminal POS", 80], ["authorization_code", "Nº de autorização", 40], ["nsu", "NSU", 40],
                ] as const).map(([field, label, limit]) => (
                  <label className="block text-xs text-muted-foreground" key={field}>
                    {label}
                    <Input className="mt-1" disabled={pending} maxLength={limit} value={cardFields[field]}
                      onChange={(event) => setCardFields((current) => ({ ...current, [field]: event.target.value }))} />
                  </label>
                ))}
              </div>
              {!cardCodesValid && <p role="alert" className="text-xs text-destructive">Use letras, números ou os sinais . _ / - na autorização e no NSU.</p>}

            </div>
          )}
          {method === "fiado" && (
            <div className="space-y-1.5" data-testid="fiado-customer-picker">
              <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Cliente da conta fiado</p>
              <Select value={fiadoId} disabled={hasFiadoPayment || pending}
                onValueChange={(v: string) => { if (!hasFiadoPayment && !pending) setFiadoId(v); }}>
                <SelectTrigger className="w-full" data-testid="fiado-customer-select">
                  <SelectValue>{(v) => customers.data?.find((c) => c.id === v)?.name ?? "Selecione o cliente"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · deve {brl(c.balance)}</SelectItem>)}
                </SelectContent>
              </Select>
              {hasFiadoPayment && <p className="text-xs text-muted-foreground">Para trocar o cliente, remova os lançamentos em fiado.</p>}
              {fiadoCust && fiadoCust.credit_limit > 0 && <p className="text-xs text-zinc-500">Limite disponível: {brl(fiadoCust.credit_limit - fiadoCust.balance)}</p>}
              {customers.isError && <p role="alert" className="text-xs text-destructive">Não foi possível consultar os clientes.</p>}
              {customers.data?.length === 0 && <p className="text-xs text-amber-300">Cadastre clientes em “Conta Fiado”.</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="payment-entry-amount">Valor do pagamento</Label>
            <Input id="payment-entry-amount" inputMode="decimal" placeholder={brl(remaining)} value={amount}
              disabled={pending} onChange={(event) => { setAmount(formatCurrencyTyping(event.target.value)); setConfirmedPixAmount(null); }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }}
              data-testid="payment-amount-input" className="h-10 text-right font-mono text-xl tabular-nums" />
            <Button className="w-full justify-between" variant="outline" disabled={!remaining || pending} onClick={() => updateAmount(remaining)}>
              Usar saldo <span className="font-mono">{brl(remaining)}</span>
            </Button>
            <div className="grid grid-cols-3 gap-1" aria-label="Valores rápidos">
              {[2, 5, 10, 20, 50, 100].map((quick) => (
                <Button key={quick} variant="outline" size="sm" disabled={pending || (method !== "dinheiro" && quick > remaining)}
                  onClick={(event) => {
                    const cents = event.shiftKey ? Math.round((cashAmount(amount) ?? 0) * 100) + quick * 100 : quick * 100;
                    if (Number.isSafeInteger(cents)) updateAmount(cents / 100);
                  }} className="min-w-0 font-mono">{brl(quick)}</Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Segure Shift ao clicar para somar.</p>
              <Button size="xs" variant="ghost" disabled={!amount || pending} onClick={() => updateAmount(0)}>Zerar valor</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Percentual do total" className="w-28" inputMode="decimal" placeholder="% do total"
              value={percentage} onChange={(event) => setPercentage(event.target.value)} />
            <Button size="sm" variant="outline" disabled={!percentShare || !remaining || pending}
              onClick={() => { if (percentShare) { setAmount(Math.min(remaining, percentShare.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); setConfirmedPixAmount(null); } }}>Usar percentual</Button>
          </div>
          {method === "pix" && (
            <div className="space-y-3 rounded-lg border border-sky-400/25 p-3">
              <h4 className="font-medium">PIX manual</h4>
              {pixKeys.length ? <label className="block text-sm">Chave utilizada
                <select className="mt-1 block w-full rounded border border-white/15 bg-background p-2" value={pixKey?.label ?? ""}
                  onChange={(event) => { setSelectedPix(event.target.value); setConfirmedPixAmount(null); }}>
                  {pixKeys.map(({ key, label }) => <option key={label} value={label}>{label} · {key}</option>)}
                </select>
              </label> : <p className="text-xs text-zinc-400">Cadastre as chaves em Configurações → Empresa & PIX.</p>}
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={pixReceived} disabled={roundedValue <= 0} onCheckedChange={(checked) => setConfirmedPixAmount(checked ? roundedValue : null)} />
                Confirmei {brl(roundedValue)} no extrato do estabelecimento
              </label>
              {duplicatePix && <p role="alert" className="text-sm text-red-300">Esta referência PIX já foi lançada.</p>}
            </div>
          )}
          {method === "pix" && <label className="block text-sm">ID da transação PIX
            <Input className="mt-1" maxLength={120} value={reference} onChange={(event) => { setReference(event.target.value); setConfirmedPixAmount(null); }} />
          </label>}
          <details className="rounded-md border border-border p-2 text-sm">
            <summary className="cursor-pointer">Dados adicionais</summary>
            {method !== "pix" && <label className="mt-2 block">Referência do comprovante
              <Input className="mt-1" maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} />
            </label>}
            <label className="mt-2 block">Observação do pagamento
              <Input className="mt-1" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </details>
          <Button className="w-full" disabled={!canAdd} onClick={add} data-testid="payment-add-button">{method === "fiado" ? "Adicionar fiado para o cliente" : "Adicionar pagamento"}</Button>
          </section>

          <section className={cn("min-w-0 space-y-2 rounded-lg border border-border bg-panel p-2 sm:p-3", panel === "pay" && "hidden @min-[52rem]:block")} aria-label="Resumo do pedido">
            <h3 className="text-base font-semibold">Consumo e ajustes</h3>
            {items.length > 0 && <details className="rounded-md border border-border p-2 text-sm">
              <summary className="cursor-pointer">Itens do pedido ({items.length})</summary>
              <ul className="mt-2 space-y-1 break-words">
                {items.slice(visibleItemPage * 6, (visibleItemPage + 1) * 6).map((item, index) => <li key={index} className="flex flex-wrap justify-between gap-x-2 border-b border-border py-1">
                  <span className="min-w-0 break-words">{item.qty} × {item.name}</span>
                  {item.unit_price !== undefined && <span className="font-mono text-xs text-muted-foreground">
                    {brl(item.unit_price)} un. · <strong className="text-foreground">{brl(item.qty * item.unit_price)}</strong>
                  </span>}
                </li>)}
              </ul>
              {lastItemPage > 0 && <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="xs" variant="outline" disabled={visibleItemPage === 0} onClick={() => setItemPage(visibleItemPage - 1)}>Anterior</Button>
                <span>{visibleItemPage + 1}/{lastItemPage + 1}</span>
                <Button size="xs" variant="outline" disabled={visibleItemPage === lastItemPage} onClick={() => setItemPage(visibleItemPage + 1)}>Próxima</Button>
              </div>}
            </details>}
            <h4 className="text-sm font-medium">Pagamentos lançados ({payments.length})</h4>
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-panel px-3 py-2 text-sm" data-testid={`payment-line-${i}`}>
                <span className="min-w-0 break-words">{payLabel(p.method, p.brand)}
                  {p.details?.pos_terminal && <small className="block text-muted-foreground">POS {p.details.pos_terminal}</small>}
                  {p.details?.authorization_code && <small className="block text-muted-foreground">Aut. {p.details.authorization_code}</small>}
                  {p.details?.nsu && <small className="block text-muted-foreground">NSU {p.details.nsu}</small>}
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
              <Label htmlFor="payment-discount" className="text-xs text-zinc-400">Desconto (R$)</Label>
              <Input id="payment-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(formatCurrencyTyping(e.target.value))} className="mt-1 font-mono" data-testid="payment-discount-input" />
            </div>
            <div>
              <Label htmlFor="payment-split" className="text-xs text-zinc-400">Dividir por pessoas</Label>
              <Input id="payment-split" inputMode="numeric" value={splitN} onChange={(e) => setSplitN(e.target.value)} className="mt-1 font-mono" data-testid="payment-split-input" />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="payment-discount-percent" className="text-xs text-muted-foreground">Desconto (%)</Label>
              <Input id="payment-discount-percent" className="mt-1 w-28" inputMode="decimal" value={discountPercent}
                onChange={(event) => setDiscountPercent(event.target.value)} />
            </div>
            <Button size="sm" variant="outline" disabled={!percentageDiscount || pending} onClick={() => {
              if (percentageDiscount) setDiscount(percentageDiscount.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            }}>Aplicar desconto</Button>
          </div>
          {!validDiscount && <p role="alert" className="text-sm text-red-300">Informe um desconto entre zero e o subtotal.</p>}
          {disc > 0 && <label className="block text-sm">Justificativa do desconto
            <Input className="mt-1" maxLength={300} value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} />
          </label>}
          {people > 1 && <div className="space-y-1 text-sm">
            <p data-testid="payment-per-person">{people - extraPeople} × {brl(share)}{extraPeople > 0 && ` + ${extraPeople} × ${brl(extraAmount)}`}</p>
            <div className="flex flex-wrap gap-2">
              {[share, ...(extraPeople ? [extraAmount] : [])].filter((value) => value > 0).map((value) =>
                <Button key={value} variant="outline" size="xs" disabled={value > remaining || pending} onClick={() => {
                  setAmount(value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); setConfirmedPixAmount(null);
                }}>Usar cota de {brl(value)}</Button>)}
            </div>
          </div>}
          {defaultService > 0 && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <Checkbox checked={service} onCheckedChange={(v) => setService(!!v)} data-testid="payment-service-checkbox" />
              Taxa de serviço {defaultService}%
            </label>
          )}
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
      </div>
      <footer data-testid="payment-footer" className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-t border-border bg-elevated px-2 py-2 sm:px-4 @min-[66rem]:content-start @min-[66rem]:items-start @min-[66rem]:border-t-0 @min-[66rem]:border-l">
        <dl className="grid basis-full grid-cols-[repeat(auto-fit,minmax(min(100%,5.25rem),1fr))] gap-x-2 gap-y-1 text-xs @min-[66rem]:grid-cols-2">
          <Row k="Subtotal" v={brl(subtotal)} />
          <Row k="Desconto" v={brl(disc)} />
          <Row k="Serviço" v={brl(serviceFee)} />
          <Row k="Total a pagar" v={brl(total)} testid="payment-total" />
          <Row k="Total pago" v={brl(paid)} />
          <Row k="Falta pagar" v={brl(remaining)} testid="payment-remaining" accent={remaining > 0 ? "text-amber-400" : "text-emerald-400"} />
          <Row k="Troco" v={brl(change)} testid="payment-change" />
        </dl>
        <p role="status" className="basis-full text-xs text-muted-foreground">
          {connectionRequired ? "Reconecte para confirmar o pagamento." : review ? "Resultado incerto. Consulte o servidor antes de confirmar novamente." : pending ? "Aguardando confirmação do servidor." : canConfirm ? "Valores conferidos. Confirme para registrar o pagamento." :
            remaining > 0 ? `Falta lançar ${brl(remaining)}.` : "Confira os lançamentos e a justificativa do desconto, quando aplicável."}
        </p>
        {review && <Button variant="outline" disabled={connectionRequired || review.pending} onClick={review.consult}>Consultar servidor</Button>}
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button variant="outline" size="sm" disabled={!canConfirm} onClick={() => finish(true)}>Finalizar e imprimir</Button>
        <Button size="sm" disabled={!canConfirm} data-testid="payment-confirm-button" onClick={() => finish(false)}>
          {pending ? "Processando…" : "Finalizar pedido"}
        </Button>
      </footer>
      </div>
    </>
  );
}

function Row({ k, v, testid, accent }: { k: string; v: string; testid?: string; accent?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn("break-words font-mono font-semibold text-foreground", accent)} data-testid={testid}>{v}</dd>
    </div>
  );
}
