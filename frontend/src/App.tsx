import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import Login from "@/pages/Login";
import Auditoria from "@/pages/Auditoria";
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
import AppShell from "@/components/AppShell";
import { NAV, homeFor, useMe } from "@/lib/auth";

import { useSessionLock } from "@/lib/session";

function AuthenticatedRoutes() {
  const locked = useSessionLock();
  return locked ? <Navigate to="/login" replace /> : <SessionRoutes />;
}

function SessionRoutes() {
  const { data, isLoading, isError } = useMe();
  const { pathname } = useLocation();
  if (isLoading) return <div role="status" className="p-4">Carregando…</div>;
  if (!data || isError) return <Navigate to="/login" replace />;
  const path = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const item = NAV.find((entry) => entry.to === (path === "/fornecedores" ? "/clientes" : path));
  if (path !== "/" && item && !item.roles.includes(data.role)) return <AppShell roles={item.roles}>{null}</AppShell>;
  return <Outlet key={data.id} />;
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
      <Route path="/login" element={<Login />} />
      <Route path="/cardapio/:tableId" element={<Cardapio />} />
      <Route path="/pedir" element={<PedirDelivery />} />
      <Route element={<AuthenticatedRoutes />}>
        <Route path="/" element={<Home />} />
        <Route path="/pdv" element={<Pdv />} />
        <Route path="/auditoria" element={<Auditoria />} />
        <Route path="/apollo-ia" element={<ApolloIA />} />
        <Route path="/mesas" element={<Mesas />} />
        <Route path="/comanda-mobile" element={<Mesas />} />
        <Route path="/cozinha" element={<Kds />} />
        <Route path="/delivery" element={<Delivery />} />
        <Route path="/caixa" element={<Caixa />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/fiado" element={<Fiado />} />
        <Route path="/config" element={<Config />} />
        <Route path="/impressao" element={<Impressao />} />
        <Route path="/clientes" element={<Pessoas />} />
        <Route path="/contas-pagar" element={<Contas />} />
        <Route path="/contas-receber" element={<Contas />} />
        <Route path="/categorias-contas" element={<FinCadastros />} />
        <Route path="/formas-pagamento" element={<FinCadastros />} />
        <Route path="/fornecedores" element={<Pessoas />} />
        <Route path="/notas" element={<Notas />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/estoque" element={<Estoque />} />
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/musica-ao-vivo" element={<MusicaAoVivo />} />
        <Route path="/funcionarios" element={<Funcionarios />} />
        <Route path="/qrcodes" element={<QrCodes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
