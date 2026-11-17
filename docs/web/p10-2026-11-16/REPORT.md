# Apollo P10 — homologação operacional Web (preparação)

**Estado: NÃO HOMOLOGADA. PRODUÇÃO BLOQUEADA.** Documentação e artefatos neste PR são preparação. Nenhum deploy, acesso à VPS, merge, dados reais ou veredito de aprovação foi executado.

## Base imutável e dependências

- Base exata: PR #24, branch `perf/p9-financial-latency`, HEAD `310948f9c77e62e12593ed502c3c152568686c8c`, aprovado **somente** em desempenho para o escopo P9; PR #24 permanece aberto, draft e sem merge.
- A ancestralidade empilhada inclui P8 (PR #23), P7 (PR #22) e a entrada Web P5 (PR #20); PRs paralelos permanecem não integrados na branch principal. A P10 deve continuar sendo PR empilhado diretamente sobre P9, não contra a default sem resolver dependências.
- Evidência P9: [relatório](../p9-2026-11-16/REPORT.md), [GitHub Actions 43983212080](https://github.com/paulobhzt-tech/Apollo/actions/runs/43983212080), [regressão 43983196839](https://github.com/paulobhzt-tech/Apollo/actions/runs/43983196839). 373 backend + 3 subtestes, 44 P6 reais, 12 P5 e 14 Node aprovados no HEAD testado conforme P9; isso **não** é aceitação operacional Web P10.
- Branch: `homolog/p10-operational-web`. A P10 altera exclusivamente seus próprios arquivos e não relaxa as regras P9.

## Inventário e pontos de atenção levantados por leitura do código

- `frontend/web.html` aponta para `src/web/main.tsx`; `vite.web.config.ts` compila essa entrada para `dist-web/index.html`. A build padrão do `Dockerfile` usa `yarn build` e copia `dist`: **não prova que publica a entrada Web P5**. Foi criado `deploy/p10/Dockerfile.web` específico para homologação sem alterar o Dockerfile atual.
- `backend/server.py` serve arquivos estáticos de `SERVE_FRONTEND_DIR` no mesmo host e expõe `/api/health/ready`. O readiness requer replica set com primary e índices únicos; **não** confundir `/api/` com readiness.
- `frontend/src/web/WebGate.tsx` usa autorização por rota a partir de `NAV`, enquanto `backend/lib/auth.py` impõe autorização no servidor. Falta testar toda a matriz perfil/rota/API com MongoDB real.
- `backend/routers/auth.py` inclui `/auth/first-access` com credenciais iniciais fixas, limitado a endereço loopback da perspectiva ASGI: **não utilizar como método automático de provisionamento público**. Exigir criação inicial segura e troca de senha antes de qualquer publicação externa. Verificar comportamento atrás de proxies antes de liberar.
- `frontend/src/web/WebApp.tsx` já inclui aviso de dados fictícios quando `APOLLO_DEMO_MODE=true`; o aviso **não** impede, sozinho, transações ou integrações reais. Requer checagem explícita de configurações e bloqueios externos.
- `backend/lib/csrf.py` exige origem confiável para mutações cookie-auth; conferir `APP_URL`, `COOKIE_SECURE=true`, reverse proxy e TLS em teste.
- `deploy/homologation/README.md` descreve três instâncias Mongo com volumes/credenciais separadas; isso não comprova implantação. O banco deve suportar transações via replica set, com usuário restrito ao banco `apollo_p10_homolog`.
- `frontend/src/pages/Notas.tsx` declara emissão fiscal simulada; homologação não autoriza transmissão real. Impressão via navegador ainda não prova impressora física.
- P5 registra necessidade de reconciliação após reload com resultado financeiro incerto; validar que nenhuma repetição duplique vendas, e considerar bloqueio operacional se a recuperação não for segura.

## Gates antes de infraestrutura ou link público

1. **Infraestrutura**: inventariar CPU/RAM/disco, portas, usuários, serviços e limites. A VPS HostGator já hospeda outro site; a informação conhecida é 1 vCPU/2 GiB/50 GiB e backups desativados na última observação. Capacidade **não verificada**. Não instalar Docker/Mongo nem usar CPU intensiva ali até diagnóstico e backups testados. Preferir infraestrutura de homologação separada caso não haja folga medida.
2. **Isolamento**: MongoDB exclusivamente de teste e dados fictícios, rede privada/restrita, credenciais e secrets separados, sem conexão com produção, sem adquirente, sem SEFAZ, sem webhooks externos/Drive reais, sem operações offline Web. Verificar por configuração e teste, não por comentário.
3. **Segurança pública**: TLS válido, mesma origem de frontend e API, CORS restrito, cookie HttpOnly Secure, CSRF, autenticação forte, limites de login, autorização efetiva por API, proteção de endpoints públicos, cabeçalhos, proteção de logs, acesso de teste limitado por IP/VPN ou autenticação de perímetro. Um banner DEMO não substitui controles de segurança.
4. **Reversibilidade**: backup e restauração real em destino descartável, versões pinadas, configuração e segredos fora do Git, método de rollback sem afetar o site já hospedado.
5. **Permissão**: sem acesso/mudanças no HostGator/Virtualmin, sem DNS/TLS ou publicação, antes de autorização explícita.

## Roteiro de ensaios com critérios de aceitação

| Área | Ensaio real e evidência exigida | Gate |
|---|---|---|
| Autenticação | login/logout, expiração, PIN/senha, troca inicial, limitação de tentativas, sessão entre abas | 401/403/429 adequados, sem bypass |
| Perfis | admin/caixa/garçom/cozinha em cada tela e rota API | acesso mínimo, não apenas gate frontend |
| Cadastros | produtos, categorias, clientes, funcionários e insumos | leitura/gravação compatíveis com perfis |
| Estoque | criação, baixa, devolução, lotes, snapshots legados/mistos | conciliação com Mongo real |
| PDV | venda fictícia, falha e repetição da mesma client_ref, consulta de resultado incerto | zero duplicação/perda, sem confirmação enganosa |
| Caixa | abertura, recebimento sintético, fechamento, concorrência | movimentos e saldo reconciliados |
| Mesas/delivery | fluxo completo mesa/QR/cozinha/delivery fictício | sem integração real ou dados pessoais |
| Cancelamento/estorno | total/parcial, PIN gerencial, estoque/lotes/fiado | autorização + reversão atômica |
| Relatórios | vendas/financeiro por turno e conciliação | valores consistentes com transações |
| Recuperação | perda de rede, refresh, backend indisponível, Mongo failover, sessão | sem repetir operação incerta |
| Web | Chromium desktop/tablet/mobile, navegação teclado, HTTPS, rede lenta | screenshots/logs e aprovação de testes reais |
| Impressão/dispositivos | diálogo navegador, ticket, comprovante, impressora física | registrar necessidade de homologação em hardware |
| Segurança externa | TLS/CSP/CSRF, endpoints públicos, logs, CORS, ratelimiting | nenhuma vulnerabilidade crítica pendente |
| Capacidade | múltiplos workers/hosts e rede WAN, limites recursos | P9 de runner isolado não substitui este teste |

Guardar caso, ambiente, versão/commit, comandos não sensíveis, resultados, logs redigidos, screenshots e hash dos artefatos. **Não declarar PASSOU** sem evidência coletada. Regressão P9 não vira resultado P10.

## Plano de execução sem alteração de infraestrutura

1. Rodar builds Web e desktop e as suítes existentes num runner isolado. A nova Dockerfile deve servir `dist-web`, e seu `/api/health/ready` deve ser validado com MongoDB real; build não basta.
2. Criar/usar projeto Mongo Atlas de homologação separado, se aprovado, com URI fornecida somente por secret manager e restrições de rede. Não há credenciais neste PR.
3. Testar os fluxos completos em aplicação efêmera com replica set real, medir recursos. Não usar a VPS compartilhada como benchmark.
4. Em seguida, pedir autorização específica para infraestrutura, DNS e exposição HTTPS, com backup/restore demonstrados.
5. Repetir testes E2E após publicação, auditar segurança e rollback.

## Veredito P10

**PENDENTE / NÃO HOMOLOGADA** — código/configuração preparados para revisão; testes com banco real, segurança externa e hardware físico **não executados nesta missão**. Produção bloqueada.