import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { errMsg, fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Printer } from "@/lib/types";

interface Terminal {
  id: string;
  name: string;
  station: string;
  printer_id: string;
  active: boolean;
  last_seen: string | null;
}

export default function PrintAgentSettings({ printers }: { printers: Printer[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [printer, setPrinter] = useState("");
  const enrollment = useMutation({
    mutationFn: () => apiPost<Terminal & { token: string }>("/print-agents", { name: name.trim(), printer_id: printer }),
    gcTime: 0,
    onSuccess: () => { setName(""); void terminals.refetch(); },
  });
  const terminals = useQuery({
    queryKey: ["print-agents"],
    queryFn: () => apiGet<Terminal[]>("/print-agents"),
    enabled: open,
    refetchInterval: 15000,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiPost(`/print-agents/${id}/revoke`, {}),
    onSuccess: () => void terminals.refetch(),
  });

  return (
    <details className="mt-4 rounded-xl border border-border bg-panel p-4" onToggle={(event) => {
      setOpen(event.currentTarget.open);
      if (!event.currentTarget.open) enrollment.reset();
    }}>
      <summary className="cursor-pointer font-semibold">Terminais de impressão Windows</summary>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); enrollment.mutate(); }}>
        <label className="grid min-w-0 gap-1 text-sm">Nome do terminal
          <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">Fila de 80 mm
          <select className="min-h-9 max-w-full rounded-md border border-border bg-elevated px-2" value={printer} onChange={(event) => setPrinter(event.target.value)}>
            <option value="">Selecione a impressora</option>
            {printers.filter((p) => p.active && p.paper === "80mm" && p.device_name && p.purpose !== "caixa").map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.purpose}</option>
            ))}
          </select>
        </label>
        <Button disabled={!name.trim() || !printer || enrollment.isPending}>Gerar credencial</Button>
      </form>
      {enrollment.data && <div className="mt-3 space-y-2 rounded-md border border-border p-3">
        <p className="text-sm">Copie a credencial para o agente Windows autorizado. Ela aparece uma vez.</p>
        <Input aria-label="Credencial do terminal" value={enrollment.data.token} readOnly autoComplete="off" spellCheck={false} />
        <Button variant="outline" size="sm" onClick={() => enrollment.reset()}>Ocultar credencial</Button>
      </div>}
      {(enrollment.isError || terminals.isError || revoke.isError) && <p role="alert" className="mt-2 text-sm text-destructive">
        {errMsg(enrollment.error ?? revoke.error ?? terminals.error)}
      </p>}
      {open && <ul className="mt-3 divide-y divide-border">
        {(terminals.data ?? []).map((terminal) => (
          <li key={terminal.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0 break-words">
              <p className="font-medium">{terminal.name} · {terminal.station}</p>
              <p className="text-xs text-muted-foreground">{terminal.active
                ? terminal.last_seen ? `Último contato ${fmtDateTime(terminal.last_seen)}` : "Aguardando primeiro contato"
                : "Revogado"}</p>
            </div>
            {terminal.active && <Button variant="outline" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(terminal.id)}>Revogar</Button>}
          </li>
        ))}
      </ul>}
    </details>
  );
}
