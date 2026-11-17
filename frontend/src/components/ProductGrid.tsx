import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ProductGrid({ products, categories, onAdd, compact }: {
  products: Product[];
  categories: Category[];
  onAdd: (p: Product) => void;
  compact?: boolean;
}) {
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => p.active && (cat === "all" || p.category_id === cat) &&
      (!s || p.name.toLowerCase().includes(s) || p.code.toLowerCase() === s));
  }, [products, cat, q]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Buscar produto ou código (ex: PZ01)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && list.length === 1) { onAdd(list[0]); setQ(""); }
          }}
          className="h-11 pl-9"
          data-testid="product-search-input"
        />
      </div>
      <div className={cn("flex gap-2 pb-1", compact ? "min-w-0 flex-wrap" : "overflow-x-auto")}>
        {[{ id: "all", name: "Todos" }, ...categories].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id)}
            data-testid={`category-filter-${c.id}`}
            className={cn(
              compact ? "min-w-0 max-w-full rounded-full border px-4 py-1.5 text-sm break-words transition-colors duration-150" : "shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors duration-150",
              cat === c.id ? "border-primary bg-primary text-white" : "border-white/10 text-zinc-300 hover:border-white/25",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4")}>
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onAdd(p)}
            data-testid={`product-card-${p.code || p.id}`}
            className={cn("group min-w-0 rounded-2xl border border-white/5 bg-panel text-left transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.98]", !compact && "overflow-hidden")}
          >
            {!compact && (
              <div className="aspect-[16/10] overflow-hidden bg-muted">
                {p.image && <img src={p.image} alt={p.name} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />}
              </div>
            )}
            <div className="p-3">
              <p className={cn("text-sm font-medium text-white", compact ? "[overflow-wrap:anywhere]" : "line-clamp-1")}>{p.name}</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-1">
                <span className="font-mono text-sm text-primary">{brl(p.price)}</span>
                <span className="font-mono text-[10px] text-zinc-500 [overflow-wrap:anywhere]">{p.code}</span>
              </div>
            </div>
          </button>
        ))}
        {list.length === 0 && <p className="col-span-full py-10 text-center text-sm text-zinc-500">Nenhum produto encontrado.</p>}
      </div>
    </div>
  );
}
