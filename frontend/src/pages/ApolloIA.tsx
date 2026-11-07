import { useState } from "react";
import { Bot, Send } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { apiPost } from "@/lib/api";

type Reply = { supported: boolean; answer: string; source: string; provider?: string; notice?: string; metrics: null | { date: string; revenue: number; paid_orders: number; average_ticket: number } };

export default function ApolloIA() {
  const [question, setQuestion] = useState("Como estão minhas vendas hoje?");
  const [reply, setReply] = useState<Reply | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true); setError(""); setReply(null);
    try { setReply(await apiPost<Reply>("/assistant/chat", { question: question.trim() })); }
    catch { setError("Não foi possível consultar as vendas. Verifique a conexão e suas permissões."); }
    finally { setLoading(false); }
  }
  return <AppShell roles={["admin", "caixa"]}>
    <PageHeader title="Apollo IA" subtitle="Assistente de gestão — consultas seguras aos dados reais do PDV" />
    <section className="mx-auto max-w-2xl space-y-5 p-4" data-testid="apollo-assistant">
      <div className="rounded-xl border border-white/10 bg-panel p-5">
        <div className="mb-4 flex items-center gap-2 font-semibold"><Bot className="size-5 text-primary" /> Assistente Apollo</div>
        <p className="mb-4 text-sm text-zinc-400">Pergunte sobre as vendas de hoje. Com a API OpenAI configurada no servidor, o ChatGPT explica os números; caso contrário, o Apollo responde localmente. Nenhuma alteração é feita no caixa.</p>
        <form onSubmit={ask} className="flex gap-2">
          <input aria-label="Pergunta ao Apollo IA" maxLength={300} value={question} onChange={e => setQuestion(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-background px-3 py-2 text-sm" />
          <button type="submit" disabled={loading || !question.trim()} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="size-4" /> {loading ? "Consultando…" : "Perguntar"}</button>
        </form>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 p-4 text-red-400">{error}</p>}
      {reply && <div role="status" className="rounded-xl border border-white/10 bg-panel p-5">
        <h2 className="mb-3 font-semibold">Resposta do Apollo {reply.provider === "openai" ? "· ChatGPT" : "· Local"}</h2>
        <p className="whitespace-pre-wrap leading-relaxed">{reply.answer}</p>
        {reply.notice && <p className="mt-3 text-sm text-amber-300">{reply.notice}</p>}
        {reply.supported && <p className="mt-4 text-xs text-zinc-400">Fonte: pedidos pagos e meta diária registrados no Apollo. Dados do dia em andamento.</p>}
      </div>}
    </section>
  </AppShell>;
}
