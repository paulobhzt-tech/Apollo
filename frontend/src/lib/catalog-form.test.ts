import { expect, it } from "vitest";
import { catalogNumber, ingredientValues } from "./catalog-form";

it("parses decimal quantities and Brazilian currency without losing precision", () => {
  expect(catalogNumber(" 12,50 ")).toBe(12.5);
  expect(catalogNumber("1.234,56")).toBe(1234.56);
  expect(catalogNumber("0.025")).toBe(0.025);
  expect(catalogNumber("-2,5")).toBe(-2.5);
});
it("rejects invalid or empty input instead of overwriting stored values with zero", () => {
  for (const value of ["", " ", "abc", "NaN", "Infinity", "1,2,3", "12.34,56", "1e3"]) expect(catalogNumber(value)).toBeNull();
  expect(ingredientValues({ stock: "4", min_stock: "0", cost_per_unit: "abc", units_per_kg: "0" }, "kg")).toBeNull();
  expect(ingredientValues({ stock: "4", min_stock: "-1", cost_per_unit: "0", units_per_kg: "0" }, "kg")).toBeNull();
});
it("retains valid negative stock and ignores hidden yield for non-kg units", () => {
  expect(ingredientValues({ stock: "-1", min_stock: "0", cost_per_unit: "1,25", units_per_kg: "abc" }, "un")).toEqual({ stock: -1, min_stock: 0, cost_per_unit: 1.25, units_per_kg: 0 });
});
