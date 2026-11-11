import { describe, expect, it } from "vitest";
import { contextToken, queueKeys, sameContext, sameQueuedRequest, validContext, type QueueContext } from "./queue-context";

const cashierA: QueueContext = { establishment_id: "restaurant-a", server_id: "server-a", operator_id: "cashier-a" };

describe("offline queue identity boundaries", () => {
  it("does not accept incomplete or malformed authenticated identities", () => {
    expect(validContext(null)).toBe(false);
    expect(validContext({ ...cashierA, operator_id: "" })).toBe(false);
    expect(validContext({ ...cashierA, server_id: 123 })).toBe(false);
    expect(validContext({ ...cashierA, establishment_id: "x".repeat(129) })).toBe(false);
    expect(validContext(cashierA)).toBe(true);
  });

  it("isolates every persistent key by establishment, server and operator", () => {
    const original = queueKeys(cashierA);
    for (const field of ["establishment_id", "server_id", "operator_id"] as const) {
      const foreign = { ...cashierA, [field]: "different" };
      const foreignKeys = queueKeys(foreign);
      for (const name of Object.keys(original) as Array<keyof typeof original>) {
        expect(foreignKeys[name]).not.toBe(original[name]);
      }
      expect(sameContext(cashierA, foreign)).toBe(false);
    }
    expect(new Set(Object.values(original)).size).toBe(Object.keys(original).length);
  });

  it("does not treat unbound legacy storage as an authenticated queue", () => {
    const unbound = queueKeys(null);
    const bound = queueKeys(cashierA);
    for (const name of Object.keys(unbound) as Array<keyof typeof unbound>) {
      expect(unbound[name]).not.toBe(bound[name]);
    }
    expect(sameContext(null, cashierA)).toBe(false);
    expect(contextToken(cashierA)).toBe(JSON.stringify(["restaurant-a", "server-a", "cashier-a"]));
  });

  it("avoids collisions for identities containing delimiters and unicode", () => {
    const a = { establishment_id: "a:b", server_id: "c", operator_id: "operador-ç" };
    const b = { establishment_id: "a", server_id: "b:c", operator_id: "operador-ç" };
    expect(contextToken(a)).not.toBe(contextToken(b));
    expect(queueKeys(a).KEY).not.toBe(queueKeys(b).KEY);
  });
});

describe("queued payment replay integrity", () => {
  const original = {
    client_ref: "sale-1",
    payments: [{ method: "dinheiro", amount: 40 }],
    items: [{ product_id: "p1", qty: 2 }],
    sync_context: cashierA,
  };

  it("accepts equivalent object property order and omitted undefined fields", () => {
    const reordered = {
      items: [{ qty: 2, product_id: "p1" }],
      sync_context: { operator_id: "cashier-a", server_id: "server-a", establishment_id: "restaurant-a" },
      payments: [{ amount: 40, method: "dinheiro" }],
      client_ref: "sale-1",
      optional: undefined,
    };
    expect(sameQueuedRequest(original, reordered)).toBe(true);
  });

  it("rejects changed payment, quantity, reference or operator", () => {
    expect(sameQueuedRequest(original, { ...original, payments: [{ method: "dinheiro", amount: 41 }] })).toBe(false);
    expect(sameQueuedRequest(original, { ...original, items: [{ product_id: "p1", qty: 3 }] })).toBe(false);
    expect(sameQueuedRequest(original, { ...original, client_ref: "sale-2" })).toBe(false);
    expect(sameQueuedRequest(original, { ...original, sync_context: { ...cashierA, operator_id: "cashier-b" } })).toBe(false);
  });

  it("preserves array order rather than treating reordered payment entries as identical", () => {
    const payments = [{ method: "dinheiro", amount: 20 }, { method: "pix", amount: 20 }];
    expect(sameQueuedRequest({ ...original, payments }, { ...original, payments: [...payments].reverse() })).toBe(false);
  });
});
