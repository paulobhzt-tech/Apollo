import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { searchProducts } from "@/lib/product-search";
import { FAVORITES_KEY, readFavorites, saveFavorites, toggleFavorite } from "@/lib/product-favorites";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ProductGrid({ products, categories, onAdd, compact, workstationDetails, searchInputRef, searchTestId = "product-search-input" }: {
  products: Product[];
  categories: Category[];
  onAdd: (p: Product) => void;
  compact?: boolean;
  workstationDetails?: ReactNode;
  searchTestId?: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [listMode, setListMode] = useState(Boolean(workstationDetails));
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
    <div className={cn("@container min-w-0", workstationDetails && "apollo-catalog-viewport")}><div className={cn("grid min-h-0 min-w-0 gap-3 @min-[30rem]:grid-cols-[minmax(8rem,1fr)_minmax(0,3fr)]", workstationDetails && "apollo-catalog-grid")}>
      <div className="apollo-catalog-search flex min-w-0 flex-wrap items-center gap-2 @min-[30rem]:col-span-2">
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
          className="h-11 pl-9"
          aria-label="Buscar produto por nome, código ou descrição"
          aria-keyshortcuts="F3"
          data-testid={searchTestId}
        />
        </div>
        <button type="button" onClick={() => setListMode((value) => !value)}
          className="min-h-11 rounded-lg border border-border px-3 text-sm hover:bg-muted">
          {listMode ? "Exibir cartões" : "Exibir lista"}
        </button>
      </div>
      <div className="apollo-catalog-rail min-w-0">
      <div role="group" aria-label="Categorias de produtos" className="flex min-w-0 flex-wrap content-start gap-1.5 @min-[30rem]:max-h-96 @min-[30rem]:flex-col @min-[30rem]:flex-nowrap @min-[30rem]:overflow-y-auto @min-[30rem]:border-r @min-[30rem]:border-border @min-[30rem]:pr-3">
        <button type="button" onClick={() => setFavoritesOnly((value) => !value)} aria-pressed={favoritesOnly} data-testid="product-favorites-filter"
          className={cn("flex items-center gap-1.5 min-h-10 rounded-lg border px-3 py-1.5 text-sm", favoritesOnly ? "border-primary bg-primary text-white" : "border-white/10 text-zinc-300 hover:border-white/25")}>
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
              "min-h-10 min-w-0 shrink-0 rounded-lg border px-3 py-1.5 text-left text-sm wrap-anywhere transition-colors duration-150",
              cat === c.id ? "border-primary bg-primary text-white" : "border-white/10 text-zinc-300 hover:border-white/25",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
      {workstationDetails && <details className="mt-2 border-t border-border pt-2">
        <summary className="cursor-pointer text-sm font-medium">Dados da mesa</summary>
        <div className="mt-2 space-y-2">{workstationDetails}</div>
      </details>}
      </div>
      <div className={cn("apollo-catalog-results grid min-w-0 content-start gap-2", listMode ? "grid-cols-1" : compact ? "grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))]" : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
        {list.map((p) => (
          <div key={p.id} className="relative min-w-0">
          <button
            type="button"
            onClick={() => onAdd(p)}
            data-testid={`product-card-${p.code || p.id}`}
            className="group h-full w-full overflow-hidden rounded-md border border-border bg-panel text-left transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.98]"
          >
            {!listMode && (!compact || p.image) && (
              <div className="aspect-[16/10] overflow-hidden bg-muted">
                {p.image && <img src={p.image} alt={p.name} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />}
              </div>
            )}
            <div className={cn("p-2 pr-11", listMode && "flex flex-wrap items-center justify-between gap-2")}>
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
            className="absolute right-1 top-1 grid size-9 place-items-center rounded-full border border-white/15 bg-panel text-amber-300 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary">
            <Star className="size-4" fill={favorites.includes(p.id) ? "currentColor" : "none"} aria-hidden="true" />
          </button>
          </div>
        ))}
        {list.length === 0 && <p className="col-span-full py-10 text-center text-sm text-zinc-500">{favoritesOnly ? "Nenhum favorito nesta seleção. Use a estrela dos produtos para montar seus atalhos." : "Nenhum produto encontrado."}</p>}
      </div>
    </div></div>
  );
}
