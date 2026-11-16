import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { isDesktop } from '@/lib/desktop';
import { clearConfirmedWebSale, pendingWebSale, PENDING_SALE_KEY, type PendingWebSale } from '@/lib/webSaleRecovery';

export default function WebSaleRecovery() {
  const [pending, setPending] = useState<PendingWebSale | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => { try { setPending(pendingWebSale()); } catch (e) { setMessage(String(e)); } };
  useEffect(() => {
    if (isDesktop()) return;
    refresh();
    const onStorage = (e: StorageEvent) => { if (e.key === PENDING_SALE_KEY) refresh(); };
    window.addEventListener('storage', onStorage);
    // Updates on the same tab, including errors while an async mutation is running.
    const timer = window.setInterval(refresh, 1000);
    return () => { window.removeEventListener('storage', onStorage); window.clearInterval(timer); };
  }, []);
  if (isDesktop() || (!pending && !message)) return null;
  const reconcile = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const result = await apiGet<{ state: string; number?: number }>(`/pdv/operations/${encodeURIComponent(pending.ref)}`);
      if (result.state === 'confirmed') {
        clearConfirmedWebSale(pending.ref); setPending(null);
        setMessage(`Venda #${result.number} confirmada no servidor. Confira o histórico; o carrinho atual não foi reenviado nem impresso.`);
      } else setMessage('Resultado ainda não confirmado. Novas vendas seguem bloqueadas neste navegador. Solicite conciliação assistida; não reenvie o pagamento.');
    } catch { setMessage('Não foi possível consultar. A referência foi preservada; não reenvie o pagamento.'); }
    finally { setBusy(false); }
  };
  return <section role="alert" className="mb-4 rounded-xl border border-amber-500 p-4" data-testid="web-sale-recovery">
    {pending && <><h2 className="font-semibold">Venda pendente de conciliação</h2><p className="break-all text-sm">Referência: {pending.ref}</p>
      <button type="button" className="mt-2 rounded border p-3" disabled={busy} onClick={() => void reconcile()} data-testid="web-sale-reconcile">{busy ? 'Consultando…' : 'Consultar resultado no servidor'}</button></>}
    {message && <p className="mt-2 text-sm">{message}</p>}
  </section>;
}
