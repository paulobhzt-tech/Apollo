import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import { isDesktop, kv } from "./desktop";
import type { Employee, Role } from "./types";

const ME_KEY = "pdv_last_operator";
async function fetchMe(): Promise<Employee> {
  try {
    const me = await apiGet<Employee>("/auth/me");
    if (isDesktop()) kv.set(ME_KEY, JSON.stringify(me));
    return me;
  } catch (e) {
    // Do not grant access just because this computer remembers an operator.
    // An offline PIN verification flow is required before allowing offline access.
    throw e;
  }
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });
}

export interface NavItem { to: string; label: string; icon: string; roles: Role[]; group: "Operação" | "Financeiro" | "Cadastros" | "Relatórios" | "Sistema" }

// Admin sees everything; the other roles get only their operational screens.
export const NAV: NavItem[] = [
  { to: "/", label: "Painel", icon: "LayoutDashboard", roles: ["admin", "caixa"], group: "Operação" },
  { to: "/apollo-ia", label: "Apollo IA", icon: "Bot", roles: ["admin", "caixa"], group: "Operação" },
  { to: "/pdv", label: "PDV / Caixa", icon: "ShoppingCart", roles: ["admin", "caixa"], group: "Operação" },
  { to: "/mesas", label: "Mesas & Comandas", icon: "Armchair", roles: ["admin", "caixa", "garcom"], group: "Operação" },
  { to: "/comanda-mobile", label: "Comanda Mobile", icon: "Smartphone", roles: ["admin", "caixa", "garcom"], group: "Operação" },
  { to: "/cozinha", label: "Cozinha (KDS)", icon: "ChefHat", roles: ["admin", "caixa", "garcom", "cozinha"], group: "Operação" },
  { to: "/impressao", label: "Central de Impressão", icon: "Printer", roles: ["admin", "caixa", "cozinha", "garcom"], group: "Operação" },
  { to: "/delivery", label: "Delivery", icon: "Bike", roles: ["admin", "caixa"], group: "Operação" },
  { to: "/caixa", label: "Controle de Caixa", icon: "Wallet", roles: ["admin", "caixa"], group: "Financeiro" },
  { to: "/contas-pagar", label: "Contas a Pagar", icon: "ArrowUpCircle", roles: ["admin", "caixa"], group: "Financeiro" },
  { to: "/contas-receber", label: "Contas a Receber", icon: "ArrowDownCircle", roles: ["admin", "caixa"], group: "Financeiro" },
  { to: "/categorias-contas", label: "Categorias de Contas", icon: "Tags", roles: ["admin"], group: "Financeiro" },
  { to: "/formas-pagamento", label: "Formas de Pagamento", icon: "CreditCard", roles: ["admin"], group: "Financeiro" },
  { to: "/musica-ao-vivo", label: "Música ao Vivo", icon: "Music", roles: ["admin"], group: "Operação" },
  { to: "/financeiro", label: "DRE & Despesas", icon: "LineChart", roles: ["admin"], group: "Relatórios" },
  { to: "/vendas", label: "Histórico de Vendas", icon: "History", roles: ["admin", "caixa"], group: "Relatórios" },
  { to: "/fiado", label: "Conta Fiado", icon: "HandCoins", roles: ["admin", "caixa"], group: "Financeiro" },
  { to: "/notas", label: "Notas Fiscais", icon: "Receipt", roles: ["admin", "caixa"], group: "Financeiro" },
  { to: "/produtos", label: "Cadastro de Produtos", icon: "UtensilsCrossed", roles: ["admin"], group: "Cadastros" },
  { to: "/estoque", label: "Estoque & Insumos", icon: "Boxes", roles: ["admin", "caixa", "cozinha"], group: "Cadastros" },
  { to: "/clientes", label: "Clientes & Fornecedores", icon: "Contact", roles: ["admin", "caixa"], group: "Cadastros" },
  { to: "/funcionarios", label: "Funcionários", icon: "Users", roles: ["admin"], group: "Cadastros" },
  { to: "/qrcodes", label: "QR Codes & Site", icon: "QrCode", roles: ["admin", "caixa", "garcom"], group: "Operação" },
  { to: "/config", label: "Configurações", icon: "Settings", roles: ["admin"], group: "Sistema" },
];

export const homeFor = (role: Role) =>
  role === "garcom" ? "/comanda-mobile" : role === "cozinha" ? "/cozinha" : role === "caixa" ? "/pdv" : "/";
