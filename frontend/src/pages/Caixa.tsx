import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, LockKeyhole, LockKeyholeOpen, Printer } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import AppShell, { PageHeader, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cashAmount } from "@/lib/catalog-form";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/api";
import { brl, errMsg, fmtDateTime, payLabel } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { CashSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Panel } from "./Dashboard";

const inv = () => { void queryClient.invalidateQueries({ queryKey: ["cash"] }); void queryClient.invalidateQueries({ queryKey: ["dashboard"] }); };

export default function Caixa() {
  const current = useQuery({ queryKey: ["cash", "current"], queryFn: () => apiGet<CashSession | null>("/cash/current"), refetchInterval: 15000 });
  const history = useQuery({ queryKey: ["cash", "history"], queryFn: () => apiGet<CashSession[]>("/cash/history") });
  const [opening, setOpening] = useState("0");
  const [openingNote, setOpeningNote] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [moveType, setMoveType] = useState<"sangria" | "suprimento">("sangria");
  const [moveAmt, setMoveAmt] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [counted, setCounted] = useState("");
  const [blind, setBlind] = useState(true);
  const [printing, setPrinting] = useState<CashSession | null>(null);
  useEffect(() => { if (!printing) return; const t = setTimeout(() => { window.print(); setPrinting(null); }, 100); return () => clearTimeout(t); }, [printing]);
  const onErr = (e: unknown) => toast.error(errMsg(e));

  const s = current.isError ? null : current.data;
  const openingAmount = cashAmount(opening);
  const movementAmount = cashAmount(moveAmt);
  const countedAmount = cashAmount(counted);

  const open = useMutation({ mutationFn: () => apiPost<CashSession>("/cash/open", { opening_amount: openingAmount, note: openingNote.trim() }), onSuccess: () => { toast.success("Caixa aberto"); setOpeningNote(""); inv(); }, onError: onErr });
  const move = useMutation({
    mutationFn: () => apiPost<CashSession>("/cash/movement", { type: moveType, amount: movementAmount, note: moveNote.trim(), expected_session_id: s?.id }),
    onSuccess: () => { toast.success(moveType === "sangria" ? "Sangria registrada" : "Suprimento registrado"); setMoveAmt(""); setMoveNote(""); inv(); },
    onError: onErr,
  });
  const close = useMutation({
    mutationFn: () => apiPost<CashSession>("/cash/close", { counted_amount: countedAmount, note: closingNote.trim(), expected_session_id: s?.id }),
    onSuccess: (s) => { toast.success(`Caixa fechado · diferença ${brl(s.difference)}`); setCounted(""); setClosingNote(""); setBlind(true); inv(); setPrinting(s); },
    onError: onErr,
  });

  const updating = open.isPending || move.isPending || close.isPending;
  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Controle de Caixa" subtitle="Abertura, sangria, suprimento e fechamento com conferência cega" />
      {current.isError && <div role="alert" className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">Não foi possível consultar o estado do caixa. Verifique a conexão antes de abrir ou fechar um turno. <Button size="sm" variant="outline" onClick={() => void current.refetch()}>Tentar novamente</Button></div>}
      {current.isLoading ? <p role="status" className="text-sm text-zinc-400">Consultando caixa…</p> : current.isError ? null : !s ? (
        <div className="max-w-md rounded-2xl border border-white/5 bg-panel p-6" data-testid="cash-open-panel">
          <h3 className="font-heading text-xl text-white">Caixa fechado</h3>
          <p className="mt-1 text-sm text-zinc-400">Informe o fundo de troco para iniciar o turno.</p>
          <Label htmlFor="cash-opening" className="mt-4 block text-xs text-zinc-400">Fundo de troco (R$)</Label>
          <Input id="cash-opening" value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" className="mt-1 font-mono" data-testid="cash-opening-input" />
          <Label htmlFor="cash-opening-note" className="mt-3 block text-xs text-zinc-400">Observações da abertura</Label>
          <Textarea id="cash-opening-note" maxLength={500} value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} className="mt-1" />
          <Button className="mt-4 h-12 w-full" onClick={() => open.mutate()} disabled={updating || openingAmount === null} data-testid="cash-open-button"><LockKeyholeOpen /> Abrir caixa</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Aberto por" value={s.opened_by_name.split(" ")[0]} hint={fmtDateTime(s.opened_at)} testid="cash-opened-by" />
            <Stat label="Vendas no turno" value={String(s.sales_count)} hint={brl(s.sales_total)} testid="cash-sales-count" />
            <Stat label="Fundo de troco" value={brl(s.opening_amount)} testid="cash-opening" />
            <Stat label="Dinheiro esperado" value={blind ? "••••" : brl(s.expected_cash)} hint="conferência cega" testid="cash-expected" accent="text-primary" />
          </div>
          {s.opening_note && <p className="mt-3 break-words text-sm text-zinc-300">Observações da abertura · {s.opening_note}</p>}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel title="Totais por forma de pagamento">
              <ul className="space-y-2">
                {Object.entries(s.totals_by_method).map(([k, v]) => (
                  <li key={k} className="flex justify-between text-sm"><span className="text-zinc-300">{payLabel(k)}</span><span className="font-mono">{blind ? "••••" : brl(v)}</span></li>
                ))}
                {Object.keys(s.totals_by_method).length === 0 && <p className="text-sm text-zinc-500">Sem vendas neste turno.</p>}
              </ul>
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => setBlind(!blind)} data-testid="cash-toggle-blind">{blind ? "Revelar valores" : "Ocultar valores"}</Button>
            </Panel>
            <Panel title="Sangria / Suprimento">
              <div className="grid grid-cols-2 gap-2">
                {(["sangria", "suprimento"] as const).map((t) => (
                  <Button key={t} variant={moveType === t ? "default" : "outline"} onClick={() => setMoveType(t)} aria-pressed={moveType === t} disabled={updating} data-testid={`cash-move-type-${t}`} className="h-11 capitalize">{t === "sangria" ? <ArrowUpFromLine /> : <ArrowDownToLine />}{t}</Button>
                ))}
              </div>
              <Input aria-label="Valor da movimentação" placeholder="Valor" value={moveAmt} onChange={(e) => setMoveAmt(e.target.value)} inputMode="decimal" className="mt-3 font-mono" data-testid="cash-move-amount-input" />
              <Input aria-label="Motivo da movimentação" placeholder="Motivo" value={moveNote} onChange={(e) => setMoveNote(e.target.value)} className="mt-2" data-testid="cash-move-note-input" />
              <p className="mt-1 text-xs text-zinc-500">Informe um valor positivo e o motivo da movimentação.</p>
              <Button className="mt-3 h-11 w-full" disabled={updating || movementAmount === null || movementAmount <= 0 || moveNote.trim().length < (moveType === "sangria" ? 3 : 1)} onClick={() => move.mutate()} data-testid="cash-move-button">Registrar</Button>
              <ul className="mt-3 space-y-1 text-xs">
                {s.movements.map((m, i) => (
                  <li key={i} className="flex justify-between text-zinc-400"><span>{m.type} · {m.note || "—"}</span><span className={cn("font-mono", m.type === "sangria" ? "text-red-300" : "text-emerald-300")}>{brl(m.amount)}</span></li>
                ))}
              </ul>
            </Panel>
            <Panel title="Fechamento" actions={<Button size="xs" variant="outline" onClick={() => setPrinting(s)} data-testid="cash-print-partial"><Printer className="size-3" /> Imprimir parcial</Button>}>
              <p className="text-sm text-zinc-400">Conte o dinheiro na gaveta e informe o valor.</p>
              <Input aria-label="Valor contado em reais" placeholder="Valor contado (R$)" value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" className="mt-3 font-mono" data-testid="cash-counted-input" />
              <Label htmlFor="cash-closing-note" className="mt-3 block text-xs text-zinc-400">Observações do fechamento</Label>
              <Textarea id="cash-closing-note" maxLength={500} value={closingNote} onChange={(event) => setClosingNote(event.target.value)} className="mt-1" />
              <Button variant="destructive" className="mt-3 h-11 w-full" disabled={updating || countedAmount === null} onClick={() => window.confirm("Confirmar fechamento do caixa?") && close.mutate()} data-testid="cash-close-button"><LockKeyhole /> Fechar caixa</Button>
            </Panel>
          </div>
        </>
      )}
      <h3 className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">Turnos anteriores</h3>
      <div className="rounded-2xl border border-white/5 bg-panel">
        <Table>
          <TableHeader><TableRow><TableHead>Abertura</TableHead><TableHead>Fechamento</TableHead><TableHead>Operador</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Esperado</TableHead><TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Diferença</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(history.data ?? []).map((h) => (
              <TableRow key={h.id} data-testid={`cash-history-${h.id}`}>
                <TableCell className="text-xs">{fmtDateTime(h.opened_at)}</TableCell>
                <TableCell className="text-xs">{fmtDateTime(h.closed_at)}</TableCell>
                <TableCell>{h.closed_by_name || h.opened_by_name}</TableCell>
                <TableCell className="text-right font-mono">{brl(h.sales_total)}</TableCell>
                <TableCell className="text-right font-mono">{brl(h.expected_cash)}</TableCell>
                <TableCell className="text-right font-mono">{brl(h.counted_amount ?? 0)}</TableCell>
                <TableCell className={cn("text-right font-mono", h.difference < 0 ? "text-red-300" : h.difference > 0 ? "text-amber-300" : "text-emerald-300")}>{brl(h.difference)}</TableCell>
                <TableCell className="text-right"><Button size="icon-xs" variant="ghost" onClick={() => setPrinting(h)} data-testid={`cash-print-${h.id}`}><Printer /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
      <p className="mt-6 text-center">_______________________<br />Assinatura do operador</p>
    </div>
  );
}
