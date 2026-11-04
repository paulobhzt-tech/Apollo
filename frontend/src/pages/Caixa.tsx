import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import AppShell, { PageHeader, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/api";
import { brl, errMsg, fmtDateTime, payLabel } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { CashSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Panel } from "./Dashboard";

const num = (s: string) => Number(s.replace(",", ".")) || 0;
const inv = () => { void queryClient.invalidateQueries({ queryKey: ["cash"] }); void queryClient.invalidateQueries({ queryKey: ["dashboard"] }); };

export default function Caixa() {
  const current = useQuery({ queryKey: ["cash", "current"], queryFn: () => apiGet<CashSession | null>("/cash/current"), refetchInterval: 15000 });
  const history = useQuery({ queryKey: ["cash", "history"], queryFn: () => apiGet<CashSession[]>("/cash/history") });
  const [opening, setOpening] = useState("200");
  const [moveType, setMoveType] = useState<"sangria" | "suprimento">("sangria");
  const [moveAmt, setMoveAmt] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [counted, setCounted] = useState("");
  const [blind, setBlind] = useState(true);
  const [printing, setPrinting] = useState<CashSession | null>(null);
  useEffect(() => { if (!printing) return; const t = setTimeout(() => { window.print(); setPrinting(null); }, 100); return () => clearTimeout(t); }, [printing]);
  const onErr = (e: unknown) => toast.error(errMsg(e));

  const open = useMutation({ mutationFn: () => apiPost<CashSession>("/cash/open", { opening_amount: num(opening) }), onSuccess: () => { toast.success("Caixa aberto"); inv(); }, onError: onErr });
  const move = useMutation({
    mutationFn: () => apiPost<CashSession>("/cash/movement", { type: moveType, amount: num(moveAmt), note: moveNote }),
    onSuccess: () => { toast.success(moveType === "sangria" ? "Sangria registrada" : "Suprimento registrado"); setMoveAmt(""); setMoveNote(""); inv(); },
    onError: onErr,
  });
  const close = useMutation({
    mutationFn: () => apiPost<CashSession>("/cash/close", { counted_amount: num(counted) }),
    onSuccess: (s) => { toast.success(`Caixa fechado · diferença ${brl(s.difference)}`); setCounted(""); setBlind(true); inv(); setPrinting(s); },
    onError: onErr,
  });

  const s = current.isError ? null : current.data;
  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Controle de Caixa" subtitle="Abertura, sangria, suprimento e fechamento com conferência cega" />
      {current.isLoading ? null : !s ? (
        <div className="max-w-md rounded-2xl border border-white/5 bg-panel p-6" data-testid="cash-open-panel">
          <h3 className="font-heading text-xl text-white">Caixa fechado</h3>
          <p className="mt-1 text-sm text-zinc-400">Informe o fundo de troco para iniciar o turno.</p>
          <Label className="mt-4 block text-xs text-zinc-400">Fundo de troco (R$)</Label>
          <Input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" className="mt-1 font-mono" data-testid="cash-opening-input" />
          <Button className="mt-4 w-full" onClick={() => open.mutate()} disabled={open.isPending} data-testid="cash-open-button">Abrir caixa</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Aberto por" value={s.opened_by_name.split(" ")[0]} hint={fmtDateTime(s.opened_at)} testid="cash-opened-by" />
            <Stat label="Vendas no turno" value={String(s.sales_count)} hint={brl(s.sales_total)} testid="cash-sales-count" />
            <Stat label="Fundo de troco" value={brl(s.opening_amount)} testid="cash-opening" />
            <Stat label="Dinheiro esperado" value={blind ? "••••" : brl(s.expected_cash)} hint="conferência cega" testid="cash-expected" accent="text-primary" />
          </div>
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
                  <Button key={t} variant={moveType === t ? "default" : "outline"} onClick={() => setMoveType(t)} data-testid={`cash-move-type-${t}`} className="capitalize">{t}</Button>
                ))}
              </div>
              <Input placeholder="Valor" value={moveAmt} onChange={(e) => setMoveAmt(e.target.value)} inputMode="decimal" className="mt-3 font-mono" data-testid="cash-move-amount-input" />
              <Input placeholder="Motivo" value={moveNote} onChange={(e) => setMoveNote(e.target.value)} className="mt-2" data-testid="cash-move-note-input" />
              <Button className="mt-3 w-full" disabled={!num(moveAmt) || move.isPending} onClick={() => move.mutate()} data-testid="cash-move-button">Registrar</Button>
              <ul className="mt-3 space-y-1 text-xs">
                {s.movements.map((m, i) => (
                  <li key={i} className="flex justify-between text-zinc-400"><span>{m.type} · {m.note || "—"}</span><span className={cn("font-mono", m.type === "sangria" ? "text-red-300" : "text-emerald-300")}>{brl(m.amount)}</span></li>
                ))}
              </ul>
            </Panel>
            <Panel title="Fechamento" actions={<Button size="xs" variant="outline" onClick={() => setPrinting(s)} data-testid="cash-print-partial"><Printer className="size-3" /> Imprimir parcial</Button>}>
              <p className="text-sm text-zinc-400">Conte o dinheiro na gaveta e informe o valor.</p>
              <Input placeholder="Valor contado (R$)" value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" className="mt-3 font-mono" data-testid="cash-counted-input" />
              <Button variant="destructive" className="mt-3 w-full" disabled={!counted || close.isPending} onClick={() => window.confirm("Confirmar fechamento do caixa?") && close.mutate()} data-testid="cash-close-button">Fechar caixa</Button>
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
