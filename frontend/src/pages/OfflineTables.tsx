import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { brl } from "@/lib/format";
import { withRequestTimeout } from "@/lib/request-timeout";
import { sameContext } from "@/lib/queue-context";
import {
  deleteEmptyTableVault, lockOfflineTables, openTableVault, readTableVault, TABLE_VAULT_LOCK, writeTableVault,
  type OfflineTableDraft, type OfflineTableProfile, type TableVault,
} from "@/lib/offline-table-vault";

type Session = Awaited<ReturnType<typeof writeTableVault>> & { vault: TableVault; lock: string | null };

function active(profile: OfflineTableProfile) {
  const now = Date.now();
  return Date.parse(profile.issued_at) <= now + 60_000 && now < Date.parse(profile.expires_at);
}

export default function OfflineTables() {
  const [session, setSession] = useState<Session>();
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const syncLifetime = useRef<AbortController | null>(null);
  const [target, setTarget] = useState("");
  const [number, setNumber] = useState("");
  const [kind, setKind] = useState<"mesa" | "comanda">("mesa");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OfflineTableDraft["items"]>([]);

  useEffect(() => {
    const controller = new AbortController();
    syncLifetime.current = controller;
    return () => { syncLifetime.current?.abort(); syncLifetime.current = null; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const lock = () => {
      syncLifetime.current?.abort();
      syncLifetime.current = new AbortController();
      setSession(undefined);
      setItems([]);
      setTarget("");
      setMessage("Acesso local bloqueado. Abra o cofre novamente.");
    };
    const storage = (event: StorageEvent) => {
      if (event.key === TABLE_VAULT_LOCK || event.key === null) lock();
    };
    const timeout = window.setTimeout(lock, Math.max(0, Date.parse(session.vault.profile.expires_at) - Date.now()));
    window.addEventListener("storage", storage);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("storage", storage);
    };
  }, [session]);

  async function run(action: () => Promise<void>, signal?: AbortSignal) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) {
      if (signal?.aborted) return;
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        lockOfflineTables();
        setSession(undefined);
        setItems([]);
      }
      const detail = error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body
        ? error.body.detail : undefined;
      setMessage(typeof detail === "string" ? detail : error instanceof Error ? error.message : "Operação indisponível.");
    } finally { operation.current = false; setBusy(false); }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const lock = localStorage.getItem(TABLE_VAULT_LOCK);
      const envelope = await readTableVault();
      const opened = envelope ? await openTableVault(envelope, secret).catch(() => {
        throw new Error("Senha local inválida ou cofre ilegível.");
      }) : undefined;
      let online: OfflineTableProfile | undefined;
      // Real upstream loss can occur while the device is still attached to Wi-Fi.
      try {
        online = await withRequestTimeout(signal => apiGet<OfflineTableProfile>("/offline/table-profile", signal), 5000);
      } catch (error) {
        const unreachable = error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError")
          || (error instanceof ApiError && [502, 503, 504].includes(error.status));
        if (!unreachable) throw error;
      }
      if (!online && (!opened || lock || !active(opened.vault.profile))) {
        throw new Error("Valide o operador online para preparar ou renovar o acesso local.");
      }
      if (online && opened && !sameContext(opened.vault.profile.context, online.context)) {
        throw new Error("Este cofre pertence a outro operador ou estabelecimento.");
      }
      if (localStorage.getItem(TABLE_VAULT_LOCK) !== lock) throw new Error("A sessão mudou. Tente novamente.");
      if (!online && envelope && opened) {
        setSession({ envelope, ...opened, lock });
      } else if (online && active(online)) {
        if (!opened && secret.length < 12) throw new Error("Use uma senha local de pelo menos 12 caracteres.");
        const vault = { profile: online, pending: opened?.vault.pending ?? [] };
        const saved = await writeTableVault(vault, secret, envelope, opened?.key);
        if (localStorage.getItem(TABLE_VAULT_LOCK) !== lock) throw new Error("A sessão mudou. Tente novamente.");
        localStorage.removeItem(TABLE_VAULT_LOCK);
        setSession({ ...saved, vault, lock: null });
      }
      setSecret("");
    });
  }

  function check(current: Session) {
    if (!active(current.vault.profile) || localStorage.getItem(TABLE_VAULT_LOCK) !== current.lock) {
      throw new Error("Acesso local expirado ou bloqueado.");
    }
  }

  async function persist(current: Session, vault: TableVault) {
    check(current);
    const saved = await writeTableVault(vault, "", current.envelope, current.key);
    check(current);
    const next = { ...saved, vault, lock: current.lock };
    setSession(next);
    return next;
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!session || !items.length) return;
    const existing = session.vault.profile.tables.find(row => row.id === target);
    if (target && (!existing?.id || !existing.order_id || existing.status !== "ocupada")) return;
    if (!target && session.vault.profile.can_create === false) return;
    const draft: OfflineTableDraft = {
      client_ref: crypto.randomUUID(),
      table: { number: existing?.number ?? Number(number), kind: existing?.kind ?? kind, name: "", seats: 4 },
      ...(existing?.id && existing.order_id ? { existing: { table_id: existing.id, order_id: existing.order_id } } : {}),
      items,
    };
    void run(async () => {
      const { vault } = session;
      if (!draft.existing && [...vault.profile.tables, ...vault.pending.map(row => row.table)]
        .some(row => row.number === draft.table.number && row.kind === kind)) {
        throw new Error("Esse número já está em uso na última consulta ou na fila.");
      }
      await persist(session, { ...vault, pending: [...vault.pending, draft] });
      setItems([]);
      setNumber("");
      setMessage("Pedido gravado neste dispositivo.");
    });
  }

  function sync(automatic = false) {
    const signal = syncLifetime.current?.signal;
    if (!session || !signal || signal.aborted) return;
    const candidates = session.vault.pending.filter(draft => !automatic || !draft.review);
    if (!candidates.length) return;
    void run(async () => {
      let online: OfflineTableProfile;
      try {
        online = await withRequestTimeout(requestSignal => apiGet<OfflineTableProfile>("/offline/table-profile", requestSignal), 5000, signal);
      } catch (error) {
        if (automatic && (error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError")
          || (error instanceof ApiError && [502, 503, 504].includes(error.status)))) return;
        throw error;
      }
      if (!sameContext(online.context, session.vault.profile.context)) throw new Error("O operador ou estabelecimento mudou.");
      let current = session;
      for (const draft of candidates) {
        signal.throwIfAborted();
        check(current);
        try {
          const { review: _review, ...payload } = draft;
          await withRequestTimeout(requestSignal => apiPost("/offline/tables", { ...payload, sync_context: online.context }, requestSignal), 15000, signal);
        } catch (error) {
          if (!(error instanceof ApiError) || ![400, 409, 422].includes(error.status)) throw error;
          signal.throwIfAborted();
          current = await persist(current, {
            ...current.vault,
            pending: current.vault.pending.map(row => row.client_ref === draft.client_ref
              ? { ...row, review: { status: error.status } } : row),
          });
          continue;
        }
        signal.throwIfAborted();
        current = await persist(current, {
          ...current.vault, profile: online,
          pending: current.vault.pending.filter(row => row.client_ref !== draft.client_ref),
        });
      }
      const hasReview = current.vault.pending.some(draft => draft.review);
      setMessage(hasReview ? "Há pedidos preservados para revisão." : "Envios confirmados pelo servidor.");
    }, signal);
  }

  const reconnect = useEffectEvent(() => sync(true));
  const hasPending = Boolean(session?.vault.pending.some(draft => !draft.review));
  useEffect(() => {
    if (!hasPending) return;
    // Upstream recovery can happen without an online event when Wi-Fi stays connected.
    const poll = window.setInterval(() => reconnect(), 10_000);
    const online = () => reconnect();
    window.addEventListener("online", online);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("online", online);
    };
  }, [hasPending]);


  return (
    <main className="mx-auto max-w-3xl space-y-5 p-5">
      <Link className="underline" to="/login">Voltar ao login</Link>
      <h1 className="text-2xl font-semibold">Mesas e comandas offline</h1>
      {message && <p role="status">{message}</p>}
      {!session ? (
        <form onSubmit={unlock} className="space-y-3">
          <p>Prepare este dispositivo com uma sessão online de garçom, caixa ou administrador. Use uma senha exclusiva para o cofre local.</p>
          <label className="block">Senha local <input required type="password" value={secret} onChange={e => setSecret(e.target.value)} /></label>
          <button disabled={busy} className="rounded border p-2">Abrir cofre</button>
        </form>
      ) : (
        <>
          <p>{session.vault.profile.operator} · Acesso válido até {new Date(session.vault.profile.expires_at).toLocaleString("pt-BR")}</p>
          <details><summary>Mesas e comandas da última consulta</summary>
            <ul>{session.vault.profile.tables.map(table => <li key={table.kind + table.number}>{table.kind} {table.number} · {table.name} · {table.status}</li>)}</ul>
          </details>
          <form onSubmit={save} className="space-y-3">
            <div><label className="block" htmlFor="offline-table-target">Atendimento</label><select id="offline-table-target" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">{session.vault.profile.can_create === false ? "Selecione um atendimento" : "Nova mesa ou comanda"}</option>
              {session.vault.profile.tables.filter(row => row.id && row.order_id && row.status === "ocupada").map(row =>
                <option key={row.id} value={row.id}>{row.kind} {row.number}</option>)}
            </select></div>
            {!target && session.vault.profile.can_create !== false && <>
            <label>Tipo <select value={kind} onChange={e => setKind(e.target.value === "mesa" ? "mesa" : "comanda")}><option value="mesa">Mesa</option><option value="comanda">Comanda</option></select></label>
            <label className="block">Número <input required type="number" min="1" max="999999" value={number} onChange={e => setNumber(e.target.value)} /></label>
            </>}
            <label className="block">Produto <select value={productId} onChange={e => setProductId(e.target.value)}><option value="">Selecione</option>{session.vault.profile.products.map(product => <option key={product.id} value={product.id}>{product.name} · {brl(product.price)}</option>)}</select></label>
            <label className="block">Quantidade <input type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(e.target.value)} /></label>
            <label className="block">Observação <input maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} /></label>
            <button type="button" className="rounded border p-2" disabled={busy || items.length >= 100} onClick={() => {
              const product = session.vault.profile.products.find(row => row.id === productId);
              const quantity = Number(qty);
              if (!product || !Number.isFinite(quantity) || quantity <= 0) return;
              setItems([...items, { product_id: productId, qty: quantity, notes, expected_price: product.price }]);
              setNotes("");
            }}>Adicionar item</button>
            <ul>{items.map((item, index) => <li key={index}>{item.qty} × {session.vault.profile.products.find(row => row.id === item.product_id)?.name} · {item.notes} <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))}>Remover</button></li>)}</ul>
            <button className="rounded border p-2" disabled={busy || !items.length || (!target && session.vault.profile.can_create === false)}>Salvar pedido no dispositivo</button>
          </form>
          <h2 className="text-lg font-semibold">Pedidos pendentes ({session.vault.pending.length})</h2>
          <ul>{session.vault.pending.map(draft => <li key={draft.client_ref}>{draft.table.kind} {draft.table.number} · {draft.items.length} linha(s){draft.review && ` · Revisão necessária (HTTP ${draft.review.status})`}</li>)}</ul>
          <button className="rounded border p-2" disabled={busy || !session.vault.pending.length} onClick={() => sync()}>Enviar após reconectar</button>
          <button className="ml-2 rounded border p-2" disabled={busy} onClick={() => { setSession(undefined); setItems([]); setTarget(""); }}>Fechar cofre</button>
          {!session.vault.pending.length && !items.length && <button className="ml-2 rounded border p-2" disabled={busy} onClick={() => void run(async () => {
            check(session);
            const online = await apiGet<OfflineTableProfile>("/offline/table-profile");
            if (!sameContext(online.context, session.vault.profile.context)) throw new Error("Valide o operador do cofre para limpar.");
            await deleteEmptyTableVault(session.envelope);
            lockOfflineTables();
            setSession(undefined);
            setMessage("Cofre local apagado.");
          })}>Apagar cofre vazio</button>}
        </>
      )}
    </main>
  );
}
