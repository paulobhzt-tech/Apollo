import { ApiError } from "./api";
import type { PayMethod, Role, Source } from "./types";

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v: number) => brlFmt.format(v || 0);
export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
export const minutesSince = (iso: string | null, now = Date.now()) =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0;

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Gerente (Admin)",
  caixa: "Operador de Caixa",
  garcom: "Garçom / Salão",
  cozinha: "Cozinha / KDS",
};
export const PAY_LABEL: Record<PayMethod, string> = {
  dinheiro: "Dinheiro",
  credito: "Crédito",
  debito: "Débito",
  pix: "PIX",
  voucher: "Vale-Refeição",
  fiado: "Fiado",
  online: "Online (App)",
};
export const SOURCE_LABEL: Record<Source, string> = {
  pdv: "Balcão",
  mesa: "Mesa",
  cardapio: "QR Mesa",
  ifood: "iFood",
  "99food": "99Food",
  keeta: "Keeta",
  site: "Site Próprio",
};
export const SOURCE_COLOR: Record<Source, string> = {
  pdv: "#94A3B8",
  mesa: "#FBBF24",
  cardapio: "#38BDF8",
  ifood: "#EA1D2C",
  "99food": "#F97316",
  keeta: "#FFCC00",
  site: "#10B981",
};

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { detail?: unknown } | null;
    if (typeof b?.detail === "string") return b.detail;
    if (Array.isArray(b?.detail)) return "Dados inválidos. Verifique os campos.";
    return `Erro ${e.status}`;
  }
  return "Sem conexão com o servidor";
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const kindLabel = (kind: "mesa" | "comanda") => (kind === "comanda" ? "Comanda" : "Mesa");
export const tableLabel = (t: { kind: "mesa" | "comanda"; number: number; name: string }) =>
  `${kindLabel(t.kind)} ${t.number}${t.name ? ` · ${t.name}` : ""}`;
