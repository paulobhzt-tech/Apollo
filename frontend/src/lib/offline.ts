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
export const newClientRef = () => `${deviceTag()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const listeners = new Set<() => void>();
let forced = kv.get("pdv_force_offline") === "1";
let queueIssue: string | null = null;
let rejectedIssue: string | null = null;
let persistenceIssue: string | null = null;
let cachedQueue: QueuedSale[] = read();
let cachedRejected: RejectedSale[] = readRejected();

function read(): QueuedSale[] {
  try {
    const value: unknown = JSON.parse(kv.get(KEY) || "[]");
    if (!Array.isArray(value) || value.some(x => !x?.payload || typeof x.payload.client_ref !== "string")) throw new Error();
    queueIssue = null;
    return value as QueuedSale[];
  } catch {
    queueIssue = "Fila offline corrompida: preserve os dados e solicite recuperação";
    return [];
  }
}
function readRejected(): RejectedSale[] {
  try {
    const value: unknown = JSON.parse(kv.get(REJ_KEY) || "[]");
    if (!Array.isArray(value) || value.some(x => !x?.payload || typeof x.payload.client_ref !== "string")) throw new Error();
    rejectedIssue = null;
    return value as RejectedSale[];
  } catch {
    rejectedIssue = "Arquivo de recusadas corrompido: preserve os dados e solicite recuperação";
    return [];
  }
}
const storageIssue = () => queueIssue || rejectedIssue || persistenceIssue;
function requireHealthyStorage() {
  read(); readRejected();
  const problem = queueIssue || rejectedIssue;
  if (problem) { emit(); throw new Error(problem); }
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
  if (!v) void syncQueue().catch(() => emit());
}
export function enqueue(sale: QueuedSale) {
  requireHealthyStorage();
  const current = read();
  if (current.some(x => x.payload.client_ref === sale.payload.client_ref)) return;
  kv.set(KEY, JSON.stringify([...current, sale]));
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
  try { requireHealthyStorage(); } catch { return { synced: 0, failed: 0 }; }
  persistenceIssue = null;
  syncing = true;
  let synced = 0;
  let failed = 0;
  const completed = new Set<string>();
  const rejected: RejectedSale[] = [];
  try {
    for (const s of read()) {
      try {
        await apiPost("/pdv/sale", s.payload);
        synced++;
        completed.add(s.payload.client_ref);
      } catch (e) {
        // business errors (4xx, e.g. caixa fechado) leave the queue but are KEPT in the rejected list for review;
        // network errors, 5xx and expired login (401) stay queued and are retried
        if (e instanceof ApiError && e.status < 500 && ![401, 408, 425, 429].includes(e.status)) {
          failed++;
          completed.add(s.payload.client_ref);
          const body = e.body as { detail?: unknown } | null;
          rejected.push({ ...s, error: typeof body?.detail === "string" ? body.detail : `Erro ${e.status}`, rejected_at: new Date().toISOString() });
        }
      }
    }
    // Re-read after the awaits: enqueue() may have added sales during replay.
    // Remove only entries handled by this pass, preserving new and retryable sales.
    const remaining = read().filter(s => !completed.has(s.payload.client_ref));
    requireHealthyStorage();
    // Archive first: a quota/write failure must leave pending records intact.
    if (rejected.length) {
      const archive = new Map([...readRejected(), ...rejected].map(x => [x.payload.client_ref, x]));
      kv.set(REJ_KEY, JSON.stringify([...archive.values()]));
    }
    kv.set(KEY, JSON.stringify(remaining));
    kv.set(LOG_KEY, JSON.stringify({ at: new Date().toISOString(), synced, failed, pending: remaining.length }));
    emit();
    if (synced) void queryClient.invalidateQueries();
  } catch (error) {
    persistenceIssue = "Falha ao persistir sincronização: preserve a fila e tente novamente";
    emit();
    throw error;
  } finally {
    syncing = false;
  }
  return { synced, failed };
}

export function useOffline() {
  const offline = useSyncExternalStore(subscribe, isOffline);
  const queue = useSyncExternalStore(subscribe, () => cachedQueue);
  const rejected = useSyncExternalStore(subscribe, () => cachedRejected);
  const storageError = useSyncExternalStore(subscribe, storageIssue);
  return { offline, forced, queue, rejected, storageError };
}

export function lastSync(): { at: string; synced: number; failed: number; pending: number } | null {
  try { return JSON.parse(kv.get(LOG_KEY) || "null"); } catch { return null; }
}

/** Puts a rejected sale back in the queue (e.g. after opening the cash register). */
export function retryRejected(ref: string) {
  requireHealthyStorage();
  const r = readRejected();
  const item = r.find((x) => x.payload.client_ref === ref);
  if (!item) return;
  const { error: _e, rejected_at: _r, ...sale } = item;
  if (!read().some(x => x.payload.client_ref === ref)) kv.set(KEY, JSON.stringify([...read(), sale]));
  kv.set(REJ_KEY, JSON.stringify(r.filter((x) => x.payload.client_ref !== ref)));
  emit();
  void syncQueue().catch(() => emit());
}
export function dismissRejected(ref: string) {
  requireHealthyStorage();
  kv.set(REJ_KEY, JSON.stringify(readRejected().filter((x) => x.payload.client_ref !== ref)));
  emit();
}

window.addEventListener("online", () => void syncQueue().catch(() => emit()));
// desktop app: the online window flushes whatever the offline window recorded
if (read().length) setTimeout(() => void syncQueue().catch(() => emit()), 3000);
setInterval(() => { if (read().length) void syncQueue().catch(() => emit()); }, 60_000);
