import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ImagePlus, Pencil, Plus, Printer as PrinterIcon, Search, Trash2 } from "lucide-react";
import { fileToDataUrl } from "@/lib/image";
import { toast } from "sonner";
import { catalogNumber } from "@/lib/catalog-form";
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
import type { BulkDeleteIn, OkOut, Category, CategoryIn, Environment, EnvironmentIn, Ingredient, OptionGroup, Product, ProductIn, RecipeItem, Station } from "@/lib/types";
import { cn } from "@/lib/utils";
import { envName, useEnvironments } from "@/lib/environments";

const inv = () => { void queryClient.invalidateQueries({ queryKey: ["products"] }); void queryClient.invalidateQueries({ queryKey: ["categories"] }); };

export default function Produtos() {
  const products = useQuery({ queryKey: ["products"], queryFn: () => apiGet<Product[]>("/products") });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories") });
  const ingredients = useQuery({ queryKey: ["ingredients"], queryFn: () => apiGet<Ingredient[]>("/ingredients") });
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "price" | "cost" | "code">("name");
  const [activeOnly, setActiveOnly] = useState(false);
  const envs = useEnvironments();
  const cats = categories.data ?? [];
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? "—";
  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/products/${id}`),
    onSuccess: () => { toast.success("Produto apagado"); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [sel, setSel] = useState<string[]>([]);
  const all = products.data ?? [];
  const visible = all.filter(p => (!activeOnly || p.active) && [p.name, p.code, p.description, catName(p.category_id)].some(v => v.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))).sort((a, b) => sortBy === "name" ? a.name.localeCompare(b.name, "pt-BR") : sortBy === "code" ? a.code.localeCompare(b.code, "pt-BR", { numeric: true }) : a[sortBy] - b[sortBy]);
  const exportProducts = () => {
    const quote = (v: string | number) => '"' + String(v).replaceAll('"', '""') + '"';
    const rows = [["Código", "Categoria", "Produto", "Custo", "Venda", "Ativo"], ...visible.map(p => [p.code, catName(p.category_id), p.name, p.cost.toFixed(2), p.price.toFixed(2), p.active ? "Sim" : "Não"])];
    const blob = new Blob(["\uFEFF", rows.map(row => row.map(quote).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "produtos-apollo.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Lista exportada em CSV compatível com Excel");
  };
  const bulk = useMutation({
    mutationFn: (ids: string[]) => apiPost<OkOut>("/products/bulk-delete", { ids } satisfies BulkDeleteIn),
    onSuccess: (r) => { toast.success(r.message); setSel([]); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <AppShell roles={[]}>
      <PageHeader title="Cadastro de Produtos" subtitle="Cadastrar e editar produtos com foto, categorias, ambientes de produção, combos e ficha técnica"
        actions={<Button onClick={() => setEditing("new")} data-testid="new-product-button"><Plus className="size-4" /> Novo produto</Button>} />
      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos" data-testid="tab-produtos">Produtos</TabsTrigger>
          <TabsTrigger value="categorias" data-testid="tab-categorias">Categorias</TabsTrigger>
          <TabsTrigger value="ambientes" data-testid="tab-ambientes">Ambientes</TabsTrigger>
        </TabsList>
        <TabsContent value="produtos" className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-panel p-3" data-testid="products-toolbar">
            <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-zinc-400" /><Input className="pl-9" placeholder="Pesquisar nome, código ou categoria..." value={search} onChange={e => setSearch(e.target.value)} data-testid="products-search" /></div>
            <select aria-label="Ordenar produtos" className="h-9 rounded-md border border-white/15 bg-background px-3 text-sm" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
              <option value="name">Nome</option><option value="code">Código</option><option value="price">Preço de venda</option><option value="cost">Preço de custo</option>
            </select>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={activeOnly} onCheckedChange={v => setActiveOnly(!!v)} /> Somente ativos</label>
            <Button variant="outline" onClick={() => window.print()}><PrinterIcon className="size-4" /> Imprimir</Button>
            <Button variant="outline" onClick={exportProducts} data-testid="products-export-csv"><Download className="size-4" /> Exportar Excel (CSV)</Button>
            <Button onClick={() => setEditing("new")}><Plus className="size-4" /> Novo</Button>
          </div>
          <div className="mb-2 text-sm text-zinc-300">Produtos ({visible.length}) · Ativos ({visible.filter(p => p.active).length})</div>
          {sel.length > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2 animate-rise" data-testid="product-bulk-bar">
              <span className="text-sm text-red-200">{sel.length} produto(s) selecionado(s)</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSel([])}>Limpar seleção</Button>
                <Button size="sm" variant="destructive" disabled={bulk.isPending} onClick={() => window.confirm(`Apagar ${sel.length} produto(s)? As vendas antigas continuam no histórico.`) && bulk.mutate(sel)} data-testid="product-bulk-delete-button">
                  <Trash2 className="size-4" /> Apagar selecionados
                </Button>
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-white/5 bg-panel">
            <Table>
              <TableHeader>
                <TableRow><TableHead className="w-8"><Checkbox checked={all.length > 0 && sel.length === all.length} onCheckedChange={(v) => setSel(v ? all.map((p) => p.id) : [])} data-testid="product-select-all" /></TableHead><TableHead>Cód. PDV</TableHead><TableHead>Produto</TableHead><TableHead>Categoria</TableHead><TableHead>Ambiente</TableHead><TableHead className="text-right">Preço</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Margem</TableHead><TableHead>Status venda</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.id} data-testid={`product-row-${p.code || p.id}`}>
                    <TableCell><Checkbox checked={sel.includes(p.id)} onCheckedChange={() => toggle(p.id)} data-testid={`product-select-${p.code || p.id}`} /></TableCell>
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
                    <TableCell className="text-zinc-300" data-testid={`product-env-${p.code || p.id}`}>
                      {envName(envs.data, p.station || cats.find((c) => c.id === p.category_id)?.station || "cozinha")}
                      {p.print_ticket === false ? <Badge variant="outline" className="ml-1">não imprime</Badge> : <PrinterIcon className="ml-1 inline size-3 text-zinc-500" />}
                    </TableCell>
                    <TableCell className="text-right font-mono">{brl(p.price)}</TableCell>
                    <TableCell className="text-right font-mono text-zinc-400">{brl(p.cost)}{p.cost_price > 0 && <span className="ml-1 text-[10px] text-zinc-500">manual</span>}</TableCell>
                    <TableCell className={cn("text-right font-mono", p.margin_pct >= 65 ? "text-emerald-300" : p.margin_pct >= 45 ? "text-amber-300" : "text-red-300")}>{p.margin_pct}%</TableCell>\n                    <TableCell><span className={p.active ? "text-emerald-300" : "text-zinc-400"}>{p.active ? "● Ativo" : "○ Inativo"}</span></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(p)} data-testid={`edit-product-${p.code || p.id}`}><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => window.confirm(`Apagar ${p.name}?`) && del.mutate(p.id)} data-testid={`delete-product-${p.code || p.id}`}><Trash2 /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="categorias" className="mt-4"><Categorias cats={cats} /></TabsContent>
        <TabsContent value="ambientes" className="mt-4"><Ambientes /></TabsContent>
      </Tabs>
      <div className="mt-3 flex flex-wrap justify-between gap-3 border-t border-white/10 py-3 text-xs text-zinc-400">
        <span>Total de itens: {visible.length}</span>
        <span>Custo médio: {brl(visible.length ? visible.reduce((s, p) => s + p.cost, 0) / visible.length : 0)}</span>
        <span>Venda média: {brl(visible.length ? visible.reduce((s, p) => s + p.price, 0) / visible.length : 0)}</span>
      </div>
      <ProductDialog editing={editing} onClose={() => setEditing(null)} cats={cats} ings={ingredients.data ?? []} />
    </AppShell>
  );
}

function Categorias({ cats }: { cats: Category[] }) {
  const [name, setName] = useState("");
  const [station, setStation] = useState<Station>("cozinha");
  const envs = useEnvironments();
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
            <div><p className="font-medium text-white">{c.name}</p><p className="text-xs text-zinc-500">{envName(envs.data, c.station)}</p></div>
            <Button size="icon-sm" variant="ghost" onClick={() => del.mutate(c.id)} data-testid={`delete-category-${c.id}`}><Trash2 /></Button>
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border border-white/5 bg-panel p-4">
        <p className="text-sm font-medium text-white">Nova categoria</p>
        <Label htmlFor="category-name">Nome</Label>
        <Input id="category-name" placeholder="Nome da categoria" value={name} onChange={(e) => setName(e.target.value)} data-testid="category-name-input" />
        <Select value={station} onValueChange={(v: string) => setStation(v as Station)}>
          <SelectTrigger className="w-full" data-testid="category-station-select"><SelectValue>{(v) => envName(envs.data, v as string)}</SelectValue></SelectTrigger>
          <SelectContent>{(envs.data ?? []).map((e) => <SelectItem key={e.key} value={e.key}>{e.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button className="w-full" disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name: name.trim(), station, sort: cats.length })} data-testid="category-save-button">Salvar</Button>
      </div>
    </div>
  );
}

const EMPTY: ProductIn = { name: "", description: "", category_id: "", price: 0, code: "", image: "", active: true, recipe: [], cost_price: 0, options: [], station: "", print_ticket: true };

function ProductDialog({ editing, onClose, cats, ings }: { editing: Product | "new" | null; onClose: () => void; cats: Category[]; ings: Ingredient[] }) {
  return (
    <Dialog open={!!editing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-elevated sm:max-w-5xl" data-testid="product-dialog">
        {editing && <ProductForm key={editing === "new" ? "new" : editing.id} editing={editing} onClose={onClose} cats={cats} ings={ings} />}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ editing, onClose, cats, ings }: { editing: Product | "new"; onClose: () => void; cats: Category[]; ings: Ingredient[] }) {
  const [f, setF] = useState<ProductIn>(editing === "new" ? { ...EMPTY, category_id: cats[0]?.id ?? "" } : {
    name: editing.name, description: editing.description, category_id: editing.category_id, price: editing.price,
    code: editing.code, image: editing.image, active: editing.active, recipe: editing.recipe, cost_price: editing.cost_price ?? 0, options: editing.options ?? [],
    station: editing.station ?? "", print_ticket: editing.print_ticket ?? true,
  });
  const envs = useEnvironments();
  const catStation = cats.find((c) => c.id === f.category_id)?.station ?? "cozinha";
  const [priceStr, setPriceStr] = useState(editing === "new" ? "" : String(editing.price));
  const [costStr, setCostStr] = useState(editing === "new" || !editing.cost_price ? "" : String(editing.cost_price));
  const [ingId, setIngId] = useState("");
  const [qty, setQty] = useState("");
  const [targetMargin, setTargetMargin] = useState("60");
  const ingMap = Object.fromEntries(ings.map((i) => [i.id, i]));
  const recipeCost = f.recipe.reduce((s, r) => s + (ingMap[r.ingredient_id]?.cost_per_unit ?? 0) * r.qty, 0);
  const parsedCost = costStr.trim() ? catalogNumber(costStr) : 0;
  const manualCost = parsedCost ?? 0;
  const cost = manualCost > 0 ? manualCost : recipeCost;
  const parsedPrice = catalogNumber(priceStr);
  const price = parsedPrice ?? 0;
  const categoryExists = cats.some((category) => category.id === f.category_id);
  const invalidAmounts = parsedPrice === null || price < 0 || parsedCost === null || manualCost < 0;
  const margin = price ? ((price - cost) / price) * 100 : 0;
  const desiredMargin = Number(targetMargin.replace(",", "."));
  const suggestedPrice = cost > 0 && Number.isFinite(desiredMargin) && desiredMargin >= 0 && desiredMargin < 100 ? cost / (1 - desiredMargin / 100) : 0;

  const save = useMutation({
    mutationFn: (b: ProductIn) => editing === "new" ? apiPost<Product>("/products", b) : apiPut<Product>(`/products/${editing.id}`, b),
    onSuccess: () => { toast.success("Produto salvo"); inv(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const addRecipe = () => {
    const q = catalogNumber(qty);
    if (!ingId || q === null || q <= 0) return;
    const r: RecipeItem = { ingredient_id: ingId, qty: q };
    setF({ ...f, recipe: [...f.recipe.filter((x) => x.ingredient_id !== ingId), r] });
    setIngId(""); setQty("");
  };

  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{editing === "new" ? "Novo produto" : `Editar ${editing.name}`}</DialogTitle></DialogHeader>
      <Tabs defaultValue="principal" className="w-full" data-testid="product-editor-tabs">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="principal">Principal</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="ficha">Ficha técnica ({f.recipe.length})</TabsTrigger>
          <TabsTrigger value="complementos">Complementos e perguntas ({f.options.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="principal" className="mt-4">
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
        <div>
          <Label className="text-xs text-zinc-400">Ambiente de produção (onde é preparado e impresso)</Label>
          <Select value={f.station || "__cat"} onValueChange={(v: string) => setF({ ...f, station: v === "__cat" ? "" : v })}>
            <SelectTrigger className="mt-1 w-full" data-testid="product-station-select"><SelectValue>{(v) => (v === "__cat" ? `Da categoria (${envName(envs.data, catStation)})` : envName(envs.data, v as string))}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="__cat">Da categoria ({envName(envs.data, catStation)})</SelectItem>
              {(envs.data ?? []).map((e) => <SelectItem key={e.key} value={e.key}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 self-end rounded-xl border border-white/5 bg-panel px-3 py-2.5 text-sm text-zinc-300">
          <Checkbox checked={f.print_ticket} onCheckedChange={(v) => setF({ ...f, print_ticket: !!v })} data-testid="product-print-checkbox" />
          <PrinterIcon className="size-4 text-primary" /> Imprimir ticket no ambiente
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={f.active} onCheckedChange={(v) => setF({ ...f, active: !!v })} data-testid="product-active-checkbox" /> Disponível para venda</label>
      </div>

        </TabsContent>
        <TabsContent value="estoque" className="mt-4 rounded-xl border border-white/10 bg-panel p-5">
          <h3 className="font-semibold text-white">Controle de estoque</h3>
          <p className="mt-2 text-sm text-zinc-300">As entradas, compras, lotes e quantidades são controladas no módulo Estoque. A ficha técnica deste produto define os insumos consumidos nas vendas.</p>
          <p className="mt-2 text-xs text-amber-300">Para evitar divergências, a quantidade não é alterada diretamente neste cadastro.</p>
        </TabsContent>
        <TabsContent value="complementos" className="mt-4">
      <OptionsEditor value={f.options} onChange={(options) => setF({ ...f, options })} />
        </TabsContent>
        <TabsContent value="ficha" className="mt-4">
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
          <div><p className="text-[10px] uppercase text-zinc-500">Preço sugerido</p><p className="font-mono text-primary" data-testid="suggested-price">{brl(suggestedPrice)}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2"><div><Label>Margem bruta desejada (%)</Label><Input className="mt-1 w-28" inputMode="decimal" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} data-testid="target-margin" /></div><Button type="button" variant="outline" disabled={!suggestedPrice || suggestedPrice > 1000000} onClick={() => setPriceStr(suggestedPrice.toFixed(2))} data-testid="apply-suggested-price">Aplicar preço sugerido</Button></div>
        {cost > 0 && price > 0 && margin < desiredMargin && <p className="mt-2 text-xs text-amber-300" role="status">Atenção: margem atual de {margin.toFixed(1)}% abaixo da meta de {desiredMargin}%.</p>}
        <p className="mt-2 text-xs text-zinc-400">Custo calculado pela ficha técnica e preços atuais dos insumos, salvo quando houver custo manual. Margem bruta não inclui impostos, taxas e despesas fixas.</p>
      </div>
        </TabsContent>
      </Tabs>
      {!f.name.trim() && <p className="text-sm text-zinc-400">Informe o nome do produto.</p>}
      {!categoryExists && <p className="text-sm text-amber-300">{cats.length ? "Selecione uma categoria válida." : "Cadastre uma categoria na aba Categorias antes de salvar o produto."}</p>}
      {invalidAmounts && <p className="text-sm text-amber-300">Informe um preço válido. Preço e custo devem ser zero ou maiores.</p>}
      <Button className="mt-2" disabled={!f.name.trim() || !categoryExists || invalidAmounts || save.isPending} onClick={() => save.mutate({ ...f, name: f.name.trim(), price, cost_price: manualCost, options: f.options.filter((g) => g.name.trim() && g.choices.length) })} data-testid="product-save-button">Salvar produto</Button>
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

function Ambientes() {
  const envs = useEnvironments();
  const [f, setF] = useState<EnvironmentIn>({ name: "", auto_print: true, sort: 0 });
  const invE = () => void queryClient.invalidateQueries({ queryKey: ["environments"] });
  const create = useMutation({
    mutationFn: () => apiPost<Environment>("/environments", { ...f, sort: envs.data?.length ?? 0 }),
    onSuccess: () => { toast.success("Ambiente criado"); setF({ name: "", auto_print: true, sort: 0 }); invE(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const upd = useMutation({ mutationFn: (e: Environment) => apiPut<Environment>(`/environments/${e.id}`, { name: e.name, auto_print: e.auto_print, sort: e.sort }), onSuccess: invE, onError: (e) => toast.error(errMsg(e)) });
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/environments/${id}`), onSuccess: () => { toast.success("Ambiente removido"); invE(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-2 sm:grid-cols-2">
        {(envs.data ?? []).map((e) => (
          <div key={e.id} className="rounded-xl border border-white/5 bg-panel px-4 py-3" data-testid={`env-row-${e.key}`}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-white">{e.name}</p>
              <Button size="icon-sm" variant="ghost" onClick={() => window.confirm(`Excluir ${e.name}?`) && del.mutate(e.id)} data-testid={`env-delete-${e.key}`}><Trash2 /></Button>
            </div>
            <label className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
              <Checkbox checked={e.auto_print} onCheckedChange={(v) => upd.mutate({ ...e, auto_print: !!v })} data-testid={`env-auto-${e.key}`} /> Imprimir automaticamente ao chegar pedido
            </label>
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border border-white/5 bg-panel p-4">
        <p className="text-sm font-medium text-white">Novo ambiente</p>
        <p className="text-xs text-zinc-500">Ex.: Churrasqueira, Bar, Cozinha, Sobremesas. Vincule uma impressora em Configurações → Impressoras.</p>
        <Input placeholder="Nome do ambiente" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="env-name-input" />
        <label className="flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={f.auto_print} onCheckedChange={(v) => setF({ ...f, auto_print: !!v })} data-testid="env-auto-new" /> Impressão automática</label>
        <Button className="w-full" disabled={f.name.trim().length < 2 || create.isPending} onClick={() => create.mutate()} data-testid="env-save-button">Salvar ambiente</Button>
      </div>
    </div>
  );
}
