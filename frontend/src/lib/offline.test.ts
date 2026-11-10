import { beforeEach, expect, it, vi } from "vitest";
const storage = new Map<string, string>();
const post = vi.fn();
vi.mock("./desktop", () => ({ deviceTag: () => "test", kv: { get: (k: string) => storage.get(k) ?? null, set: (k: string, v: string) => storage.set(k, v) } }));
vi.mock("./api", () => ({ apiPost: (...args: unknown[]) => post(...args), ApiError: class extends Error { status = 503; } }));
vi.mock("./queryClient", () => ({ queryClient: { invalidateQueries: vi.fn() } }));
beforeEach(() => {
  vi.resetModules(); storage.clear(); post.mockReset();
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("navigator", { onLine: true });
  vi.useFakeTimers();
});
it("stops at a transient failure and preserves FIFO for the next sync", async () => {
  const offline = await import("./offline");
  for (const client_ref of ["sale-1", "sale-2"]) offline.enqueue({ payload: { client_ref } as never, total: 10, queued_at: "2026-11-10" });
  post.mockRejectedValueOnce(new Error("network"));
  expect(await offline.syncQueue()).toEqual({ synced: 0, failed: 0 });
  expect(post).toHaveBeenCalledTimes(1);
  expect(JSON.parse(storage.get("pdv_offline_queue")!).map((s: {payload: {client_ref: string}}) => s.payload.client_ref)).toEqual(["sale-1", "sale-2"]);
  post.mockResolvedValue({});
  expect(await offline.syncQueue()).toEqual({ synced: 2, failed: 0 });
  expect(JSON.parse(storage.get("pdv_offline_queue")!)).toEqual([]);
});
it("does not enqueue the same reference twice", async () => {
  const offline = await import("./offline");
  const sale = { payload: { client_ref: "sale-1" } as never, total: 10, queued_at: "2026-11-10" };
  offline.enqueue(sale); offline.enqueue(sale);
  expect(JSON.parse(storage.get("pdv_offline_queue")!)).toHaveLength(1);
});
