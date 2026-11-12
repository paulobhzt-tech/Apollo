import { expect, it } from "vitest";
import { equalBillShares, previewBillShare } from "./bill-split";

it("assigns remaining cents without increasing or decreasing the total", () => {
  const split = equalBillShares(100, 3);
  expect(split).toEqual({ amount: 33.33, extraAmount: 33.34, extraPeople: 1, people: 3 });
  expect(equalBillShares(100, 2.5).people).toBe(1);
});

it("previews a percentage or amount in cents and rejects shares beyond the total", () => {
  expect(previewBillShare(10.01, "percentage", "50")).toEqual({ amount: 5.01, remaining: 5 });
  expect(previewBillShare(10.01, "amount", "4,35")).toEqual({ amount: 4.35, remaining: 5.66 });
  expect(previewBillShare(10, "amount", "11")).toBeNull();
  expect(previewBillShare(10, "percentage", "100,01")).toBeNull();
  expect(previewBillShare(10, "amount", "0,001")).toBeNull();
});
