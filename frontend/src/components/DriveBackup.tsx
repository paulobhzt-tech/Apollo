import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CloudUpload, Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/pages/Dashboard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg, fmtDateTime } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { AuthUrlOut, DriveBackupInfo, DriveSettingsIn, DriveStatus, OkOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const inv = () => void queryClient.invalidateQueries({ queryKey: ["drive-status"] });

export default function DriveBackup({ flash }: { flash: string | null }) {
  const q = useQuery({ queryKey: ["drive-status"], queryFn: () => apiGet<DriveStatus>("/drive/status") });
  useEffect(() => {
    if (flash === "ok") toast.success("Google Drive conectado!");
    else if (flash === "erro") toast.error("Não foi possível conectar ao Google Drive");
    else if (flash === "escopo") toast.error("Permita o acesso aos arquivos do Drive para continuar");
  }, [flash]);
  const connect = useMutation({ mutationFn: () => apiGet<AuthUrlOut>("/drive/connect"), onSuccess: (r) => { window.location.href = r.authorization_url; }, onError: (e) => toast.error(errMsg(e)) });
  const now = useMutation({ mutationFn: () => apiPost<DriveBackupInfo>("/drive/backup-now", {}), onSuccess: (r) => { toast.success(`Backup enviado: ${r.file_name}`); inv(); }, onError: (e) => { toast.error(errMsg(e)); inv(); } });
  const auto = useMutation({ mutationFn: (b: DriveSettingsIn) => apiPut<OkOut>("/drive/settings", b), onSuccess: (r) => { toast.success(r.message); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const off = useMutation({ mutationFn: () => apiDelete<OkOut>("/drive"), onSuccess: () => { toast.success("Google Drive desconectado"); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const s = q.data;
  if (!s) return null;
  return (
    <Panel title="Backup automático no Google Drive" className="lg:col-span-2">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-60 flex-1">
          <p className="text-sm text-zinc-300" data-testid="drive-status">
            {!s.configured ? "Aguardando as credenciais do Google serem cadastradas no servidor."
              : s.connected ? <>Conectado a <b className="text-white">{s.email || "sua conta Google"}</b> · pasta “{s.folder_name}”</>
              : "Conecte sua conta Google uma vez. Depois o sistema envia o backup sozinho toda noite."}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Todo dia às 03:00 (Brasília) · guarda os últimos 14 backups no Drive · sem PINs de funcionários.</p>
        </div>
        {s.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <Checkbox checked={s.auto} onCheckedChange={(v) => auto.mutate({ auto: !!v })} data-testid="drive-auto-switch" /> Automático toda noite
            </label>
            <Button onClick={() => now.mutate()} disabled={now.isPending} data-testid="drive-backup-now-button">
              {now.isPending ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />} Enviar backup agora
            </Button>
            <Button variant="ghost" onClick={() => window.confirm("Desconectar o Google Drive?") && off.mutate()} data-testid="drive-disconnect-button"><Unlink className="size-4" /></Button>
          </div>
        ) : (
          <Button onClick={() => connect.mutate()} disabled={!s.configured || connect.isPending} data-testid="drive-connect-button"><Link2 className="size-4" /> Conectar Google Drive</Button>
        )}
      </div>
      <ul className="mt-4 space-y-1.5" data-testid="drive-history">
        {s.history.map((h) => (
          <li key={`${h.at}-${h.trigger}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2 text-sm">
            <span className={cn(h.ok ? "text-emerald-300" : "text-red-300")}>{h.ok ? "✓ Enviado" : "✗ Falhou"} · {h.trigger === "automatico" ? "automático" : "manual"}</span>
            <span className="text-xs text-zinc-400">{h.ok ? `${h.file_name} · ${h.size_kb} KB` : h.error}</span>
            <span className="font-mono text-xs text-zinc-500">{fmtDateTime(h.at)}</span>
          </li>
        ))}
        {!s.history.length && <li className="text-xs text-zinc-500">Nenhum backup enviado ainda.</li>}
      </ul>
    </Panel>
  );
}
