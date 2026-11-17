import { Component, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { NAV, homeFor, useMe } from '@/lib/auth';
import { endSession } from '@/lib/session';

export function WebToolbar() {
  const { pathname } = useLocation();
  return <><a className="web-skip" href="#web-content">Ir para o conteúdo</a>
    <div className="web-toolbar" role="region" aria-label="Estado da versão web">
      <span>Apollo Web · Homologação · Operação online</span>
      {pathname !== '/login' && !pathname.startsWith('/cardapio/') && pathname !== '/pedir' &&
        <button type="button" onClick={() => void endSession()}>Trocar operador</button>}
    </div></>;
}

export function WebGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { data: me, isPending, isError, refetch } = useMe();
  const publicPage = pathname === '/login' || pathname === '/pedir' || pathname.startsWith('/cardapio/');
  if (publicPage) return <div id="web-content" tabIndex={-1}>{children}</div>;
  if (isPending) return <p role="status" className="p-8">Verificando sessão…</p>;
  if (isError || !me) return <div role="alert" className="p-8"><p>Não foi possível validar sua sessão.</p>
    <button type="button" onClick={() => void refetch()}>Tentar novamente</button> · <Link to="/login">Entrar</Link></div>;
  const route = NAV.find(n => n.to === (pathname === '/fornecedores' ? '/clientes' : pathname));
  if (!route) return <Navigate to={homeFor(me.role)} replace />;
  if (!route.roles.includes(me.role)) return <div role="alert" className="p-8"><h1>Acesso restrito</h1>
    <p>Seu perfil não tem acesso a esta tela.</p><Link to={homeFor(me.role)}>Ir para minha tela</Link></div>;
  // Children are not mounted until the session and route permission are validated.
  return <div id="web-content" tabIndex={-1}>{children}</div>;
}

export class WebBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="p-8"><h1>Não foi possível abrir o módulo.</h1>
      <p>Se houve uma operação financeira, consulte o histórico antes de tentar novamente.</p>
      <button type="button" onClick={() => window.location.reload()}>Recarregar interface</button></div>;
    return this.props.children;
  }
}
