import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { fileToDataUrl } from "@/lib/image";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { brl, errMsg } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { Category, CategoryIn, Ingredient, OptionGroup, Product, ProductIn, RecipeItem, Station } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATION_LABEL: Record<Station, string> = { cozinha: "Cozinha quente", forno: "Forno pizzaria", bar: "Bar / Bebidas" };
const inv = () => { void queryClient.invalidateQueries({ queryKey: ["products"] }); void queryClient.invalidateQueries({ queryKey: ["categories"] }); };

export default function Produtos() {
  const products = useQuery({ queryKey: ["products"], queryFn: () => apiGet<Product[]>("/products") });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories") });
  const ingredients = useQuery({ queryKey: ["ingredients"], queryFn: () => apiGet<Ingredient[]>("/ingredients") });
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const cats = categories.data ?? [];
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? "—";
  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/products/${id}`),
    onSuccess: () => { toast.success("Produto removido"); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <AppShell roles={[]}>
      <PageHeader title="Produtos & Combos" subtitle="Cadastro com foto, categorias, combos, opções e ficha técnica com CMV"
        actions={<Button onClick={() => setEditing("new")} data-testid="new-product-button"><Plus className="size-4" /> Novo produto</Button>} />
      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos" data-testid="tab-produtos">Produtos</TabsTrigger>
          <TabsTrigger value="categorias" data-testid="tab-categorias">Categorias</TabsTrigger>
        </TabsList>
        <TabsContent value="produtos" className="mt-4">
          <div className="rounded-2xl border border-white/5 bg-panel">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Produto</TableHead><TableHead>Categoria</TableHead><TableHead className="text-right">Preço</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Margem</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {(products.data ?? []).map((p) => (
                  <TableRow key={p.id} data-testid={`product-row-${p.code || p.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {p.image ? <img src={p.image} alt="" className="size-10 rounded-lg object-cover" /> : <div className="size-10 rounded-lg bg-muted" />}
                        <div>
                          <p className="font-medium text-white">{p.name} {!p.active && <Badge variant="outline">Inativo</Badge>}</p>
                          <p className="font-mono text-xs text-zinc-500">{p.code} · {p.recipe.length} insumos</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-300">{catName(p.category_id)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(p.price)}</TableCell>
                    <TableCell className="text-right font-mono text-zinc-400">{brl(p.cost)}{p.cost_price > 0 && <span className="ml-1 text-[10px] text-zinc-500">manual</span>}</TableCell>
                    <TableCell className={cn("text-right font-mono", p.margin_pct >= 65 ? "text-emerald-300" : p.margin_pct >= 45 ? "text-amber-300" : "text-red-300")}>{p.margin_pct}%</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(p)} data-testid={`edit-product-${p.code || p.id}`}><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => window.confirm(`Excluir ${p.name}?`) && del.mutate(p.id)} data-testid={`delete-product-${p.code || p.id}`}><Trash2 /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="categorias" className="mt-4"><Categorias cats={cats} /></TabsContent>
      </Tabs>
      <ProductDialog editing={editing} onClose={() => setEditing(null)} cats={cats} ings={ingredients.data ?? []} />
    </AppShell>
  );
}

function Categorias({ cats }: { cats: Category[] }) {
  const [name, setName] = useState("");
  const [station, setStation] = useState<Station>("cozinha");
  const create = useMutation({
    mutationFn: (b: CategoryIn) => apiPost<Category>("/categories", b),
    onSuccess: () => { toast.success("Categoria criada"); setName(""); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/categories/${id}`), onSuccess: inv, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-2 sm:grid-cols-2">
        {cats.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-panel px-4 py-3" data-testid={`category-row-${c.id}`}>
            <div><p className="font-medium text-white">{c.name}</p><p className="text-xs text-zinc-500">{STATION_LABEL[c.station]}</p></div>
            <Button size="icon-sm" variant="ghost" onClick={() => del.mutate(c.id)} data-testid={`delete-category-${c.id}`}><Trash2 /></Button>
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border border-white/5 bg-panel p-4">
        <p className="text-sm font-medium text-white">Nova categoria</p>
        <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} data-testid="category-name-input" />
        <Select value={station} onValueChange={(v: string) => setStation(v as Station)}>
          <SelectTrigger className="w-full" data-testid="category-station-select"><SelectValue>{(v) => STATION_LABEL[v as Station]}</SelectValue></SelectTrigger>
          <SelectContent>{(Object.keys(STATION_LABEL) as Station[]).map((s) => <SelectItem key={s} value={s}>{STATION_LABEL[s]}</SelectItem>)}</SelectContent>
        </Select>
        <Button className="w-full" disabled={!name.trim()} onClick={() => create.mutate({ name, station, sort: cats.length })} data-testid="category-save-button">Salvar</Button>
      </div>
    </div>
  );
}

const EMPTY: ProductIn = { name: "", description: "", category_id: "", price: 0, code: "", image: "", active: true, recipe: [], cost_price: 0, options: [] };

function ProductDialog({ editing, onClose, cats, ings }: { editing: Product | "new" | null; onClose: () => void; cats: Category[]; ings: Ingredient[] }) {
  return (
    <Dialog open={!!editing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-elevated sm:max-w-2xl" data-testid="product-dialog">
        {editing && <ProductForm key={editing === "new" ? "new" : editing.id} editing={editing} onClose={onClose} cats={cats} ings={ings} />}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ editing, onClose, cats, ings }: { editing: Product | "new"; onClose: () => void; cats: Category[]; ings: Ingredient[] }) {
  const [f, setF] = useState<ProductIn>(editing === "new" ? { ...EMPTY, category_id: cats[0]?.id ?? "" } : {
    name: editing.name, description: editing.description, category_id: editing.category_id, price: editing.price,
    code: editing.code, image: editing.image, active: editing.active, recipe: editing.recipe, cost_price: editing.cost_price ?? 0, options: editing.options ?? [],
  });
  const [priceStr, setPriceStr] = useState(editing === "new" ? "" : String(editing.price));
  const [costStr, setCostStr] = useState(editing === "new" || !editing.cost_price ? "" : String(editing.cost_price));
  const [ingId, setIngId] = useState("");
  const [qty, setQty] = useState("");
  const ingMap = Object.fromEntries(ings.map((i) => [i.id, i]));
  const recipeCost = f.recipe.reduce((s, r) => s + (ingMap[r.ingredient_id]?.cost_per_unit ?? 0) * r.qty, 0);
  const manualCost = Number(costStr.replace(",", ".")) || 0;
  const cost = manualCost > 0 ? manualCost : recipeCost;
  const price = Number(priceStr.replace(",", ".")) || 0;
  const margin = price ? ((price - cost) / price) * 100 : 0;

  const save = useMutation({
    mutationFn: (b: ProductIn) => editing === "new" ? apiPost<Product>("/products", b) : apiPut<Product>(`/products/${editing.id}`, b),
    onSuccess: () => { toast.success("Produto salvo"); inv(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const addRecipe = () => {
    const q = Number(qty.replace(",", "."));
    if (!ingId || !(q > 0)) return;
    const r: RecipeItem = { ingredient_id: ingId, qty: q };
    setF({ ...f, recipe: [...f.recipe.filter((x) => x.ingredient_id !== ingId), r] });
    setIngId(""); setQty("");
  };

  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{editing === "new" ? "Novo produto" : `Editar ${editing.name}`}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label className="text-xs text-zinc-400">Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1" data-testid="product-name-input" /></div>
        <div className="sm:col-span-2"><Label className="text-xs text-zinc-400">Descrição</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="mt-1" data-testid="product-description-input" /></div>
        <div>
          <Label className="text-xs text-zinc-400">Categoria</Label>
          <Select value={f.category_id} onValueChange={(v: string) => setF({ ...f, category_id: v })}>
            <SelectTrigger className="mt-1 w-full" data-testid="product-category-select"><SelectValue>{(v) => cats.find((c) => c.id === v)?.name ?? "Selecione"}</SelectValue></SelectTrigger>
            <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs text-zinc-400">Preço de venda (R$)</Label><Input value={priceStr} inputMode="decimal" onChange={(e) => setPriceStr(e.target.value)} className="mt-1 font-mono" data-testid="product-price-input" /></div>
        <div>
          <Label className="text-xs text-zinc-400">Preço de custo (R$)</Label>
          <Input value={costStr} inputMode="decimal" placeholder={recipeCost > 0 ? `Ficha técnica: ${brl(recipeCost)}` : "0,00"} onChange={(e) => setCostStr(e.target.value)} className="mt-1 font-mono" data-testid="product-cost-input" />
          <p className="mt-1 text-[11px] text-zinc-500">{manualCost > 0 ? "Custo manual (substitui a ficha técnica)" : "Vazio = usa o custo da ficha técnica"}</p>
        </div>
        <div className="flex flex-col justify-center rounded-xl border border-white/5 bg-panel px-3 py-2">
          <p className="text-[11px] text-zinc-500">Lucro por unidade</p>
          <p className={cn("font-mono text-lg", price - cost >= 0 ? "text-emerald-300" : "text-red-300")} data-testid="product-profit">{brl(price - cost)} <span className="text-xs text-zinc-400">({margin.toFixed(1)}%)</span></p>
        </div>
        <div><Label className="text-xs text-zinc-400">Código / PLU</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="mt-1 font-mono" data-testid="product-code-input" /></div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-zinc-400">Imagem do produto</Label>
          <div className="mt-1 flex items-center gap-3">
            <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-muted">{f.image && <img src={f.image} alt="" className="size-full object-cover" data-testid="product-image-preview" />}</div>
            <div className="flex-1 space-y-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-zinc-300 transition-colors duration-150 hover:border-primary/50">
                <ImagePlus className="size-4" /> Enviar foto do computador/celular
                <input type="file" accept="image/*" className="hidden" data-testid="product-image-upload"
                  onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { setF({ ...f, image: await fileToDataUrl(file) }); } catch (err) { toast.error((err as Error).message); } }} />
              </label>
              <Input value={f.image.startsWith("data:") ? "" : f.image} placeholder={f.image.startsWith("data:") ? "Foto enviada ✓ (ou cole uma URL)" : "…ou cole a URL da imagem"} onChange={(e) => setF({ ...f, image: e.target.value })} data-testid="product-image-input" />
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={f.active} onCheckedChange={(v) => setF({ ...f, active: !!v })} data-testid="product-active-checkbox" /> Disponível para venda</label>
      </div>

      <OptionsEditor value={f.options} onChange={(options) => setF({ ...f, options })} />
      <div className="mt-2 rounded-2xl border border-white/5 bg-panel p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">Ficha técnica</p>
        <div className="mt-3 flex gap-2">
          <Select value={ingId} onValueChange={(v: string) => setIngId(v)}>
            <SelectTrigger className="flex-1" data-testid="recipe-ingredient-select"><SelectValue>{(v) => ingMap[v as string]?.name ?? "Insumo"}</SelectValue></SelectTrigger>
            <SelectContent>{ings.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder={`Qtd${ingId ? ` (${ingMap[ingId]?.unit})` : ""}`} value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} className="w-28 font-mono" data-testid="recipe-qty-input" />
          <Button variant="outline" onClick={addRecipe} data-testid="recipe-add-button"><Plus /></Button>
        </div>
        <ul className="mt-3 space-y-1.5">
          {f.recipe.map((r) => {
            const i = ingMap[r.ingredient_id];
            return (
              <li key={r.ingredient_id} className="flex items-center justify-between text-sm" data-testid={`recipe-line-${r.ingredient_id}`}>
                <span className="text-zinc-200">{i?.name ?? "?"} · <span className="font-mono text-zinc-400">{r.qty} {i?.unit}</span></span>
                <span className="flex items-center gap-2 font-mono text-zinc-300">{brl((i?.cost_per_unit ?? 0) * r.qty)}
                  <button type="button" onClick={() => setF({ ...f, recipe: f.recipe.filter((x) => x.ingredient_id !== r.ingredient_id) })}><Trash2 className="size-3.5 text-zinc-500" /></button>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-center">
          <div><p className="text-[10px] uppercase text-zinc-500">{manualCost > 0 ? "Custo (manual)" : "CMV ficha"}</p><p className="font-mono text-white" data-testid="recipe-cost">{brl(cost)}</p></div>
          <div><p className="text-[10px] uppercase text-zinc-500">Margem</p><p className={cn("font-mono", margin >= 65 ? "text-emerald-300" : "text-amber-300")} data-testid="recipe-margin">{margin.toFixed(1)}%</p></div>
          <div><p className="text-[10px] uppercase text-zinc-500">Preço sugerido (CMV 30%)</p><p className="font-mono text-primary">{brl(cost / 0.3)}</p></div>
        </div>
      </div>
      <Button className="mt-2" disabled={!f.name.trim() || !f.category_id || save.isPending} onClick={() => save.mutate({ ...f, price, cost_price: manualCost, options: f.options.filter((g) => g.name.trim() && g.choices.length) })} data-testid="product-save-button">Salvar produto</Button>
    </>
  );
}

const choicesText = (g: OptionGroup) => g.choices.map((c) => (c.price ? `${c.name}:${c.price}` : c.name)).join(", ");
const parseChoices = (t: string) => t.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
  const [name, price] = x.split(":");
  return { name: name.trim(), price: Number((price ?? "0").replace(",", ".")) || 0 };
}).filter((c) => c.name);

function OptionsEditor({ value, onChange }: { value: OptionGroup[]; onChange: (v: OptionGroup[]) => void }) {
  const upd = (i: number, g: Partial<OptionGroup>) => onChange(value.map((x, j) => (j === i ? { ...x, ...g } : x)));
  return (
    <div className="mt-2 rounded-2xl border border-white/5 bg-panel p-4" data-testid="options-editor">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">Opções (ponto, acompanhamentos, adicionais)</p>
        <Button size="xs" variant="outline" onClick={() => onChange([...value, { name: "", required: false, multi: false, choices: [] }])} data-testid="options-add-group"><Plus /> Grupo</Button>
      </div>
      {value.map((g, i) => (
        <div key={i} className="mt-3 space-y-2 rounded-xl border border-white/5 p-3" data-testid={`options-group-${i}`}>
          <div className="flex gap-2">
            <Input placeholder="Nome do grupo (ex: Ponto da carne)" value={g.name} onChange={(e) => upd(i, { name: e.target.value })} data-testid={`options-group-name-${i}`} />
            <Button size="icon-sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} data-testid={`options-group-remove-${i}`}><Trash2 /></Button>
          </div>
          <Input defaultValue={choicesText(g)} placeholder="Escolhas separadas por vírgula. Preço extra com dois-pontos: Farofa, Mandioca:6"
            onBlur={(e) => upd(i, { choices: parseChoices(e.target.value) })} data-testid={`options-group-choices-${i}`} />
          <div className="flex gap-4 text-xs text-zinc-300">
            <label className="flex items-center gap-2"><Checkbox checked={g.required} onCheckedChange={(v) => upd(i, { required: !!v })} data-testid={`options-group-required-${i}`} /> Obrigatório</label>
            <label className="flex items-center gap-2"><Checkbox checked={g.multi} onCheckedChange={(v) => upd(i, { multi: !!v })} data-testid={`options-group-multi-${i}`} /> Permite várias</label>
          </div>
        </div>
      ))}
    </div>
  );
}
