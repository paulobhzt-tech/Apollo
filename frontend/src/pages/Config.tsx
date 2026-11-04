import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import SelfTest from "@/components/SelfTest";
import SyncPanel from "@/components/SyncPanel";
import { ServerBackups, SystemPanel } from "@/components/SystemPanels";
import DevicePrinterField from "@/components/DevicePrinterField";
import DriveBackup from "@/components/DriveBackup";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CloudUpload, Download, Pencil, Plus, Printer as PrinterIcon, Trash2, Upload } from "lucide-react";
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
import type { GeneralSettings, Printer, PrinterIn, PrinterPurpose, RestoreIn, RestoreOut } from "@/lib/types";
import { envName, useEnvironments } from "@/lib/environments";
import { CardFeesPanel } from "./Financeiro";
import { Panel } from "./Dashboard";

const invP = () => void queryClient.invalidateQueries({ queryKey: ["printers"] });

export default function Config() {
  const [params] = useSearchParams();
  return (
    <AppShell roles={[]}>
      <PageHeader title="Configurações" subtitle="Impressoras, dados da empresa e PIX, taxas de cartão, backup e auto teste" />
      <Tabs defaultValue={params.get("tab") ?? "impressoras"}>
        <TabsList>
          <TabsTrigger value="impressoras" data-testid="config-tab-printers">Impressoras</TabsTrigger>
          <TabsTrigger value="empresa" data-testid="config-tab-company">Empresa & PIX</TabsTrigger>
          <TabsTrigger value="taxas" data-testid="config-tab-fees">Taxas de cartão</TabsTrigger>
          <TabsTrigger value="backup" data-testid="config-tab-backup">Backup</TabsTrigger>
          <TabsTrigger value="autoteste" data-testid="config-tab-selftest">Auto teste</TabsTrigger>
          <TabsTrigger value="sync" data-testid="config-tab-sync">Sincronização</TabsTrigger>
          <TabsTrigger value="sistema" data-testid="config-tab-system">Sistema</TabsTrigger>
        </TabsList>
        <TabsContent value="impressoras" className="mt-4"><Printers /></TabsContent>
        <TabsContent value="empresa" className="mt-4"><Company /></TabsContent>
        <TabsContent value="taxas" className="mt-0"><CardFeesPanel /></TabsContent>
        <TabsContent value="backup" className="mt-4"><Backup flash={params.get("drive")} /></TabsContent>
        <TabsContent value="autoteste" className="mt-4"><SelfTest /></TabsContent>
        <TabsContent value="sync" className="mt-4"><SyncPanel /></TabsContent>
        <TabsContent value="sistema" className="mt-4"><SystemPanel /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function usePurposes() {
  const envs = useEnvironments();
  const label = (k: PrinterPurpose) => (k === "caixa" ? "Caixa / cupom" : envName(envs.data, k));
  return { keys: ["caixa", ...(envs.data ?? []).map((e) => e.key)], label };
}

function Printers() {
  const { label } = usePurposes();
  const q = useQuery({ queryKey: ["printers"], queryFn: () => apiGet<Printer[]>("/printers") });
  const [editing, setEditing] = useState<Printer | "new" | null>(null);
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/printers/${id}`), onSuccess: invP, onError: (e) => toast.error(errMsg(e)) });
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-zinc-400">Cada impressora atende um ambiente. Os tickets saem automaticamente pela Central de Impressão.</p>
        <Button onClick={() => setEditing("new")} data-testid="printer-new-button"><Plus className="size-4" /> Nova impressora</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(q.data ?? []).map((p) => (
          <article key={p.id} className="rounded-2xl border border-white/5 bg-panel p-4" data-testid={`printer-card-${p.id}`}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary"><PrinterIcon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white">{p.name}</p>
                <p className="text-xs text-zinc-500">{label(p.purpose)} · {p.paper}{p.device_name && ` · ${p.device_name}`}{p.ip && ` · ${p.ip}`} · {p.copies} via(s)</p>
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
  const P = usePurposes();
  const [f, setF] = useState<PrinterIn>(editing === "new" ? { name: "", purpose: "cozinha", paper: "80mm", ip: "", device_name: "", copies: 1, active: true } : { ...editing });
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
        <div><Label className="text-xs text-zinc-400">Imprime (ambiente)</Label>
          <Select value={f.purpose} onValueChange={(v: string) => setF({ ...f, purpose: v as PrinterPurpose })}>
            <SelectTrigger className="mt-1 w-full" data-testid="printer-purpose-select"><SelectValue>{(v) => P.label(v as string)}</SelectValue></SelectTrigger>
            <SelectContent>{P.keys.map((k) => <SelectItem key={k} value={k}>{P.label(k)}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs text-zinc-400">Papel</Label>
          <Select value={f.paper} onValueChange={(v: string) => setF({ ...f, paper: v as PrinterIn["paper"] })}>
            <SelectTrigger className="mt-1 w-full" data-testid="printer-paper-select"><SelectValue /></SelectTrigger>
            <SelectContent>{["58mm", "80mm", "A4"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs text-zinc-400">IP (opcional)</Label><Input value={f.ip} placeholder="192.168.0.50" onChange={(e) => setF({ ...f, ip: e.target.value })} className="mt-1 font-mono" data-testid="printer-ip-input" /></div>
        <DevicePrinterField value={f.device_name ?? ""} onChange={(v) => setF({ ...f, device_name: v })} />
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
  const [f, setF] = useState<GeneralSettings>({ ...{ company_name: "", trade_name: "", cnpj: "", ie: "", city: "", receipt_footer: "", pix_key: "", pix_holder: "", phone: "", address: "" }, ...init });
  const save = useMutation({
    mutationFn: () => apiPut<GeneralSettings>("/settings/general", f),
    onSuccess: () => { toast.success("Configurações salvas"); void queryClient.invalidateQueries({ queryKey: ["settings-general"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const field = (k: keyof GeneralSettings, label: string, ph: string) => (
    <div><Label className="text-xs text-zinc-400">{label}</Label><Input value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1" data-testid={`settings-${k}-input`} /></div>
  );
  return (
    <Panel title="Dados da empresa (aparecem no cupom, pré-conta e nota) e PIX">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("trade_name", "Nome no cupom (nome fantasia)", "Ex.: Espeteria Churras Buguer")}
        {field("company_name", "Razão social", "Espeteria Churras Buguer LTDA")}
        {field("cnpj", "CNPJ", "00.000.000/0001-00")}
        {field("ie", "Inscrição estadual", "Isento ou número")}
        {field("city", "Cidade / UF", "Belo Horizonte/MG")}
        {field("receipt_footer", "Mensagem no rodapé do cupom", "Obrigado pela preferência!")}
        {field("pix_key", "Chave PIX", "CNPJ, e-mail, telefone ou aleatória")}
        {field("pix_holder", "Nome do recebedor", "Espeteria Churras Buguer")}
        {field("phone", "Telefone / WhatsApp da loja", "(11) 99999-0000")}
        {field("address", "Endereço", "Rua…")}
      </div>
      <Button className="mt-4" onClick={() => save.mutate()} disabled={save.isPending} data-testid="settings-save-button">Salvar</Button>
    </Panel>
  );
}

function Backup({ flash }: { flash: string | null }) {
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
    <div className="grid gap-4 lg:grid-cols-2">
    <ServerBackups />
    <DriveBackup flash={flash} />
    <Panel title="Backup manual (baixar arquivo)">
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
    <Restore />
    </div>
  );
}

function Restore() {
  const [file, setFile] = useState<{ name: string; body: RestoreIn; summary: string } | null>(null);
  const [result, setResult] = useState("");
  const run = useMutation({
    mutationFn: (b: RestoreIn) => apiPost<RestoreOut>("/backup/restore", b),
    onSuccess: (r) => { setResult(r.message); setFile(null); toast.success(r.message); void queryClient.invalidateQueries(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const pick = async (f: File) => {
    try {
      const json = JSON.parse(await f.text()) as { app?: string; created_at?: string; data?: Record<string, unknown[]> };
      if (!json.data || typeof json.data !== "object") throw new Error("Arquivo não é um backup do sistema");
      const n = (k: string) => (Array.isArray(json.data?.[k]) ? json.data[k].length : 0);
      setFile({ name: f.name, body: { data: json.data }, summary: `${n("products")} produtos · ${n("orders")} vendas · ${n("employees")} funcionários · ${n("fiado_customers")} clientes fiado${json.created_at ? ` · gerado em ${json.created_at}` : ""}` });
      setResult("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Arquivo inválido"); }
  };
  return (
    <Panel title="Restaurar backup (novo computador)">
      <p className="text-sm text-zinc-400">Baixe o arquivo do Google Drive e envie aqui. <b className="text-amber-300">Os dados atuais serão substituídos</b> pelos do backup. Funcionários mantêm os PINs deste sistema; quem não existir aqui volta inativo até você cadastrar um PIN.</p>
      <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-5 text-sm text-zinc-300 transition-colors duration-150 hover:border-primary/50">
        <Upload className="size-4" /> {file ? file.name : "Escolher arquivo de backup (.json)"}
        <input type="file" accept="application/json,.json" className="hidden" data-testid="restore-file-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
      </label>
      {file && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3" data-testid="restore-preview">
          <p className="text-sm text-amber-200">{file.summary}</p>
          <Button className="mt-3" variant="destructive" disabled={run.isPending} onClick={() => window.confirm("Substituir os dados atuais pelos do backup?") && run.mutate(file.body)} data-testid="restore-confirm-button">
            {run.isPending ? "Restaurando…" : "Restaurar agora"}
          </Button>
        </div>
      )}
      {result && <p className="mt-3 text-sm text-emerald-300" data-testid="restore-result">{result}</p>}
    </Panel>
  );
}
