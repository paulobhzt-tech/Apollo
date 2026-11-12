import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Delete, Flame, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
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
    if (remembered) setSelected(remembered);
  }, [rememberOperator, profiles.data]);


  const login = useMutation({
    mutationFn: (credentials: {pin?: string; username?: string; password?: string}) => apiPost<Employee>("/auth/login", credentials),
    onSuccess: async (emp) => {
      if (rememberOperator && selected) localStorage.setItem("apollo-last-operator-id", selected.id);
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
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) {
        toast.error(mode === "password"
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
  const submit = (p = pin) => p.length >= 4 && login.mutate({pin: p});
  const submitPassword = () => username.trim() && password && login.mutate({username: username.trim(), password});

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.2fr_1fr]">
        <section className="animate-rise">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-white shadow-xl shadow-primary/30">{branding.data?.logo_url ? <img src={branding.data.logo_url} alt="Logomarca" className="size-12 rounded-2xl object-cover" /> : <Flame className="size-6" />}</span>
            <div>
              <p className="font-heading text-2xl font-semibold text-white" data-testid="login-brand">{branding.data?.trade_name || "Apollo PDV"}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Gestão de atendimento, vendas e estoque</p>
            </div>
          </div>
          <h1 className="mt-10 max-w-lg text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Frente de caixa, salão, cozinha e delivery <span className="text-primary">em um só lugar.</span>
          </h1>
          <p className="mt-4 max-w-md text-zinc-400">Use o usuário e a senha cadastrados neste servidor ou selecione a aba PIN se sua conta usa PIN.</p>
          <p className="mt-2 break-all text-sm text-zinc-400">Servidor · {window.location.host}</p>
          {profiles.isSuccess && profiles.data.length === 0 && <p role="status" className="mt-3 text-sm text-amber-300">Este ambiente não tem perfis ativos. Confira o servidor com o administrador da homologação.</p>}
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
          <div className="mb-5 flex gap-2"><button type="button" onClick={() => setMode("password")} className={mode === "password" ? "rounded-lg bg-primary px-3 py-2 text-white" : "rounded-lg border px-3 py-2"}>Usuário e senha</button><button type="button" onClick={() => setMode("pin")} className={mode === "pin" ? "rounded-lg bg-primary px-3 py-2 text-white" : "rounded-lg border px-3 py-2"}>PIN</button></div>
          {mode === "password" ? <form onSubmit={(e) => { e.preventDefault(); submitPassword(); }} className="space-y-4"><label className="block text-sm">Usuário<input className="mt-1 w-full rounded-xl border border-border bg-elevated p-3 text-foreground" value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} /></label><label className="block text-sm">Senha<input type="password" className="mt-1 w-full rounded-xl border border-border bg-elevated p-3 text-foreground" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} /></label><button type="submit" disabled={!username.trim() || !password || login.isPending} className="w-full rounded-xl bg-primary p-3 font-semibold text-white disabled:opacity-40">Entrar</button></form> : <><p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">
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
            <button type="button" onClick={() => setHelp("forgot")} className="text-zinc-300 hover:underline" data-testid="forgot-password-link">Esqueceu a senha?</button>
          </div>
          {help && <div role="dialog" aria-label={help === "register" ? "Cadastrar usuário" : "Recuperar acesso"} className="mt-4 rounded-xl border border-white/15 bg-elevated p-4 text-sm text-zinc-300">
            <p className="font-semibold text-white">{help === "register" ? "Cadastro de usuários" : "Esqueceu a senha?"}</p>
            <p className="mt-2">{help === "register"
              ? "Por segurança, somente um administrador pode cadastrar usuários. Entre com uma conta de administrador para abrir o cadastro de funcionários."
              : "Solicite ao administrador do Apollo a redefinição da sua senha na tela Funcionários > Editar. Se você é o único administrador, procure o suporte responsável pela instalação. Não compartilhe seu PIN ou senha."}</p>
            <div className="mt-3 flex gap-3">
              {help === "register" && <button type="button" className="rounded-lg bg-primary px-3 py-2 font-medium text-white" onClick={() => { setRegisterAfterLogin(true); setMode("password"); setHelp(null); }}>Entrar como administrador</button>}
              <button type="button" className="rounded-lg border border-white/20 px-3 py-2" onClick={() => setHelp(null)}>Fechar</button>
            </div>
          </div>}
          <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm text-zinc-400"><input type="checkbox" checked={rememberOperator} onChange={(e) => { const value = e.target.checked; setRememberOperator(value); localStorage.setItem("apollo-remember-operator", String(value)); if (!value) localStorage.removeItem("apollo-last-operator-id"); }} /> Lembrar meu usuário neste dispositivo (não salva PIN)</label>
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
        "h-16 rounded-2xl border border-white/8 font-mono text-2xl transition-[background-color,transform] duration-100 active:scale-95",
        muted ? "bg-transparent text-zinc-400 hover:bg-white/5" : "bg-elevated text-white hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}
