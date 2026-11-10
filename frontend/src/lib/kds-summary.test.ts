import { expect, it } from "vitest";
import { summarizeKds } from "./kds-summary";
import type { KitchenTicket } from "./types";
const now = Date.parse("2026-11-10T20:00:00Z");
function ticket(id: string, status: KitchenTicket["status"], minutes: number, stations = ["cozinha"]): KitchenTicket {
  return { id, status, created_at: new Date(now - minutes * 60000).toISOString(), items: stations.map(station => ({ station })) } as KitchenTicket;
}
const tickets = [ticket("new", "novo", 5), ticket("late", "preparo", 15), ticket("critical", "preparo", 26), ticket("ready", "pronto", 40), ticket("delivered", "entregue", 60), ticket("bar", "novo", 30, ["bar"]), ticket("shared", "novo", 2, ["cozinha", "bar"])];
it("restricts cards, items and counts to the selected production station", () => {
  const result = summarizeKds(tickets, "bar", false, true, now);
  expect(result.list.map(t => t.id)).toEqual(["bar", "shared"]);
  expect(result.list.find(t => t.id === "shared")?.items.map(i => i.station)).toEqual(["bar"]);
  expect(result.waiting).toBe(2);
  expect(result.oldestWaiting).toBe(30);
  expect(tickets.find(t => t.id === "shared")?.items).toHaveLength(2);
});
it("excludes delivered tickets from cards, aging and readiness counts", () => {
  const result = summarizeKds([ticket("done", "entregue", 90), ticket("ready", "pronto", 50)], "all", false, true, now);
  expect(result.list.map(t => t.id)).toEqual(["ready"]);
  expect(result).toMatchObject({ ready: 1, waiting: 0, preparing: 0, delayed: 0, critical: 0, oldestWaiting: 0 });
});
it("keeps station readiness counts while showing only late cards", () => {
  const full = summarizeKds(tickets, "cozinha", false, true, now);
  const late = summarizeKds(tickets, "cozinha", true, true, now);
  expect(late.list.map(t => t.id)).toEqual(["critical", "late"]);
  const { list: _full, ...fullCounts } = full;
  const { list: _late, ...lateCounts } = late;
  expect(lateCounts).toEqual(fullCounts);
  expect(late).toMatchObject({ ready: 1, waiting: 2, preparing: 2, delayed: 2, critical: 1, oldestWaiting: 26 });
});
it("returns zero counts and no cards for an empty station", () => {
  expect(summarizeKds(tickets, "pizza", true, true, now)).toEqual({ list: [], waiting: 0, preparing: 0, ready: 0, delayed: 0, critical: 0, oldestWaiting: 0 });
});
it("sorts cards newest first without changing counts", () => {
  expect(summarizeKds(tickets, "bar", false, false, now).list.map(t => t.id)).toEqual(["shared", "bar"]);
});
