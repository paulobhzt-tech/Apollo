import type { QueueContext } from "./queue-context";

export interface OfflineTableProfile {
  context: QueueContext;
  operator: string;
  can_create?: boolean;
  issued_at: string;
  expires_at: string;
  products: { id: string; name: string; price: number }[];
  tables: { number: number; kind: "mesa" | "comanda"; name: string; status: string; id?: string; order_id?: string | null }[];
}
export interface OfflineTableDraft {
  client_ref: string;
  table: { number: number; kind: "mesa" | "comanda"; name: string; seats: number };
  existing?: { table_id: string; order_id: string };
  review?: { status: number };
  items: { product_id: string; qty: number; notes: string; expected_price: number }[];
}
export interface TableVault { profile: OfflineTableProfile; pending: OfflineTableDraft[] }
interface Envelope { salt: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer; revision: string }

export const TABLE_VAULT_LOCK = "apollo-offline-table-vault-locked";

export function lockOfflineTables() {
  try { localStorage.setItem(TABLE_VAULT_LOCK, crypto.randomUUID()); } catch { /* Offline unlock also fails without storage. */ }
}

function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("apollo-offline-table-vault", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("terminal");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("terminal", mode);
      const request = run(tx.objectStore("terminal"));
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Gravação local cancelada.")); };
    };
  });
}

export const readTableVault = (): Promise<Envelope | undefined> =>
  transaction("readonly", store => store.get("vault"));

async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const secret = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    secret, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function openTableVault(envelope: Envelope, passphrase: string) {
  const key = await derive(passphrase, envelope.salt);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: envelope.iv }, key, envelope.ciphertext);
  return { key, vault: JSON.parse(new TextDecoder().decode(clear)) as TableVault };
}

export async function writeTableVault(vault: TableVault, passphrase: string, previous?: Envelope, unlockedKey?: CryptoKey) {
  const salt = previous?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = unlockedKey ?? await derive(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(vault)));
  const envelope: Envelope = { salt, iv, ciphertext, revision: crypto.randomUUID() };
  let conflict = false;
  await transaction("readwrite", store => {
    const read = store.get("vault");
    read.onsuccess = () => {
      if (read.result?.revision !== previous?.revision) {
        conflict = true;
        return;
      }
      store.put(envelope, "vault");
    };
    return read;
  });
  if (conflict) throw new Error("O registro mudou em outra aba. Reabra o cofre.");
  return { key, envelope };
}


export async function deleteEmptyTableVault(previous: Envelope) {
  let conflict = false;
  await transaction("readwrite", store => {
    const read = store.get("vault");
    read.onsuccess = () => {
      if (read.result?.revision !== previous.revision) {
        conflict = true;
        return;
      }
      store.delete("vault");
    };
    return read;
  });
  if (conflict) throw new Error("O registro mudou em outra aba. Reabra o cofre.");
}
