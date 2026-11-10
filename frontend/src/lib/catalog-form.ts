/** Parse quantities/currency typed in Portuguese without silently replacing errors with zero. */
export function catalogNumber(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  // With a comma, dots may be Brazilian grouping separators (1.234,56).
  const normalized = text.includes(",")
    ? (/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(text) ? text.replaceAll(".", "").replace(",", ".") : "")
    : (/^-?\d+(?:\.\d+)?$/.test(text) ? text : "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function ingredientValues(values: { stock: string; min_stock: string; cost_per_unit: string; units_per_kg: string }, unit: string) {
  const stock = catalogNumber(values.stock);
  const min_stock = catalogNumber(values.min_stock);
  const cost_per_unit = catalogNumber(values.cost_per_unit);
  const units_per_kg = unit === "kg" ? catalogNumber(values.units_per_kg) : 0;
  // Negative stock may already exist and is permitted by the backend contract.
  if (stock === null || min_stock === null || cost_per_unit === null || units_per_kg === null ||
      min_stock < 0 || cost_per_unit < 0 || units_per_kg < 0) return null;
  return { stock, min_stock, cost_per_unit, units_per_kg };
}
