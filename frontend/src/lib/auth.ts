import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { Employee, Role } from "./types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<Employee>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export interface NavItem { to: string; label: string; icon: string; roles: Role[]; group: "Operação" | "Financeiro" | "Cadastros" | "Sistema" }

// Admin sees everything; the other roles get only their operational screens.
export const NAV: NavItem[] = [
  { to: "/", label: "Painel", icon: "LayoutDashboard", roles: ["admin", "caixa"], group: "Operação" },
  { to: "/pdv", label: "PDV / Caixa", icon: "ShoppingCart", roles: ["admin", "caixa"], group: "Operação" },
  { to: "/mesas", label: "Mesas & Comandas", icon: "Armchair", roles: ["admin", "caixa", "garcom"], group: "Operação" },
  { to: "/cozinha", label: "Cozinha (KDS)", icon: "ChefHat", roles: ["admin", "caixa", "garcom", "cozinha"], group: "Operação" },
  { to: "/impressao", label: "Central de Impressão", icon: "Printer", roles: ["admin", "caixa", "cozinha", "garcom"], group: "Operação" },
  { to: "/delivery", label: "Delivery", icon: "Bike", roles: ["admin", "caixa"], group: "Operação" },
  { to: "/caixa", label: "Controle de Caixa", icon: "Wallet", roles: ["admin", "caixa"], group: "Financeiro" },
  { to: "/financeiro", label: "DRE & Despesas", icon: "LineChart", roles: ["admin"], group: "Financeiro" },
  { to: "/vendas", label: "Histórico de Vendas", icon: "History", roles: ["admin", "caixa"], group: "Financeiro" },
  { to: "/fiado", label: "Conta Fiado", icon: "HandCoins", roles: ["admin", "caixa"], group: "Financeiro" },
  { to: "/notas", label: "Notas Fiscais", icon: "Receipt", roles: ["admin", "caixa"], group: "Financeiro" },
  { to: "/produtos", label: "Cadastro de Produtos", icon: "UtensilsCrossed", roles: ["admin"], group: "Cadastros" },
  { to: "/estoque", label: "Estoque & Insumos", icon: "Boxes", roles: ["admin", "caixa", "cozinha"], group: "Cadastros" },
  { to: "/clientes", label: "Clientes & Fornecedores", icon: "Contact", roles: ["admin", "caixa"], group: "Cadastros" },
  { to: "/funcionarios", label: "Funcionários", icon: "Users", roles: ["admin"], group: "Cadastros" },
  { to: "/qrcodes", label: "QR Codes & Site", icon: "QrCode", roles: ["admin", "caixa", "garcom"], group: "Cadastros" },
  { to: "/config", label: "Configurações", icon: "Settings", roles: ["admin"], group: "Sistema" },
];

export const homeFor = (role: Role) =>
  role === "garcom" ? "/mesas" : role === "cozinha" ? "/cozinha" : role === "caixa" ? "/pdv" : "/";
