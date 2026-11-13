import OperatingCosts from "@/components/OperatingCosts";
import OpeningInsights from "@/components/OpeningInsights";
import { useState } from "react";
import { Bot, Send } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { apiPost } from "@/lib/api";

type Reply = { supported: boolean; answer: string; source: string; provider?: string; notice?: string; metrics: null | { date: string; revenue: number; paid_orders: number; average_ticket: number; partial_day?: boolean } };

export default function ApolloIA() {
  const [provider, setProvider] = useState<"openai" | "gemini" | "local">("openai");
  const [question, setQuestion] = useState("Como estão minhas vendas hoje?");
  const [reply, setReply] = useState<Reply | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true); setError(""); setReply(null);
    try { setReply(await apiPost<Reply>("/assistant/chat", { question: question.trim(), provider })); }
    catch { setError("Não foi possível consultar as vendas. Verifique a conexão e suas permissões."); }
    finally { setLoading(false); }
  }
  return <AppShell roles={["admin", "caixa"]}>
    <PageHeader title="Apollo IA" subtitle="Assistente de gestão — consultas seguras aos dados reais do PDV" />
    <section className="mx-auto max-w-2xl space-y-5 p-4" data-testid="apollo-assistant">
      <div className="rounded-xl border border-white/10 bg-panel p-5">
        <div className="mb-4 flex items-center gap-2 font-semibold"><Bot className="size-5 text-primary" /> Assistente Apollo</div>
        <p className="mb-4 text-sm text-zinc-400">Pergunte sobre vendas, despesas ou produtos mais vendidos. Escolha ChatGPT, Gemini ou Apollo local. Serviços externos recebem apenas os indicadores agregados de vendas; se indisponíveis, o Apollo responde localmente. Nenhuma alteração é feita no caixa.</p>
        <label htmlFor="apollo-provider" className="mb-2 block text-sm text-zinc-300">Assistente</label>
        <select id="apollo-provider" value={provider} onChange={e => setProvider(e.target.value as "openai" | "gemini" | "local")} className="mb-4 w-full rounded-lg border border-white/20 bg-background px-3 py-2 text-sm">
          <option value="openai">ChatGPT</option>
          <option value="gemini">Google Gemini</option>
          <option value="local">Apollo local (sem IA externa)</option>
        </select>
        <div className="mb-3 flex flex-wrap gap-2"><button type="button" onClick={() => setQuestion("Como estão minhas vendas hoje?")} className="rounded-lg border border-white/20 px-3 py-1 text-xs">Vendas de hoje</button><button type="button" onClick={() => setQuestion("Quanto vendi ontem?")} className="rounded-lg border border-white/20 px-3 py-1 text-xs">Vendas de ontem</button></div>
        <button type="button" onClick={() => setQuestion("Quanto gastei este mês?")} className="mb-3 rounded-lg border border-white/20 px-3 py-1 text-xs">Despesas deste mês</button>
        <button type="button" onClick={() => setQuestion("Quais são os produtos mais vendidos?")} className="mb-3 ml-2 rounded-lg border border-white/20 px-3 py-1 text-xs">Produtos mais vendidos</button>
        <form onSubmit={ask} className="flex gap-2">
          <input aria-label="Pergunta ao Apollo IA" maxLength={300} value={question} onChange={e => setQuestion(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-background px-3 py-2 text-sm" />
          <button type="submit" disabled={loading || !question.trim()} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="size-4" /> {loading ? "Consultando…" : "Perguntar"}</button>
        </form>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 p-4 text-red-400">{error}</p>}
      {reply && <div role="status" className="rounded-xl border border-white/10 bg-panel p-5">
        <h2 className="mb-3 font-semibold">Resposta do Apollo {reply.provider === "openai" ? "· ChatGPT" : reply.provider === "gemini" ? "· Gemini" : "· Local"}</h2>
        <p className="whitespace-pre-wrap leading-relaxed">{reply.answer}</p>
        {reply.notice && <p className="mt-3 text-sm text-amber-300">{reply.notice}</p>}
        {reply.supported && <p className="mt-4 text-xs text-zinc-400">Fonte: {reply.source === "despesas_lancadas_mes" ? "despesas lançadas" : "pedidos pagos"} no Apollo. {reply.metrics?.date || ""} {reply.source === "despesas_lancadas_mes" ? "· Mês em andamento." : reply.metrics?.partial_day ? "· Dia em andamento." : "· Período encerrado."}</p>}
      </div>}
    </section>
    <OperatingCosts />
    <OpeningInsights />
  </AppShell>;
}
