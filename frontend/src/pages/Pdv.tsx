import SaleQuantityInput from "@/components/SaleQuantityInput";
import { getReceiptPref, printSimpleReceipt } from "@/lib/receipt";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBag, Trash2, WifiOff, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import ProductGrid from "@/components/ProductGrid";
import OptionsDialog, { type Picked } from "@/components/OptionsDialog";
import PaymentDialog from "@/components/PaymentDialog";
import InvoiceDialog from "@/components/InvoiceDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { brl, errMsg, uid } from "@/lib/format";
import { cacheMenu, cachedMenu, enqueue, newClientRef, requiresPaymentReview, useOffline } from "@/lib/offline";
import { useMe } from "@/lib/auth";
import { useOperatorDraft } from "@/lib/operator-draft";
import { queryClient } from "@/lib/queryClient";
import type { CashSession, Category, ChosenOption, Invoice, PayIn, Product, QuickSaleIn, SaleResult } from "@/lib/types";

interface CartLine { key: string; product: Product; qty: number; notes: string; options: ChosenOption[]; labels: string[]; extra: number }

export default function Pdv() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { data: me } = useMe();
  const draftKey = `apollo-pdv-draft:${me?.id}`;
  const { offline, queue, context } = useOffline();
  const products = useQuery({ queryKey: ["products"], queryFn: () => apiGet<Product[]>("/products") });
  const cash = useQuery({ queryKey: ["cash", "current"], queryFn: () => apiGet<CashSession | null>("/cash/current"), enabled: Boolean(me) });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories") });
  const [cart, setCart] = useOperatorDraft<CartLine[]>(`${draftKey}:items`, []);
  const [customer, setCustomer] = useOperatorDraft(`${draftKey}:customer`, "");
  const [kitchen, setKitchen] = useOperatorDraft(`${draftKey}:kitchen`, true);
  const [clientRef, setClientRef] = useOperatorDraft<string | null>(`${draftKey}:reference`, null);
  const saleRef = useRef(clientRef);
  const [payOpen, setPayOpen] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  useEffect(() => { if (products.data) cacheMenu(products.data); }, [products.data]);
  const prodList = (products.data ?? cachedMenu()).filter((product) => product.channels?.includes("caixa") ?? true);
  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = Math.round(cart.reduce((s, l) => s + l.qty * (l.product.price + l.extra), 0) * 100) / 100;

  const [optFor, setOptFor] = useState<Product | null>(null);
  const push = (p: Product, picked?: Picked) => setCart((c) => {
    if (!picked) {
      const i = c.findIndex((l) => l.product.id === p.id && !l.notes && !l.options.length);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: Math.min(99, Number((l.qty + 1).toFixed(4))) } : l));
    }
    return [...c, { key: uid(), product: p, qty: 1, notes: "", options: picked?.options ?? [], labels: picked?.labels ?? [], extra: picked?.extra ?? 0 }];
  });
  const add = (p: Product) => (p.options?.length ? setOptFor(p) : push(p));
  const setQty = (i: number, d: number) =>
    setCart((c) => c.flatMap((l, j) => (j !== i ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: Math.min(99, Number((l.qty + d).toFixed(4))) }])));

  const reset = () => { saleRef.current = null; setClientRef(null); setCart([]); setCustomer(""); setPayOpen(false); };

  const sale = useMutation({
    mutationFn: (p: QuickSaleIn) => apiPost<SaleResult>("/pdv/sale", p),
    onSuccess: (r) => {
      toast.success(`Venda #${r.order.number} finalizada${r.order.change ? ` · Troco ${brl(r.order.change)}` : ""}`);
      reset();
      if (getReceiptPref()) void printSimpleReceipt(r.order);
      if (r.invoice) setInvoice(r.invoice);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["cash"] });
    },
    onError: (e, p) => {
      if (!(e instanceof ApiError)) {
        try {
          enqueue({ payload: p, total: subtotal, queued_at: new Date().toISOString() });
          toast.warning(requiresPaymentReview(p)
            ? "Resposta indisponível. Confira o recebimento e a referência na fila antes de lançar outro pagamento."
            : "Sem conexão: venda salva no modo contingência e será sincronizada");
          reset();
        } catch {
          toast.error("Falha ao salvar a venda offline. NÃO finalize novamente sem conferir a venda; mantenha o carrinho aberto.");
        }
      } else toast.error(errMsg(e));
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3" && !payOpen && !optFor && !sale.isPending) { e.preventDefault(); searchInputRef.current?.focus(); searchInputRef.current?.select(); }
      if (e.key === "F2" && cart.length && !payOpen && !sale.isPending) { e.preventDefault(); setPayOpen(true); }
      if (e.key === "F4" && !payOpen && !sale.isPending && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); if (window.confirm("Limpar todos os itens da venda atual?")) setCart([]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.length, payOpen, optFor, sale.isPending]);

  const confirm = (pay: PayIn) => {
    if (!cart.length || sale.isPending) return;
    if (!cash.data?.id) { toast.error("Abra seu caixa e carregue o PDV antes de registrar vendas."); return; }
    const reference = (saleRef.current ??= newClientRef());
    setClientRef(reference);
    const payload: QuickSaleIn = {
      ...pay, expected_cash_session_id: cash.data.id, sync_context: context ?? undefined, client_ref: reference, customer_name: customer, send_to_kitchen: kitchen,
      items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty, notes: l.notes, options: l.options })),
    };
    if (offline) {
      if (requiresPaymentReview(pay)) {
        toast.error("Sem conexão, apenas dinheiro pode entrar na fila. Reconecte para confirmar os demais pagamentos.");
        return;
      }
      try {
        enqueue({ payload, total: subtotal, queued_at: new Date().toISOString() });
        toast.warning("Modo offline: venda pendente de sincronização. Documento fiscal ainda não emitido.");
        reset();
      } catch {
        toast.error("Armazenamento local indisponível: venda NÃO foi salva. Mantenha o carrinho aberto.");
      }
      return;
    }
    sale.mutate(payload);
  };

  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Frente de Caixa" subtitle="F2 pagamento · F3 buscar · F4 limpar · Enter na busca adiciona o item" actions={
        offline ? <span className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200" data-testid="pdv-offline-banner"><WifiOff className="size-3.5" /> Contingência offline · {queue.length} na fila</span> : null
      } />
      <div className="@container border border-border bg-panel">
        <div className="grid min-w-0 @min-[55rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="min-w-0 p-3" aria-label="Catálogo de balcão">
            <h2 className="mb-2 text-base font-semibold text-foreground">Catálogo de balcão</h2>
            <ProductGrid products={prodList} categories={categories.data ?? []} onAdd={add} searchInputRef={searchInputRef} compact />
          </section>
          <aside className="min-w-0 border-t border-border bg-background p-3 @min-[55rem]:border-t-0 @min-[55rem]:border-l" data-testid="pdv-cart">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-heading text-lg text-foreground"><ShoppingBag className="size-5 text-primary" /> Venda atual</h3>
              {cart.length > 0 && <Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Limpar todos os itens da venda atual?")) setCart([]); }} disabled={sale.isPending} data-testid="pdv-clear-cart">Limpar</Button>}
            </div>
            <Input placeholder="Nome do cliente (opcional)" value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-3" data-testid="pdv-customer-input" />
            <div className="mt-3 max-h-[46dvh] divide-y divide-border overflow-y-auto border-y border-border">
              {cart.map((l, i) => (
                <div key={l.key} className="min-w-0 px-1 py-2" data-testid={`cart-line-${i}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 wrap-anywhere text-sm font-medium text-foreground">{l.product.name}{l.labels.length > 0 && <span className="block text-xs text-primary">{l.labels.join(" · ")}</span>}</p>
                    <p className="font-mono text-sm text-foreground">{brl(l.qty * (l.product.price + l.extra))}</p>
                  </div>
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                    <Button size="icon-xs" variant="outline" onClick={() => setQty(i, -1)} data-testid={`cart-dec-${i}`}><Minus /></Button>
                    <span data-testid={`cart-qty-${i}`}><SaleQuantityInput qty={l.qty} unit={l.product.sale_unit}
                      onChange={(qty) => setCart((current) => current.map((line) => line.key === l.key ? { ...line, qty } : line))} /></span>
                    <Button size="icon-xs" variant="outline" onClick={() => setQty(i, 1)} data-testid={`cart-inc-${i}`}><Plus /></Button>
                    <Input value={l.notes} placeholder="Obs.: sem cebola…" onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
                      className="min-w-0 grow basis-28 text-xs" data-testid={`cart-notes-${i}`} />
                    <Button size="icon-xs" variant="ghost" onClick={() => setQty(i, -l.qty)} data-testid={`cart-remove-${i}`}><Trash2 /></Button>
                  </div>
                </div>
              ))}
              {cart.length === 0 && <p className="py-12 text-center text-sm text-zinc-500">Toque nos produtos para adicionar.</p>}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
              <Checkbox checked={kitchen} onCheckedChange={(v) => setKitchen(!!v)} data-testid="pdv-send-kitchen-checkbox" /> Enviar itens para a cozinha (KDS)
            </label>
          </aside>
        </div>
        <footer className="sticky bottom-0 z-10 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-elevated p-3">
          <dl className="flex min-w-0 flex-wrap gap-x-5 gap-y-1 text-xs" data-testid="pdv-sale-summary">
            <div><dt className="text-muted-foreground">Itens no pedido</dt><dd className="font-semibold">{itemCount}</dd></div>
            <div><dt className="text-muted-foreground">Vendas pendentes</dt><dd className="flex items-center gap-1 font-semibold"><ReceiptText className="size-3" /> {queue.length}</dd></div>
            <div><dt className="text-muted-foreground">Total da venda</dt><dd className="font-mono text-base font-semibold text-foreground" data-testid="pdv-subtotal">{brl(subtotal)}</dd></div>
          </dl>
          <Button className="min-h-11 whitespace-normal" disabled={!cart.length || sale.isPending} onClick={() => setPayOpen(true)} data-testid="pdv-checkout-button">Pagamento (F2)</Button>
        </footer>
      </div>
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} subtotal={subtotal} items={cart.map((line) => ({ name: line.product.name, qty: line.qty, unit_price: line.product.price + line.extra }))} title="Pagamento · Balcão" pending={sale.isPending} onConfirm={confirm} />
      <InvoiceDialog invoice={invoice} onClose={() => setInvoice(null)} />
      <OptionsDialog product={optFor} onClose={() => setOptFor(null)} onConfirm={push} />
    </AppShell>
  );
}
