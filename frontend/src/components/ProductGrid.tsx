import { useEffect, useMemo, useState, type RefObject } from "react";
import { Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { searchProducts } from "@/lib/product-search";
import { FAVORITES_KEY, readFavorites, saveFavorites, toggleFavorite } from "@/lib/product-favorites";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ProductGrid({ products, categories, onAdd, compact, searchInputRef, searchTestId = "product-search-input" }: {
  products: Product[];
  categories: Category[];
  onAdd: (p: Product) => void;
  compact?: boolean;
  searchTestId?: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [listMode, setListMode] = useState(false);
  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (event.key === FAVORITES_KEY || event.key === null) setFavorites(readFavorites()); };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  const favorite = (id: string) => {
    const next = toggleFavorite(favorites, id);
    setFavorites(next);
    if (!saveFavorites(next)) toast.warning("Favoritos disponíveis nesta tela; não foi possível salvar a preferência neste dispositivo.");
  };
  const list = useMemo(() => searchProducts(products, cat, q, favoritesOnly ? favorites : undefined), [products, cat, q, favoritesOnly, favorites]);

  return (
    <div className="@container min-w-0"><div className="grid min-h-0 min-w-0 gap-2 @min-[27rem]:grid-cols-[minmax(7rem,1fr)_minmax(0,3fr)]">
      <div className="flex min-w-0 flex-wrap items-center gap-2 @min-[27rem]:col-span-2">
        <div className="relative min-w-0 flex-1 basis-40">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        <Input
          ref={searchInputRef}
          placeholder="Buscar produto ou código (ex: PZ01)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && list.length === 1) { onAdd(list[0]); setQ(""); }
          }}
          className="h-9 pl-9"
          aria-label="Buscar produto por nome, código ou descrição"
          aria-keyshortcuts="F3"
          data-testid={searchTestId}
        />
        </div>
        <button type="button" onClick={() => setListMode((value) => !value)}
          className="min-h-9 rounded border border-border px-2 text-xs hover:bg-muted">
          {listMode ? "Exibir cartões" : "Exibir lista"}
        </button>
      </div>
      <div role="group" aria-label="Categorias de produtos" className="flex min-w-0 flex-wrap content-start gap-1.5 @min-[27rem]:max-h-96 @min-[27rem]:flex-col @min-[27rem]:flex-nowrap @min-[27rem]:overflow-y-auto @min-[27rem]:border-r @min-[27rem]:border-border @min-[27rem]:pr-3">
        <button type="button" onClick={() => setFavoritesOnly((value) => !value)} aria-pressed={favoritesOnly} data-testid="product-favorites-filter"
          className={cn("flex items-center gap-1.5 min-h-8 rounded border px-2 py-1 text-xs", favoritesOnly ? "border-primary bg-primary text-white" : "border-border bg-elevated text-foreground hover:border-primary/50")}>
          <Star className="size-4" fill={favoritesOnly ? "currentColor" : "none"} aria-hidden="true" /> Favoritos
        </button>
        {[{ id: "all", name: "Todos" }, ...categories].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id)}
            data-testid={`category-filter-${c.id}`}
            aria-pressed={cat === c.id}
            className={cn(
              "min-h-8 min-w-0 shrink-0 rounded border px-2 py-1 text-left text-xs wrap-anywhere transition-colors duration-150",
              cat === c.id ? "border-primary bg-primary text-white" : "border-border bg-elevated text-foreground hover:border-primary/50",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className={cn("grid min-w-0 content-start gap-1.5", listMode ? "grid-cols-1" : compact ? "grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))]" : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
        {list.map((p) => (
          <div key={p.id} className="relative min-w-0">
          <button
            type="button"
            onClick={() => onAdd(p)}
            data-testid={`product-card-${p.code || p.id}`}
            className="group h-full w-full rounded border border-border bg-elevated text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            {!listMode && p.image && (
              <div className="aspect-[2/1] overflow-hidden bg-muted">
                {p.image && <img src={p.image} alt={p.name} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />}
              </div>
            )}
            <div className={cn("p-2 pr-9", listMode && "flex flex-wrap items-center justify-between gap-2")}>
              <p className="wrap-anywhere text-sm font-medium text-foreground">{p.name}</p>
              {p.description && <p className="wrap-anywhere text-xs text-muted-foreground">{p.description}</p>}
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
                <span className="font-mono text-sm text-primary">{brl(p.price)}{p.sale_unit && p.sale_unit !== "un" ? ` / ${p.sale_unit}` : ""}</span>
                <span className="font-mono text-[10px] text-zinc-500">{p.code}</span>
              </div>
            </div>
          </button>
          <button type="button" onClick={() => favorite(p.id)} aria-label={`${favorites.includes(p.id) ? "Remover" : "Adicionar"} ${p.name} ${favorites.includes(p.id) ? "dos" : "aos"} favoritos`} aria-pressed={favorites.includes(p.id)}
            data-testid={`product-favorite-${p.id}`} title="Favorito neste dispositivo"
            className="absolute right-1 top-1 grid size-7 place-items-center rounded border border-border bg-panel text-amber-700 dark:text-amber-300 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary">
            <Star className="size-4" fill={favorites.includes(p.id) ? "currentColor" : "none"} aria-hidden="true" />
          </button>
          </div>
        ))}
        {list.length === 0 && <p className="col-span-full py-10 text-center text-sm text-zinc-500">{favoritesOnly ? "Nenhum favorito nesta seleção. Use a estrela dos produtos para montar seus atalhos." : "Nenhum produto encontrado."}</p>}
      </div>
    </div></div>
  );
}
