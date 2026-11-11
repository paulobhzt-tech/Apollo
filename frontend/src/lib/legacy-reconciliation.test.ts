import { describe, expect, it } from "vitest";
import { reconcileLegacyPreview } from "./legacy-reconciliation";

const current = { establishment_id: "e1", server_id: "s1", operator_id: "o1" };
const sale = (client_ref: string, extra: Record<string, unknown> = {}) => ({
  payload: { client_ref, items: [{ product_id: "p1", qty: 1 }], ...extra },
  total: 12.5,
});

describe("legacy reconciliation preflight", () => {
  it("keeps even well-formed legacy sales blocked pending origin confirmation", () => {
    const pending = [sale("a")];
    const before = JSON.stringify(pending);
    expect(reconcileLegacyPreview(pending, [], current)).toEqual([
      { source: "pending", index: 0, client_ref: "a", decision: "needs_origin_confirmation" },
    ]);
    expect(JSON.stringify(pending)).toBe(before);
  });
  it("flags duplicate references across pending and rejected records", () => {
    const result = reconcileLegacyPreview([sale("a")], [sale("a")], current);
    expect(result.map(r => r.decision)).toEqual(["needs_origin_confirmation", "duplicate_reference"]);
  });
  it("rejects foreign or malformed identity instead of binding it to the active user", () => {
    const result = reconcileLegacyPreview([
      sale("a", { sync_context: { ...current, server_id: "foreign" } }),
      sale("b", { sync_context: { server_id: "unknown" } }),
      sale("c", { sync_context: current }),
    ], [], current);
    expect(result.map(r => r.decision)).toEqual(["foreign_identity", "foreign_identity", "needs_origin_confirmation"]);
  });
  it("flags missing references, invalid totals and missing items", () => {
    const result = reconcileLegacyPreview([
      sale(""),
      { ...sale("bad-total"), total: -1 },
      sale("no-items", { items: [] }),
      null,
    ], [], current);
    expect(result.map(r => r.decision)).toEqual(["invalid", "invalid", "invalid", "invalid"]);
  });
  it("does not treat corrupt/non-array sources as an empty verified queue", () => {
    expect(reconcileLegacyPreview({ unexpected: true }, null, current)).toEqual([
      { source: "pending", index: -1, client_ref: null, decision: "invalid" },
      { source: "rejected", index: -1, client_ref: null, decision: "invalid" },
    ]);
  });
});
