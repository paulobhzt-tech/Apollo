import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg } from "@/lib/format";
import { usePayMethods } from "@/lib/payMethods";
import { queryClient } from "@/lib/queryClient";
import type { AccountCategory, AccountCategoryIn, BillKind, OkOut, PaymentMethodCfg, PaymentMethodIn } from "@/lib/types";
import { cn } from "@/lib/utils";

/** /categorias-contas and /formas-pagamento (Financeiro menu). */
export default function FinCadastros() {
  const isMethods = useLocation().pathname.includes("formas");
  return (
    <AppShell roles={[]}>
      {isMethods
        ? <><PageHeader title="Formas de Pagamento" subtitle="Ative, desative ou crie formas novas (ex.: Vale-refeição, Sodexo). Elas aparecem na hora de receber." /><Methods /></>
        : <><PageHeader title="Categorias de Contas" subtitle="Organize as contas a pagar e a receber. Aparecem separadas no DRE." /><Categories /></>}
    </AppShell>
  );
}

function Categories() {
  const q = useQuery({ queryKey: ["account-categories"], queryFn: () => apiGet<AccountCategory[]>("/account-categories") });
  const [f, setF] = useState<AccountCategoryIn>({ name: "", kind: "pagar" });
  const inv = () => void queryClient.invalidateQueries({ queryKey: ["account-categories"] });
  const create = useMutation({ mutationFn: () => apiPost<AccountCategory>("/account-categories", f), onSuccess: () => { toast.success("Categoria criada"); setF({ ...f, name: "" }); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const ren = useMutation({ mutationFn: (c: AccountCategory) => apiPut<AccountCategory>(`/account-categories/${c.id}`, { name: c.name, kind: c.kind }), onSuccess: () => { toast.success("Categoria renomeada"); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const del = useMutation({ mutationFn: (id: string) => apiDelete<OkOut>(`/account-categories/${id}`), onSuccess: () => { toast.success("Categoria apagada"); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_320px]">
      {(["pagar", "receber"] as BillKind[]).map((k) => (
        <div key={k} className="rounded-2xl border border-white/5 bg-panel p-4" data-testid={`categories-${k}`}>
          <p className="mb-3 text-xs uppercase tracking-[0.15em] text-zinc-500">{k === "pagar" ? "Contas a pagar" : "Contas a receber"}</p>
          <ul className="space-y-1.5">
            {(q.data ?? []).filter((c) => c.kind === k).map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2" data-testid={`category-row-${c.id}`}>
                <span className="flex-1 text-sm text-white">{c.name}</span>
                <Button size="xs" variant="ghost" onClick={() => { const n = window.prompt("Novo nome:", c.name); if (n && n.trim().length >= 2) ren.mutate({ ...c, name: n.trim() }); }} data-testid={`category-rename-${c.id}`}>Renomear</Button>
                <Button size="icon-sm" variant="ghost" onClick={() => window.confirm(`Apagar ${c.name}?`) && del.mutate(c.id)} data-testid={`category-delete-${c.id}`}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="space-y-3 rounded-2xl border border-white/5 bg-panel p-4">
        <p className="text-sm font-medium text-white">Nova categoria</p>
        <div className="flex gap-1.5">
          {(["pagar", "receber"] as BillKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} data-testid={`category-kind-${k}`}
              className={cn("flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-150", f.kind === k ? "border-primary bg-primary/15 text-white" : "border-white/10 text-zinc-400")}>{k === "pagar" ? "A pagar" : "A receber"}</button>
          ))}
        </div>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Carvão, Internet, Convênio" data-testid="category-name-input" />
        <Button className="w-full" disabled={f.name.trim().length < 2 || create.isPending} onClick={() => create.mutate()} data-testid="category-save-button"><Plus className="size-4" /> Adicionar</Button>
      </div>
    </div>
  );
}

function Methods() {
  const q = usePayMethods();
  const [f, setF] = useState({ name: "", fee: "" });
  const inv = () => void queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
  const body = (m: PaymentMethodCfg, patch: Partial<PaymentMethodIn>): PaymentMethodIn => ({ name: m.name, fee_pct: m.fee_pct, active: m.active, sort: m.sort, ...patch });
  const upd = useMutation({ mutationFn: ({ m, patch }: { m: PaymentMethodCfg; patch: Partial<PaymentMethodIn> }) => apiPut<PaymentMethodCfg>(`/payment-methods/${m.id}`, body(m, patch)), onSuccess: inv, onError: (e) => toast.error(errMsg(e)) });
  const create = useMutation({
    mutationFn: () => apiPost<PaymentMethodCfg>("/payment-methods", { name: f.name, fee_pct: Number(f.fee.replace(",", ".")) || 0, active: true, sort: (q.data?.length ?? 0) + 1 } satisfies PaymentMethodIn),
    onSuccess: () => { toast.success("Forma de pagamento criada"); setF({ name: "", fee: "" }); inv(); }, onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => apiDelete<OkOut>(`/payment-methods/${id}`), onSuccess: () => { toast.success("Forma apagada"); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-2">
        {(q.data ?? []).map((m) => (
          <div key={m.id} className={cn("flex flex-wrap items-center gap-3 rounded-xl border bg-panel px-4 py-3", m.active ? "border-white/5" : "border-white/5 opacity-60")} data-testid={`method-row-${m.key}`}>
            <label className="flex items-center gap-2"><Checkbox checked={m.active} onCheckedChange={(v) => upd.mutate({ m, patch: { active: !!v } })} data-testid={`method-active-${m.key}`} />
              <span className="font-medium text-white">{m.name}</span></label>
            {m.builtin ? <Badge variant="outline">padrão</Badge> : <Badge className="bg-primary/15 text-primary">personalizada</Badge>}
            <span className="ml-auto text-xs text-zinc-400">
              {m.kind === "cartao" ? "Taxa por bandeira em Configurações → Taxas de cartão" : m.builtin ? "Sem taxa" : (
                <span className="flex items-center gap-1">Taxa
                  <Input className="h-7 w-16 font-mono" defaultValue={String(m.fee_pct)} onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")) || 0; if (v !== m.fee_pct) upd.mutate({ m, patch: { fee_pct: v } }); }} data-testid={`method-fee-${m.key}`} />%</span>
              )}
            </span>
            {!m.builtin && <Button size="icon-sm" variant="ghost" onClick={() => window.confirm(`Apagar ${m.name}?`) && del.mutate(m.id)} data-testid={`method-delete-${m.key}`}><Trash2 /></Button>}
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border border-white/5 bg-panel p-4">
        <p className="text-sm font-medium text-white">Nova forma de pagamento</p>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Vale-refeição, Sodexo, Transferência" data-testid="method-name-input" />
        <Input value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} placeholder="Taxa % (opcional)" inputMode="decimal" data-testid="method-fee-input" />
        <Button className="w-full" disabled={f.name.trim().length < 2 || create.isPending} onClick={() => create.mutate()} data-testid="method-save-button"><Plus className="size-4" /> Adicionar</Button>
        <p className="text-xs text-zinc-500">Troco só é dado em dinheiro. A taxa entra no DRE como custo.</p>
      </div>
    </div>
  );
}
