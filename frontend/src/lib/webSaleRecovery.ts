// Stores an opaque operation identity only: no cart, payment, customer or credentials.
export const PENDING_SALE_KEY = 'apollo_web_pending_sale_v1';
const LOCK = 'apollo-web-financial-checkout-v1';
export interface PendingWebSale { ref: string; created_at: string }
export function pendingWebSale(): PendingWebSale | null {
  const raw = localStorage.getItem(PENDING_SALE_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingWebSale;
  if (!/^web-[a-f0-9-]{36}$/.test(value.ref) || typeof value.created_at !== 'string') {
    throw new Error('Referência pendente inválida. Preserve os dados para conciliação assistida.');
  }
  return value;
}
export async function webCheckout<T>(send: (ref: string) => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('Este navegador não oferece o bloqueio seguro entre abas. Use um navegador compatível em HTTPS.');
  return navigator.locks.request(LOCK, { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) throw new Error('Outra aba está finalizando uma venda. Aguarde e consulte o histórico.');
    if (pendingWebSale()) throw new Error('Venda com resultado pendente. Consulte a conciliação antes de iniciar outra.');
    const pending = { ref: `web-${crypto.randomUUID()}`, created_at: new Date().toISOString() };
    // A quota/permissions error prevents the request. Never send without a durable identity.
    localStorage.setItem(PENDING_SALE_KEY, JSON.stringify(pending));
    const result = await send(pending.ref);
    // Any error, including HTTP 4xx or local persistence failure, keeps the reference.
    clearConfirmedWebSale(pending.ref);
    return result;
  });
}
export function clearConfirmedWebSale(ref: string) {
  if (pendingWebSale()?.ref === ref) localStorage.removeItem(PENDING_SALE_KEY);
}
