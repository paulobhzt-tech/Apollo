import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import AppShell, { PageHeader, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/api";
import { brl, errMsg } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";

type EventReport = { date: string; artist: string; artist_fee: number; extra_costs: number; contribution_margin_pct: number; revenue: number; target: number; remaining: number; contribution: number; event_result: number; reached: boolean; saved: boolean };
type History = { weeks: number; days: { date: string; artist: string; has_music: boolean; revenue: number; orders: number; average_ticket: number; event_cost: number; estimated_event_result: number | null }[]; with_music: { days: number; average_revenue: number | null; average_ticket: number | null }; without_music: { days: number; average_revenue: number | null; average_ticket: number | null }; revenue_difference: number | null; note: string };
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };
export default function MusicaAoVivo() {
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Values>({ artist: "", fee: "0", extra: "0", margin: "40" });
  const [dirty, setDirty] = useState(false);
  const [weeks, setWeeks] = useState(8);
  const history = useQuery({ queryKey: ["live-music-history", date, weeks], queryFn: () => apiGet<History>(`/reports/live-music/history?event_date=${date}&weeks=${weeks}`) });
  const q = useQuery({ queryKey: ["live-music", date], queryFn: () => apiGet<EventReport>(`/reports/live-music?event_date=${date}`), refetchInterval: 30000 });
  const mutation = useMutation({ mutationFn: (v: Values) => apiPut<{ ok: boolean }>("/reports/live-music", { date, artist: v.artist.trim(), artist_fee: Number(v.fee), extra_costs: Number(v.extra), contribution_margin_pct: Number(v.margin) }), onSuccess: () => { setDirty(false); void queryClient.invalidateQueries({ queryKey: ["live-music", date] }); toast.success("Evento salvo"); }, onError: (e) => toast.error(errMsg(e)) });
  const data = q.data;
  const totalCosts = Number(values.fee) + Number(values.extra);
  const valid = Number.isFinite(totalCosts) && Number(values.fee) >= 0 && Number(values.extra) >= 0 && Number(values.margin) > 0 && Number(values.margin) <= 100;
  const target = valid ? totalCosts / (Number(values.margin) / 100) : 0;
  const revenue = data?.revenue ?? 0;
  const preview = dirty ? { target, remaining: Math.max(0, target - revenue), contribution: revenue * Number(values.margin) / 100, event_result: revenue * Number(values.margin) / 100 - totalCosts } : data;
  return <AppShell roles={["admin"]}>
    <PageHeader title="Música ao Vivo — Meta de Vendas" subtitle="Quanto o dia precisa vender para cobrir o cachê e os custos do evento" />
    <div className="mb-4 max-w-sm"><Label htmlFor="music-date">Data do evento</Label><Input id="music-date" type="date" value={date} onChange={e => { setDate(e.target.value); setDirty(false); }} /></div>
    <div className="mb-4 max-w-sm"><Label htmlFor="music-weeks">Histórico para comparação</Label><select id="music-weeks" value={weeks} onChange={e => setWeeks(Number(e.target.value))} className="mt-1 w-full rounded-md border border-white/15 bg-[#252527] p-2 text-white"><option value={4}>4 semanas</option><option value={8}>8 semanas</option><option value={12}>12 semanas</option><option value={16}>16 semanas</option></select></div>
    {q.isError && <p role="alert" className="mb-4 text-red-400">Não foi possível carregar o evento e as vendas. Tente novamente.</p>}
    {q.isLoading && <p className="text-zinc-400">Carregando vendas do dia...</p>}
    {data && !dirty && <div className="hidden" aria-hidden="true">{data.artist}</div>}
    <EventForm key={date + (data?.saved ? "saved" : "new")} data={data} onChange={(v) => { setValues(v); setDirty(true); }} save={mutation.mutate} saving={mutation.isPending} />
    {data && <div className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat testid="live-music-stat-1" label="Vendas pagas no dia" value={brl(revenue)} />
        <Stat testid="live-music-stat-2" label="Meta para cobrir evento" value={brl(dirty ? target : data.target)} />
        <Stat testid="live-music-stat-3" label="Falta vender" value={brl(preview?.remaining ?? 0)} />
        <Stat testid="live-music-stat-4" label="Resultado estimado do evento" value={brl(preview?.event_result ?? 0)} />
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <strong className={((preview?.event_result ?? 0) >= 0) ? "text-emerald-400" : "text-amber-300"}>{(preview?.event_result ?? 0) >= 0 ? "Meta atingida" : "Meta ainda não atingida"}</strong>
        <p className="mt-2 text-sm text-zinc-300">Margem estimada disponível das vendas: {brl(preview?.contribution ?? 0)}. Esse valor é usado para pagar o cachê e os custos extras informados.</p>
        <p className="mt-2 text-xs text-zinc-400">O faturamento considera pedidos pagos na data escolhida. A margem é uma estimativa informada por você e deve descontar insumos, impostos, taxas e outros custos variáveis. O resultado não representa o lucro líquido do restaurante; despesas fixas não incluídas continuam existindo.</p>
        {dirty && <p className="mt-2 text-xs text-amber-300">Prévia com valores alterados. Salve para registrar a meta do evento.</p>}
      </div>
    </div>}
    <section className="mt-6 space-y-4" data-testid="live-music-history">
      <h2 className="text-xl font-semibold text-white">Análise de rentabilidade e histórico</h2>
      <p className="text-sm text-zinc-400">Comparação de dias equivalentes da semana, com e sem música cadastrada.</p>
      {history.isLoading && <p className="text-sm text-zinc-400">Carregando histórico...</p>}
      {history.isError && <p role="alert" className="text-sm text-red-400">Não foi possível carregar a comparação.</p>}
      {history.data && <>
        <div className="grid gap-3 md:grid-cols-3">
          <Stat testid="music-average-with" label={`Média com música (${history.data.with_music.days} dias)`} value={history.data.with_music.average_revenue === null ? "Sem dados" : brl(history.data.with_music.average_revenue)} />
          <Stat testid="music-average-without" label={`Média sem música (${history.data.without_music.days} dias)`} value={history.data.without_music.average_revenue === null ? "Sem dados" : brl(history.data.without_music.average_revenue)} />
          <Stat testid="music-revenue-difference" label="Diferença média de faturamento" value={history.data.revenue_difference === null ? "Sem comparação" : brl(history.data.revenue_difference)} />
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[660px] text-left text-sm">
            <thead className="bg-white/10 text-zinc-300"><tr><th className="p-3">Data</th><th className="p-3">Atração</th><th className="p-3 text-right">Vendas pagas</th><th className="p-3 text-right">Pedidos</th><th className="p-3 text-right">Custo do evento</th><th className="p-3 text-right">Resultado estimado</th></tr></thead>
            <tbody>{history.data.days.map(row => <tr key={row.date} className="border-t border-white/10">
              <td className="p-3">{row.date.split("-").reverse().join("/")}</td><td className="p-3">{row.has_music ? row.artist : "Sem evento cadastrado"}</td>
              <td className="p-3 text-right">{brl(row.revenue)}</td><td className="p-3 text-right">{row.orders}</td>
              <td className="p-3 text-right">{row.has_music ? brl(row.event_cost) : "—"}</td>
              <td className="p-3 text-right">{row.estimated_event_result === null ? "—" : brl(row.estimated_event_result)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-xs text-amber-200">{history.data.note}</p>
      </>}
    </section>
  </AppShell>;
}
type Values = { artist: string; fee: string; extra: string; margin: string };
function EventForm({ data, onChange, save, saving }: { data?: EventReport; onChange: (v: Values) => void; save: (v: Values) => void; saving: boolean }) {
  const [v, setV] = useState<Values>({ artist: data?.artist ?? "", fee: String(data?.artist_fee ?? 0), extra: String(data?.extra_costs ?? 0), margin: String(data?.contribution_margin_pct ?? 40) });
  const change = (key: keyof Values, value: string) => { const next = { ...v, [key]: value }; setV(next); onChange(next); };
  const valid = v.artist.trim().length > 0 && [v.fee, v.extra, v.margin].every(x => x.trim() !== "" && Number.isFinite(Number(x))) && Number(v.fee) >= 0 && Number(v.extra) >= 0 && Number(v.margin) > 0 && Number(v.margin) <= 100;
  return <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 md:grid-cols-2">
    <div><Label htmlFor="artist">Artista ou atração</Label><Input id="artist" value={v.artist} onChange={e => change("artist", e.target.value)} placeholder="Nome do artista" /></div>
    <div><Label htmlFor="fee">Cachê (R$)</Label><Input id="fee" type="number" min="0" step="0.01" value={v.fee} onChange={e => change("fee", e.target.value)} /></div>
    <div><Label htmlFor="extra">Outros custos do evento (R$)</Label><Input id="extra" type="number" min="0" step="0.01" value={v.extra} onChange={e => change("extra", e.target.value)} /></div>
    <div><Label htmlFor="margin">Margem de contribuição (%)</Label><Input id="margin" type="number" min="0.01" max="100" step="0.1" value={v.margin} onChange={e => change("margin", e.target.value)} /></div>
    <div className="md:col-span-2"><Button disabled={!valid || saving} onClick={() => save(v)}>{saving ? "Salvando..." : "Salvar meta do evento"}</Button></div>
  </div>;
}
