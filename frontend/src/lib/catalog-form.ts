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

/** Accept decimal comma, decimal point and Brazilian currency grouping. */
export function cashAmount(value: string): number | null {
  const text = value.trim().replace(/^R\$\s*/, "");
  if (!/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/.test(text)) return null;
  return catalogNumber(/^\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replaceAll(".", "") : text);
}

/** Currency input mask: typing digits automatically places cents and thousands separators. */
export function formatCurrencyTyping(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 15);
  if (!digits) return "";
  const cents = digits.slice(-2).padStart(2, "0");
  const whole = (digits.slice(0, -2) || "0").replace(/^0+(?=\d)/, "");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + cents;
}
