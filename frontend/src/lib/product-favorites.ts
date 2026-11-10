/** Optional device preference only: product IDs, never orders, customer or payment data. */
export const FAVORITES_KEY = "apollo_product_favorites_v1";
export interface FavoritesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const clean = (ids: unknown): string[] => Array.isArray(ids)
  ? [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200))].slice(0, 500)
  : [];
export function readFavorites(storage?: FavoritesStorage): string[] {
  try { return clean(JSON.parse((storage ?? localStorage).getItem(FAVORITES_KEY) || "[]")); }
  catch { return []; }
}
export function saveFavorites(ids: readonly string[], storage?: FavoritesStorage): boolean {
  try { (storage ?? localStorage).setItem(FAVORITES_KEY, JSON.stringify(clean(ids))); return true; }
  catch { return false; }
}
export function toggleFavorite(ids: readonly string[], id: string): string[] {
  return clean(ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
}
