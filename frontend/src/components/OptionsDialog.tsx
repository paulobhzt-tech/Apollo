import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import type { ChosenOption, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface Picked { options: ChosenOption[]; extra: number; labels: string[] }

export default function OptionsDialog({ product, onClose, onConfirm }: { product: Product | null; onClose: () => void; onConfirm: (p: Product, picked: Picked) => void }) {
  return (
    <Dialog open={!!product} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-elevated sm:max-w-md" data-testid="options-dialog">
        {product && <Body key={product.id} product={product} onConfirm={(p) => { onConfirm(product, p); onClose(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ product, onConfirm }: { product: Product; onConfirm: (p: Picked) => void }) {
  const [sel, setSel] = useState<ChosenOption[]>([]);
  const has = (g: string, n: string) => sel.some((s) => s.group === g && s.name === n);
  const toggle = (g: string, n: string, multi: boolean) =>
    setSel((cur) => has(g, n) ? cur.filter((s) => !(s.group === g && s.name === n))
      : [...(multi ? cur : cur.filter((s) => s.group !== g)), { group: g, name: n }]);
  const extra = sel.reduce((t, s) => t + (product.options.find((g) => g.name === s.group)?.choices.find((c) => c.name === s.name)?.price ?? 0), 0);
  const missing = product.options.filter((g) => g.required && !sel.some((s) => s.group === g.name));
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{product.name}</DialogTitle></DialogHeader>
      {product.options.map((g) => (
        <div key={g.name} data-testid={`option-group-${g.name}`}>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">
            {g.name} {g.required ? <span className="text-primary">· obrigatório</span> : <span>· opcional</span>}{g.multi && " · várias"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {g.choices.map((c) => (
              <button key={c.name} type="button" onClick={() => toggle(g.name, c.name, g.multi)} data-testid={`option-${g.name}-${c.name}`}
                className={cn("rounded-xl border px-3 py-2.5 text-left text-sm transition-colors duration-150 active:scale-95",
                  has(g.name, c.name) ? "border-primary bg-primary/15 text-white" : "border-white/8 bg-panel text-zinc-300 hover:border-white/20")}>
                {c.name}{c.price > 0 && <span className="block font-mono text-xs text-primary">+ {brl(c.price)}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button className="h-12" disabled={missing.length > 0} data-testid="options-confirm"
        onClick={() => onConfirm({ options: sel, extra, labels: sel.map((s) => `${s.group}: ${s.name}`) })}>
        {missing.length ? `Escolha: ${missing.map((m) => m.name).join(", ")}` : `Adicionar · ${brl(product.price + extra)}`}
      </Button>
    </>
  );
}
