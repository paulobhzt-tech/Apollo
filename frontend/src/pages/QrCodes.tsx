import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Globe, Plus, Printer, Trash2 } from "lucide-react";
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
  const site = `${origin}/pedir`;

  return (
    <AppShell roles={["caixa", "garcom"]}>
      <PageHeader title="QR Codes & Cardápio Digital" subtitle="Um QR Code por mesa: o cliente pede pelo celular e o pedido cai direto na comanda e no KDS"
        actions={<Button variant="outline" onClick={() => window.print()} data-testid="print-all-qr-button"><Printer className="size-4" /> Imprimir todos</Button>} />
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
      <div className="print-area grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {(tables.data ?? []).map((t) => (
          <div key={t.id} className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-black" data-testid={`qr-card-${t.number}`}>
            <p className="text-center font-heading text-sm font-semibold">Espeteria Churras Buguer</p>
            <QRCodeSVG value={`${origin}/cardapio/${t.id}`} size={130} />
            <p className="font-heading text-xl font-bold">{tableLabel(t)}</p>
            <div className="flex gap-1">
              <a href={`/cardapio/${t.id}`} target="_blank" rel="noreferrer" className="text-xs text-orange-600 underline" data-testid={`qr-open-${t.number}`}>abrir</a>
              {me?.role === "admin" && <button type="button" onClick={() => del.mutate(t.id)} data-testid={`delete-table-${t.number}`}><Trash2 className="size-3.5 text-zinc-400" /></button>}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
