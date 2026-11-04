import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, HardDrive, Loader2, RotateCcw, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/pages/Dashboard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { desktop } from "@/lib/desktop";
import { errMsg, fmtDateTime } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { LocalBackupSettings, OkOut, RestoreOut, ServerBackupInfo } from "@/lib/types";

/** Backup automático guardado no próprio servidor (local da loja ou nuvem). */
export function ServerBackups() {
  const list = useQuery({ queryKey: ["server-backups"], queryFn: () => apiGet<ServerBackupInfo[]>("/backups/server") });
  const cfg = useQuery({ queryKey: ["server-backup-settings"], queryFn: () => apiGet<LocalBackupSettings>("/backups/server/settings") });
  const inv = () => void queryClient.invalidateQueries({ queryKey: ["server-backups"] });
  const now = useMutation({ mutationFn: () => apiPost<ServerBackupInfo>("/backups/server"), onSuccess: (b) => { toast.success(`Backup salvo no servidor (${b.size_kb} KB)`); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const save = useMutation({ mutationFn: (b: LocalBackupSettings) => apiPut<LocalBackupSettings>("/backups/server/settings", b), onSuccess: () => { toast.success("Preferência salva"); void queryClient.invalidateQueries({ queryKey: ["server-backup-settings"] }); }, onError: (e) => toast.error(errMsg(e)) });
  const restore = useMutation({ mutationFn: (id: string) => apiPost<RestoreOut>(`/backups/server/${id}/restore`), onSuccess: (r) => { toast.success(r.message); void queryClient.invalidateQueries(); }, onError: (e) => toast.error(errMsg(e)) });
  const del = useMutation({ mutationFn: (id: string) => apiDelete<OkOut>(`/backups/server/${id}`), onSuccess: inv, onError: (e) => toast.error(errMsg(e)) });
  const c = cfg.data;
  return (
    <Panel title="Backup automático no servidor (conta local)" className="lg:col-span-2">
      <div className="flex flex-wrap items-center gap-4">
        {c && (
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <Checkbox checked={c.auto} onCheckedChange={(v) => save.mutate({ ...c, auto: !!v })} data-testid="server-backup-auto" /> Automático todo dia às 03:00
          </label>
        )}
        {c && <span className="flex items-center gap-1 text-sm text-zinc-400">Guardar os últimos
          <Input className="h-8 w-16 font-mono" defaultValue={String(c.keep)} onBlur={(e) => { const k = Math.max(3, Math.min(60, Number(e.target.value) || 14)); if (k !== c.keep) save.mutate({ ...c, keep: k }); }} data-testid="server-backup-keep" /> backups</span>}
        <Button className="ml-auto" onClick={() => now.mutate()} disabled={now.isPending} data-testid="server-backup-now-button">
          {now.isPending ? <Loader2 className="size-4 animate-spin" /> : <HardDrive className="size-4" />} Fazer backup agora
        </Button>
      </div>
      <ul className="mt-4 space-y-1.5" data-testid="server-backup-list">
        {(list.data ?? []).map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-sm" data-testid="server-backup-item">
            <span className="flex-1 text-zinc-200">{fmtDateTime(b.at)} · <span className="text-zinc-400">{b.trigger}{b.by_name && ` · ${b.by_name}`}</span></span>
            <span className="font-mono text-xs text-zinc-500">{b.size_kb} KB</span>
            <a href={`/api/backups/server/${b.id}/download`} download><Button size="xs" variant="outline" data-testid="server-backup-download"><Download className="size-3" /> Baixar</Button></a>
            <Button size="xs" variant="outline" disabled={restore.isPending} onClick={() => window.confirm("Restaurar este backup? Os dados atuais serão substituídos (uma cópia de segurança é feita antes).") && restore.mutate(b.id)} data-testid="server-backup-restore"><RotateCcw className="size-3" /> Restaurar</Button>
            <Button size="icon-sm" variant="ghost" onClick={() => window.confirm("Apagar este backup?") && del.mutate(b.id)} data-testid="server-backup-delete"><Trash2 /></Button>
          </li>
        ))}
        {!list.data?.length && <li className="text-xs text-zinc-500">Nenhum backup no servidor ainda.</li>}
      </ul>
    </Panel>
  );
}

/** Configuração do sistema: servidor (IP fixo / nuvem) e informações. */
export function SystemPanel() {
  const d = desktop();
  const cfg = useQuery({ queryKey: ["desktop-config"], queryFn: () => d!.config(), enabled: !!d });
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const add = async () => {
    if (!d) return;
    const full = /^https?:\/\//.test(url) ? url : `http://${url}`;
    const t = await d.testServer(full);
    if (!t.ok) { toast.error(`Servidor não respondeu: ${t.error ?? ""}`); if (!window.confirm("Salvar mesmo assim?")) return; }
    await d.addServer({ name: name || full, url: full });
    toast.success("Servidor adicionado"); setUrl(""); setName("");
    void queryClient.invalidateQueries({ queryKey: ["desktop-config"] });
  };
  const use = async (u: string) => { await d!.useServer(u); };
  const remove = async (u: string) => { await d!.removeServer(u); void queryClient.invalidateQueries({ queryKey: ["desktop-config"] }); };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Servidor do sistema">
        {d && cfg.data ? (
          <>
            <ul className="space-y-1.5" data-testid="server-list">
              {cfg.data.servers.map((s) => (
                <li key={s.url} className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-sm">
                  <Server className="size-4 text-primary" />
                  <span className="flex-1"><span className="text-white">{s.name}</span><span className="block font-mono text-xs text-zinc-500">{s.url}</span></span>
                  {s.url === cfg.data!.serverUrl ? <span className="text-xs text-emerald-300">em uso</span> : (
                    <>
                      <Button size="xs" onClick={() => void use(s.url)} data-testid="server-use-button">Usar</Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => void remove(s.url)} data-testid="server-remove-button"><Trash2 /></Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Servidor da loja)" data-testid="server-name-input" />
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="IP fixo ex.: 192.168.0.10:8001" className="font-mono" data-testid="server-url-input" />
              <Button disabled={url.trim().length < 4} onClick={() => void add()} data-testid="server-add-button">Adicionar</Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-400" data-testid="server-browser-info">Você está no navegador, usando o servidor <b className="font-mono text-zinc-200">{window.location.origin}</b>. Para escolher um servidor com IP fixo, use o aplicativo <b>Apollo PDV</b> para Windows (Configurações → Sistema).</p>
        )}
      </Panel>
      <Panel title="Servidor local na loja (IP fixo)">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-300">
          <li>Escolha um PC que fique sempre ligado e defina um IP fixo no roteador (ex.: 192.168.0.10).</li>
          <li>Nesse PC, rode o instalador <b className="font-mono">local-server\instalar-servidor.ps1</b> (instala banco de dados e servidor e abre a porta 8001).</li>
          <li>Nos caixas, no app Apollo PDV, adicione o servidor <b className="font-mono">192.168.0.10:8001</b> e clique em Usar.</li>
          <li>Celulares dos garçons abrem <b className="font-mono">http://192.168.0.10:8001</b> no navegador, no Wi-Fi da loja.</li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">O servidor local tem banco próprio. Para levar os dados da nuvem, faça um backup aqui e restaure no servidor local.</p>
      </Panel>
    </div>
  );
}
