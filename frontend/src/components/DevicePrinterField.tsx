import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { desktop, type DesktopPrinter } from "@/lib/desktop";
import { readPrinterInventory } from "@/lib/printerInventory";

/** Keep the exact configured queue editable even when Windows cannot detect it. */
export default function DevicePrinterField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputId = useId();
  const d = desktop();
  const list = useQuery({ queryKey: ["desktop-printers"], queryFn: () => d!.printers(), enabled: false });
  const [imported, setImported] = useState<DesktopPrinter[]>([]);
  const [message, setMessage] = useState("");
  const candidates = new Map(imported.map((printer) => [printer.name, printer]));
  for (const printer of list.data ?? []) candidates.set(printer.name, printer);

  const importFile = async (file: File) => {
    try {
      const queues = await readPrinterInventory(file);
      setImported(queues);
      setMessage(queues.length ? `${queues.length} fila(s) no inventário. Selecione uma fila para este cadastro.` : "O inventário não contém filas.");
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "JSON inválido." : error instanceof Error ? error.message : "Falha ao abrir inventário.");
    }
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={inputId} className="text-xs text-zinc-400">Nome exato da fila no Windows</Label>
      <Input id={inputId} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="Em branco: impressora padrão do Windows" data-testid="printer-device-input" />
      <div className="flex flex-wrap gap-2">
        {d && <Button type="button" variant="outline" size="sm" disabled={list.isFetching} onClick={() => {
          setMessage("");
          void list.refetch().then(({ data, error }) => {
            setMessage(error ? "Falha ao consultar as impressoras do Windows." : data?.length ? `${data.length} fila(s) detectada(s).` : "Nenhuma fila detectada.");
          });
        }}>{list.data ? "Atualizar lista" : "Detectar impressoras instaladas"}</Button>}
        <Label className="flex cursor-pointer items-center gap-2 text-xs">
          Importar inventário
          <Input type="file" className="max-w-56" accept=".json,application/json" onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) void importFile(file);
          }} />
        </Label>
      </div>
      {candidates.size > 0 && (
        <select aria-label="Selecionar fila detectada ou importada" data-testid="printer-device-select"
          className="w-full rounded-md border bg-background p-2 text-sm" value={candidates.has(value) ? value : ""}
          onChange={(e) => onChange(e.target.value)}>
          <option value="">Impressora padrão do Windows</option>
          {Array.from(candidates.values(), (p) => <option key={p.name} value={p.name}>{p.displayName}{p.isDefault ? " (padrão)" : ""}</option>)}
        </select>
      )}
      <p className="text-xs text-zinc-400" role="status">{message}</p>
    </div>
  );
}
