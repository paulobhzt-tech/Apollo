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
import type { Ingredient, IngredientIn, StockMove, Unit, Product, Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ingredientValues } from "@/lib/catalog-form";

const UNITS: Unit[] = ["kg", "g", "L", "ml", "un"];
const MOVE_LABEL: Record<StockMove["type"], string> = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste/Inventário", venda: "Baixa por venda", estorno: "Estorno", perda: "Perda / Descarte" };
const inv = () => { void queryClient.invalidateQueries({ queryKey: ["ingredients"] }); void queryClient.invalidateQueries({ queryKey: ["stock-moves"] }); };

type ProductionBatch = {
  id: string; production_type?: "espetinho" | "porcao"; ingredient_id: string; product_id?: string; ingredient_name: string; kg: number; units: number;
  purchase_cost: number; extra_cost: number; total_cost: number; cost_per_unit: number;
  units_per_kg: number; note: string; created_at: string;
};

function ProductionBatchForm({ ingredients, products, onSaved }: { ingredients: Ingredient[]; products: Product[]; onSaved: () => void }) {
  const [productionType, setProductionType] = useState<"espetinho" | "porcao">("espetinho");
  const [ingredientId, setIngredientId] = useState("");
  const [productId, setProductId] = useState("none");
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
      production_type: productionType, ingredient_id: ingredientId, product_id: productId === "none" ? null : productId, kg: num(kg), units: count,
      purchase_cost: num(purchaseCost), extra_cost: num(extraCost), note,
    }),
    onSuccess: () => { toast.success("Lote registrado"); onSaved(); setPurchaseCost(""); setNote(""); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return <div className="space-y-3 rounded-2xl border border-white/10 bg-panel p-4" data-testid="production-batch-form">
    <h3 className="font-semibold text-white">Produção por lote · espetinhos e porções</h3>
    <div><Label>Tipo de produção</Label><Select value={productionType} onValueChange={(v) => setProductionType(v as "espetinho" | "porcao")}><SelectTrigger data-testid="batch-production-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="espetinho">Espetinhos</SelectItem><SelectItem value="porcao">Porções</SelectItem></SelectContent></Select></div>
    <p className="text-xs text-zinc-400">Registre a produção e calcule o custo por unidade. Este registro não movimenta o estoque automaticamente.</p>
    <Select value={ingredientId} onValueChange={setIngredientId}><SelectTrigger data-testid="batch-ingredient"><SelectValue placeholder="Selecione o insumo em kg" /></SelectTrigger><SelectContent>
      {ingredients.filter((i) => i.unit === "kg").map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
    </SelectContent></Select>
    <div><Label>Produto de venda (opcional: atualizar custo da ficha)</Label><Select value={productId} onValueChange={setProductId}><SelectTrigger data-testid="batch-product"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não atualizar custo de produto</SelectItem>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-zinc-400">Ao vincular, o custo unitário calculado substitui o custo manual do produto. Inclua todos os custos do lote para evitar subestimar o preço.</p></div>
    <div className="grid grid-cols-2 gap-3">
      <div><Label>Quilos utilizados</Label><Input value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" placeholder="20" /></div>
      <div><Label>{productionType === "porcao" ? "Porções produzidas" : "Espetinhos produzidos"}</Label><Input value={units} onChange={(e) => setUnits(e.target.value)} inputMode="numeric" placeholder="180" /></div>
      <div><Label>Valor pago pelo insumo (R$)</Label><Input value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} inputMode="decimal" placeholder="Ex.: 600,00" /></div>
      <div><Label>Outros custos (R$)</Label><Input value={extraCost} onChange={(e) => setExtraCost(e.target.value)} inputMode="decimal" placeholder="0,00" /></div>
    </div>
    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observações do lote (opcional)" />
    <div className="grid grid-cols-3 gap-2 text-sm"><div>Rendimento<br/><strong>{num(kg) > 0 && count > 0 ? (count / num(kg)).toFixed(2) : "0"} un./kg</strong></div>
      <div>Custo total<br/><strong>{Number.isFinite(total) ? brl(total) : "—"}</strong></div>
      <div>{productionType === "porcao" ? "Custo por porção" : "Custo por espetinho"}<br/><strong>{count > 0 && Number.isFinite(total) ? brl(total / count) : "—"}</strong></div></div>
    <Button disabled={!valid || save.isPending} onClick={() => save.mutate()} data-testid="batch-save">Registrar produção</Button>
  </div>;
}

type Purchase = {
  id: string; supplier_id: string; supplier_name: string; ingredient_id: string; ingredient_name: string;
  qty: number; remaining_qty?: number; unit: Unit; unit_cost: number; total_cost: number; expiry_date?: string | null;
  lot_number: string; note: string; created_at: string;
};
type ExpiryPurchase = Purchase & { days_to_expiry: number };

function PurchasePanel({ ingredients, onSaved }: { ingredients: Ingredient[]; onSaved: () => void }) {
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => apiGet<Supplier[]>("/suppliers") });
  const purchases = useQuery({ queryKey: ["purchases"], queryFn: () => apiGet<Purchase[]>("/purchases") });
  const expiry = useQuery({ queryKey: ["purchase-expiry"], queryFn: () => apiGet<ExpiryPurchase[]>("/purchases/expiry") });
  const [supplierId, setSupplierId] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [note, setNote] = useState("");
  const number = (s: string) => Number(s.replace(",", "."));
  const amount = number(qty) * number(unitCost);
  const valid = !!supplierId && !!ingredientId && number(qty) > 0 && number(unitCost) >= 0 &&
    Number.isFinite(amount) && unitCost.trim() !== "";
  const save = useMutation({
    mutationFn: () => apiPost<Purchase>("/purchases", {
      supplier_id: supplierId, ingredient_id: ingredientId, qty: number(qty),
      unit_cost: number(unitCost), expiry_date: expiryDate || null, lot_number: lotNumber, note,
    }),
    onSuccess: () => { toast.success("Compra registrada e estoque atualizado"); setQty(""); setUnitCost(""); setLotNumber(""); setNote(""); setExpiryDate(""); void purchases.refetch(); void expiry.refetch(); onSaved(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const selected = ingredients.find((i) => i.id === ingredientId);
  return <div className="space-y-4">
    <div className="rounded-2xl border border-white/5 bg-panel p-4 space-y-3">
      <h3 className="font-semibold text-white">Registrar compra de insumos</h3>
      <p className="text-xs text-zinc-400">A compra acrescenta a quantidade ao estoque e atualiza o custo médio ponderado do insumo. Não registre a mesma entrada novamente em Movimentações.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><Label>Fornecedor</Label><Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger data-testid="purchase-supplier"><SelectValue placeholder="Selecione fornecedor" /></SelectTrigger><SelectContent>{(suppliers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Insumo</Label><Select value={ingredientId} onValueChange={setIngredientId}><SelectTrigger data-testid="purchase-ingredient"><SelectValue placeholder="Selecione insumo" /></SelectTrigger><SelectContent>{ingredients.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Quantidade {selected ? "(" + selected.unit + ")" : ""}</Label><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="20" /></div>
        <div><Label>Preço por {selected?.unit ?? "unidade"} (R$)</Label><Input inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="32,00" /></div>
        <div><Label>Validade do lote</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
        <div><Label>Número do lote</Label><Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="Opcional" /></div>
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observações / nota fiscal (opcional)" />
      <div className="flex items-center justify-between"><span className="text-sm">Custo total: <strong>{Number.isFinite(amount) ? brl(amount) : "—"}</strong></span><Button disabled={!valid || save.isPending} onClick={() => save.mutate()} data-testid="purchase-save">Registrar compra</Button></div>
    </div>
    <div className="rounded-2xl border border-amber-400/20 bg-panel p-4">
      <h3 className="mb-2 font-semibold text-amber-200">Validades próximas (até 7 dias) e vencidas</h3>
      <p className="mb-3 text-xs text-zinc-400">Avisos por data de compra: não representam saldo disponível do lote, pois a saída por lote ainda não é rastreada.</p>
      {(expiry.data ?? []).length === 0 ? <p className="text-sm text-zinc-400">Nenhum lote com alerta.</p> : <ul className="space-y-2 text-sm">{(expiry.data ?? []).map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2"><span>{p.ingredient_name} · {p.supplier_name} · lote {p.lot_number || "não informado"}</span><strong className={p.days_to_expiry < 0 ? "text-red-300" : "text-amber-200"}>{p.days_to_expiry < 0 ? "Vencido" : p.days_to_expiry === 0 ? "Vence hoje" : "Vence em " + p.days_to_expiry + " dias"} ({p.expiry_date})</strong></li>)}</ul>}
    </div>
    <div className="overflow-x-auto rounded-2xl border border-white/5 bg-panel"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Fornecedor</TableHead><TableHead>Insumo</TableHead><TableHead>Qtd.</TableHead><TableHead>Custo un.</TableHead><TableHead>Total</TableHead><TableHead>Validade</TableHead></TableRow></TableHeader><TableBody>{(purchases.data ?? []).map((p) => <TableRow key={p.id}><TableCell>{fmtDateTime(p.created_at)}</TableCell><TableCell>{p.supplier_name}</TableCell><TableCell>{p.ingredient_name}</TableCell><TableCell>{p.qty} {p.unit}</TableCell><TableCell>{brl(p.unit_cost)}</TableCell><TableCell>{brl(p.total_cost)}</TableCell><TableCell>{p.expiry_date || "—"}</TableCell></TableRow>)}</TableBody></Table></div>
  </div>;
}

type InventoryCount = { id: string; ingredient_id: string; counted_qty: number; previous_qty: number; difference: number; note: string; created_at: string };
function InventoryPanel({ ingredients, onSaved }: { ingredients: Ingredient[]; onSaved: () => void }) {
  const counts = useQuery({ queryKey: ["inventory-counts"], queryFn: () => apiGet<InventoryCount[]>("/inventory/counts") });
  const lots = useQuery({ queryKey: ["inventory-lots"], queryFn: () => apiGet<Purchase[]>("/inventory/lots") });
  const [lotQty, setLotQty] = useState<Record<string, string>>({});
  const [ingredientId, setIngredientId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const current = ingredients.find((i) => i.id === ingredientId);
  const counted = Number(qty.replace(",", "."));
  const save = useMutation({
    mutationFn: () => apiPost<InventoryCount>("/inventory/counts", { ingredient_id: ingredientId, counted_qty: counted, note }),
    onSuccess: () => { toast.success("Inventário registrado"); setQty(""); setNote(""); void counts.refetch(); onSaved(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const countLot = useMutation({ mutationFn: ({ id, qty }: { id: string; qty: number }) => apiPost("/inventory/lots/count", { purchase_id: id, counted_qty: qty }), onSuccess: () => { toast.success("Lote conferido"); void lots.refetch(); onSaved(); }, onError: (e) => toast.error(errMsg(e)) });
  return <div className="space-y-4">
    <div className="rounded-2xl border border-white/5 bg-panel p-4 space-y-3">
      <h3 className="font-semibold">Conferência física do estoque</h3>
      <p className="text-xs text-amber-200">Ajusta o estoque total do insumo. A conciliação de saldos por lote deve ser feita separadamente.</p>
      <Select value={ingredientId} onValueChange={setIngredientId}><SelectTrigger><SelectValue placeholder="Selecione o insumo" /></SelectTrigger><SelectContent>{ingredients.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent></Select>
      {current && <p className="text-sm">Estoque registrado: {current.stock} {current.unit}</p>}
      <div><Label>Quantidade contada fisicamente</Label><Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" /></div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo / observação" />
      {current && Number.isFinite(counted) && qty.trim() && <p className="text-sm">Diferença: {(counted - current.stock).toFixed(3)} {current.unit}</p>}
      <Button disabled={!ingredientId || !qty.trim() || !Number.isFinite(counted) || counted < 0 || save.isPending} onClick={() => save.mutate()}>Registrar contagem</Button>
    </div>
    <div className="rounded-2xl border border-white/5 bg-panel p-4 space-y-3"><h3 className="font-semibold">Conferência por lote</h3><p className="text-xs text-zinc-400">Informe o saldo físico de cada lote. A diferença ajusta também o estoque geral.</p>{(lots.data ?? []).map((lot) => <div key={lot.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-2 text-sm"><span className="min-w-44">{lot.ingredient_name} · {lot.lot_number || lot.id.slice(0, 8)} · saldo {lot.remaining_qty ?? 0} {lot.unit}</span><Input className="w-28" inputMode="decimal" placeholder="Contagem" value={lotQty[lot.id] ?? ""} onChange={(e) => setLotQty((prev) => ({ ...prev, [lot.id]: e.target.value }))} /><Button size="sm" variant="outline" disabled={countLot.isPending || !(lotQty[lot.id] ?? "").trim() || !Number.isFinite(Number((lotQty[lot.id] ?? "").replace(",", "."))) || Number((lotQty[lot.id] ?? "").replace(",", ".")) < 0} onClick={() => countLot.mutate({ id: lot.id, qty: Number((lotQty[lot.id] ?? "").replace(",", ".")) })}>Conferir lote</Button></div>)}</div>
    <div className="rounded-2xl border border-white/5 bg-panel p-4"><h3 className="mb-2 font-semibold">Histórico de inventário</h3>
      {(counts.data ?? []).map((i) => <p key={i.id} className="border-b border-white/5 py-2 text-sm">{fmtDateTime(i.created_at)} · {ingredients.find((x) => x.id === i.ingredient_id)?.name ?? i.ingredient_id}: {i.previous_qty} → {i.counted_qty} (diferença {i.difference})</p>)}
    </div>
  </div>;
}

export default function Estoque() {
  const { data: me } = useMe();
  const ings = useQuery({ queryKey: ["ingredients"], queryFn: () => apiGet<Ingredient[]>("/ingredients"), refetchInterval: 15000 });
  const alerts = useQuery({ queryKey: ["inventory-alerts"], queryFn: () => apiGet<{ total: number; out_of_stock: number; low_stock: number; estimated_minimum_cost: number }>("/inventory/alerts"), refetchInterval: 15000 });
  const moves = useQuery({ queryKey: ["stock-moves"], queryFn: () => apiGet<StockMove[]>("/stock/moves") });
  const batches = useQuery({ queryKey: ["production-batches"], queryFn: () => apiGet<ProductionBatch[]>("/production/batches") });
  const products = useQuery({ queryKey: ["products"], queryFn: () => apiGet<Product[]>("/products") });
  const [editing, setEditing] = useState<Ingredient | "new" | null>(null);
  const [moving, setMoving] = useState<Ingredient | null>(null);
  const list = ings.data ?? [];
  const low = list.filter((i) => i.stock <= 0 || (i.min_stock > 0 && i.stock < i.min_stock)).sort((a, b) => a.stock / a.min_stock - b.stock / b.min_stock);
  const shopping = low.filter((i) => i.min_stock > 0).map((i) => ({ ...i, suggested: Math.max(0, i.min_stock * 2 - i.stock) }));
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
      {alerts.data && alerts.data.total > 0 && <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-400/5 p-3 text-sm" data-testid="inventory-alert-summary"><strong className="text-red-200">Alertas de estoque:</strong> {alerts.data.out_of_stock} sem estoque · {alerts.data.low_stock} abaixo do mínimo · Custo estimado para atingir os mínimos: <strong>{brl(alerts.data.estimated_minimum_cost)}</strong></div>}
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
        <TabsList className="w-full flex-wrap justify-start gap-1 group-data-horizontal/tabs:h-auto [&_[data-slot=tabs-trigger]]:h-8"><TabsTrigger value="insumos" data-testid="tab-insumos">Insumos</TabsTrigger><TabsTrigger value="movs" data-testid="tab-movimentacoes">Movimentações</TabsTrigger><TabsTrigger value="producao" data-testid="tab-producao">Produção por lote</TabsTrigger><TabsTrigger value="compras" data-testid="tab-compras">Compras e validade</TabsTrigger><TabsTrigger value="inventario" data-testid="tab-inventario">Inventário</TabsTrigger></TabsList>
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
        <TabsContent value="inventario" className="mt-4"><InventoryPanel ingredients={list} onSaved={inv} /></TabsContent>
        <TabsContent value="compras" className="mt-4"><PurchasePanel ingredients={list} onSaved={inv} /></TabsContent>
        <TabsContent value="producao" className="mt-4 space-y-4"><ProductionBatchForm ingredients={list} products={products.data ?? []} onSaved={() => { void batches.refetch(); void ings.refetch(); void products.refetch(); }} /><div className="overflow-x-auto rounded-2xl border border-white/5 bg-panel"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Insumo</TableHead><TableHead>Tipo</TableHead><TableHead>Kg</TableHead><TableHead>Unidades</TableHead><TableHead>Rendimento</TableHead><TableHead>Custo total</TableHead><TableHead>Custo/un.</TableHead></TableRow></TableHeader><TableBody>{(batches.data ?? []).map((b) => <TableRow key={b.id}><TableCell>{fmtDateTime(b.created_at)}</TableCell><TableCell>{b.ingredient_name}</TableCell><TableCell>{b.production_type === "porcao" ? "Porções" : "Espetinhos"}</TableCell><TableCell>{b.kg}</TableCell><TableCell>{b.units}</TableCell><TableCell>{b.units_per_kg.toFixed(2)}</TableCell><TableCell>{brl(b.total_cost)}</TableCell><TableCell>{brl(b.cost_per_unit)}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-white/10 bg-elevated" data-testid="ingredient-dialog">
        {editing && <IngredientForm key={editing === "new" ? "n" : editing.id} editing={editing} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function IngredientForm({ editing, onClose }: { editing: Ingredient | "new"; onClose: () => void }) {
  const init = editing === "new" ? { name: "", unit: "kg" as Unit, stock: "0", min_stock: "0", cost_per_unit: "0", units_per_kg: "0" }
    : { name: editing.name, unit: editing.unit, stock: String(editing.stock), min_stock: String(editing.min_stock), cost_per_unit: String(editing.cost_per_unit), units_per_kg: String(editing.units_per_kg ?? 0) };
  const [f, setF] = useState(init);
  const numbers = ingredientValues(f, f.unit);
  const save = useMutation({
    mutationFn: (b: IngredientIn) => editing === "new" ? apiPost<Ingredient>("/ingredients", b) : apiPut<Ingredient>(`/ingredients/${editing.id}`, { ...b, expected_stock: editing.stock }),
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
        <div><Label className="text-xs text-zinc-400">Custo por unidade (R$)</Label><Input inputMode="decimal" value={f.cost_per_unit} onChange={(e) => setF({ ...f, cost_per_unit: e.target.value })} className="mt-1 font-mono" data-testid="ingredient-cost-input" /></div>
        <div><Label className="text-xs text-zinc-400">Estoque atual</Label><Input inputMode="decimal" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className="mt-1 font-mono" data-testid="ingredient-stock-input" /></div>
        {f.unit === "kg" && <div className="col-span-2"><Label className="text-xs text-zinc-400">Produção: quantas unidades rende 1 kg?</Label><Input value={f.units_per_kg} onChange={(e) => setF({ ...f, units_per_kg: e.target.value })} placeholder="Ex.: 10 espetinhos por kg" inputMode="decimal" className="mt-1 font-mono" data-testid="ingredient-yield-input" /><p className="mt-1 text-xs text-zinc-500">Estimativa: {numbers ? Math.floor(Math.max(0, numbers.stock * numbers.units_per_kg)) : "—"} unidades com o estoque atual. Não altera a baixa em kg da ficha técnica.</p></div>}
        <div><Label className="text-xs text-zinc-400">Estoque mínimo</Label><Input inputMode="decimal" value={f.min_stock} onChange={(e) => setF({ ...f, min_stock: e.target.value })} className="mt-1 font-mono" data-testid="ingredient-min-input" /></div>
      </div>
      {!numbers && <p role="alert" className="text-sm text-amber-300">Preencha os valores numéricos. Use vírgula ou ponto para decimais; custo, mínimo e rendimento devem ser zero ou positivos.</p>}
      <Button disabled={!f.name.trim() || !numbers || save.isPending} onClick={() => { if (numbers) save.mutate({ name: f.name.trim(), unit: f.unit, ...numbers }); }} data-testid="ingredient-save-button">Salvar</Button>
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
