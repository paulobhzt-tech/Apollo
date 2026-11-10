import { expect, it } from "vitest";
import { FAVORITES_KEY, readFavorites, saveFavorites, toggleFavorite, type FavoritesStorage } from "./product-favorites";
function storage(initial = "[]"): FavoritesStorage {
  const values = new Map([[FAVORITES_KEY, initial]]);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}
it("round trips a local ID preference and toggles without duplicates", () => {
  const local = storage();
  expect(saveFavorites(toggleFavorite(["a"], "b"), local)).toBe(true);
  expect(readFavorites(local)).toEqual(["a", "b"]);
  expect(toggleFavorite(readFavorites(local), "a")).toEqual(["b"]);
});
it("ignores corrupt or unexpected saved data", () => {
  expect(readFavorites(storage("broken"))).toEqual([]);
  expect(readFavorites(storage('{"password":"not-a-list"}'))).toEqual([]);
  expect(readFavorites(storage('["a","a",null,5,""]'))).toEqual(["a"]);
});
it("storage failure never breaks the cash register", () => {
  const unavailable = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
  expect(readFavorites(unavailable)).toEqual([]);
  expect(saveFavorites(["a"], unavailable)).toBe(false);
});
