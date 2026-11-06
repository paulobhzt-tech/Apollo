import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ClipboardList, Plus } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { brl, errMsg, fmtDateTime } from "@/lib/format";
import { useMe } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import type { Ingredient, IngredientIn, StockMove, Unit } from "@/lib/types";
import { cn } from "@/lib/utils";

const UNITS: Unit[] = ["kg", "g", "L", "ml", "un"];
const MOVE_LABEL: Record<StockMove["type"], string> = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste/Inventário", venda: "Baixa por venda", estorno: "Estorno", perda: "Perda / Descarte" };
const inv = () => { void queryClient.invalidateQueries({ queryKey: ["ingredients"] }); void queryClient.invalidateQueries({ queryKey: ["stock-moves"] }); };

type ProductionBatch = {
  id: string; ingredient_id: string; ingredient_name: string; kg: number; units: number;
  purchase_cost: number; extra_cost: number; total_cost: number; cost_per_unit: number;
  units_per_kg: number; note: string; created_at: string;
};

function ProductionBatchForm({ ingredients, onSaved }: { ingredients: Ingredient[]; onSaved: () => void }) {
  const [ingredientId, setIngredientId] = useState("");
  const [kg, setKg] = useState("20");
  const [units, setUnits] = useState("180");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [extraCost, setExtraCost] = useState("0");
  const [note, setNote] = useState("");
  const num = (v: string) => Number(v.replace(",", "."));
  const total = num(purchaseCost) + num(extraCost);
  const count = num(units);
  const valid = !!ingredientId && num(kg) > 0 && Number.isInteger(count) && count > 0 &&
    Number.isFinite(total) && num(purchaseCost) >= 0 && num(extraCost) >= 0;
  const save = useMutation({
    mutationFn: () => apiPost<ProductionBatch>("/production/batches", {
      ingredient_id: ingredientId, kg: num(kg), units: count,
      purchase_cost: num(purchaseCost), extra_cost: num(extraCost), note,
    }),
    onSuccess: () => { toast.success("Lote registrado"); onSaved(); setPurchaseCost(""); setNote(""); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return <div className="space-y-3 rounded-2xl border border-white/10 bg-panel p-4" data-testid="production-batch-form">
    <h3 className="font-semibold text-white">Produção por lote · kg para unidades</h3>
    <p className="text-xs text-zinc-400">Registre a produção e calcule o custo por unidade. Este registro não movimenta o estoque automaticamente.</p>
    <Select value={ingredientId} onValueChange={setIngredientId}><SelectTrigger data-testid="batch-ingredient"><SelectValue placeholder="Selecione o insumo em kg" /></SelectTrigger><SelectContent>
      {ingredients.filter((i) => i.unit === "kg").map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
    </SelectContent></Select>
    <div className="grid grid-cols-2 gap-3">
      <div><Label>Quilos utilizados</Label><Input value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" placeholder="20" /></div>
      <div><Label>Unidades produzidas</Label><Input value={units} onChange={(e) => setUnits(e.target.value)} inputMode="numeric" placeholder="180" /></div>
      <div><Label>Valor pago pela carne (R$)</Label><Input value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} inputMode="decimal" placeholder="Ex.: 600,00" /></div>
      <div><Label>Outros custos (R$)</Label><Input value={extraCost} onChange={(e) => setExtraCost(e.target.value)} inputMode="decimal" placeholder="0,00" /></div>
    </div>
    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observações do lote (opcional)" />
    <div className="grid grid-cols-3 gap-2 text-sm"><div>Rendimento<br/><strong>{num(kg) > 0 && count > 0 ? (count / num(kg)).toFixed(2) : "0"} un./kg</strong></div>
      <div>Custo total<br/><strong>{Number.isFinite(total) ? brl(total) : "—"}</strong></div>
      <div>Custo por unidade<br/><strong>{count > 0 && Number.isFinite(total) ? brl(total / count) : "—"}</strong></div></div>
    <Button disabled={!valid || save.isPending} onClick={() => save.mutate()} data-testid="batch-save">Registrar produção</Button>
  </div>;
}

export default function Estoque() {
  const { data: me } = useMe();
  const ings = useQuery({ queryKey: ["ingredients"], queryFn: () => apiGet<Ingredient[]>("/ingredients"), refetchInterval: 15000 });
  const moves = useQuery({ queryKey: ["stock-moves"], queryFn: () => apiGet<StockMove[]>("/stock/moves") });
  const batches = useQuery({ queryKey: ["production-batches"], queryFn: () => apiGet<ProductionBatch[]>("/production/batches") });
  const [editing, setEditing] = useState<Ingredient | "new" | null>(null);
  const [moving, setMoving] = useState<Ingredient | null>(null);
  const list = ings.data ?? [];
  const low = list.filter((i) => i.min_stock > 0 && i.stock <= i.min_stock).sort((a, b) => a.stock / a.min_stock - b.stock / b.min_stock);
  const shopping = low.map((i) => ({ ...i, suggested: Math.max(0, i.min_stock * 2 - i.stock) }));
  const shoppingText = shopping.map((i) => `${i.name}: comprar ${i.suggested.toFixed(2)} ${i.unit} (atual ${i.stock.toFixed(2)}, mínimo ${i.min_stock.toFixed(2)})`).join("\n");
  const losses = (moves.data ?? []).filter((m) => m.type === "perda");
  const lossTotal = losses.reduce((sum, m) => sum + (m.cost_total ?? 0), 0);
  const value = list.reduce((s, i) => s + Math.max(0, i.stock) * i.cost_per_unit, 0);
  const isAdmin = me?.role === "admin";

  return (
    <AppShell roles={["caixa", "cozinha"]}>
      <PageHeader title="Estoque & Insumos" subtitle="Baixa automática por ficha técnica a cada venda (PDV, mesas, QR e delivery)"
        actions={isAdmin && <Button onClick={() => setEditing("new")} data-testid="new-ingredient-button"><Plus className="size-4" /> Novo insumo</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/5 bg-panel p-4"><p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Insumos</p><p className="mt-1 font-mono text-2xl text-white">{list.length}</p></div>
        <div className="rounded-2xl border border-white/5 bg-panel p-4"><p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Valor em estoque</p><p className="mt-1 font-mono text-2xl text-white" data-testid="stock-value">{brl(value)}</p></div>
        <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4"><p className="text-[11px] uppercase tracking-[0.15em] text-red-300">Reposição urgente</p><p className="mt-1 font-mono text-2xl text-red-200" data-testid="stock-low-count">{low.length}</p></div>
      </div>
      {shopping.length > 0 && <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4" data-testid="stock-shopping-list">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-200"><ClipboardList className="size-4" /> Lista de compras sugerida ({shopping.length})</h3>
          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(shoppingText).then(() => toast.success("Lista copiada")).catch(() => toast.error("Não foi possível copiar a lista"))} data-testid="stock-copy-shopping">Copiar lista</Button>
        </div>
        <p className="mb-2 text-xs text-zinc-400">Sugestão: repor até o dobro do estoque mínimo. Ajuste a quantidade antes de comprar.</p>
        <ul className="space-y-1 text-sm">{shopping.map((i) => <li key={i.id} className="flex flex-wrap justify-between gap-2"><span>{i.name}</span><span className="font-mono text-amber-200">Comprar {i.suggested.toFixed(2)} {i.unit}</span></li>)}</ul>
      </div>}
      <div className="mb-4 rounded-2xl border border-white/5 bg-panel p-4"><p className="text-xs text-zinc-400">Prejuízo por perdas (últimas 300 movimentações)</p><p className="font-mono text-xl text-red-300">{brl(lossTotal)}</p><p className="text-xs text-zinc-500">{losses.length} ocorrências</p></div>
      <Tabs defaultValue="insumos">
        <TabsList><TabsTrigger value="insumos" data-testid="tab-insumos">Insumos</TabsTrigger><TabsTrigger value="movs" data-testid="tab-movimentacoes">Movimentações</TabsTrigger><TabsTrigger value="producao" data-testid="tab-producao">Produção por lote</TabsTrigger></TabsList>
        <TabsContent value="insumos" className="mt-4">
          <div className="rounded-2xl border border-white/5 bg-panel">
            <Table>
              <TableHeader><TableRow><TableHead>Insumo</TableHead><TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">Mínimo</TableHead><TableHead className="text-right">Custo/un</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {list.map((i) => {
                  const isLow = i.min_stock > 0 && i.stock <= i.min_stock;
                  return (
                    <TableRow key={i.id} data-testid={`ingredient-row-${i.id}`}>
                      <TableCell className="font-medium text-white">
                        <span className="flex items-center gap-2">{isLow && <AlertTriangle className="size-4 text-red-400" />}{i.name}</span>
                        {i.unit === "kg" && !!i.units_per_kg && <span className="text-xs text-zinc-400">Produção estimada: {Math.floor(Math.max(0, i.stock * i.units_per_kg))} un. ({i.units_per_kg} por kg)</span>}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono", isLow ? "text-red-300" : "text-zinc-200")} data-testid={`ingredient-stock-${i.id}`}>{i.stock.toFixed(2)} {i.unit}</TableCell>
                      <TableCell className="text-right font-mono text-zinc-500">{i.min_stock} {i.unit}</TableCell>
                      <TableCell className="text-right font-mono text-zinc-400">{brl(i.cost_per_unit)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => setMoving(i)} data-testid={`move-ingredient-${i.id}`}><ArrowDownToLine className="size-3.5" /> Movimentar</Button>
                        {isAdmin && <Button size="sm" variant="ghost" onClick={() => setEditing(i)} data-testid={`edit-ingredient-${i.id}`}>Editar</Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="producao" className="mt-4 space-y-4"><ProductionBatchForm ingredients={list} onSaved={() => { void batches.refetch(); void ings.refetch(); }} /><div className="overflow-x-auto rounded-2xl border border-white/5 bg-panel"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Insumo</TableHead><TableHead>Kg</TableHead><TableHead>Unidades</TableHead><TableHead>Rendimento</TableHead><TableHead>Custo total</TableHead><TableHead>Custo/un.</TableHead></TableRow></TableHeader><TableBody>{(batches.data ?? []).map((b) => <TableRow key={b.id}><TableCell>{fmtDateTime(b.created_at)}</TableCell><TableCell>{b.ingredient_name}</TableCell><TableCell>{b.kg}</TableCell><TableCell>{b.units}</TableCell><TableCell>{b.units_per_kg.toFixed(2)}</TableCell><TableCell>{brl(b.total_cost)}</TableCell><TableCell>{brl(b.cost_per_unit)}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
        <TabsContent value="movs" className="mt-4">
          <div className="rounded-2xl border border-white/5 bg-panel">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Insumo</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Obs.</TableHead></TableRow></TableHeader>
              <TableBody>
                {(moves.data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-zinc-400">{fmtDateTime(m.created_at)}</TableCell>
                    <TableCell className="text-white">{m.ingredient_name}</TableCell>
                    <TableCell className="text-zinc-300">{MOVE_LABEL[m.type]}</TableCell>
                    <TableCell className={cn("text-right font-mono", m.qty < 0 ? "text-red-300" : "text-emerald-300")}>{m.qty > 0 ? "+" : ""}{m.qty}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{m.reason && `${m.reason} · `}{m.note} {m.by_name && `· ${m.by_name}`}{m.type === "perda" && ` · ${brl(m.cost_total ?? 0)}`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
      <IngredientDialog editing={editing} onClose={() => setEditing(null)} />
      <MoveDialog ing={moving} onClose={() => setMoving(null)} />
    </AppShell>
  );
}

function IngredientDialog({ editing, onClose }: { editing: Ingredient | "new" | null; onClose: () => void }) {
  return (
    <Dialog open={!!editing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-white/10 bg-elevated" data-testid="ingredient-dialog">
        {editing && <IngredientForm key={editing === "new" ? "n" : editing.id} editing={editing} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function IngredientForm({ editing, onClose }: { editing: Ingredient | "new"; onClose: () => void }) {
  const init = editing === "new" ? { name: "", unit: "kg" as Unit, stock: "0", min_stock: "0", cost_per_unit: "0", units_per_kg: "0" }
    : { name: editing.name, unit: editing.unit, stock: String(editing.stock), min_stock: String(editing.min_stock), cost_per_unit: String(editing.cost_per_unit), units_per_kg: String(editing.units_per_kg ?? 0) };
  const [f, setF] = useState(init);
  const n = (s: string) => Number(s.replace(",", ".")) || 0;
  const save = useMutation({
    mutationFn: (b: IngredientIn) => editing === "new" ? apiPost<Ingredient>("/ingredients", b) : apiPut<Ingredient>(`/ingredients/${editing.id}`, b),
    onSuccess: () => { toast.success("Insumo salvo"); inv(); void queryClient.invalidateQueries({ queryKey: ["products"] }); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{editing === "new" ? "Novo insumo" : "Editar insumo"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label className="text-xs text-zinc-400">Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1" data-testid="ingredient-name-input" /></div>
        <div>
          <Label className="text-xs text-zinc-400">Unidade</Label>
          <Select value={f.unit} onValueChange={(v: string) => setF({ ...f, unit: v as Unit })}>
            <SelectTrigger className="mt-1 w-full" data-testid="ingredient-unit-select"><SelectValue /></SelectTrigger>
            <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs text-zinc-400">Custo por unidade (R$)</Label><Input value={f.cost_per_unit} onChange={(e) => setF({ ...f, cost_per_unit: e.target.value })} className="mt-1 font-mono" data-testid="ingredient-cost-input" /></div>
        <div><Label className="text-xs text-zinc-400">Estoque atual</Label><Input value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className="mt-1 font-mono" data-testid="ingredient-stock-input" /></div>
        {f.unit === "kg" && <div className="col-span-2"><Label className="text-xs text-zinc-400">Produção: quantas unidades rende 1 kg?</Label><Input value={f.units_per_kg} onChange={(e) => setF({ ...f, units_per_kg: e.target.value })} placeholder="Ex.: 10 espetinhos por kg" inputMode="decimal" className="mt-1 font-mono" data-testid="ingredient-yield-input" /><p className="mt-1 text-xs text-zinc-500">Estimativa: {Math.floor(Math.max(0, n(f.stock) * n(f.units_per_kg)))} unidades com o estoque atual. Não altera a baixa em kg da ficha técnica.</p></div>}
        <div><Label className="text-xs text-zinc-400">Estoque mínimo</Label><Input value={f.min_stock} onChange={(e) => setF({ ...f, min_stock: e.target.value })} className="mt-1 font-mono" data-testid="ingredient-min-input" /></div>
      </div>
      <Button disabled={!f.name.trim() || save.isPending} onClick={() => save.mutate({ name: f.name, unit: f.unit, stock: n(f.stock), min_stock: n(f.min_stock), cost_per_unit: n(f.cost_per_unit), units_per_kg: f.unit === "kg" ? n(f.units_per_kg) : 0 })} data-testid="ingredient-save-button">Salvar</Button>
    </>
  );
}

function MoveDialog({ ing, onClose }: { ing: Ingredient | null; onClose: () => void }) {
  const [type, setType] = useState<"entrada" | "saida" | "ajuste" | "perda">("entrada");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("desperdicio");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => apiPost<Ingredient>("/stock/moves", { ingredient_id: ing!.id, type, qty: Number(qty.replace(",", ".")), note, ...(type === "perda" ? { reason } : {}) }),
    onSuccess: (i) => { toast.success(`${i.name}: ${i.stock.toFixed(2)} ${i.unit}`); inv(); setQty(""); setNote(""); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open={!!ing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-white/10 bg-elevated" data-testid="stock-move-dialog">
        <DialogHeader><DialogTitle className="font-heading text-white">Movimentar · {ing?.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-zinc-400">Atual: <span className="font-mono text-white">{ing?.stock.toFixed(2)} {ing?.unit}</span></p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["entrada", "saida", "ajuste", "perda"] as const).map((t) => (
            <Button key={t} variant={type === t ? "default" : "outline"} onClick={() => setType(t)} data-testid={`stock-move-type-${t}`}>{MOVE_LABEL[t].split("/")[0]}</Button>
          ))}
        </div>
        {type === "perda" && <div><Label>Motivo da perda</Label><Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vencimento">Vencimento</SelectItem><SelectItem value="quebra">Quebra</SelectItem><SelectItem value="desperdicio">Desperdício</SelectItem><SelectItem value="outro">Outro</SelectItem></SelectContent></Select><p className="mt-2 text-xs text-red-300">Prejuízo estimado: {brl(Math.max(0, Number(qty.replace(",", ".")) || 0) * (ing?.cost_per_unit ?? 0))}</p></div>}
        <Input placeholder={type === "ajuste" ? "Novo saldo contado" : "Quantidade"} value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} className="font-mono" data-testid="stock-move-qty-input" />
        <Input placeholder="Observação (NF fornecedor, perda…)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="stock-move-note-input" />
        <Button disabled={!qty || save.isPending} onClick={() => save.mutate()} data-testid="stock-move-save-button">Confirmar</Button>
      </DialogContent>
    </Dialog>
  );
}
