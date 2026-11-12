import { catalogNumber } from "./catalog-form";

export function equalBillShares(total: number, people: number) {
  const cents = Math.round(total * 100);
  const count = Number.isInteger(people) && people >= 1 && people <= 99 ? people : 1;
  const base = Math.floor(cents / count);
  return { amount: base / 100, extraAmount: (base + 1) / 100, extraPeople: cents % count, people: count };
}

export function previewBillShare(total: number, mode: "amount" | "percentage", input: string) {
  const value = catalogNumber(input);
  const cents = Math.round(total * 100);
  if (value === null || value <= 0 || (mode === "percentage" && value > 100)) return null;
  const share = Math.round(mode === "amount" ? value * 100 : cents * value / 100);
  if (share <= 0 || share > cents) return null;
  return { amount: share / 100, remaining: (cents - share) / 100 };
}
