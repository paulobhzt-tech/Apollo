import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/format";
import type { GroupedItem } from "@/lib/group";

const REASONS = ["Lançado errado", "Cliente desistiu", "Produto em falta", "Duplicado"];

export interface RemoveRequest { lines: { id: string; qty: number }[]; reason: string; manager_pin?: string }

/** Apagar produto lançado: choose how many units to remove, a reason and (when needed) the manager PIN. */
export default function RemoveItemDialog({ group, needsPin, pending, onClose, onConfirm }: {
  group: GroupedItem | null; needsPin: boolean; pending: boolean; onClose: () => void; onConfirm: (r: RemoveRequest) => void;
}) {
  return (
    <Dialog open={!!group} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm border-white/10 bg-shell" data-testid="remove-item-dialog">
        {group && <Body key={group.key} group={group} needsPin={needsPin} pending={pending} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ group, needsPin, pending, onConfirm }: { group: GroupedItem; needsPin: boolean; pending: boolean; onConfirm: (r: RemoveRequest) => void }) {
  const [qty, setQty] = useState(group.qty);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const confirm = () => {
    // take units from the newest lines first
    let left = qty;
    const lines: { id: string; qty: number }[] = [];
    for (const l of group.lines) {
      if (left <= 0) break;
      const take = Math.min(l.qty, left);
      lines.push({ id: l.id, qty: take });
      left -= take;
    }
    onConfirm({ lines, reason: reason.trim(), manager_pin: needsPin ? pin : undefined });
  };
  return (
    <>
      <DialogTitle className="font-heading text-lg text-white">Apagar {group.name}</DialogTitle>
      {group.options.length > 0 && <p className="-mt-2 text-xs text-primary">{group.options.join(" · ")}</p>}
      <div className="flex items-center justify-between rounded-xl bg-panel px-3 py-2">
        <span className="text-sm text-zinc-300">Quantidade a apagar</span>
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="outline" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} data-testid="remove-qty-minus"><Minus /></Button>
          <span className="w-10 text-center font-mono text-lg text-white" data-testid="remove-qty">{qty}</span>
          <Button size="icon-sm" variant="outline" onClick={() => setQty((q) => Math.min(group.qty, q + 1))} disabled={qty >= group.qty} data-testid="remove-qty-plus"><Plus /></Button>
        </div>
      </div>
      <p className="text-right text-xs text-zinc-500">de {group.qty} lançados · {brl(qty * group.unit_price)}</p>
      <div>
        <Label className="text-xs text-zinc-400">Motivo</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} data-testid={`remove-reason-${r.split(" ")[0].toLowerCase()}`}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 ${reason === r ? "border-primary bg-primary/15 text-white" : "border-white/10 text-zinc-400 hover:border-white/30"}`}>{r}</button>
          ))}
        </div>
        <Input className="mt-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ou escreva o motivo" data-testid="remove-reason-input" />
      </div>
      {needsPin && (
        <div>
          <Label className="text-xs text-zinc-400">PIN do gerente (você não tem permissão para apagar)</Label>
          <Input className="mt-1 font-mono" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} data-testid="remove-manager-pin-input" />
        </div>
      )}
      <Button variant="destructive" className="h-11" disabled={pending || reason.trim().length < 3 || (needsPin && pin.length < 4)} onClick={confirm} data-testid="remove-confirm-button">
        <Trash2 className="size-4" /> Apagar {qty} {qty > 1 ? "unidades" : "unidade"}
      </Button>
    </>
  );
}
