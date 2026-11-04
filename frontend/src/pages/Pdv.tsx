import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBag, Trash2, WifiOff } from "lucide-react";
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
import { cacheMenu, cachedMenu, enqueue, useOffline } from "@/lib/offline";
import { queryClient } from "@/lib/queryClient";
import type { Category, ChosenOption, Invoice, PayIn, Product, QuickSaleIn, SaleResult } from "@/lib/types";

interface CartLine { key: string; product: Product; qty: number; notes: string; options: ChosenOption[]; labels: string[]; extra: number }

export default function Pdv() {
  const { offline, queue } = useOffline();
  const products = useQuery({ queryKey: ["products"], queryFn: () => apiGet<Product[]>("/products") });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories") });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [kitchen, setKitchen] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  useEffect(() => { if (products.data) cacheMenu(products.data); }, [products.data]);
  const prodList = products.data ?? cachedMenu();
  const subtotal = Math.round(cart.reduce((s, l) => s + l.qty * (l.product.price + l.extra), 0) * 100) / 100;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2" && cart.length) { e.preventDefault(); setPayOpen(true); }
      if (e.key === "F4") { e.preventDefault(); setCart([]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.length]);

  const [optFor, setOptFor] = useState<Product | null>(null);
  const push = (p: Product, picked?: Picked) => setCart((c) => {
    if (!picked) {
      const i = c.findIndex((l) => l.product.id === p.id && !l.notes && !l.options.length);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
    }
    return [...c, { key: uid(), product: p, qty: 1, notes: "", options: picked?.options ?? [], labels: picked?.labels ?? [], extra: picked?.extra ?? 0 }];
  });
  const add = (p: Product) => (p.options?.length ? setOptFor(p) : push(p));
  const setQty = (i: number, d: number) =>
    setCart((c) => c.flatMap((l, j) => (j !== i ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }])));

  const reset = () => { setCart([]); setCustomer(""); setPayOpen(false); };

  const sale = useMutation({
    mutationFn: (p: QuickSaleIn) => apiPost<SaleResult>("/pdv/sale", p),
    onSuccess: (r) => {
      toast.success(`Venda #${r.order.number} finalizada${r.order.change ? ` · Troco ${brl(r.order.change)}` : ""}`);
      reset();
      if (r.invoice) setInvoice(r.invoice);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["cash"] });
    },
    onError: (e, p) => {
      if (!(e instanceof ApiError)) {
        enqueue({ payload: p, total: subtotal, queued_at: new Date().toISOString() });
        toast.warning("Sem conexão: venda salva no modo contingência e será sincronizada");
        reset();
      } else toast.error(errMsg(e));
    },
  });

  const confirm = (pay: PayIn) => {
    const payload: QuickSaleIn = {
      ...pay, client_ref: uid(), customer_name: customer, send_to_kitchen: kitchen,
      items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty, notes: l.notes, options: l.options })),
    };
    if (offline) {
      enqueue({ payload, total: subtotal, queued_at: new Date().toISOString() });
      toast.warning("Modo offline: venda registrada localmente (nota será emitida em contingência)");
      reset();
      return;
    }
    sale.mutate(payload);
  };

  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Frente de Caixa" subtitle="F2 pagamento · F4 limpar · Enter na busca adiciona o item" actions={
        offline ? <span className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200" data-testid="pdv-offline-banner"><WifiOff className="size-3.5" /> Contingência offline · {queue.length} na fila</span> : null
      } />
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7 2xl:col-span-8">
          <ProductGrid products={prodList} categories={categories.data ?? []} onAdd={add} />
        </div>
        <aside className="xl:col-span-5 2xl:col-span-4">
          <div className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col rounded-2xl border border-white/5 bg-[#121520] p-4" data-testid="pdv-cart">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-heading text-lg text-white"><ShoppingBag className="size-5 text-primary" /> Venda atual</h3>
              {cart.length > 0 && <Button variant="ghost" size="sm" onClick={() => setCart([])} data-testid="pdv-clear-cart">Limpar</Button>}
            </div>
            <Input placeholder="Nome do cliente (opcional)" value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-3" data-testid="pdv-customer-input" />
            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {cart.map((l, i) => (
                <div key={l.key} className="rounded-xl bg-panel p-3 animate-rise" data-testid={`cart-line-${i}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white">{l.product.name}{l.labels.length > 0 && <span className="block text-xs text-primary">{l.labels.join(" · ")}</span>}</p>
                    <p className="font-mono text-sm text-white">{brl(l.qty * (l.product.price + l.extra))}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="icon-xs" variant="outline" onClick={() => setQty(i, -1)} data-testid={`cart-dec-${i}`}><Minus /></Button>
                    <span className="w-6 text-center font-mono text-sm" data-testid={`cart-qty-${i}`}>{l.qty}</span>
                    <Button size="icon-xs" variant="outline" onClick={() => setQty(i, 1)} data-testid={`cart-inc-${i}`}><Plus /></Button>
                    <Input value={l.notes} placeholder="Obs.: sem cebola…" onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
                      className="h-7 flex-1 text-xs" data-testid={`cart-notes-${i}`} />
                    <Button size="icon-xs" variant="ghost" onClick={() => setQty(i, -l.qty)} data-testid={`cart-remove-${i}`}><Trash2 /></Button>
                  </div>
                </div>
              ))}
              {cart.length === 0 && <p className="py-12 text-center text-sm text-zinc-500">Toque nos produtos para adicionar.</p>}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
              <Checkbox checked={kitchen} onCheckedChange={(v) => setKitchen(!!v)} data-testid="pdv-send-kitchen-checkbox" /> Enviar itens para a cozinha (KDS)
            </label>
            <div className="mt-3 flex items-end justify-between border-t border-white/10 pt-3">
              <span className="text-sm text-zinc-400">{cart.reduce((s, l) => s + l.qty, 0)} itens</span>
              <span className="font-mono text-3xl font-medium text-white" data-testid="pdv-subtotal">{brl(subtotal)}</span>
            </div>
            <Button className="mt-3 h-14 text-lg" disabled={!cart.length} onClick={() => setPayOpen(true)} data-testid="pdv-checkout-button">
              Pagamento (F2)
            </Button>
          </div>
        </aside>
      </div>
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} subtotal={subtotal} title="Pagamento · Balcão" pending={sale.isPending} onConfirm={confirm} />
      <InvoiceDialog invoice={invoice} onClose={() => setInvoice(null)} />
      <OptionsDialog product={optFor} onClose={() => setOptFor(null)} onConfirm={push} />
    </AppShell>
  );
}
