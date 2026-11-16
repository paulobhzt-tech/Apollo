import { lazy, Suspense } from "react";
import { WebBoundary, WebGate, WebToolbar } from "./WebGate";
import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Pdv = lazy(() => import("@/pages/Pdv"));
const Mesas = lazy(() => import("@/pages/Mesas"));
const Kds = lazy(() => import("@/pages/Kds"));
const Delivery = lazy(() => import("@/pages/Delivery"));
const Caixa = lazy(() => import("@/pages/Caixa"));
const Notas = lazy(() => import("@/pages/Notas"));
const Produtos = lazy(() => import("@/pages/Produtos"));
const Estoque = lazy(() => import("@/pages/Estoque"));
const Financeiro = lazy(() => import("@/pages/Financeiro"));
const Funcionarios = lazy(() => import("@/pages/Funcionarios"));
const QrCodes = lazy(() => import("@/pages/QrCodes"));
const Cardapio = lazy(() => import("@/pages/Cardapio"));
const PedirDelivery = lazy(() => import("@/pages/PedirDelivery"));
const Vendas = lazy(() => import("@/pages/Vendas"));
const Fiado = lazy(() => import("@/pages/Fiado"));
const Config = lazy(() => import("@/pages/Config"));
const Impressao = lazy(() => import("@/pages/Impressao"));
const Pessoas = lazy(() => import("@/pages/Pessoas"));
const Contas = lazy(() => import("@/pages/Contas"));
const FinCadastros = lazy(() => import("@/pages/FinCadastros"));
import { homeFor, useMe } from "@/lib/auth";

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
    <WebToolbar /><WebBoundary><WebGate><Suspense fallback={<p role="status" className="p-8">Carregando módulo…</p>}><Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/pdv" element={<Pdv />} />
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
      <Route path="/funcionarios" element={<Funcionarios />} />
      <Route path="/qrcodes" element={<QrCodes />} />
      <Route path="/cardapio/:tableId" element={<Cardapio />} />
      <Route path="/pedir" element={<PedirDelivery />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Suspense></WebGate></WebBoundary>
    </>
  );
}
