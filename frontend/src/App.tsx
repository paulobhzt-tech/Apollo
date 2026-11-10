import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import Login from "@/pages/Login";
import ApolloIA from "@/pages/ApolloIA";
import Dashboard from "@/pages/Dashboard";
import Pdv from "@/pages/Pdv";
import Mesas from "@/pages/Mesas";
import Kds from "@/pages/Kds";
import Delivery from "@/pages/Delivery";
import Caixa from "@/pages/Caixa";
import Notas from "@/pages/Notas";
import Produtos from "@/pages/Produtos";
import Estoque from "@/pages/Estoque";
import Financeiro from "@/pages/Financeiro";
import MusicaAoVivo from "@/pages/MusicaAoVivo";
import Funcionarios from "@/pages/Funcionarios";
import QrCodes from "@/pages/QrCodes";
import Cardapio from "@/pages/Cardapio";
import PedirDelivery from "@/pages/PedirDelivery";
import Vendas from "@/pages/Vendas";
import Fiado from "@/pages/Fiado";
import Config from "@/pages/Config";
import Impressao from "@/pages/Impressao";
import Pessoas from "@/pages/Pessoas";
import Contas from "@/pages/Contas";
import FinCadastros from "@/pages/FinCadastros";
import { homeFor, useMe, NAV } from "@/lib/auth";
import type { ReactNode } from "react";

// Route-level checks complement (never replace) server-side authorization.
export function ProtectedRoute({ path, children }: { path: string; children: ReactNode }) {
  const { data: me, isLoading, isError } = useMe();
  if (isLoading) return null;
  if (isError || !me) return <Navigate to="/login" replace />;
  const item = NAV.find((entry) => entry.to === path);
  if (!item || !item.roles.includes(me.role)) return <Navigate to={homeFor(me.role)} replace />;
  return <>{children}</>;
}

function Home() {
  const { data: me, isLoading, isError } = useMe();
  if (isLoading) return null;
  if (isError || !me) return <Navigate to="/login" replace />;
  return me.role === "admin" || me.role === "caixa" ? <Dashboard /> : <Navigate to={homeFor(me.role)} replace />;
}

function DemoNotice() {
  const { data } = useQuery({
    queryKey: ["demo-status"],
    queryFn: () => apiGet<{ demo: boolean }>("/demo-status"),
    retry: false,
    staleTime: 60000,
  });
  if (!data?.demo) return null;
  return (
    <div role="status" className="relative z-50 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black" data-testid="demo-notice">
      DEMONSTRAÇÃO APOLLO — DADOS FICTÍCIOS · NÃO USE PARA VENDAS REAIS
    </div>
  );
}

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
    <DemoNotice />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/pdv" element={<ProtectedRoute path="/pdv"><Pdv /></ProtectedRoute>} />
      <Route path="/apollo-ia" element={<ProtectedRoute path="/apollo-ia"><ApolloIA /></ProtectedRoute>} />
      <Route path="/mesas" element={<ProtectedRoute path="/mesas"><Mesas /></ProtectedRoute>} />
      <Route path="/comanda-mobile" element={<ProtectedRoute path="/comanda-mobile"><Mesas /></ProtectedRoute>} />
      <Route path="/cozinha" element={<ProtectedRoute path="/cozinha"><Kds /></ProtectedRoute>} />
      <Route path="/delivery" element={<ProtectedRoute path="/delivery"><Delivery /></ProtectedRoute>} />
      <Route path="/caixa" element={<ProtectedRoute path="/caixa"><Caixa /></ProtectedRoute>} />
      <Route path="/vendas" element={<ProtectedRoute path="/vendas"><Vendas /></ProtectedRoute>} />
      <Route path="/fiado" element={<ProtectedRoute path="/fiado"><Fiado /></ProtectedRoute>} />
      <Route path="/config" element={<ProtectedRoute path="/config"><Config /></ProtectedRoute>} />
      <Route path="/impressao" element={<ProtectedRoute path="/impressao"><Impressao /></ProtectedRoute>} />
      <Route path="/clientes" element={<ProtectedRoute path="/clientes"><Pessoas /></ProtectedRoute>} />
      <Route path="/contas-pagar" element={<ProtectedRoute path="/contas-pagar"><Contas /></ProtectedRoute>} />
      <Route path="/contas-receber" element={<ProtectedRoute path="/contas-receber"><Contas /></ProtectedRoute>} />
      <Route path="/categorias-contas" element={<ProtectedRoute path="/categorias-contas"><FinCadastros /></ProtectedRoute>} />
      <Route path="/formas-pagamento" element={<ProtectedRoute path="/formas-pagamento"><FinCadastros /></ProtectedRoute>} />
      <Route path="/fornecedores" element={<ProtectedRoute path="/fornecedores"><Pessoas /></ProtectedRoute>} />
      <Route path="/notas" element={<ProtectedRoute path="/notas"><Notas /></ProtectedRoute>} />
      <Route path="/produtos" element={<ProtectedRoute path="/produtos"><Produtos /></ProtectedRoute>} />
      <Route path="/estoque" element={<ProtectedRoute path="/estoque"><Estoque /></ProtectedRoute>} />
      <Route path="/financeiro" element={<ProtectedRoute path="/financeiro"><Financeiro /></ProtectedRoute>} />
      <Route path="/musica-ao-vivo" element={<ProtectedRoute path="/musica-ao-vivo"><MusicaAoVivo /></ProtectedRoute>} />
      <Route path="/funcionarios" element={<ProtectedRoute path="/funcionarios"><Funcionarios /></ProtectedRoute>} />
      <Route path="/qrcodes" element={<ProtectedRoute path="/qrcodes"><QrCodes /></ProtectedRoute>} />
      <Route path="/cardapio/:tableId" element={<Cardapio />} />
      <Route path="/pedir" element={<PedirDelivery />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
