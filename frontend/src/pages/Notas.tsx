import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell, { PageHeader } from "@/components/AppShell";
import InvoiceDialog from "@/components/InvoiceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { brl, fmtDateTime } from "@/lib/format";
import type { Invoice } from "@/lib/types";

export default function Notas() {
  const q = useQuery({ queryKey: ["invoices"], queryFn: () => apiGet<Invoice[]>("/invoices") });
  const [sel, setSel] = useState<Invoice | null>(null);
  const [search, setSearch] = useState("");
  const list = (q.data ?? []).filter((i) => !search || String(i.number).includes(search) || String(i.order_number).includes(search) || i.access_key.includes(search));
  const total = list.filter((i) => i.status === "autorizada").reduce((s, i) => s + i.total, 0);
  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Notas Fiscais" subtitle="NFC-e / NF-e ilimitadas armazenadas na nuvem · emissão SIMULADA (sem envio à SEFAZ)"
        actions={<Input placeholder="Buscar nº, pedido ou chave" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" data-testid="invoice-search-input" />} />
      <p className="mb-3 text-sm text-zinc-400">{list.length} notas · total autorizado <span className="font-mono text-white">{brl(total)}</span></p>
      <div className="rounded-2xl border border-white/5 bg-panel">
        <Table>
          <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Modelo</TableHead><TableHead>Emissão</TableHead><TableHead>Pedido</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {list.map((i) => (
              <TableRow key={i.id} data-testid={`invoice-row-${i.number}`}>
                <TableCell className="font-mono">{String(i.number).padStart(6, "0")}</TableCell>
                <TableCell>{i.doc_type === "nfce" ? "NFC-e (65)" : "NF-e (55)"}</TableCell>
                <TableCell className="text-xs text-zinc-400">{fmtDateTime(i.emitted_at)}</TableCell>
                <TableCell className="font-mono">#{i.order_number}</TableCell>
                <TableCell><Badge variant="outline" className={i.status === "autorizada" ? "border-emerald-400/30 text-emerald-300" : "border-red-400/30 text-red-300"}>{i.status}</Badge></TableCell>
                <TableCell className="text-right font-mono">{brl(i.total)}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSel(i)} data-testid={`invoice-view-${i.number}`}>DANFE</Button></TableCell>
              </TableRow>
            ))}
            {list.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-zinc-500">Nenhuma nota emitida ainda. Finalize uma venda no PDV.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <InvoiceDialog invoice={sel} onClose={() => setSel(null)} />
    </AppShell>
  );
}
