import type { OrderItem } from "@/lib/types";

export interface GroupedItem { key: string; lines: { id: string; qty: number }[]; name: string; options: string[]; notes: string[]; qty: number; unit_price: number; total: number }

/** Sums the quantity of identical products (same name, options and price); cancelled items are left out. */
export function groupItems(items: (Pick<OrderItem, "name" | "qty" | "unit_price" | "options" | "notes" | "cancelled"> & { id?: string })[]): GroupedItem[] {
  const map = new Map<string, GroupedItem>();
  for (const i of items) {
    if (i.cancelled) continue;
    const options = i.options ?? [];
    const key = `${i.name}|${options.join(",")}|${i.unit_price}`;
    const g = map.get(key) ?? { key, lines: [], name: i.name, options, notes: [], qty: 0, unit_price: i.unit_price, total: 0 };
    g.qty += i.qty;
    if (i.id) g.lines.unshift({ id: i.id, qty: i.qty }); // newest first
    g.total = Math.round(g.qty * g.unit_price * 100) / 100;
    if (i.notes && !g.notes.includes(i.notes)) g.notes.push(i.notes);
    map.set(key, g);
  }
  return [...map.values()];
}
