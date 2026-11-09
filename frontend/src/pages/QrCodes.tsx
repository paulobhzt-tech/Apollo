import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Globe, Plus, Printer, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { errMsg, tableLabel } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { Table } from "@/lib/types";

export default function QrCodes() {
  const { data: me } = useMe();
  const tables = useQuery({ queryKey: ["tables"], queryFn: () => apiGet<Table[]>("/tables") });
  const [num, setNum] = useState("");
  const inv = () => void queryClient.invalidateQueries({ queryKey: ["tables"] });
  const add = useMutation({ mutationFn: () => apiPost<Table>("/tables", { number: Number(num), seats: 4 }), onSuccess: () => { toast.success("Mesa criada"); setNum(""); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/tables/${id}`), onSuccess: inv, onError: (e) => toast.error(errMsg(e)) });
  const origin = window.location.origin;
  const [selectedKind, setSelectedKind] = useState<"all" | "mesa" | "comanda">("mesa");
  const site = `${origin}/pedir`;

  const printable = (tables.data ?? []).filter((t) => selectedKind === "all" || t.kind === selectedKind);
  const downloadList = () => {
    const rows = [["Identificação", "URL do cardápio"], ...printable.map((t) => [tableLabel(t), `${origin}/cardapio/${t.id}`])];
    const csv = "\uFEFF" + rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "apollo-qr-mesas.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <AppShell roles={["caixa", "garcom"]}>
      <PageHeader title="QR Codes & Cardápio Digital" subtitle="Um QR Code por mesa: o cliente pede pelo celular e o pedido cai direto na comanda e no KDS"
        actions={<div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" onClick={downloadList} disabled={!printable.length} data-testid="export-qr-list"><Download className="size-4" /> Exportar links</Button><Button variant="outline" onClick={() => window.print()} disabled={!printable.length} data-testid="print-all-qr-button"><Printer className="size-4" /> Imprimir QR Codes</Button></div>} />
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
        <div className="rounded-xl bg-white p-2"><QRCodeSVG value={site} size={84} /></div>
        <div className="flex-1">
          <p className="flex items-center gap-2 font-heading text-lg text-white"><Globe className="size-5 text-emerald-300" /> Site próprio de delivery · 0% comissão</p>
          <p className="break-all text-sm text-zinc-400" data-testid="own-site-url">{site}</p>
        </div>
        <a href="/pedir" target="_blank" rel="noreferrer"><Button data-testid="open-site-button">Abrir site</Button></a>
      </div>
      {me?.role === "admin" && (
        <div className="mb-4 flex max-w-sm gap-2">
          <Input placeholder="Nº da nova mesa" value={num} inputMode="numeric" onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} data-testid="new-table-number-input" />
          <Button disabled={!num} onClick={() => add.mutate()} data-testid="new-table-button"><Plus className="size-4" /> Mesa</Button>
        </div>
      )}
      <div className="mb-4 flex items-center gap-3 print:hidden"><label htmlFor="qr-filter" className="text-sm text-zinc-300">Imprimir:</label><select id="qr-filter" value={selectedKind} onChange={(e) => setSelectedKind(e.target.value as "all" | "mesa" | "comanda")} className="rounded-lg border border-white/20 bg-background px-3 py-2 text-sm"><option value="mesa">Somente mesas</option><option value="comanda">Somente comandas</option><option value="all">Todos</option></select><span className="text-xs text-zinc-400">{printable.length} QR Codes</span></div>
      <div className="print-area grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {printable.map((t) => (
          <div key={t.id} className="flex break-inside-avoid flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-4 text-black print:rounded-none print:border-black" data-testid={`qr-card-${t.number}`}>
            <p className="text-center font-heading text-sm font-semibold">Espeteria Churras Burguer</p>
            <QRCodeSVG value={`${origin}/cardapio/${t.id}`} size={130} />
            <p className="font-heading text-xl font-bold">{tableLabel(t)}</p>
            <p className="text-center text-[10px] text-zinc-600">Aponte a câmera, escolha os produtos e envie o pedido.</p>
            <div className="flex gap-1 print:hidden">
              <a href={`/cardapio/${t.id}`} target="_blank" rel="noreferrer" className="text-xs text-orange-600 underline" data-testid={`qr-open-${t.number}`}>abrir</a>
              {me?.role === "admin" && <button type="button" onClick={() => del.mutate(t.id)} data-testid={`delete-table-${t.number}`}><Trash2 className="size-3.5 text-zinc-400" /></button>}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
