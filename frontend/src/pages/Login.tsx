import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Delete, Flame, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { desktop } from "@/lib/desktop";
import { Toaster } from "@/components/ui/sonner";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { beginSession, waitForLogout } from "@/lib/session";
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
  const [rememberOperator, setRememberOperator] = useState(() => Boolean(localStorage.getItem("apollo-login-username")));
  const [confirmRemember, setConfirmRemember] = useState(false);
  const [showOperators, setShowOperators] = useState(false);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState("");
  const version = desktop()?.version ?? import.meta.env.VITE_APOLLO_VERSION;
  const terminal = useQuery({
    queryKey: ["operator-terminal"],
    queryFn: () => apiGet<{ authorized: boolean }>("/auth/operator-terminal"),
    retry: false,
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => apiGet<Profile[]>("/auth/profiles"),
    enabled: terminal.data?.authorized === true,
    retry: false,
  });
  const operators = terminal.data?.authorized && !profiles.isError ? profiles.data ?? [] : [];
  const namedOperators = operators.filter((operator) => operator.username);

  useEffect(() => {
    // The earlier implementation also stored a separate PIN operator ID.
    localStorage.removeItem("apollo-last-operator-id");
    localStorage.removeItem("apollo-remember-operator");
  }, []);

  const login = useMutation({
    mutationFn: async (credentials: {pin?: string; username?: string; password?: string; employee_id?: string}) => {
      setError("");
      await waitForLogout();
      return apiPost<Employee>("/auth/login", credentials, AbortSignal.timeout(10000));
    },
    onSuccess: async (emp, credentials) => {
      if (rememberOperator && credentials.username) localStorage.setItem("apollo-login-username", credentials.username.trim());
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
      setError(e instanceof ApiError
        ? e.status === 401
          ? credentials.username ? "Usuário ou senha incorretos." : "PIN inválido."
          : errMsg(e)
        : "Servidor indisponível. Reconecte-se para autenticar o operador.");
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
  const submitPassword = () => !login.isPending && !confirmRemember && username.trim() && password && login.mutate({username: username.trim(), password});

  const close = () => {
    if (login.isPending) return;
    setOpen(false);
    setPassword("");
    setPin("");
    setHelp(null);
    setRegisterAfterLogin(false);
    setShowOperators(false);
    setError("");
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-shell p-4">
      {!open && <div className="text-center">
        <p className="mb-3 text-foreground">Apollo PDV bloqueado</p>
        <button type="button" className="rounded-lg bg-primary px-4 py-2 font-semibold text-white" onClick={() => setOpen(true)}>Abrir login</button>
      </div>}
      <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }} disablePointerDismissal>
        <DialogContent className="gap-2 rounded-2xl border border-border bg-panel p-5 shadow-xl sm:max-w-md sm:p-7"
          overlayClassName="bg-black/60" data-testid="pin-panel">
          <header className="mb-4 flex flex-col items-center gap-2 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-white"><Flame className="size-6" aria-hidden="true" /></span>
            <p className="font-semibold text-foreground" data-testid="login-brand">Apollo PDV</p>
            <DialogTitle className="text-2xl font-semibold text-foreground">Bem-vindo de volta</DialogTitle>
            <p className="text-sm text-muted-foreground">Acesse sua conta para continuar</p>
          </header>
          {mode === "pin" && operators.length > 0 && operators.every((p) => p.pin_enabled === false)
            ? <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-300">Nenhum operador ativo tem PIN neste servidor. Use usuário e senha.</p>
            : null}
          {mode === "pin" && (
          <div className="mb-4 grid max-h-40 grid-cols-2 gap-2 overflow-y-auto" data-testid="profile-list">
            {operators.filter((p) => p.pin_enabled !== false).map((p) => (
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
          {mode === "password" ? <form onSubmit={(event) => { event.preventDefault(); submitPassword(); }} className="space-y-3">
            <div>
              <label htmlFor="login-username" className="block text-sm">Usuário</label>
              <div className="mt-1 flex rounded-xl border border-border bg-elevated focus-within:ring-2 focus-within:ring-primary">
                <input id="login-username" className="min-w-0 flex-1 rounded-xl bg-transparent p-3 text-foreground outline-none"
                  value={username} autoComplete="username" onChange={(event) => { setUsername(event.target.value); setError(""); }} />
                {namedOperators.length > 0 && <button type="button" className="grid w-11 shrink-0 place-items-center rounded-r-xl hover:bg-muted"
                  aria-label="Selecionar usuário" aria-expanded={showOperators} aria-controls="login-operator-list"
                  onClick={() => setShowOperators(!showOperators)}><ChevronDown className="size-4" /></button>}
              </div>
              {showOperators && namedOperators.length > 0 && <div id="login-operator-list" className="mt-1 max-h-40 overflow-auto rounded-xl border border-border bg-elevated">
                <div className="grid grid-cols-2 gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground"><span>Login</span><span>Nome</span></div>
                {namedOperators.map((operator) => <button key={operator.id} type="button" className="grid w-full grid-cols-2 gap-2 px-3 py-2 text-left hover:bg-muted"
                  onClick={() => {
                    setUsername(operator.username ?? "");
                    setPassword("");
                    setShowOperators(false);
                    document.getElementById("login-password")?.focus();
                  }}><span className="wrap-anywhere">{operator.username}</span><span className="wrap-anywhere">{operator.name}</span></button>)}
              </div>}
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1 block text-sm">Senha</label>
              <input id="login-password" type="password" className="w-full rounded-xl border border-border bg-elevated p-3 text-foreground" value={password} autoComplete="current-password" onChange={(event) => { setPassword(event.target.value); setError(""); }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={rememberOperator} onChange={(event) => {
                  if (event.target.checked) setConfirmRemember(true);
                  else {
                    setRememberOperator(false);
                    localStorage.removeItem("apollo-login-username");
                  }
                }} /> Memorizar usuário
              </label>
              <button type="button" onClick={() => setHelp("forgot")} className="text-primary hover:underline" data-testid="forgot-password-link">Esqueci minha senha</button>
            </div>
            <button type="submit" disabled={!username.trim() || !password || login.isPending} className="w-full rounded-xl bg-primary p-3 font-semibold text-white disabled:opacity-40">{login.isPending ? "Entrando…" : "Entrar"}</button>
          </form> : <><p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">
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
          {error && <p role="alert" className="rounded-lg border border-destructive/40 p-2 text-foreground">{error}</p>}
          <div className="mt-3 flex flex-wrap justify-between gap-3 text-sm">
            <button type="button" onClick={() => setHelp("register")} className="text-primary hover:underline" data-testid="register-user-link">Cadastrar usuário</button>
            <button type="button" onClick={() => { setError(""); setPassword(""); setPin(""); setRegisterAfterLogin(false); setMode(mode === "pin" ? "password" : "pin"); }} className="text-muted-foreground hover:underline">{mode === "pin" ? "Entrar com usuário e senha" : "Entrar com PIN"}</button>
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
          {mode === "pin" && <button
            type="button"
            onClick={() => submit()}
            disabled={pin.length < 4 || login.isPending}
            data-testid="pin-submit"
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-heading text-lg font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#EA580C] active:scale-[0.98] disabled:opacity-40"
          >
            <ShieldCheck className="size-5" /> {login.isPending ? "Entrando…" : "Entrar"}
          </button>}
          {version && <p className="mt-2 text-center text-xs text-muted-foreground">Versão {version}</p>}
          <Dialog open={confirmRemember} onOpenChange={setConfirmRemember} disablePointerDismissal>
            <DialogContent>
              <DialogTitle>Memorizar usuário</DialogTitle>
              <p>Se este terminal é compartilhado, deseja lembrar apenas o nome do usuário neste dispositivo?</p>
              <div className="flex justify-end gap-3">
                <button type="button" className="rounded-lg border px-3 py-2" onClick={() => setConfirmRemember(false)}>Não</button>
                <button type="button" className="rounded-lg bg-primary px-3 py-2 text-white" onClick={() => { setRememberOperator(true); setConfirmRemember(false); }}>Sim</button>
              </div>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
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
