// Offline contingency: counter sales that fail on network errors are queued in
// localStorage and replayed against the idempotent /pdv/sale endpoint (client_ref).
import { useSyncExternalStore } from "react";
import { ApiError, apiPost } from "./api";
import { queryClient } from "./queryClient";
import type { Product, QuickSaleIn } from "./types";

const KEY = "pdv_offline_queue";
const MENU_KEY = "pdv_offline_menu";
export interface QueuedSale { payload: QuickSaleIn; total: number; queued_at: string }

const listeners = new Set<() => void>();
let forced = localStorage.getItem("pdv_force_offline") === "1";
let cachedQueue: QueuedSale[] = read();

function read(): QueuedSale[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as QueuedSale[];
  } catch {
    return [];
  }
}
function emit() {
  cachedQueue = read();
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
  localStorage.setItem("pdv_force_offline", v ? "1" : "0");
  emit();
  if (!v) void syncQueue();
}
export function enqueue(sale: QueuedSale) {
  localStorage.setItem(KEY, JSON.stringify([...read(), sale]));
  emit();
}
export function cacheMenu(products: Product[]) {
  localStorage.setItem(MENU_KEY, JSON.stringify(products));
}
export function cachedMenu(): Product[] {
  try {
    return JSON.parse(localStorage.getItem(MENU_KEY) || "[]") as Product[];
  } catch {
    return [];
  }
}

let syncing = false;
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  if (syncing || isOffline()) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  const remaining: QueuedSale[] = [];
  try {
    for (const s of read()) {
      try {
        await apiPost("/pdv/sale", s.payload);
        synced++;
      } catch (e) {
        // business errors (4xx) are dropped from the queue to avoid infinite retries; network errors stay
        if (e instanceof ApiError && e.status < 500 && e.status !== 401) failed++;
        else remaining.push(s);
      }
    }
    localStorage.setItem(KEY, JSON.stringify(remaining));
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
  return { offline, forced, queue };
}

window.addEventListener("online", () => void syncQueue());
