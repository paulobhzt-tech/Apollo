import type { Product } from "./types";
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
/** A scanned exact code takes precedence over category/name matches. */
export function searchProducts(products: Product[], category: string, query: string): Product[] {
  const q = normalize(query);
  const active = products.filter((product) => product.active);
  if (q) {
    const exact = active.filter((product) => normalize(product.code || "") === q);
    if (exact.length) return exact;
  }
  return active.filter((product) => (category === "all" || product.category_id === category) &&
    (!q || normalize(product.name).includes(q)));
}
