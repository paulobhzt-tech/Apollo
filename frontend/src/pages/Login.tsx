import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Delete, Flame, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/PasswordInput";
import { Toaster } from "@/components/ui/sonner";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { queryClient } from "@/lib/queryClient";
import { bindOperatorQueue, homeFor } from "@/lib/auth";
import { errMsg, ROLE_LABEL } from "@/lib/format";
import type { Employee, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";


export default function Login() {
  const nav = useNavigate();
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState<"password" | "pin">("password");
  const [username, setUsername] = useState(() => localStorage.getItem("apollo-login-username") || "");
  const [password, setPassword] = useState("");
  const [help, setHelp] = useState<"register" | "forgot" | null>(null);
  const [registerAfterLogin, setRegisterAfterLogin] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [rememberOperator, setRememberOperator] = useState(() => localStorage.getItem("apollo-remember-operator") === "true");
  const branding = useQuery({ queryKey: ["branding"], queryFn: () => apiGet<{trade_name: string; logo_url: string}>("/branding"), retry: false });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => apiGet<Profile[]>("/auth/profiles"), retry: false });
  useEffect(() => {
    if (!rememberOperator || !profiles.data?.length) return;
    const id = localStorage.getItem("apollo-last-operator-id");
    const remembered = profiles.data.find((p) => p.id === id);
    if (remembered && remembered.pin_enabled !== false) setSelected(remembered);
  }, [rememberOperator, profiles.data]);


  const login = useMutation({
    mutationFn: (credentials: {pin?: string; username?: string; password?: string; employee_id?: string}) => apiPost<Employee>("/auth/login", credentials),
    onSuccess: async (emp) => {
      if (rememberOperator) localStorage.setItem("apollo-last-operator-id", emp.id);
      if (rememberOperator && mode === "password") localStorage.setItem("apollo-login-username", username.trim());
      beginSession();
      await bindOperatorQueue(emp);
      queryClient.setQueryData(["me"], emp);
      toast.success(`Bem-vindo(a), ${emp.name}`);
      if (registerAfterLogin && emp.role === "admin") nav("/funcionarios", { replace: true });
      else {
        if (registerAfterLogin) toast.info("Somente administradores podem cadastrar usuários.");
        nav(homeFor(emp.role), { replace: true });
      }
    },
    onError: (e, credentials) => {
      if (e instanceof ApiError && e.status === 401) {
        toast.error(credentials.username
          ? "Credenciais inválidas. Confira o usuário e a senha. Se sua conta usa PIN, selecione a aba PIN."
          : "Credenciais inválidas. Confira o PIN e o ambiente em que sua conta foi cadastrada.");
      } else {
        toast.error(errMsg(e));
      }
      setPin("");
      setPassword("");
    },
  });

  const press = (d: string) => {
    if (login.isPending) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
  };
  const submit = (p = pin) => p.length >= 4 && login.mutate({pin: p, employee_id: selected?.id});
  const submitPassword = () => username.trim() && password && login.mutate({username: username.trim(), password});

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mx-auto grid min-h-dvh w-full max-w-lg items-center px-4 py-5 sm:py-10">
        <section className="min-w-0 rounded-2xl border border-border bg-panel p-5 shadow-xl sm:p-7" data-testid="pin-panel">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-white shadow-xl shadow-primary/30">{branding.data?.logo_url ? <img src={branding.data.logo_url} alt="Logomarca" className="size-12 rounded-2xl object-cover" /> : <Flame className="size-6" />}</span>
            <div>
              <h1 className="font-heading text-2xl font-semibold text-foreground" data-testid="login-brand">{branding.data?.trade_name || "Apollo PDV"}</h1>
            </div>
          </div>
          <p className="mt-2 break-all text-center text-xs text-zinc-400">Servidor · {window.location.host}</p>
          {profiles.isSuccess && profiles.data.length === 0 && <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-300">Nenhum operador ativo neste servidor. Confira o endereço da homologação ou solicite a configuração inicial pelo terminal do servidor.</p>}
          {mode === "pin" && profiles.data?.length && profiles.data.every((p) => p.pin_enabled === false)
            ? <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-300">Nenhum operador ativo tem PIN neste servidor. Use usuário e senha.</p>
            : null}
          <div className="my-5 flex flex-wrap gap-2"><button type="button" onClick={() => setMode("password")} className={mode === "password" ? "rounded-lg bg-primary px-3 py-2 text-white" : "rounded-lg border px-3 py-2"}>Usuário e senha</button><button type="button" onClick={() => setMode("pin")} className={mode === "pin" ? "rounded-lg bg-primary px-3 py-2 text-white" : "rounded-lg border px-3 py-2"}>PIN</button></div>
          {mode === "pin" && (
          <div className="mb-4 grid max-h-40 grid-cols-2 gap-2 overflow-y-auto" data-testid="profile-list">
            {(profiles.data ?? []).filter((p) => p.pin_enabled !== false).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setSelected(selected?.id === p.id ? null : p); setPin(""); }}
                aria-pressed={selected?.id === p.id}
                data-testid={`profile-${p.id}`}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors duration-200",
                  selected?.id === p.id ? "border-primary bg-primary/10" : "border-border bg-elevated hover:border-primary/50",
                )}
              >
                <p className="truncate text-sm font-medium text-white">{p.name}</p>
                <p className="truncate text-[11px] text-zinc-500">{ROLE_LABEL[p.role]}</p>
              </button>
            ))}
          </div>
          )}
          {mode === "password" ? <form onSubmit={(e) => { e.preventDefault(); submitPassword(); }} className="space-y-4"><label className="block text-sm">Usuário<input className="mt-1 w-full rounded-xl border border-border bg-elevated p-3 text-foreground" value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} /></label><div><label htmlFor="login-password" className="mb-1 block text-sm">Senha</label><PasswordInput id="login-password" className="p-3 pr-12" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} /></div><button type="submit" disabled={!username.trim() || !password || login.isPending} className="w-full rounded-xl bg-primary p-3 font-semibold text-white disabled:opacity-40">Entrar</button></form> : <><p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">
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
          </>}
          <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm">
            <button type="button" onClick={() => setHelp("register")} className="text-primary hover:underline" data-testid="register-user-link">Cadastrar usuário</button>
            <button type="button" onClick={() => setHelp("forgot")} className="text-muted-foreground hover:underline" data-testid="forgot-password-link">Esqueceu a senha?</button>
          </div>
          {help && <div role="dialog" aria-label={help === "register" ? "Cadastrar usuário" : "Recuperar acesso"} className="mt-4 rounded-xl border border-border bg-elevated p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-white">{help === "register" ? "Cadastro de usuários" : "Esqueceu a senha?"}</p>
            <p className="mt-2">{help === "register"
              ? "Por segurança, somente um administrador pode cadastrar usuários. Entre com uma conta de administrador para abrir o cadastro de funcionários."
              : "Solicite ao administrador do Apollo a redefinição da sua senha na tela Funcionários > Editar. Se você é o único administrador, o responsável pelo servidor pode recuperar a sua conta pelo terminal com python first_run.py --list-admins e python first_run.py --recover ID. No primeiro acesso, o comando python first_run.py configura o administrador somente se ainda não houver um cadastrado."}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {help === "register" && <button type="button" className="rounded-lg bg-primary px-3 py-2 font-medium text-white" onClick={() => { setRegisterAfterLogin(true); setMode("password"); setHelp(null); }}>Entrar como administrador</button>}
              <button type="button" className="rounded-lg border border-border px-3 py-2" onClick={() => setHelp(null)}>Fechar</button>
            </div>
          </div>}
          <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm text-zinc-400"><input type="checkbox" checked={rememberOperator} onChange={(e) => { const value = e.target.checked; setRememberOperator(value); localStorage.setItem("apollo-remember-operator", String(value)); if (!value) { localStorage.removeItem("apollo-last-operator-id"); localStorage.removeItem("apollo-login-username"); } }} /> Lembrar usuário neste dispositivo</label>
          {mode === "pin" && <button
            type="button"
            onClick={() => submit()}
            disabled={pin.length < 4 || login.isPending}
            data-testid="pin-submit"
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-heading text-lg font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#EA580C] active:scale-[0.98] disabled:opacity-40"
          >
            <ShieldCheck className="size-5" /> {login.isPending ? "Entrando…" : "Entrar"}
          </button>}
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
        "h-12 rounded-xl sm:h-14 border border-white/8 font-mono text-2xl transition-[background-color,transform] duration-100 active:scale-95",
        muted ? "bg-transparent text-zinc-400 hover:bg-white/5" : "bg-elevated text-white hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}
