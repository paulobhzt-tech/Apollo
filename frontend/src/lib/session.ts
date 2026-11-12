// Authentication rides an httpOnly cookie. The local lock also blocks a previous
// session when the server cannot be reached to revoke that cookie.
import { useSyncExternalStore } from "react";
import { setQueueContext } from "./offline";
import { queryClient } from "./queryClient";
import { apiPost } from "./api";
import { toast } from "sonner";
import { desktop } from "./desktop";

const LOCK_KEY = "apollo-operator-locked";
const SESSION_CHANGE_KEY = "apollo-session-change";
const listeners = new Set<() => void>();
let locked = false;
let logout: Promise<unknown> | undefined;

function isLocked(): boolean {
  try {
    return locked || localStorage.getItem(LOCK_KEY) === "1" || desktop()?.kvGet(LOCK_KEY) === "1";
  } catch {
    return true;
  }
}

function setLock(value: boolean): void {
  locked = value;
  try { desktop()?.kvSet(LOCK_KEY, value ? "1" : "0"); } catch { /* Browser storage still applies. */ }
  try {
    if (value) localStorage.setItem(LOCK_KEY, "1");
    else localStorage.removeItem(LOCK_KEY);
  } catch { /* The in-memory lock still applies. */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== LOCK_KEY && event.key !== SESSION_CHANGE_KEY) return;
    locked = true;
    setQueueContext(null);
    queryClient.clear();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSessionLock() {
  return useSyncExternalStore(subscribe, isLocked);
}

export function beginSession(): void {
  setQueueContext(null);
  queryClient.clear();
  setLock(false);
  try { localStorage.setItem(SESSION_CHANGE_KEY, crypto.randomUUID()); } catch { /* Storage may be unavailable. */ }
}

export function waitForLogout() {
  return logout;
}

export function endSession(): void {
  if (logout) return;
  if (queryClient.isMutating()) {
    toast.info("Aguarde a operação em andamento para trocar de operador.");
    return;
  }
  setLock(true);
  setQueueContext(null);
  queryClient.clear();
  logout = apiPost("/auth/logout", undefined, AbortSignal.timeout(5000))
    .catch(() => undefined)
    .finally(() => { logout = undefined; });
}
