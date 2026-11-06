import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Heart, Minus, Plus, Search, ShoppingBag } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import OptionsDialog, { type Picked } from "./OptionsDialog";
import { apiGet } from "@/lib/api";
import { brl, uid } from "@/lib/format";
import type { ChosenOption, OrderItemIn, Product, PublicMenu as Menu } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CartLine { key: string; product: Product; qty: number; notes: string; options: ChosenOption[]; labels: string[]; extra: number }

export default function PublicMenu({ header, renderCheckout, cartOpen, setCartOpen }: {
  header: ReactNode;
  renderCheckout: (lines: CartLine[], items: OrderItemIn[], total: number, clear: () => void) => ReactNode;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
}) {
  const menu = useQuery({ queryKey: ["public-menu"], queryFn: () => apiGet<Menu>("/public/menu") });
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const data = menu.isError ? undefined : menu.data;
  const prods = useMemo(() => (data?.products ?? []).filter((p) => {
    if (cat !== "all" && p.category_id !== cat) return false;
    if (favoritesOnly && !favorites.includes(p.id)) return false;
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return !q || `${p.name} ${p.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(q);
  }), [data, cat, search, favoritesOnly, favorites]);
  const toggleFavorite = (id: string) => setFavorites((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const total = Math.round(cart.reduce((s, l) => s + l.qty * (l.product.price + l.extra), 0) * 100) / 100;
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const [optFor, setOptFor] = useState<Product | null>(null);
  const push = (p: Product, picked?: Picked) => setCart((c) => {
    if (!picked) {
      const i = c.findIndex((l) => l.product.id === p.id && !l.notes && !l.options.length);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
    }
    return [...c, { key: uid(), product: p, qty: 1, notes: "", options: picked?.options ?? [], labels: picked?.labels ?? [], extra: picked?.extra ?? 0 }];
  });
  const add = (p: Product) => (p.options?.length ? setOptFor(p) : push(p));
  const dec = (i: number) => setCart((c) => c.flatMap((l, j) => (j !== i ? [l] : l.qty <= 1 ? [] : [{ ...l, qty: l.qty - 1 }])));

  return (
    <div className="min-h-screen bg-[#0B0C10] pb-28">
      <header className="relative overflow-hidden">
        <img src="https://images.unsplash.com/photo-1651980979183-79425af50103?crop=entropy&cs=srgb&fm=jpg&q=70&w=1200" alt="" className="absolute inset-0 size-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-[#0B0C10]" />
        <div className="relative mx-auto max-w-3xl px-5 pb-6 pt-10">
          <div className="flex items-center gap-2 text-primary"><Flame className="size-5" /><span className="text-xs uppercase tracking-[0.2em]">Cardápio digital</span></div>
          <h1 className="mt-2 font-heading text-4xl font-semibold text-white" data-testid="public-restaurant-name">{data?.restaurant ?? "Espeteria Churras Burguer"}</h1>
          {header}
        </div>
      </header>
      <nav className="sticky top-0 z-20 border-b border-white/5 bg-[#0B0C10]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-5 py-3">
          {[{ id: "all", name: "Tudo" }, ...(data?.categories ?? [])].map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} data-testid={`public-category-${c.id}`}
              className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors duration-150", cat === c.id ? "bg-primary text-white" : "bg-white/5 text-zinc-300")}>
              {c.name}
            </button>
          ))}
        </div>
      </nav>
      <div className="mx-auto flex max-w-3xl flex-wrap gap-2 px-5 pt-4">
        <div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 size-4 text-zinc-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pratos, bebidas e ingredientes..." aria-label="Buscar no cardápio" className="pl-9" data-testid="public-menu-search" /></div>
        <Button variant={favoritesOnly ? "default" : "outline"} onClick={() => setFavoritesOnly((v) => !v)} data-testid="public-favorites-filter"><Heart className="size-4" /> Favoritos ({favorites.length})</Button>
      </div>
      <main className="mx-auto max-w-3xl space-y-3 px-5 py-5">
        {menu.isError && <p className="py-10 text-center text-sm text-zinc-500">Cardápio indisponível no momento.</p>}
        {!menu.isLoading && !menu.isError && prods.length === 0 && <p className="py-10 text-center text-sm text-zinc-400" data-testid="public-menu-no-results">Nenhum produto encontrado. Tente outra busca ou categoria.</p>}
        {prods.map((p) => {
          const inCart = cart.filter((l) => l.product.id === p.id).reduce((t, l) => t + l.qty, 0);
          return (
            <article key={p.id} className="flex gap-4 rounded-2xl border border-white/5 bg-[#141722] p-3 animate-rise" data-testid={`public-product-${p.code || p.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2"><h3 className="font-heading text-base font-semibold text-white">{p.name}</h3><button type="button" aria-label={favorites.includes(p.id) ? `Remover ${p.name} dos favoritos` : `Favoritar ${p.name}`} aria-pressed={favorites.includes(p.id)} onClick={() => toggleFavorite(p.id)} className="rounded-lg p-1 text-rose-300" data-testid={`public-favorite-${p.code || p.id}`}><Heart className={cn("size-5", favorites.includes(p.id) && "fill-current")} /></button></div>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{p.description}</p>
                <p className="mt-2 font-mono text-primary">{brl(p.price)}</p>
              </div>
              <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-white/5">
                {p.image && <img src={p.image} alt={p.name} loading="lazy" className="size-full object-cover" />}
                <button type="button" onClick={() => add(p)} data-testid={`public-add-${p.code || p.id}`}
                  className="absolute bottom-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-primary text-white shadow-lg transition-transform duration-150 active:scale-90">
                  {inCart ? <span className="font-mono text-xs">{inCart}</span> : <Plus className="size-4" />}
                </button>
              </div>
            </article>
          );
        })}
      </main>
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4">
          <button type="button" onClick={() => setCartOpen(true)} data-testid="public-cart-button"
            className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between rounded-2xl bg-primary px-5 font-medium text-white shadow-2xl shadow-primary/30 transition-transform duration-150 active:scale-[0.98]">
            <span className="flex items-center gap-2"><ShoppingBag className="size-5" /> Ver pedido ({count})</span>
            <span className="font-mono">{brl(total)}</span>
          </button>
        </div>
      )}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl border-white/10 bg-[#121520] p-5" data-testid="public-cart-sheet">
          <SheetTitle className="font-heading text-xl text-white">Seu pedido</SheetTitle>
          <div className="mx-auto mt-3 w-full max-w-3xl space-y-3">
            {cart.map((l, i) => (
              <div key={l.key} className="rounded-xl bg-white/5 p-3" data-testid={`public-cart-line-${i}`}>
                <div className="flex items-center gap-3">
                  <Button size="icon-xs" variant="outline" onClick={() => dec(i)} data-testid={`public-cart-dec-${i}`}><Minus /></Button>
                  <span className="w-5 text-center font-mono">{l.qty}</span>
                  <Button size="icon-xs" variant="outline" onClick={() => setCart((c) => c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))} data-testid={`public-cart-inc-${i}`}><Plus /></Button>
                  <span className="flex-1 text-sm text-white">{l.product.name}{l.labels.length > 0 && <span className="block text-xs text-primary">{l.labels.join(" · ")}</span>}</span>
                  <span className="font-mono text-sm">{brl(l.qty * (l.product.price + l.extra))}</span>
                </div>
                <Input value={l.notes} placeholder="Observação (ex: sem cebola, borda recheada)" onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
                  className="mt-2 h-8 text-xs" data-testid={`public-cart-notes-${i}`} />
              </div>
            ))}
            {renderCheckout(cart, cart.map((l) => ({ product_id: l.product.id, qty: l.qty, notes: l.notes, options: l.options })), total, () => setCart([]))}
          </div>
        </SheetContent>
      </Sheet>
      <OptionsDialog product={optFor} onClose={() => setOptFor(null)} onConfirm={push} />
      <Toaster richColors position="bottom-center" />
    </div>
  );
}
