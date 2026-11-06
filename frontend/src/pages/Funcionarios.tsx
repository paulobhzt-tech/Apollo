import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg, ROLE_LABEL } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import type { Employee, EmployeeIn, Role } from "@/lib/types";

const ROLES: Role[] = ["admin", "caixa", "garcom", "cozinha"];
const ROLE_COLOR: Record<Role, string> = { admin: "text-primary border-primary/30", caixa: "text-sky-300 border-sky-400/30", garcom: "text-amber-300 border-amber-400/30", cozinha: "text-emerald-300 border-emerald-400/30" };
const inv = () => { void queryClient.invalidateQueries({ queryKey: ["employees"] }); void queryClient.invalidateQueries({ queryKey: ["profiles"] }); };


type ClockState = { clocked_in: boolean; clock_in_at: string | null };
type ClockReport = { totals: { employee_id: string; employee_name: string; minutes: number; shifts: number }[]; note: string };

function TimeClock() {
  const state = useQuery({ queryKey: ["my-time-clock"], queryFn: () => apiGet<ClockState>("/employees/time-clock/me") });
  const [start, setStart] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString("en-CA"));
  const [end, setEnd] = useState(() => new Date().toLocaleDateString("en-CA"));
  const report = useQuery({ queryKey: ["employee-time-report", start, end], queryFn: () => apiGet<ClockReport>(`/employees/time-clock/report?start=${start}&end=${end}`), enabled: !!start && !!end && start <= end });
  const punch = useMutation({
    mutationFn: (action: "in" | "out") => apiPost(`/employees/time-clock/${action}`, {}),
    onSuccess: () => { toast.success("Ponto registrado"); void queryClient.invalidateQueries({ queryKey: ["my-time-clock"] }); void queryClient.invalidateQueries({ queryKey: ["employee-time-report"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return <section className="mb-5 space-y-3 rounded-2xl border border-white/10 bg-panel p-4" data-testid="employee-time-clock">
    <h2 className="text-lg font-semibold">Ponto e turnos</h2>
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-zinc-300">{state.data?.clocked_in ? "Turno em andamento" : "Sem turno aberto"}</span>
      <Button disabled={punch.isPending || state.isLoading || state.isError} onClick={() => punch.mutate(state.data?.clocked_in ? "out" : "in")} data-testid="employee-clock-button">{state.data?.clocked_in ? "Registrar saída" : "Registrar entrada"}</Button>
      {state.isError && <span className="text-sm text-red-400">{errMsg(state.error)}</span>}
    </div>
    <div className="flex flex-wrap items-center gap-2 text-sm"><span>Relatório:</span>
      <Input type="date" aria-label="Início do relatório de ponto" className="w-40" value={start} onChange={e => setStart(e.target.value)} />
      <Input type="date" aria-label="Fim do relatório de ponto" className="w-40" value={end} onChange={e => setEnd(e.target.value)} />
    </div>
    {report.isError && <p role="alert" className="text-red-400">{errMsg(report.error)}</p>}
    {report.data && <><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-zinc-400"><th className="p-2">Funcionário</th><th className="p-2">Turnos</th><th className="p-2">Horas registradas</th></tr></thead><tbody>{report.data.totals.map(row => <tr key={row.employee_id} className="border-t border-white/10"><td className="p-2">{row.employee_name}</td><td className="p-2">{row.shifts}</td><td className="p-2">{(row.minutes / 60).toFixed(2)} h</td></tr>)}</tbody></table></div><p className="text-xs text-zinc-400">{report.data.note}</p></>}
  </section>;
}

export default function Funcionarios() {
  const q = useQuery({ queryKey: ["employees"], queryFn: () => apiGet<Employee[]>("/employees") });
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/employees/${id}`),
    onSuccess: () => { toast.success("Funcionário removido"); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <AppShell roles={[]}>
      <PageHeader title="Funcionários" subtitle="Cadastro, perfis de acesso por PIN e comissão de garçons"
        actions={<Button onClick={() => setEditing("new")} data-testid="new-employee-button"><Plus className="size-4" /> Novo funcionário</Button>} />
      <TimeClock />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(q.data ?? []).map((e) => (
          <article key={e.id} className="rounded-2xl border border-white/5 bg-panel p-4 transition-transform duration-200 hover:-translate-y-0.5" data-testid={`employee-card-${e.id}`}>
            <div className="flex items-start gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-white/5 font-heading font-semibold text-white">{e.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{e.name}</p>
                <Badge variant="outline" className={ROLE_COLOR[e.role]}>{ROLE_LABEL[e.role]}</Badge>
                {!e.active && <Badge variant="outline" className="ml-1">Inativo</Badge>}
                {(e.role === "admin" || e.can_cancel) && <Badge variant="outline" className="ml-1 border-red-400/30 text-red-300" data-testid={`employee-can-cancel-${e.id}`}>Pode estornar</Badge>}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>{e.phone || "Sem telefone"}</span>
              {e.commission_pct > 0 && <span className="font-mono text-primary">{e.commission_pct}% comissão</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(e)} data-testid={`edit-employee-${e.id}`}><Pencil className="size-3.5" /> Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => window.confirm(`Excluir ${e.name}?`) && del.mutate(e.id)} data-testid={`delete-employee-${e.id}`}><Trash2 className="size-3.5" /></Button>
            </div>
          </article>
        ))}
      </div>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="border-white/10 bg-elevated" data-testid="employee-dialog">
          {editing && <EmployeeForm key={editing === "new" ? "n" : editing.id} editing={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function EmployeeForm({ editing, onClose }: { editing: Employee | "new"; onClose: () => void }) {
  const isNew = editing === "new";
  const [f, setF] = useState({
    name: isNew ? "" : editing.name, role: (isNew ? "garcom" : editing.role) as Role, phone: isNew ? "" : editing.phone, cpf: isNew ? "" : (editing.cpf || ""), cnpj: isNew ? "" : (editing.cnpj || ""),
    commission: isNew ? "0" : String(editing.commission_pct), active: isNew ? true : editing.active, pin: "", username: "", password: "",
    can_cancel: isNew ? false : editing.can_cancel,
  });
  const save = useMutation({
    mutationFn: () => {
      const body: EmployeeIn = { name: f.name, role: f.role, phone: f.phone, cpf: f.cpf, cnpj: f.cnpj, commission_pct: Number(f.commission.replace(",", ".")) || 0, active: f.active, can_cancel: f.can_cancel };
      if (f.pin) body.pin = f.pin;
      if (f.username.trim()) body.username = f.username.trim();
      if (f.password) body.password = f.password;
      return isNew ? apiPost<Employee>("/employees", body) : apiPut<Employee>(`/employees/${editing.id}`, body);
    },
    onSuccess: () => { toast.success("Funcionário salvo"); inv(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const pinOk = /^\d{4,6}$/.test(f.pin) || (!isNew && f.pin === "");
  return (
    <>
      <DialogHeader><DialogTitle className="font-heading text-white">{isNew ? "Novo funcionário" : "Editar funcionário"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label className="text-xs text-zinc-400">Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1" data-testid="employee-name-input" /></div>
        <div>
          <Label className="text-xs text-zinc-400">Perfil</Label>
          <Select value={f.role} onValueChange={(v: string) => setF({ ...f, role: v as Role })}>
            <SelectTrigger className="mt-1 w-full" data-testid="employee-role-select"><SelectValue>{(v) => ROLE_LABEL[v as Role]}</SelectValue></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs text-zinc-400">{isNew ? "PIN (4-6 dígitos)" : "Novo PIN (opcional)"}</Label><Input value={f.pin} inputMode="numeric" maxLength={6} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })} className="mt-1 font-mono" data-testid="employee-pin-input" /></div>
        <div><Label className="text-xs text-zinc-400">Usuário de acesso (opcional)</Label><Input value={f.username} autoComplete="off" onChange={(e) => setF({ ...f, username: e.target.value })} className="mt-1" placeholder={isNew ? "ex.: operador01" : "Manter atual se vazio"} /></div>
        <div><Label className="text-xs text-zinc-400">Senha (mín. 8 caracteres)</Label><Input type="password" value={f.password} autoComplete="new-password" onChange={(e) => setF({ ...f, password: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs text-zinc-400">Telefone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="mt-1" data-testid="employee-phone-input" /></div>
        <div><Label className="text-xs text-zinc-400">CPF</Label><Input value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} className="mt-1" placeholder="000.000.000-00" /></div>
        <div><Label className="text-xs text-zinc-400">CNPJ</Label><Input value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} className="mt-1" placeholder="00.000.000/0000-00" /></div>
        <div><Label className="text-xs text-zinc-400">Comissão (%)</Label><Input value={f.commission} inputMode="decimal" onChange={(e) => setF({ ...f, commission: e.target.value })} className="mt-1 font-mono" data-testid="employee-commission-input" /></div>
        <label className="col-span-2 flex items-start gap-2 rounded-xl border border-white/5 bg-panel p-3 text-sm text-zinc-300">
          <Checkbox checked={f.role === "admin" || f.can_cancel} disabled={f.role === "admin"} onCheckedChange={(v) => setF({ ...f, can_cancel: !!v })} data-testid="employee-can-cancel-checkbox" />
          <span>Autorizado a <b className="text-white">cancelar produtos e fazer estornos</b><span className="block text-xs text-zinc-500">Administradores sempre têm essa permissão.</span></span>
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={f.active} onCheckedChange={(v) => setF({ ...f, active: !!v })} data-testid="employee-active-checkbox" /> Ativo (pode acessar o sistema)</label>
      </div>
      <Button disabled={f.name.trim().length < 2 || !pinOk || save.isPending} onClick={() => save.mutate()} data-testid="employee-save-button">Salvar</Button>
    </>
  );
}
