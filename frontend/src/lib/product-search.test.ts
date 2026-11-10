import { expect, it } from "vitest";
import { searchProducts } from "./product-search";
import type { Product } from "./types";
const products = [
  { id: "1", name: "Porção de pão", code: "P01", category_id: "food", active: true },
  { id: "2", name: "Chopp P01 especial", code: "C01", category_id: "drink", active: true },
  { id: "3", name: "Antigo", code: "OLD", category_id: "food", active: false },
] as Product[];
it("adds the scanned exact code even with another category selected", () => {
  expect(searchProducts(products, "drink", " p01 ").map(p => p.id)).toEqual(["1"]);
});
it("finds names without accents and respects category filters", () => {
  expect(searchProducts(products, "all", "porcao").map(p => p.id)).toEqual(["1"]);
  expect(searchProducts(products, "drink", "porcao")).toEqual([]);
});
it("never returns inactive scanned products", () => {
  expect(searchProducts(products, "all", "OLD")).toEqual([]);
});
