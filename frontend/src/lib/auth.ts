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

export interface NavItem { to: string; label: string; icon: string; roles: Role[] }

// Admin sees everything; the other roles get only their operational screens.
export const NAV: NavItem[] = [
  { to: "/", label: "Painel", icon: "LayoutDashboard", roles: ["admin", "caixa"] },
  { to: "/pdv", label: "PDV / Caixa", icon: "ShoppingCart", roles: ["admin", "caixa"] },
  { to: "/mesas", label: "Mesas & Comandas", icon: "Armchair", roles: ["admin", "caixa", "garcom"] },
  { to: "/cozinha", label: "Cozinha (KDS)", icon: "ChefHat", roles: ["admin", "caixa", "garcom", "cozinha"] },
  { to: "/delivery", label: "Delivery", icon: "Bike", roles: ["admin", "caixa"] },
  { to: "/caixa", label: "Controle de Caixa", icon: "Wallet", roles: ["admin", "caixa"] },
  { to: "/vendas", label: "Histórico de Vendas", icon: "History", roles: ["admin", "caixa"] },
  { to: "/notas", label: "Notas Fiscais", icon: "Receipt", roles: ["admin", "caixa"] },
  { to: "/produtos", label: "Cardápio & Fichas", icon: "UtensilsCrossed", roles: ["admin"] },
  { to: "/estoque", label: "Estoque & Insumos", icon: "Boxes", roles: ["admin", "caixa", "cozinha"] },
  { to: "/financeiro", label: "Financeiro & DRE", icon: "LineChart", roles: ["admin"] },
  { to: "/funcionarios", label: "Funcionários", icon: "Users", roles: ["admin"] },
  { to: "/qrcodes", label: "QR Codes & Site", icon: "QrCode", roles: ["admin", "caixa", "garcom"] },
];

export const homeFor = (role: Role) =>
  role === "garcom" ? "/mesas" : role === "cozinha" ? "/cozinha" : role === "caixa" ? "/pdv" : "/";
