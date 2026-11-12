// Offline contingency: counter sales that fail on network errors are queued in
// localStorage and replayed against the idempotent /pdv/sale endpoint (client_ref).
import { toast } from "sonner";
import { useSyncExternalStore } from "react";
import { ApiError, apiGet, apiPost } from "./api";
import { queryClient } from "./queryClient";
import type { Product, QuickSaleIn } from "./types";
import { deviceTag, kv } from "./desktop";

import { contextToken, queueKeys, sameContext, sameQueuedRequest, validContext, type QueueContext } from "./queue-context";
import { reconcileLegacyPreview, type LegacyReviewItem } from "./legacy-reconciliation";
export type { QueueContext } from "./queue-context";
let activeContext: QueueContext | null = null;
let { KEY, REJ_KEY, ARCHIVE_KEY, LOG_KEY, MENU_KEY } = queueKeys(null);
export interface QueuedSale { payload: QuickSaleIn; total: number; queued_at: string; attempts?: number; last_attempt_at?: string; last_error?: string; next_retry_at?: string }
export interface RejectedSale extends QueuedSale { error: string; rejected_at: string }
/** Bind only after an authenticated server response; never restore authorization from disk. */
export function setQueueContext(context: QueueContext | null) {
  if (context && !validContext(context)) throw new Error("Identidade de sincronização inválida");
  activeContext = context ? { ...context } : null;
  ({ KEY, REJ_KEY, ARCHIVE_KEY, LOG_KEY, MENU_KEY } = queueKeys(activeContext));
  emit();
  if (context && cachedQueue.length && !isOffline()) {
    setTimeout(() => {
      if (sameContext(activeContext, context)) void backgroundSync();
    }, 0);
  }
}
export function legacyQueueStatus() {
  const raw = kv.get("pdv_offline_queue");
  const rejected = kv.get("pdv_offline_rejected");
  return { pending: readSales<QueuedSale>("pdv_offline_queue").length,
    rejected: readSales<RejectedSale>("pdv_offline_rejected").length,
    has_data: !!raw && raw !== "[]" || !!rejected && rejected !== "[]" };
}
/** Read-only inventory for assisted migration. Never infers a tenant or sends legacy sales. */
export function legacyQueuePreview(): { pending: number; rejected: number; invalid: boolean; duplicate_refs: number; missing_refs: number; total: number } {
  const keys = ["pdv_offline_queue", "pdv_offline_rejected"];
  const seen = new Set<string>();
  let pending = 0, rejected = 0, duplicate_refs = 0, missing_refs = 0, total = 0, invalid = false;
  for (const [index, key] of keys.entries()) {
    const raw = kv.get(key);
    if (raw === null || raw === "") continue;
    let entries: unknown;
    try { entries = JSON.parse(raw); } catch { invalid = true; continue; }
    if (!Array.isArray(entries)) { invalid = true; continue; }
    if (index === 0) pending = entries.length; else rejected = entries.length;
    for (const item of entries) {
      if (!item || typeof item !== "object") { invalid = true; missing_refs++; continue; }
      const sale = item as Partial<QueuedSale>;
      const ref = sale.payload?.client_ref;
      if (typeof ref !== "string" || !ref.trim()) { missing_refs++; invalid = true; continue; }
      if (seen.has(ref)) duplicate_refs++;
      seen.add(ref);
      if (typeof sale.total === "number" && Number.isFinite(sale.total) && sale.total >= 0) total += sale.total;
      else invalid = true;
    }
  }
  return { pending, rejected, invalid, duplicate_refs, missing_refs, total };
}

/** Read-only classification; malformed bytes are never replaced or silently accepted. */
export function legacyReconciliationStatus(): { items: LegacyReviewItem[]; unreadable: boolean } {
  let unreadable = false;
  const parse = (key: string): unknown => {
    const raw = kv.get(key);
    if (raw === null || raw === "") return [];
    try { return JSON.parse(raw); }
    catch { unreadable = true; return null; }
  };
  const pending = parse("pdv_offline_queue");
  const rejected = parse("pdv_offline_rejected");
  return { items: reconcileLegacyPreview(pending, rejected, activeContext), unreadable };
}

/** Unique, device-tagged reference: replays are idempotent on the server (client_ref). */
export const newClientRef = () => `${deviceTag()}-${Date.now().toString(36)}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

const listeners = new Set<() => void>();
let forced = kv.get("pdv_force_offline") === "1";
let cachedQueue: QueuedSale[] = read();
let cachedRejected: RejectedSale[] = readRejected();

function readSales<T extends QueuedSale>(key: string, strict = false): T[] {
  try {
    const parsed: unknown = JSON.parse(kv.get(key) || "[]");
    if (!Array.isArray(parsed) || parsed.some((s) => !s || typeof s !== "object" ||
      !s.payload || typeof s.payload.client_ref !== "string" || !s.payload.client_ref)) {
      throw new Error("Invalid queue");
    }
    return parsed as T[];
  } catch {
    // Keep the original bytes untouched. UI can render; mutations must fail
    // closed rather than replacing unreadable sales with an empty queue.
    if (strict) throw new Error("Fila offline ilegível. Preserve este dispositivo e solicite suporte; nenhum registro foi apagado.");
    return [];
  }
}
function read(strict = false): QueuedSale[] { return readSales<QueuedSale>(KEY, strict); }
function readRejected(strict = false): RejectedSale[] { return readSales<RejectedSale>(REJ_KEY, strict); }
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
  if (!activeContext) throw new Error("Entre novamente para confirmar estabelecimento, servidor e operador antes de salvar offline");
  if (sale.payload.sync_context && !sameContext(sale.payload.sync_context, activeContext)) throw new Error("Venda pertence a outra fila de sincronização");
  sale = { ...sale, payload: { ...sale.payload, sync_context: { ...activeContext } } };
  const queued = read(true);
  const existing = queued.find((item) => item.payload.client_ref === sale.payload.client_ref);
  if (existing) {
    if (!sameQueuedRequest(existing.payload, sale.payload)) throw new Error("Já existe uma tentativa desta venda com dados diferentes. Revise a fila antes de confirmar outro pagamento.");
    return;
  }
  // A failed write must never be presented as a successfully saved sale.
  const next = JSON.stringify([...queued, sale]);
  kv.set(KEY, next);
  if (kv.get(KEY) !== next) throw new Error("Não foi possível salvar a venda neste dispositivo");
  emit();
}
export function cacheMenu(products: Product[]) {
  if (activeContext) kv.set(MENU_KEY, JSON.stringify(products));
}
export function cachedMenu(): Product[] {
  try {
    return JSON.parse(kv.get(MENU_KEY) || "[]") as Product[];
  } catch {
    return [];
  }
}

let syncing = false;
export async function syncQueue(options: { force?: boolean } = {}): Promise<{ synced: number; failed: number }> {
  if (syncing || isOffline() || !activeContext) return { synced: 0, failed: 0 };
  const context = { ...activeContext };
  // Web Locks serialize replay across tabs on the same origin.
  // The backend client_ref protects desktop windows on other origins.
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(`apollo-pdv-offline-sync:${contextToken(context)}`, async () => {
      if (isOffline()) return { synced: 0, failed: 0 };
      return performSyncQueue(!!options.force, context);
    });
  }
  return performSyncQueue(!!options.force, context);
}

async function performSyncQueue(force: boolean, context: QueueContext): Promise<{ synced: number; failed: number }> {
  if (syncing || isOffline() || !sameContext(activeContext, context)) return { synced: 0, failed: 0 };
  const { KEY, REJ_KEY, LOG_KEY } = queueKeys(context);
  syncing = true;
  let synced = 0;
  let failed = 0;
  const remaining: QueuedSale[] = [];
  const rejected: RejectedSale[] = [];
  try {
    const snapshot = readSales<QueuedSale>(KEY, true);
    readSales<RejectedSale>(REJ_KEY, true);
    if (!snapshot.length) return { synced: 0, failed: 0 };
    const authenticated = await apiGet<QueueContext>("/auth/sync-context");
    if (!sameContext(context, authenticated)) throw new Error("Sessão ou servidor mudou. Entre novamente; a fila original foi preservada.");
    for (const [index, s] of snapshot.entries()) {
      if (!sameContext(activeContext, context)) { remaining.push(...snapshot.slice(index)); break; }
      if (!sameContext(s.payload.sync_context, context)) throw new Error("Registro de outra identidade encontrado. Fila preservada para revisão.");
      if (!force && s.next_retry_at && new Date(s.next_retry_at).getTime() > Date.now()) {
        remaining.push(...snapshot.slice(index));
        break;
      }
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
        } else {
          // Preserve FIFO after a connection/authentication failure. Sending the
          // rest would hammer an unavailable server and reorder cash sales.
          const attempts = (s.attempts ?? 0) + 1;
          const delay = Math.min(300_000, 5_000 * 2 ** Math.min(attempts - 1, 6));
          const error = e instanceof ApiError ? (e.status === 401 ? "Sessão expirada: entre novamente" : `Servidor retornou ${e.status}`) : "Falha de conexão";
          remaining.push({ ...s, attempts, last_attempt_at: new Date().toISOString(), last_error: error,
                           next_retry_at: new Date(Date.now() + delay).toISOString() }, ...snapshot.slice(index + 1));
          break;
        }
      }
    }
    // Write rejected sales to durable storage BEFORE removing anything from the queue.
    // If persistence fails, leave the original queue untouched for safe recovery.
    if (rejected.length) {
      const previous = readSales<RejectedSale>(REJ_KEY, true);
      const knownRefs = new Set(previous.map((s) => s.payload.client_ref));
      const additions = rejected.filter((s) => !knownRefs.has(s.payload.client_ref));
      const nextRejected = JSON.stringify([...additions, ...previous]);
      kv.set(REJ_KEY, nextRejected);
      if (kv.get(REJ_KEY) !== nextRejected) throw new Error("Falha ao salvar vendas rejeitadas");
    }
    // Keep sales added while synchronization was running. Only replace the snapshot we processed.
    const processedRefs = new Set(snapshot.map((s) => s.payload.client_ref));
    const newlyQueued = readSales<QueuedSale>(KEY, true).filter((s) => !processedRefs.has(s.payload.client_ref));
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
  return { offline, forced, queue, rejected, context: activeContext };
}

export function lastSync(): { at: string; synced: number; failed: number; pending: number } | null {
  try { return JSON.parse(kv.get(LOG_KEY) || "null"); } catch { return null; }
}

/** Puts a rejected sale back in the queue (e.g. after opening the cash register). */
export function retryRejected(ref: string) {
  const r = readRejected(true);
  const item = r.find((x) => x.payload.client_ref === ref);
  if (!item) return;
  const { error: _e, rejected_at: _r, next_retry_at: _retry, ...sale } = item;
  // Persist the sale back into the pending queue BEFORE removing the rejected copy.
  // If storage is full or unavailable, the rejected record remains recoverable.
  enqueue(sale);
  const next = JSON.stringify(r.filter((x) => x.payload.client_ref !== ref));
  kv.set(REJ_KEY, next);
  if (kv.get(REJ_KEY) !== next) throw new Error("Falha ao atualizar vendas rejeitadas");
  emit();
  void backgroundSync();
}
export function reviewedSales(): (RejectedSale & { reviewed_at: string })[] {
  return readSales<RejectedSale & { reviewed_at: string }>(ARCHIVE_KEY);
}
export function dismissRejected(ref: string) {
  const rejected = readRejected(true);
  const item = rejected.find(s => s.payload.client_ref === ref);
  if (!item) return;
  // Archive durably before removing from the review list; never erase evidence.
  const archive = readSales<RejectedSale & { reviewed_at: string }>(ARCHIVE_KEY, true);
  const nextArchive = JSON.stringify([...archive.filter(s => s.payload.client_ref !== ref), { ...item, reviewed_at: new Date().toISOString() }]);
  kv.set(ARCHIVE_KEY, nextArchive);
  if (kv.get(ARCHIVE_KEY) !== nextArchive) throw new Error("Falha ao arquivar a venda recusada");
  const nextRejected = JSON.stringify(rejected.filter(s => s.payload.client_ref !== ref));
  kv.set(REJ_KEY, nextRejected);
  if (kv.get(REJ_KEY) !== nextRejected) throw new Error("Falha ao atualizar a lista de revisão");
  emit();
}

let lastBackgroundError = "";
async function backgroundSync() {
  try {
    await syncQueue();
    lastBackgroundError = "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronização offline";
    if (message !== lastBackgroundError) toast.error(message);
    lastBackgroundError = message;
  }
}

// Keep the queue and rejection list consistent across browser tabs / desktop windows.
window.addEventListener("storage", (event) => {
  if ([KEY, REJ_KEY, ARCHIVE_KEY, LOG_KEY, "pdv_force_offline"].includes(event.key || "")) {
    forced = kv.get("pdv_force_offline") === "1";
    emit();
    if (event.key === KEY && read().length && !isOffline()) void backgroundSync();
  }
});
window.addEventListener("online", () => { emit(); void backgroundSync(); });
window.addEventListener("offline", emit);
setInterval(() => { if (read().length) void backgroundSync(); }, 60_000);
