import { expect, it } from "vitest";
import { cashAmount, catalogNumber, formatCurrencyTyping, ingredientValues } from "./catalog-form";

it("parses decimal quantities and Brazilian currency without losing precision", () => {
  expect(catalogNumber(" 12,50 ")).toBe(12.5);
  expect(catalogNumber("1.234,56")).toBe(1234.56);
  expect(catalogNumber("0.025")).toBe(0.025);
  // Production batches use this parser for kg, units and cost fields.
  expect(catalogNumber("20,5")).toBe(20.5);
  expect(catalogNumber("600,00")).toBe(600);
  expect(catalogNumber("-2,5")).toBe(-2.5);
});
it("rejects invalid or empty input instead of overwriting stored values with zero", () => {
  for (const value of ["", " ", "abc", "NaN", "Infinity", "-Infinity", "1,2,3", "12.34,56", "1e3"]) expect(catalogNumber(value)).toBeNull();
  expect(ingredientValues({ stock: "4", min_stock: "0", cost_per_unit: "abc", units_per_kg: "0" }, "kg")).toBeNull();
  expect(ingredientValues({ stock: "4", min_stock: "-1", cost_per_unit: "0", units_per_kg: "0" }, "kg")).toBeNull();
});
it("retains valid negative stock and ignores hidden yield for non-kg units", () => {
  expect(ingredientValues({ stock: "-1", min_stock: "0", cost_per_unit: "1,25", units_per_kg: "abc" }, "un")).toEqual({ stock: -1, min_stock: 0, cost_per_unit: 1.25, units_per_kg: 0 });
});

it("keeps cents when operators type a decimal point or comma", () => {
  expect(cashAmount("12.50")).toBe(12.5);
  expect(cashAmount("12,50")).toBe(12.5);
  expect(cashAmount("R$ 1.234,56")).toBe(1234.56);
  expect(cashAmount("1.234")).toBe(1234);
  expect(cashAmount("12.50.00")).toBeNull();
  expect(cashAmount("-1")).toBeNull();
});

// Used by the stock movement dialog to reject malformed or non-finite quantities.
it("validates stock movement numeric input before submitting", () => {
  expect(catalogNumber("1,5")).toBe(1.5);
  expect(catalogNumber("0")).toBe(0); // allowed for inventory adjustments only
  expect(catalogNumber("-1")).toBe(-1); // caller rejects negatives for stock movements
  for (const input of ["Infinity", "NaN", "1e309", "1,2,3", ""]) {
    expect(catalogNumber(input)).toBeNull();
  }
});


it("formats currency automatically as Brazilian reais while typing digits", () => {
  expect(formatCurrencyTyping("")).toBe("");
  expect(formatCurrencyTyping("1")).toBe("0,01");
  expect(formatCurrencyTyping("12")).toBe("0,12");
  expect(formatCurrencyTyping("123")).toBe("1,23");
  expect(formatCurrencyTyping("12345")).toBe("123,45");
  expect(formatCurrencyTyping("1234567")).toBe("12.345,67");
  expect(formatCurrencyTyping("R$ 1.234,56")).toBe("1.234,56");
  expect(catalogNumber(formatCurrencyTyping("1234567"))).toBe(12345.67);
});
