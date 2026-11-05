import { getReceiptPref, setReceiptPref } from "@/lib/receipt";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type { CardBrand, FiadoCustomer, PayIn, PayMethod, Payment } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Banknote> = { dinheiro: Banknote, pix: QrCode, credito: CreditCard, debito: Wallet, fiado: UserRound };
const ORDER = ["dinheiro", "pix", "credito", "debito", "fiado"];
const BRANDS: CardBrand[] = ["visa", "mastercard", "elo"];
const BRAND_COLOR: Record<CardBrand, string> = { visa: "#1A1F71", mastercard: "#EB001B", elo: "#FFCB05" };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subtotal: number;
  title: string;
  defaultService?: number;
  partialMode?: boolean;
  pending?: boolean;
  onConfirm: (p: PayIn) => void;
}

export default function PaymentDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-elevated sm:max-w-2xl" data-testid="payment-dialog">
        {props.open && <PaymentBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentBody({ subtotal, title, defaultService = 0, partialMode = false, pending, onConfirm }: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
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
  const [receipt, setReceipt] = useState(getReceiptPref);
  const [docType, setDocType] = useState<"nfce" | "nfe">("nfce");
  const [cpf, setCpf] = useState("");

  const disc = Math.min(Number(discount.replace(",", ".")) || 0, subtotal);
  const serviceFee = service ? Math.round(subtotal * defaultService) / 100 : 0;
  const total = Math.round((subtotal - disc + serviceFee) * 100) / 100;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const change = Math.max(0, Math.round((paid - total) * 100) / 100);
  const n = Math.max(1, Number(splitN) || 1);
  const perPerson = useMemo(() => Math.ceil((total / n) * 100) / 100, [total, n]);

  const add = (value?: number) => {
    const v = value ?? (Number(amount.replace(",", ".")) || remaining);
    if (v <= 0 || (isCard && !brand) || (method === "fiado" && !fiadoId)) return;
    setPayments((p) => [...p, { method, amount: Math.round(v * 100) / 100, brand: isCard ? brand : null }]);
    setAmount("");
  };
  const cashChangeOk = change <= payments.filter((p) => p.method === "dinheiro").reduce((s, p) => s + p.amount, 0) + 0.001;
  const canConfirm = payments.length > 0 && remaining === 0 && cashChangeOk && !pending;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-heading text-xl text-white">{title}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {METHODS.map(({ m, label, icon: Icon }) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                data-testid={`payment-method-${m}`}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors duration-150 active:scale-95",
                  method === m ? "border-primary bg-primary/15 text-primary" : "border-white/8 bg-panel text-zinc-300 hover:border-white/20",
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
          {isCard && (
            <div className="space-y-1.5" data-testid="card-brand-picker">
              <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Bandeira do cartão</p>
              <div className="grid grid-cols-3 gap-2">
                {BRANDS.map((b) => (
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
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              placeholder={`Valor (restante ${brl(remaining)})`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              data-testid="payment-amount-input"
              className="font-mono"
            />
            <Button onClick={() => add()} data-testid="payment-add-button" disabled={(remaining === 0 && method !== "dinheiro") || (isCard && !brand) || (method === "fiado" && !fiadoId)}>
              Adicionar
            </Button>
          </div>
          {method === "dinheiro" && (
            <div className="flex flex-wrap gap-2">
              {[remaining, 20, 50, 100, 200].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
                <Button key={v} variant="outline" size="sm" onClick={() => add(v)} data-testid={`cash-quick-${Math.round(v)}`} className="font-mono">
                  {brl(v)}
                </Button>
              ))}
            </div>
          )}
          {method === "pix" && remaining > 0 && (
            <p className="rounded-lg border border-sky-400/20 bg-sky-400/5 p-3 text-xs text-sky-200">
              PIX dinâmico (SIMULADO): o QR Code é exibido para o cliente e a confirmação é manual. Clique em Adicionar após o recebimento.
            </p>
          )}
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-panel px-3 py-2 text-sm" data-testid={`payment-line-${i}`}>
                <span>{payLabel(p.method, p.brand)}</span>
                <span className="flex items-center gap-2 font-mono">
                  {brl(p.amount)}
                  <button type="button" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))} data-testid={`payment-remove-${i}`}>
                    <Trash2 className="size-3.5 text-zinc-500 hover:text-red-400" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/5 bg-panel p-4">
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
            {n > 1 && <Row k={`Por pessoa (${n})`} v={brl(perPerson)} testid="payment-per-person" />}
            <Row k="Pago" v={brl(paid)} />
            <Row k="Restante" v={brl(remaining)} testid="payment-remaining" accent={remaining > 0 ? "text-amber-300" : "text-emerald-300"} />
            {change > 0 && <Row k="Troco" v={brl(change)} big testid="payment-change" accent="text-emerald-300" />}
          </dl>
          {!cashChangeOk && <p className="text-xs text-red-400">Troco só pode ser dado em dinheiro.</p>}
          <div className="space-y-2 rounded-xl border border-white/5 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <Checkbox checked={receipt} onCheckedChange={(v) => { setReceipt(!!v); setReceiptPref(!!v); }} data-testid="payment-simple-receipt-checkbox" />
              Imprimir cupom simples (não fiscal)
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <Checkbox checked={emit} onCheckedChange={(v) => setEmit(!!v)} data-testid="payment-emit-invoice-checkbox" />
              Emitir nota fiscal (simulada)
            </label>
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
          <Button
            className="h-12 w-full text-base"
            disabled={!canConfirm}
            data-testid="payment-confirm-button"
            onClick={() => onConfirm({ payments, discount: disc, service_pct: service ? defaultService : 0, emit_invoice: emit, doc_type: docType, customer_cpf: cpf, fiado_customer_id: payments.some((p) => p.method === "fiado") ? fiadoId : null })}
          >
            {pending ? "Processando…" : `Finalizar ${brl(total)}`}
          </Button>
        </div>
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
