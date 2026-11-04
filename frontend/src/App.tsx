import { Routes, Route, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
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
import Funcionarios from "@/pages/Funcionarios";
import QrCodes from "@/pages/QrCodes";
import Cardapio from "@/pages/Cardapio";
import PedirDelivery from "@/pages/PedirDelivery";
import Vendas from "@/pages/Vendas";
import Fiado from "@/pages/Fiado";
import { homeFor, useMe } from "@/lib/auth";

function Home() {
  const { data: me, isLoading, isError } = useMe();
  if (isLoading) return null;
  if (isError || !me) return <Navigate to="/login" replace />;
  return me.role === "admin" || me.role === "caixa" ? <Dashboard /> : <Navigate to={homeFor(me.role)} replace />;
}

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/pdv" element={<Pdv />} />
      <Route path="/mesas" element={<Mesas />} />
      <Route path="/cozinha" element={<Kds />} />
      <Route path="/delivery" element={<Delivery />} />
      <Route path="/caixa" element={<Caixa />} />
      <Route path="/vendas" element={<Vendas />} />
      <Route path="/fiado" element={<Fiado />} />
      <Route path="/notas" element={<Notas />} />
      <Route path="/produtos" element={<Produtos />} />
      <Route path="/estoque" element={<Estoque />} />
      <Route path="/financeiro" element={<Financeiro />} />
      <Route path="/funcionarios" element={<Funcionarios />} />
      <Route path="/qrcodes" element={<QrCodes />} />
      <Route path="/cardapio/:tableId" element={<Cardapio />} />
      <Route path="/pedir" element={<PedirDelivery />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
