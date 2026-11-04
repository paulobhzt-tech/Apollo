import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Receipt, Search, Trash2 } from "lucide-react";
import { BillForm } from "@/pages/Contas";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { brl, errMsg } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { FiadoCustomer, FiadoCustomerIn, OkOut, Supplier, SupplierIn } from "@/lib/types";
import { cn } from "@/lib/utils";

const num = (s: string) => Number(s.replace(",", ".")) || 0;
const match = (q: string, ...v: string[]) => !q || v.some((x) => x.toLowerCase().includes(q.toLowerCase()));

export default function Pessoas() {
  const loc = useLocation();
  const nav = useNavigate();
  const tab = loc.pathname.startsWith("/fornecedores") ? "fornecedores" : "clientes";
  return (
    <AppShell roles={["caixa"]}>
      <PageHeader title="Clientes & Fornecedores" subtitle="Cadastrar, editar e descadastrar clientes e fornecedores" />
      <Tabs value={tab} onValueChange={(v) => nav(v === "fornecedores" ? "/fornecedores" : "/clientes")}>
        <TabsList>
          <TabsTrigger value="clientes" data-testid="tab-clientes">Clientes</TabsTrigger>
          <TabsTrigger value="fornecedores" data-testid="tab-fornecedores">Fornecedores</TabsTrigger>
        </TabsList>
        <TabsContent value="clientes" className="mt-4"><Clientes /></TabsContent>
        <TabsContent value="fornecedores" className="mt-4"><Fornecedores /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Toolbar({ search, setSearch, onNew, label, testid, canCreate = true }: { search: string; setSearch: (s: string) => void; onNew: () => void; label: string; testid: string; canCreate?: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        <Input placeholder="Buscar por nome, telefone ou documento" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 pl-9" data-testid={`${testid}-search-input`} /></div>
      {canCreate && <Button onClick={onNew} data-testid={`${testid}-new-button`}><Plus className="size-4" /> {label}</Button>}
    </div>
  );
}

/* ---------------- Clientes ---------------- */
function Clientes() {
  const q = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<FiadoCustomer[]>("/customers") });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<FiadoCustomer | "new" | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => apiDelete<OkOut>(`/customers/${id}`),
    onSuccess: () => { toast.success("Cliente descadastrado"); void queryClient.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const list = (q.data ?? []).filter((c) => match(search, c.name, c.phone, c.cpf, c.email));
  return (
    <>
      <Toolbar search={search} setSearch={setSearch} onNew={() => setEditing("new")} label="Novo cliente" testid="customer" />
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-panel">
        <Table>
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Contato</TableHead><TableHead>CPF</TableHead><TableHead className="text-right">Limite fiado</TableHead><TableHead className="text-right">Deve</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {list.map((c) => (
              <TableRow key={c.id} data-testid={`customer-row-${c.id}`}>
                <TableCell><p className="font-medium text-white">{c.name}</p>{c.address && <p className="text-xs text-zinc-500">{c.address}</p>}</TableCell>
                <TableCell className="text-zinc-300">{c.phone || "—"}{c.email && <span className="block text-xs text-zinc-500">{c.email}</span>}</TableCell>
                <TableCell className="font-mono text-xs text-zinc-400">{c.cpf || "—"}</TableCell>
                <TableCell className="text-right font-mono text-zinc-400">{c.credit_limit ? brl(c.credit_limit) : "—"}</TableCell>
                <TableCell className={cn("text-right font-mono", c.balance > 0.009 ? "text-red-300" : "text-zinc-500")}>{brl(c.balance)}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditing(c)} data-testid={`customer-edit-${c.id}`}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => window.confirm(`Descadastrar ${c.name}?`) && del.mutate(c.id)} data-testid={`customer-delete-${c.id}`}><Trash2 /></Button>
                </TableCell>
              </TableRow>
            ))}
            {!list.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-zinc-500" data-testid="customers-empty">Nenhum cliente cadastrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-lg" data-testid="customer-dialog">
          {editing && <CustomerForm c={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CustomerForm({ c, onClose }: { c: FiadoCustomer | null; onClose: () => void }) {
  const [f, setF] = useState({ name: c?.name ?? "", phone: c?.phone ?? "", cpf: c?.cpf ?? "", email: c?.email ?? "", address: c?.address ?? "", notes: c?.notes ?? "", limit: c?.credit_limit ? String(c.credit_limit) : "" });
  const save = useMutation({
    mutationFn: () => {
      const body: FiadoCustomerIn = { name: f.name, phone: f.phone, cpf: f.cpf, email: f.email, address: f.address, notes: f.notes, credit_limit: num(f.limit) };
      return c ? apiPut<FiadoCustomer>(`/customers/${c.id}`, body) : apiPost<FiadoCustomer>("/customers", body);
    },
    onSuccess: () => { toast.success(c ? "Cliente atualizado" : "Cliente cadastrado"); void queryClient.invalidateQueries({ queryKey: ["customers"] }); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const field = (k: keyof typeof f, label: string, ph = "", full = false) => (
    <div className={cn(full && "sm:col-span-2")}><Label className="text-xs text-zinc-400">{label}</Label>
      <Input value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1" data-testid={`customer-${k}-input`} /></div>
  );
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{c ? `Editar ${c.name}` : "Novo cliente"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "Nome", "Nome do cliente", true)}
        {field("phone", "Telefone / WhatsApp", "(31) 99999-0000")}
        {field("cpf", "CPF", "000.000.000-00")}
        {field("email", "E-mail")}
        {field("limit", "Limite de fiado (R$)", "0 = sem limite")}
        {field("address", "Endereço", "Rua, número, bairro", true)}
        <div className="sm:col-span-2"><Label className="text-xs text-zinc-400">Observações</Label>
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="mt-1" data-testid="customer-notes-input" /></div>
      </div>
      <Button className="mt-2 h-11" disabled={f.name.trim().length < 2 || save.isPending} onClick={() => save.mutate()} data-testid="customer-save-button">Salvar cliente</Button>
    </>
  );
}

/* ---------------- Fornecedores ---------------- */
const EMPTY_S: SupplierIn = { name: "", doc: "", phone: "", email: "", contact: "", address: "", supplies: "", notes: "" };

function Fornecedores() {
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const q = useQuery({ queryKey: ["suppliers"], queryFn: () => apiGet<Supplier[]>("/suppliers") });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [billFor, setBillFor] = useState<Supplier | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => apiDelete<OkOut>(`/suppliers/${id}`),
    onSuccess: () => { toast.success("Fornecedor descadastrado"); void queryClient.invalidateQueries({ queryKey: ["suppliers"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const list = (q.data ?? []).filter((s) => match(search, s.name, s.phone, s.doc, s.supplies, s.contact));
  return (
    <>
      <Toolbar search={search} setSearch={setSearch} onNew={() => setEditing("new")} label="Novo fornecedor" testid="supplier" canCreate={isAdmin} />
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-panel">
        <Table>
          <TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead>Fornece</TableHead><TableHead>Contato</TableHead><TableHead>CNPJ/CPF</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {list.map((s) => (
              <TableRow key={s.id} data-testid={`supplier-row-${s.id}`}>
                <TableCell><p className="font-medium text-white">{s.name}</p>{s.address && <p className="text-xs text-zinc-500">{s.address}</p>}</TableCell>
                <TableCell className="text-zinc-300">{s.supplies || "—"}</TableCell>
                <TableCell className="text-zinc-300">{s.contact && <span className="block">{s.contact}</span>}{s.phone || "—"}{s.email && <span className="block text-xs text-zinc-500">{s.email}</span>}</TableCell>
                <TableCell className="font-mono text-xs text-zinc-400">{s.doc || "—"}</TableCell>
                <TableCell className="text-right">
                  {isAdmin && <>
                    <Button size="sm" variant="outline" onClick={() => setBillFor(s)} data-testid={`supplier-bill-${s.id}`}><Receipt className="size-3.5" /> Lançar conta</Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(s)} data-testid={`supplier-edit-${s.id}`}><Pencil /></Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => window.confirm(`Descadastrar ${s.name}?`) && del.mutate(s.id)} data-testid={`supplier-delete-${s.id}`}><Trash2 /></Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}
            {!list.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-zinc-500" data-testid="suppliers-empty">Nenhum fornecedor cadastrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-lg" data-testid="supplier-dialog">
          {editing && <SupplierForm s={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!billFor} onOpenChange={(v) => !v && setBillFor(null)}>
        <DialogContent className="border-white/10 bg-elevated sm:max-w-lg" data-testid="supplier-bill-dialog">
          {billFor && <BillForm kind="pagar" bill={null} partyLabel="Fornecedor" initialParty={billFor.name} onClose={() => setBillFor(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SupplierForm({ s, onClose }: { s: Supplier | null; onClose: () => void }) {
  const [f, setF] = useState<SupplierIn>(s ? { name: s.name, doc: s.doc, phone: s.phone, email: s.email, contact: s.contact, address: s.address, supplies: s.supplies, notes: s.notes } : EMPTY_S);
  const save = useMutation({
    mutationFn: () => (s ? apiPut<Supplier>(`/suppliers/${s.id}`, f) : apiPost<Supplier>("/suppliers", f)),
    onSuccess: () => { toast.success(s ? "Fornecedor atualizado" : "Fornecedor cadastrado"); void queryClient.invalidateQueries({ queryKey: ["suppliers"] }); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const field = (k: keyof SupplierIn, label: string, ph = "", full = false) => (
    <div className={cn(full && "sm:col-span-2")}><Label className="text-xs text-zinc-400">{label}</Label>
      <Input value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1" data-testid={`supplier-${k}-input`} /></div>
  );
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{s ? `Editar ${s.name}` : "Novo fornecedor"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "Nome / razão social", "Ex.: Frigorífico Boi Bom", true)}
        {field("doc", "CNPJ ou CPF")}
        {field("supplies", "O que fornece", "Carnes, bebidas, carvão…")}
        {field("contact", "Pessoa de contato")}
        {field("phone", "Telefone / WhatsApp")}
        {field("email", "E-mail", "", true)}
        {field("address", "Endereço", "", true)}
        <div className="sm:col-span-2"><Label className="text-xs text-zinc-400">Observações</Label>
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="mt-1" placeholder="Dia de entrega, prazo de pagamento…" data-testid="supplier-notes-input" /></div>
      </div>
      <Button className="mt-2 h-11" disabled={f.name.trim().length < 2 || save.isPending} onClick={() => save.mutate()} data-testid="supplier-save-button">Salvar fornecedor</Button>
    </>
  );
}
