import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, MessageCircle } from "lucide-react";
import { Panel } from "@/pages/Dashboard";
import { apiGet } from "@/lib/api";
import { brl } from "@/lib/format";
import type { Bill, BillAlerts as Alerts } from "@/lib/types";
import { cn } from "@/lib/utils";

const fmtD = (d: string) => d.split("-").reverse().join("/");
const sum = (l: Bill[]) => l.reduce((s, b) => s + b.amount, 0);

/** WhatsApp link with a ready-made reminder for the owner (he taps send). */
export function reminderLink(phone: string, title: string, bills: Bill[]) {
  const digits = phone.replace(/\D/g, "");
  const to = digits ? (digits.startsWith("55") ? digits : `55${digits}`) : "";
  const lines = bills.map((b) => `• ${b.description}${b.party ? ` (${b.party})` : ""}: ${brl(b.amount)} · vence ${fmtD(b.due_date)}`);
  const msg = `⏰ *Apollo PDV · ${title}*\n${lines.join("\n")}\n\nTotal: *${brl(sum(bills))}*`;
  return `https://wa.me/${to}?text=${encodeURIComponent(msg)}`;
}

/** Painel: contas a pagar/receber vencidas, de hoje e de amanhã, com lembrete no WhatsApp. */
export default function BillAlertsPanel() {
  const q = useQuery({ queryKey: ["bills-alerts"], queryFn: () => apiGet<Alerts>("/bills/alerts"), refetchInterval: 60_000 });
  const a = q.data;
  if (!a || (!a.overdue.length && !a.due_today.length && !a.due_tomorrow.length)) return null;
  const pay = (l: Bill[]) => l.filter((b) => b.kind === "pagar");
  const groups = [
    { key: "overdue", label: "Vencidas", list: a.overdue, tone: "text-red-300 border-red-400/30 bg-red-400/5" },
    { key: "today", label: "Vencem hoje", list: a.due_today, tone: "text-amber-300 border-amber-400/30 bg-amber-400/5" },
    { key: "tomorrow", label: "Vencem amanhã", list: a.due_tomorrow, tone: "text-sky-300 border-sky-400/25 bg-sky-400/5" },
  ];
  const reminder = [...pay(a.overdue), ...pay(a.due_today), ...pay(a.due_tomorrow)];
  return (
    <Panel title="Contas a vencer" className="mb-4" actions={
      reminder.length > 0 && (
        <a href={reminderLink(a.alert_phone, a.due_tomorrow.length ? `Contas que vencem amanhã (${fmtD(a.tomorrow_date)})` : "Contas a pagar pendentes", reminder)}
          target="_blank" rel="noreferrer" data-testid="bill-alerts-whatsapp"
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-emerald-500">
          <MessageCircle className="size-3.5" /> Lembrete no WhatsApp
        </a>
      )}>
      {!a.alert_phone && <p className="mb-2 text-xs text-zinc-500">Cadastre seu WhatsApp em Configurações → Empresa para o lembrete ir direto para você.</p>}
      <div className="grid gap-3 md:grid-cols-3" data-testid="bill-alerts">
        {groups.map((g) => (
          <div key={g.key} className={cn("rounded-xl border p-3", g.tone)} data-testid={`bill-alerts-${g.key}`}>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>{g.key === "overdue" ? <AlertTriangle className="mr-1 inline size-4" /> : <CalendarClock className="mr-1 inline size-4" />}{g.label}</span>
              <span className="font-mono">{brl(sum(g.list))}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {g.list.slice(0, 5).map((b) => (
                <li key={b.id} className="flex justify-between gap-2 text-xs text-zinc-300">
                  <Link to={b.kind === "pagar" ? "/contas-pagar" : "/contas-receber"} className="truncate hover:underline">{b.kind === "receber" ? "↓ " : "↑ "}{b.description}</Link>
                  <span className="whitespace-nowrap font-mono">{brl(b.amount)}</span>
                </li>
              ))}
              {g.list.length > 5 && <li className="text-xs text-zinc-500">+{g.list.length - 5} conta(s)</li>}
              {!g.list.length && <li className="text-xs text-zinc-500">Nenhuma</li>}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}
