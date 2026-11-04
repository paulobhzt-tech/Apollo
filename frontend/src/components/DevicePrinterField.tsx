import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { desktop } from "@/lib/desktop";

/** Windows printer name: picked from the installed printers in the desktop app, typed in a browser. */
export default function DevicePrinterField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const d = desktop();
  const list = useQuery({ queryKey: ["desktop-printers"], queryFn: () => d!.printers(), enabled: !!d });
  return (
    <div className="sm:col-span-2">
      <Label className="text-xs text-zinc-400">Impressora no Windows (impressão direta pelo aplicativo Apollo PDV)</Label>
      {d && (list.data?.length ?? 0) > 0 ? (
        <Select value={value || "__default"} onValueChange={(v: string) => onChange(v === "__default" ? "" : v)}>
          <SelectTrigger className="mt-1 w-full" data-testid="printer-device-select"><SelectValue>{(v) => (v === "__default" ? "Impressora padrão do Windows" : (v as string))}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="__default">Impressora padrão do Windows</SelectItem>
            {list.data!.map((p) => <SelectItem key={p.name} value={p.name}>{p.displayName}{p.isDefault ? " (padrão)" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ex.: EPSON TM-T20X (vazio = padrão do Windows)" className="mt-1" data-testid="printer-device-input" />
      )}
    </div>
  );
}
