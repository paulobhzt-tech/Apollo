// Offline contingency: counter sales that fail on network errors are queued in
// localStorage and replayed against the idempotent /pdv/sale endpoint (client_ref).
import { useSyncExternalStore } from "react";
import { ApiError, apiPost } from "./api";
import { queryClient } from "./queryClient";
import type { Product, QuickSaleIn } from "./types";
import { deviceTag, kv } from "./desktop";

const KEY = "pdv_offline_queue";
const MENU_KEY = "pdv_offline_menu";
export interface QueuedSale { payload: QuickSaleIn; total: number; queued_at: string }
export interface RejectedSale extends QueuedSale { error: string; rejected_at: string }
const REJ_KEY = "pdv_offline_rejected";
const LOG_KEY = "pdv_offline_last_sync";
/** Unique, device-tagged reference: replays are idempotent on the server (client_ref). */
export const newClientRef = () => `${deviceTag()}-${Date.now().toString(36)}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

const listeners = new Set<() => void>();
let forced = kv.get("pdv_force_offline") === "1";
let cachedQueue: QueuedSale[] = read();
let cachedRejected: RejectedSale[] = readRejected();

function read(): QueuedSale[] {
  try {
    return JSON.parse(kv.get(KEY) || "[]") as QueuedSale[];
  } catch {
    return [];
  }
}
function readRejected(): RejectedSale[] {
  try {
    return JSON.parse(kv.get(REJ_KEY) || "[]") as RejectedSale[];
  } catch {
    return [];
  }
}
function emit() {
  cachedQueue = read();
  cachedRejected = readRejected();
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("online", l);
  window.addEventListener("offline", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("online", l);
    window.removeEventListener("offline", l);
  };
}

export const isOffline = () => forced || !navigator.onLine;
export function setForcedOffline(v: boolean) {
  forced = v;
  kv.set("pdv_force_offline", v ? "1" : "0");
  emit();
}
export function enqueue(sale: QueuedSale) {
  const queued = read();
  if (queued.some((item) => item.payload.client_ref === sale.payload.client_ref)) return;
  // A failed write must never be presented as a successfully saved sale.
  const next = JSON.stringify([...queued, sale]);
  kv.set(KEY, next);
  if (kv.get(KEY) !== next) throw new Error("Não foi possível salvar a venda neste dispositivo");
  emit();
}
export function cacheMenu(products: Product[]) {
  kv.set(MENU_KEY, JSON.stringify(products));
}
export function cachedMenu(): Product[] {
  try {
    return JSON.parse(kv.get(MENU_KEY) || "[]") as Product[];
  } catch {
    return [];
  }
}

let syncing = false;
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  if (syncing || isOffline()) return { synced: 0, failed: 0 };
  // Web Locks serialize replay across tabs on the same origin.
  // The backend client_ref protects desktop windows on other origins.
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("apollo-pdv-offline-sync", async () => {
      if (isOffline()) return { synced: 0, failed: 0 };
      return performSyncQueue();
    });
  }
  return performSyncQueue();
}

async function performSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (syncing || isOffline()) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  const remaining: QueuedSale[] = [];
  const rejected: RejectedSale[] = [];
  try {
    const snapshot = read();
    for (const s of snapshot) {
      try {
        await apiPost("/pdv/sale", s.payload);
        synced++;
      } catch (e) {
        // business errors (4xx, e.g. caixa fechado) leave the queue but are KEPT in the rejected list for review;
        // network errors, 5xx, 401 and transient concurrent replay conflicts (409) stay queued and are retried
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 408, 409, 425, 429].includes(e.status)) {
          failed++;
          const body = e.body as { detail?: unknown } | null;
          rejected.push({ ...s, error: typeof body?.detail === "string" ? body.detail : `Erro ${e.status}`, rejected_at: new Date().toISOString() });
        } else remaining.push(s);
      }
    }
    // Write rejected sales to durable storage BEFORE removing anything from the queue.
    // If persistence fails, leave the original queue untouched for safe recovery.
    if (rejected.length) {
      const previous = readRejected();
      const knownRefs = new Set(previous.map((s) => s.payload.client_ref));
      const additions = rejected.filter((s) => !knownRefs.has(s.payload.client_ref));
      const nextRejected = JSON.stringify([...additions, ...previous]);
      kv.set(REJ_KEY, nextRejected);
      if (kv.get(REJ_KEY) !== nextRejected) throw new Error("Falha ao salvar vendas rejeitadas");
    }
    // Keep sales added while synchronization was running. Only replace the snapshot we processed.
    const processedRefs = new Set(snapshot.map((s) => s.payload.client_ref));
    const newlyQueued = read().filter((s) => !processedRefs.has(s.payload.client_ref));
    const nextQueue = JSON.stringify([...remaining, ...newlyQueued]);
    kv.set(KEY, nextQueue);
    if (kv.get(KEY) !== nextQueue) throw new Error("Falha ao salvar fila de vendas");
    kv.set(LOG_KEY, JSON.stringify({ at: new Date().toISOString(), synced, failed, pending: remaining.length + newlyQueued.length }));
    emit();
    if (synced) void queryClient.invalidateQueries();
  } finally {
    syncing = false;
  }
  return { synced, failed };
}

export function useOffline() {
  const offline = useSyncExternalStore(subscribe, isOffline);
  const queue = useSyncExternalStore(subscribe, () => cachedQueue);
  const rejected = useSyncExternalStore(subscribe, () => cachedRejected);
  return { offline, forced, queue, rejected };
}

export function lastSync(): { at: string; synced: number; failed: number; pending: number } | null {
  try { return JSON.parse(kv.get(LOG_KEY) || "null"); } catch { return null; }
}

/** Puts a rejected sale back in the queue (e.g. after opening the cash register). */
export function retryRejected(ref: string) {
  const r = readRejected();
  const item = r.find((x) => x.payload.client_ref === ref);
  if (!item) return;
  const { error: _e, rejected_at: _r, ...sale } = item;
  // Persist the sale back into the pending queue BEFORE removing the rejected copy.
  // If storage is full or unavailable, the rejected record remains recoverable.
  enqueue(sale);
  const next = JSON.stringify(r.filter((x) => x.payload.client_ref !== ref));
  kv.set(REJ_KEY, next);
  if (kv.get(REJ_KEY) !== next) throw new Error("Falha ao atualizar vendas rejeitadas");
  emit();
  void syncQueue();
}
export function dismissRejected(ref: string) {
  const next = JSON.stringify(readRejected().filter((x) => x.payload.client_ref !== ref));
  kv.set(REJ_KEY, next);
  if (kv.get(REJ_KEY) !== next) throw new Error("Falha ao atualizar vendas rejeitadas");
  emit();
}

// Keep the queue and rejection list consistent across browser tabs / desktop windows.
window.addEventListener("storage", (event) => {
  if ([KEY, REJ_KEY, LOG_KEY, "pdv_force_offline"].includes(event.key || "")) {
    forced = kv.get("pdv_force_offline") === "1";
    emit();
    if (event.key === KEY && read().length && !isOffline()) void syncQueue();
  }
});
window.addEventListener("online", () => { emit(); void syncQueue(); });
window.addEventListener("offline", emit);
// desktop app: the online window flushes whatever the offline window recorded
if (read().length) setTimeout(() => void syncQueue(), 3000);
setInterval(() => { if (read().length) void syncQueue(); }, 60_000);
