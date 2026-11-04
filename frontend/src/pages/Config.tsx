import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CloudUpload, Download, Pencil, Plus, Printer as PrinterIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { GeneralSettings, Printer, PrinterIn, PrinterPurpose } from "@/lib/types";
import { CardFeesPanel } from "./Financeiro";
import { Panel } from "./Dashboard";

const PURPOSE: Record<PrinterPurpose, string> = { caixa: "Caixa / cupom", cozinha: "Cozinha", bar: "Bar", forno: "Forno / pizzaria" };
const invP = () => void queryClient.invalidateQueries({ queryKey: ["printers"] });

export default function Config() {
  return (
    <AppShell roles={[]}>
      <PageHeader title="Configurações" subtitle="Impressoras, dados da empresa e PIX, taxas de cartão e backup" />
      <Tabs defaultValue="impressoras">
        <TabsList>
          <TabsTrigger value="impressoras" data-testid="config-tab-printers">Impressoras</TabsTrigger>
          <TabsTrigger value="empresa" data-testid="config-tab-company">Empresa & PIX</TabsTrigger>
          <TabsTrigger value="taxas" data-testid="config-tab-fees">Taxas de cartão</TabsTrigger>
          <TabsTrigger value="backup" data-testid="config-tab-backup">Backup</TabsTrigger>
        </TabsList>
        <TabsContent value="impressoras" className="mt-4"><Printers /></TabsContent>
        <TabsContent value="empresa" className="mt-4"><Company /></TabsContent>
        <TabsContent value="taxas" className="mt-0"><CardFeesPanel /></TabsContent>
        <TabsContent value="backup" className="mt-4"><Backup /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Printers() {
  const q = useQuery({ queryKey: ["printers"], queryFn: () => apiGet<Printer[]>("/printers") });
  const [editing, setEditing] = useState<Printer | "new" | null>(null);
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/printers/${id}`), onSuccess: invP, onError: (e) => toast.error(errMsg(e)) });
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-zinc-400">A impressão abre pelo navegador já no tamanho do papel cadastrado (58/80mm).</p>
        <Button onClick={() => setEditing("new")} data-testid="printer-new-button"><Plus className="size-4" /> Nova impressora</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(q.data ?? []).map((p) => (
          <article key={p.id} className="rounded-2xl border border-white/5 bg-panel p-4" data-testid={`printer-card-${p.id}`}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary"><PrinterIcon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white">{p.name}</p>
                <p className="text-xs text-zinc-500">{PURPOSE[p.purpose]} · {p.paper}{p.ip && ` · ${p.ip}`} · {p.copies} via(s)</p>
              </div>
              {!p.active && <Badge variant="outline">Inativa</Badge>}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(p)} data-testid={`printer-edit-${p.id}`}><Pencil className="size-3.5" /> Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => window.confirm(`Excluir ${p.name}?`) && del.mutate(p.id)} data-testid={`printer-delete-${p.id}`}><Trash2 className="size-3.5" /></Button>
            </div>
          </article>
        ))}
        {q.data?.length === 0 && <p className="col-span-full py-10 text-center text-sm text-zinc-500">Nenhuma impressora cadastrada.</p>}
      </div>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-sm" data-testid="printer-dialog">
          {editing && <PrinterForm key={editing === "new" ? "n" : editing.id} editing={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PrinterForm({ editing, onClose }: { editing: Printer | "new"; onClose: () => void }) {
  const [f, setF] = useState<PrinterIn>(editing === "new" ? { name: "", purpose: "cozinha", paper: "80mm", ip: "", copies: 1, active: true } : { ...editing });
  const save = useMutation({
    mutationFn: () => (editing === "new" ? apiPost<Printer>("/printers", f) : apiPut<Printer>(`/printers/${editing.id}`, f)),
    onSuccess: () => { toast.success("Impressora salva"); invP(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{editing === "new" ? "Nova impressora" : "Editar impressora"}</DialogTitle></DialogHeader>
      <Input placeholder="Nome (ex: Térmica Cozinha)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="printer-name-input" />
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs text-zinc-400">Imprime</Label>
          <Select value={f.purpose} onValueChange={(v: string) => setF({ ...f, purpose: v as PrinterPurpose })}>
            <SelectTrigger className="mt-1 w-full" data-testid="printer-purpose-select"><SelectValue>{(v) => PURPOSE[v as PrinterPurpose]}</SelectValue></SelectTrigger>
            <SelectContent>{(Object.keys(PURPOSE) as PrinterPurpose[]).map((k) => <SelectItem key={k} value={k}>{PURPOSE[k]}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs text-zinc-400">Papel</Label>
          <Select value={f.paper} onValueChange={(v: string) => setF({ ...f, paper: v as PrinterIn["paper"] })}>
            <SelectTrigger className="mt-1 w-full" data-testid="printer-paper-select"><SelectValue /></SelectTrigger>
            <SelectContent>{["58mm", "80mm", "A4"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs text-zinc-400">IP (opcional)</Label><Input value={f.ip} placeholder="192.168.0.50" onChange={(e) => setF({ ...f, ip: e.target.value })} className="mt-1 font-mono" data-testid="printer-ip-input" /></div>
        <div><Label className="text-xs text-zinc-400">Vias</Label><Input value={String(f.copies)} inputMode="numeric" onChange={(e) => setF({ ...f, copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} className="mt-1 font-mono" data-testid="printer-copies-input" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={f.active} onCheckedChange={(v) => setF({ ...f, active: !!v })} data-testid="printer-active-checkbox" /> Ativa</label>
      <Button disabled={f.name.trim().length < 2 || save.isPending} onClick={() => save.mutate()} data-testid="printer-save-button">Salvar</Button>
    </>
  );
}

function Company() {
  const q = useQuery({ queryKey: ["settings-general"], queryFn: () => apiGet<GeneralSettings>("/settings/general") });
  return q.data ? <CompanyForm key={JSON.stringify(q.data)} init={q.data} /> : null;
}

function CompanyForm({ init }: { init: GeneralSettings }) {
  const [f, setF] = useState<GeneralSettings>({ ...{ pix_key: "", pix_holder: "", phone: "", address: "" }, ...init });
  const save = useMutation({
    mutationFn: () => apiPut<GeneralSettings>("/settings/general", f),
    onSuccess: () => { toast.success("Configurações salvas"); void queryClient.invalidateQueries({ queryKey: ["settings-general"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const field = (k: keyof GeneralSettings, label: string, ph: string) => (
    <div><Label className="text-xs text-zinc-400">{label}</Label><Input value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1" data-testid={`settings-${k}-input`} /></div>
  );
  return (
    <Panel title="Empresa & PIX (usado na cobrança do fiado pelo WhatsApp)">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("pix_key", "Chave PIX", "CNPJ, e-mail, telefone ou aleatória")}
        {field("pix_holder", "Nome do recebedor", "Espeteria Churras Buguer")}
        {field("phone", "Telefone / WhatsApp da loja", "(11) 99999-0000")}
        {field("address", "Endereço", "Rua…")}
      </div>
      <Button className="mt-4" onClick={() => save.mutate()} disabled={save.isPending} data-testid="settings-save-button">Salvar</Button>
    </Panel>
  );
}

function Backup() {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/backup", { credentials: "include" });
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `backup-espeteria-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Backup baixado. Agora envie o arquivo para o seu Google Drive.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no backup");
    } finally { setBusy(false); }
  };
  return (
    <Panel title="Backup completo">
      <p className="text-sm text-zinc-400">Gera um arquivo com produtos (incluindo imagens), estoque, vendas, caixa, fiado, funcionários (sem PINs) e configurações.</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
        <li>Clique em “Baixar backup”.</li>
        <li>Abra o Google Drive e envie o arquivo para uma pasta (ex: “Backups Espeteria”).</li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={download} disabled={busy} data-testid="backup-download-button"><Download className="size-4" /> {busy ? "Gerando…" : "Baixar backup"}</Button>
        <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noreferrer"><Button variant="outline" data-testid="backup-open-drive"><CloudUpload className="size-4" /> Abrir Google Drive</Button></a>
      </div>
    </Panel>
  );
}
