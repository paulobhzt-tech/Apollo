import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Delete, Flame, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { apiGet, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { queryClient } from "@/lib/queryClient";
import { homeFor } from "@/lib/auth";
import { errMsg, ROLE_LABEL } from "@/lib/format";
import type { Employee, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";


export default function Login() {
  const nav = useNavigate();
  const [pin, setPin] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => apiGet<Profile[]>("/auth/profiles"), retry: false });

  const login = useMutation({
    mutationFn: (p: string) => apiPost<Employee>("/auth/login", { pin: p }),
    onSuccess: (emp) => {
      beginSession();
      queryClient.setQueryData(["me"], emp);
      toast.success(`Bem-vindo(a), ${emp.name}`);
      nav(homeFor(emp.role), { replace: true });
    },
    onError: (e) => {
      toast.error(errMsg(e));
      setPin("");
    },
  });

  const press = (d: string) => {
    if (login.isPending) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
  };
  const submit = (p = pin) => p.length >= 4 && login.mutate(p);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.2fr_1fr]">
        <section className="animate-rise">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-white shadow-xl shadow-primary/30"><Flame className="size-6" /></span>
            <div>
              <p className="font-heading text-2xl font-semibold text-white" data-testid="login-brand">Espeteria Churras Buguer</p>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Espetinhos · Churrasco · Burgers</p>
            </div>
          </div>
          <h1 className="mt-10 max-w-lg text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Frente de caixa, salão, cozinha e delivery <span className="text-primary">em um só lugar.</span>
          </h1>
          <p className="mt-4 max-w-md text-zinc-400">Selecione seu perfil e digite seu PIN para iniciar o turno.</p>
          <div className="mt-8 grid max-w-lg grid-cols-2 gap-2 sm:grid-cols-3" data-testid="profile-list">
            {(profiles.data ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                data-testid={`profile-${p.id}`}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors duration-200",
                  selected?.id === p.id ? "border-primary bg-primary/10" : "border-white/8 bg-panel hover:border-white/20",
                )}
              >
                <p className="truncate text-sm font-medium text-white">{p.name}</p>
                <p className="truncate text-[11px] text-zinc-500">{ROLE_LABEL[p.role]}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/8 bg-panel/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8 animate-rise" data-testid="pin-panel">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">
            {selected ? `Olá, ${selected.name}` : "Acesso por PIN"}
          </p>
          <div className="mt-4 flex justify-center gap-3" data-testid="pin-display">
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <span key={i} className={cn("size-4 rounded-full border transition-colors duration-150", i < pin.length ? "border-primary bg-primary" : "border-white/20")} />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Key key={d} onClick={() => press(d)} testid={`pin-digit-${d}`}>{d}</Key>
            ))}
            <Key onClick={() => setPin("")} testid="pin-clear" muted>C</Key>
            <Key onClick={() => press("0")} testid="pin-digit-0">0</Key>
            <Key onClick={() => setPin(pin.slice(0, -1))} testid="pin-backspace" muted><Delete className="mx-auto size-5" /></Key>
          </div>
          <button
            type="button"
            onClick={() => submit()}
            disabled={pin.length < 4 || login.isPending}
            data-testid="pin-submit"
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-heading text-lg font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#EA580C] active:scale-[0.98] disabled:opacity-40"
          >
            <ShieldCheck className="size-5" /> {login.isPending ? "Entrando…" : "Entrar"}
          </button>
        </section>
      </div>
      <Toaster richColors />
    </div>
  );
}

function Key({ children, onClick, testid, muted }: { children: React.ReactNode; onClick: () => void; testid: string; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={cn(
        "h-16 rounded-2xl border border-white/8 font-mono text-2xl transition-[background-color,transform] duration-100 active:scale-95",
        muted ? "bg-transparent text-zinc-400 hover:bg-white/5" : "bg-elevated text-white hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}
