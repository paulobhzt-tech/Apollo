import { beforeEach, expect, it, vi } from "vitest";
const storage = new Map<string, string>();
const post = vi.fn();
vi.mock("./desktop", () => ({ deviceTag: () => "test", kv: { get: (k: string) => storage.get(k) ?? null, set: (k: string, v: string) => storage.set(k, v) } }));
vi.mock("./api", () => ({ apiPost: (...args: unknown[]) => post(...args), ApiError: class extends Error { status: number; body: unknown; constructor(status = 503, body: unknown = null) { super("API"); this.status = status; this.body = body; } } }));
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

it("preserves corrupt storage instead of overwriting it", async () => {
  storage.set("pdv_offline_queue", "broken-json");
  const offline = await import("./offline");
  expect(() => offline.enqueue({ payload: { client_ref: "new-sale" } as never, total: 10, queued_at: "now" })).toThrow("Fila offline ilegível");
  await expect(offline.syncQueue()).rejects.toThrow("Fila offline ilegível");
  expect(storage.get("pdv_offline_queue")).toBe("broken-json");
  expect(post).not.toHaveBeenCalled();
});
it("retains authentication failures for retry after login", async () => {
  const offline = await import("./offline");
  const { ApiError } = await import("./api");
  offline.enqueue({ payload: { client_ref: "sale-1" } as never, total: 10, queued_at: "now" });
  post.mockRejectedValueOnce(new ApiError(401, null));
  await offline.syncQueue();
  expect(JSON.parse(storage.get("pdv_offline_queue")!)).toHaveLength(1);
  expect(storage.get("pdv_offline_rejected")).toBeUndefined();
});
it("retains a business rejection for review before removing it from pending", async () => {
  const offline = await import("./offline");
  const { ApiError } = await import("./api");
  offline.enqueue({ payload: { client_ref: "sale-1" } as never, total: 10, queued_at: "now" });
  post.mockRejectedValueOnce(new ApiError(422, { detail: "Dados divergentes" }));
  expect(await offline.syncQueue()).toEqual({ synced: 0, failed: 1 });
  expect(JSON.parse(storage.get("pdv_offline_rejected")!)[0].error).toBe("Dados divergentes");
  expect(JSON.parse(storage.get("pdv_offline_queue")!)).toEqual([]);
});
it("preserves a sale enqueued during an in-flight sync", async () => {
  const offline = await import("./offline");
  const sale = (client_ref: string) => ({ payload: { client_ref } as never, total: 10, queued_at: "now" });
  offline.enqueue(sale("sale-1"));
  post.mockImplementationOnce(async () => { offline.enqueue(sale("sale-2")); return {}; });
  await offline.syncQueue();
  expect(JSON.parse(storage.get("pdv_offline_queue")!)[0].payload.client_ref).toBe("sale-2");
});
