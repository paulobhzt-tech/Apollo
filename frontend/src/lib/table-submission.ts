import { contextToken, type QueueContext } from "./queue-context";

export interface TableSubmission {
  ref: string;
  orderId: string;
  payload: string;
}

export function tableSubmissionKey(context: QueueContext, tableId: string, orderId: string) {
  return JSON.stringify([contextToken(context), tableId, orderId]);
}

function access(
  key: string,
  mode: IDBTransactionMode,
  change?: (previous: TableSubmission | null) => TableSubmission | null,
): Promise<TableSubmission | null> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("apollo-table-submissions", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("submissions");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("submissions", mode);
      const store = transaction.objectStore("submissions");
      const request = store.get(key);
      let value: TableSubmission | null = null;
      transaction.onabort = () => {
        db.close();
        reject(transaction.error ?? new Error("Não foi possível gravar o envio neste dispositivo."));
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(value);
      };
      request.onsuccess = () => {
        value = request.result ?? null;
        if (!change) return;
        try {
          value = change(value);
          if (value) store.put(value, key);
          else store.delete(key);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
    };
  });
}

export const readTableSubmission = (key: string) => access(key, "readonly");

export async function reserveTableSubmission(key: string, proposed: TableSubmission) {
  const saved = await access(key, "readwrite", previous => {
    if (previous && previous.payload !== proposed.payload) {
      throw new Error("Confira o envio anterior antes de editar os itens.");
    }
    return previous ?? proposed;
  });
  if (!saved) throw new Error("Envio sem referência gravada.");
  return saved;
}

export const clearTableSubmission = (key: string, ref: string) =>
  access(key, "readwrite", previous => previous?.ref === ref ? null : previous);
