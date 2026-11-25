import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, LockKeyhole, LockKeyholeOpen, Printer } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import AppShell, { PageHeader, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cashAmount, formatCurrencyTyping } from "@/lib/catalog-form";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { onlineMutation, onlineOperation, UncertainOperationError, useOffline } from "@/lib/offline";
import { apiGet, apiPost } from "@/lib/api";
import { brl, errMsg, fmtDateTime, payLabel } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { CashSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Panel } from "./Dashboard";

const inv = () => { void queryClient.invalidateQueries({ queryKey: ["cash"] }); void queryClient.invalidateQueries({ queryKey: ["dashboard"] }); };

export default function Caixa() {
  const { offline } = useOffline();
  const current = useQuery({ queryKey: ["cash", "current"], queryFn: () => apiGet<CashSession | null>("/cash/current"), refetchInterval: 15000 });
  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");
  const validHistory = !historyStart || !historyEnd || historyStart <= historyEnd;
  const historyParams = new URLSearchParams({ start: historyStart, end: historyEnd });
  const history = useQuery({
    queryKey: ["cash", "history", historyStart, historyEnd],
    queryFn: () => apiGet<CashSession[]>(`/cash/history?${historyParams}`),
    enabled: validHistory,
  });
  const [opening, setOpening] = useState("0,00");
  const [openingNote, setOpeningNote] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [moveType, setMoveType] = useState<"sangria" | "suprimento">("sangria");
  const [moveAmt, setMoveAmt] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [counted, setCounted] = useState("");
  const [blind, setBlind] = useState(true);
  const [printing, setPrinting] = useState<CashSession | null>(null);
  useEffect(() => { if (!printing) return; const t = setTimeout(() => { window.print(); setPrinting(null); }, 100); return () => clearTimeout(t); }, [printing]);
  const [needsReview, setNeedsReview] = useState(false);
  const [checking, setChecking] = useState(false);
  const onErr = (e: unknown) => {
    if (e instanceof UncertainOperationError) setNeedsReview(true);
    toast.error(errMsg(e));
  };
  const consult = async () => {
    setChecking(true);
    try {
      const [turn] = await Promise.all([
        current.refetch({ throwOnError: true }),
        queryClient.fetchQuery({ queryKey: ["cash", "history", "", ""], queryFn: () => apiGet<CashSession[]>("/cash/history") }),
      ]);
      if (!turn.isSuccess) return;
      setNeedsReview(false);
      toast.info("Caixa atualizado. Confira as movimentações e o histórico antes de continuar.");
    } catch (error) {
      onErr(error);
    } finally {
      setChecking(false);
    }
  };

  const s = current.isError ? null : current.data;
  const openingAmount = cashAmount(opening);
  const movementAmount = cashAmount(moveAmt);
  const countedAmount = cashAmount(counted);

  const open = useMutation({ ...onlineMutation, mutationFn: () => onlineOperation(() => apiPost<CashSession>("/cash/open", { opening_amount: openingAmount, note: openingNote.trim() })), onSuccess: () => { toast.success("Caixa aberto"); setOpeningNote(""); inv(); }, onError: onErr });
  const moveReference = useRef<{ fingerprint: string; reference: string } | null>(null);
  const move = useMutation({
    ...onlineMutation,
    mutationFn: () => {
      const payload = { type: moveType, amount: movementAmount, note: moveNote.trim(), expected_session_id: s?.id };
      const fingerprint = JSON.stringify(payload);
      if (moveReference.current?.fingerprint !== fingerprint) {
        moveReference.current = { fingerprint, reference: crypto.randomUUID() };
      }
      const request = { ...payload, client_ref: moveReference.current.reference };
      return onlineOperation(() => apiPost<CashSession>("/cash/movement", request));
    },
    onSuccess: () => { moveReference.current = null; toast.success(moveType === "sangria" ? "Sangria registrada" : "Suprimento registrado"); setMoveAmt(""); setMoveNote(""); inv(); },
    onError: onErr,
  });
  const close = useMutation({
    ...onlineMutation,
    mutationFn: () => onlineOperation(() => apiPost<CashSession>("/cash/close", { counted_amount: countedAmount, note: closingNote.trim(), expected_session_id: s?.id, expected_financial_revision: s?.financial_revision })),
    onSuccess: (s) => { toast.success(`Caixa fechado · diferença ${brl(s.difference)}`); setCounted(""); setClosingNote(""); setBlind(true); inv(); setPrinting(s); },
    onError: onErr,
  });

  const updating = needsReview || open.isPending || move.isPending || close.isPending;
  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Controle de Caixa" subtitle="Abertura, sangria, suprimento e fechamento com conferência cega" />
      {offline && <p role="status" data-testid="cash-online-required" className="mb-3 text-sm text-amber-300">Abertura, movimentos e fechamento de caixa exigem conexão.</p>}
      {needsReview && <div role="alert" className="mb-4 rounded-md border border-white/15 p-3">
        Resultado incerto. Consulte o caixa e o histórico antes de repetir a operação.
        <Button size="sm" variant="outline" className="ml-2" disabled={offline || checking} onClick={() => void consult()}>Consultar servidor</Button>
      </div>}
      {current.isError && <div role="alert" className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">Não foi possível consultar o estado do caixa. Verifique a conexão antes de abrir ou fechar um turno. <Button size="sm" variant="outline" onClick={() => void current.refetch()}>Tentar novamente</Button></div>}
      {current.isLoading ? <p role="status" className="text-sm text-zinc-400">Consultando caixa…</p> : current.isError ? null : !s ? (
        <div className="max-w-md rounded-2xl border border-white/5 bg-panel p-6" data-testid="cash-open-panel">
          <h3 className="font-heading text-xl text-white">Caixa fechado</h3>
          <p className="mt-1 text-sm text-zinc-400">Informe o fundo de troco para iniciar o turno.</p>
          <Label htmlFor="cash-opening" className="mt-4 block text-xs text-zinc-400">Fundo de troco (R$)</Label>
          <Input id="cash-opening" value={opening} onChange={(e) => setOpening(formatCurrencyTyping(e.target.value))} inputMode="decimal" className="mt-1 font-mono" data-testid="cash-opening-input" />
          <Label htmlFor="cash-opening-note" className="mt-3 block text-xs text-zinc-400">Observações da abertura</Label>
          <Textarea id="cash-opening-note" maxLength={500} value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} className="mt-1" />
          <Button className="mt-4 h-12 w-full" onClick={() => open.mutate()} disabled={offline || updating || openingAmount === null} data-testid="cash-open-button"><LockKeyholeOpen /> Abrir caixa</Button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="rounded-md bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-300">Caixa aberto</span>
            <span className="text-sm text-muted-foreground">Turno {s.id.slice(0, 8)}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3">
            <Stat label="Aberto por" value={s.opened_by_name.split(" ")[0]} hint={fmtDateTime(s.opened_at)} testid="cash-opened-by" />
            <Stat label="Vendas no turno" value={String(s.sales_count)} hint={brl(s.sales_total)} testid="cash-sales-count" />
            <Stat label="Fundo de troco" value={brl(s.opening_amount)} testid="cash-opening" />
            <Stat label="Dinheiro esperado" value={blind ? "••••" : brl(s.expected_cash)} hint="conferência cega" testid="cash-expected" accent="text-primary" />
          </div>
          {s.opening_note && <p className="mt-3 break-words text-sm text-zinc-300">Observações da abertura · {s.opening_note}</p>}
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-4">
            <Panel title="Totais por forma de pagamento">
              <ul className="space-y-2">
                {Object.entries(s.totals_by_method).map(([k, v]) => (
                  <li key={k} className="flex justify-between text-sm"><span className="text-zinc-300">{payLabel(k)}</span><span className="font-mono">{blind ? "••••" : brl(v)}</span></li>
                ))}
                {Object.keys(s.totals_by_method).length === 0 && <p className="text-sm text-zinc-500">Sem vendas neste turno.</p>}
              </ul>
              {(s.refund_adjustments?.length ?? 0) > 0 && <div className="mt-3 border-t border-white/10 pt-3" data-testid="cash-refund-adjustments">
                <p className="text-xs font-semibold text-amber-300">Devoluções de turnos anteriores</p>
                {s.refund_adjustments?.map((entry) => <p key={entry.id} className="mt-1 break-words text-xs text-zinc-400">{fmtDateTime(entry.at)} · {entry.by_name} · {entry.reason} · {blind ? "••••" : brl(Object.values(entry.totals_by_method).reduce((a, b) => a + b, 0))}</p>)}
              </div>}
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => setBlind(!blind)} data-testid="cash-toggle-blind">{blind ? "Revelar valores" : "Ocultar valores"}</Button>
            </Panel>
            <Panel title="Sangria / Suprimento">
              <div className="grid grid-cols-2 gap-2">
                {(["sangria", "suprimento"] as const).map((t) => (
                  <Button key={t} variant={moveType === t ? "default" : "outline"} onClick={() => setMoveType(t)} aria-pressed={moveType === t} disabled={updating} data-testid={`cash-move-type-${t}`} className="h-11 capitalize">{t === "sangria" ? <ArrowUpFromLine /> : <ArrowDownToLine />}{t}</Button>
                ))}
              </div>
              <Input aria-label="Valor da movimentação" placeholder="Valor" value={moveAmt} onChange={(e) => setMoveAmt(formatCurrencyTyping(e.target.value))} inputMode="decimal" className="mt-3 font-mono" data-testid="cash-move-amount-input" />
              <Input aria-label="Motivo da movimentação" placeholder="Motivo" value={moveNote} onChange={(e) => setMoveNote(e.target.value)} className="mt-2" data-testid="cash-move-note-input" />
              <p className="mt-1 text-xs text-zinc-500">Informe um valor positivo e o motivo da movimentação.</p>
              <Button className="mt-3 h-11 w-full" disabled={offline || updating || movementAmount === null || movementAmount <= 0 || moveNote.trim().length < (moveType === "sangria" ? 3 : 1)} onClick={() => move.mutate()} data-testid="cash-move-button">Registrar</Button>
            </Panel>
            <Panel title="Fechamento" actions={<Button size="xs" variant="outline" onClick={() => setPrinting(s)} data-testid="cash-print-partial"><Printer className="size-3" /> Imprimir parcial</Button>}>
              <p className="text-sm text-zinc-400">Conte o dinheiro na gaveta e informe o valor.</p>
              <Input aria-label="Valor contado em reais" placeholder="Valor contado (R$)" value={counted} onChange={(e) => setCounted(formatCurrencyTyping(e.target.value))} inputMode="decimal" className="mt-3 font-mono" data-testid="cash-counted-input" />
              <Label htmlFor="cash-closing-note" className="mt-3 block text-xs text-zinc-400">Observações do fechamento</Label>
              <Textarea id="cash-closing-note" maxLength={500} value={closingNote} onChange={(event) => setClosingNote(event.target.value)} className="mt-1" />
              <Button variant="destructive" className="mt-3 h-11 w-full" disabled={offline || updating || countedAmount === null} onClick={() => window.confirm("Confirmar fechamento do caixa?") && close.mutate()} data-testid="cash-close-button"><LockKeyhole /> Fechar caixa</Button>
            </Panel>
          </div>
          <Panel title="Movimentações manuais do turno" className="mt-4">
            <Table stacked aria-label="Movimentações manuais do turno">
              <TableHeader><TableRow><TableHead>Data e hora</TableHead><TableHead>Tipo</TableHead><TableHead>Operador</TableHead><TableHead>Motivo</TableHead><TableHead className="text-right">Entrada</TableHead><TableHead className="text-right">Saída</TableHead></TableRow></TableHeader>
              <TableBody>
                {s.movements.map((movement, index) => <TableRow key={`${movement.at}-${index}`}>
                  <TableCell label="Data e hora">{fmtDateTime(movement.at)}</TableCell>
                  <TableCell label="Tipo">{movement.type === "sangria" ? "Sangria" : "Suprimento"}</TableCell>
                  <TableCell label="Operador">{movement.by_name}</TableCell>
                  <TableCell label="Motivo" className="whitespace-normal wrap-anywhere">{movement.note}</TableCell>
                  <TableCell label="Entrada" className="text-right">{movement.type === "suprimento" ? brl(movement.amount) : "—"}</TableCell>
                  <TableCell label="Saída" className="text-right">{movement.type === "sangria" ? brl(movement.amount) : "—"}</TableCell>
                </TableRow>)}
                {!s.movements.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Nenhuma movimentação manual neste turno.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}
      <Panel title="Turnos anteriores" className="mt-6">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Label className="grid gap-1">Fechados a partir de<Input type="date" value={historyStart} onChange={(event) => setHistoryStart(event.target.value)} /></Label>
          <Label className="grid gap-1">Fechados até<Input type="date" value={historyEnd} onChange={(event) => setHistoryEnd(event.target.value)} /></Label>
          <Button variant="outline" onClick={() => { setHistoryStart(""); setHistoryEnd(""); }}>Limpar datas</Button>
        </div>
        {!validHistory && <p role="alert" className="text-sm text-amber-300">A data inicial deve ser igual ou anterior à final.</p>}
        {validHistory && history.isLoading && <p role="status" className="text-sm text-muted-foreground">Consultando turnos…</p>}
        {validHistory && history.isError && <p role="alert" className="text-sm text-red-300">{errMsg(history.error)}</p>}
        {validHistory && !history.isError && history.data && <Table stacked aria-label="Turnos anteriores">
          <TableHeader><TableRow><TableHead>Abertura</TableHead><TableHead>Fechamento</TableHead><TableHead>Operador</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Esperado</TableHead><TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Diferença</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {!history.data.length && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Nenhum turno encerrado no período.</TableCell></TableRow>}
            {history.data.map((h) => (
              <TableRow key={h.id} data-testid={`cash-history-${h.id}`}>
                <TableCell label="Abertura" className="text-xs">{fmtDateTime(h.opened_at)}</TableCell>
                <TableCell label="Fechamento" className="text-xs">{fmtDateTime(h.closed_at)}</TableCell>
                <TableCell label="Operador">{h.closed_by_name || h.opened_by_name}</TableCell>
                <TableCell label="Vendas" className="text-right font-mono">{brl(h.sales_total)}</TableCell>
                <TableCell label="Esperado" className="text-right font-mono">{brl(h.expected_cash)}</TableCell>
                <TableCell label="Contado" className="text-right font-mono">{brl(h.counted_amount ?? 0)}</TableCell>
                <TableCell label="Diferença" className={cn("text-right font-mono", h.difference < 0 ? "text-red-300" : h.difference > 0 ? "text-amber-300" : "text-emerald-300")}>{brl(h.difference)}</TableCell>
                <TableCell label="Ações" className="text-right"><Button size="icon-xs" variant="ghost" aria-label="Imprimir fechamento" onClick={() => setPrinting(h)} data-testid={`cash-print-${h.id}`}><Printer /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
        {history.data?.length === 60 && <p className="mt-3 text-sm text-muted-foreground">Exibindo os 60 fechamentos mais recentes do período.</p>}
      </Panel>
      {printing && <ClosingReport s={printing} />}
    </AppShell>
  );
}

function ClosingReport({ s }: { s: CashSession }) {
  const rows = Object.entries(s.totals_by_method).sort(([a], [b]) => a.localeCompare(b));
  const card = rows.filter(([k]) => k.startsWith("credito") || k.startsWith("debito"));
  return (
    <div className="print-area hidden p-3 font-mono text-[11px] text-black print:block" data-testid="cash-closing-report">
      <p className="text-center font-bold">ESPETERIA CHURRAS BUGUER</p>
      <p className="text-center font-bold">FECHAMENTO DE CAIXA</p>
      <p>Abertura: {fmtDateTime(s.opened_at)} · {s.opened_by_name}</p>
      <p>Fechamento: {s.closed_at ? `${fmtDateTime(s.closed_at)} · ${s.closed_by_name}` : "PARCIAL (caixa aberto)"}</p>
      {s.opening_note && <p className="break-words">Observações da abertura: {s.opening_note}</p>}
      {s.closing_note && <p className="break-words">Observações do fechamento: {s.closing_note}</p>}
      <p className="mt-2 border-t border-dashed border-black pt-1 font-bold">TOTAIS POR FORMA / BANDEIRA</p>
      {rows.map(([k, v]) => <div key={k} className="flex justify-between"><span>{payLabel(k)}</span><span>{brl(v)}</span></div>)}
      <p className="mt-2 border-t border-dashed border-black pt-1 font-bold">CONFERIR NA MAQUININHA</p>
      {card.map(([k, v]) => <div key={k} className="flex justify-between"><span>{payLabel(k)}</span><span>{brl(v)}</span></div>)}
      <div className="flex justify-between font-bold"><span>Total cartões</span><span>{brl(card.reduce((t, [, v]) => t + v, 0))}</span></div>
      <p className="mt-2 border-t border-dashed border-black pt-1 font-bold">DINHEIRO</p>
      <div className="flex justify-between"><span>Fundo de troco</span><span>{brl(s.opening_amount)}</span></div>
      {s.movements.map((m, i) => <div key={i} className="flex justify-between"><span>{m.type}</span><span>{m.type === "sangria" ? "-" : "+"}{brl(m.amount)}</span></div>)}
      <div className="flex justify-between"><span>Esperado</span><span>{brl(s.expected_cash)}</span></div>
      {s.counted_amount != null && <div className="flex justify-between"><span>Contado</span><span>{brl(s.counted_amount)}</span></div>}
      {s.counted_amount != null && <div className="flex justify-between font-bold"><span>Diferença</span><span>{brl(s.difference)}</span></div>}
      <p className="mt-2">Vendas: {s.sales_count} · Total {brl(s.sales_total)}</p>
      {(s.refund_adjustments?.length ?? 0) > 0 && <div className="mt-2 border-t border-dashed border-black pt-1">
        <p className="font-bold">DEVOLUÇÕES DE TURNOS ANTERIORES</p>
        {s.refund_adjustments?.map((entry) => <p key={entry.id} className="break-words">{fmtDateTime(entry.at)} · {entry.by_name} · {entry.reason} · {brl(Object.values(entry.totals_by_method).reduce((a, b) => a + b, 0))}</p>)}
      </div>}
      <p className="mt-6 text-center">_______________________<br />Assinatura do operador</p>
    </div>
  );
}
