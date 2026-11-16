# Apollo P5 — versão web em desenvolvimento

Data: 16/11/2026. **Não homologada; não liberar para produção.** Nenhum merge, deploy ou dado real.

## Base e coordenação

Base escolhida: `fix/p1-transaction-backoff-validation`, SHA `ef3de4a9a5e54c92533551990e9a9f21df9c3d34` (PR #19). Seus 16 checks consultados estavam concluídos com success; isso não elimina os 503 documentados no ensaio prolongado. Branch P5: `feat/p5-professional-web`, PR empilhado sobre #19. Preserva #13–#19 por ancestralidade, sem integrar PRs paralelos.

Foram consultados todos os 15 PRs abertos: #2, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16, #17, #18, #19, incluindo seus arquivos alterados. A atualização final das referências retornou os mesmos HEADs. P2/P3/P4 não apareceram nas pesquisas de issues/PRs por esses identificadores; não é possível afirmar conclusão ou ausência de trabalho fora do GitHub.

#19/#18: contenção/telemetria; #17/#16/#15: integridade/recuperação; #14/#13: segurança; #12: permissões frontend; #11/#10: Drive/backup; #9: reconexão desktop; #8/#6: logout; #7: ações de produto; #2: instalador e evolução paralela. Nada dessas branches foi alterado. App.tsx, AppShell.tsx, auth.ts, desktop/, backend/ e workflows anteriores foram preservados. A entrada web nova evita disputar navegação/layout com #6/#8/#12. Pdv.tsx tem ajustes restritos a contingência/identidade web, sem reformular itens do #7. offline.ts/SyncPanel estendem a base herdada; podem exigir conciliação com #9 antes de futura integração. Não se detectou alteração dos HEADs durante esta execução.

## Arquitetura

`web.html → src/web/main.tsx → WebApp → WebGate → páginas compartilhadas → /api → FastAPI → MongoDB replica set`.

React 19, TypeScript, Tailwind e Vite existentes; mesmo backend e mesmos contratos. A entrada Electron `index.html/main.tsx/App.tsx` continua independente. `vite.web.config.ts` gera `dist-web/index.html`; não substitui `dist/`. Dev faz fallback explícito para web.html, inclusive em reload de URLs protegidas. Em hospedagem de homologação é obrigatório encaminhar rotas SPA para dist-web/index.html e /api ao FastAPI na mesma origem.

WebGate valida sessão/perfil antes de montar as páginas; backend mantém a autoridade sobre autorização, estoque, totais, pagamentos e transações. WebApp carrega páginas sob demanda; há fallback de carregamento, erro de módulo, link de salto, foco visível, toque e redução de animações. Toolbar identifica homologação e mantém troca de operador acessível. Ainda há dois manifests de rotas (legado e web); consolidar depois da conciliação do #12, sem duplicar regras financeiras.

## Inventário e disponibilidade

Todas as telas abaixo já existiam. Foram conectadas à entrada web e ao gate; **conectada não significa fluxo homologado**.

| Requisito | Implementação existente reutilizada | Situação P5 |
|---|---|---|
| Login | Login.tsx, /auth/* | Cookie existente; conferência visual do formulário |
| Dashboard | Dashboard.tsx | Rota privada; gráficos carregados sob demanda |
| Frente de caixa | Pdv.tsx | Online; fila web bloqueada; retry mantém client_ref na mesma tela |
| Vendas | Vendas.tsx | Histórico existente; integração pendente |
| Produtos | Produtos.tsx | Admin; gate impede montagem por caixa |
| Categorias | Produtos.tsx | Cadastro integrado a produtos; não há novo módulo paralelo |
| Estoque | Estoque.tsx | Permissões existentes; integração pendente |
| Clientes | Pessoas.tsx | Cadastro compartilhado |
| Fiado | Fiado.tsx | APIs transacionais existentes; homologação web pendente |
| Mesas | Mesas.tsx | Tela existente |
| Comandas | Mesas.tsx, /comanda-mobile | Rota existente, sem segundo motor de pedidos |
| Pedidos QR | Cardapio.tsx, QrCodes.tsx | Cardápio público e gestão privada preservados |
| Delivery | Delivery.tsx, PedirDelivery.tsx | Gestão privada e pedido público existentes |
| Pagamentos | PaymentDialog.tsx | Contratos financeiros existentes |
| Cancelamentos | Vendas/Mesas, RemoveItemDialog | Controles existentes; integração web pendente |
| Estornos | Vendas/Mesas | Backend existente; sem lógica financeira nova |
| Abertura de caixa | Caixa.tsx | Existente; não homologado no navegador |
| Fechamento de caixa | Caixa.tsx | Existente; concorrência depende do backend |
| Relatórios | Dashboard/Financeiro/Vendas | Telas existentes, sem novo gerador |
| Configurações | Config.tsx | Admin; módulos desktop continuam condicionais |

## Segurança

Verificados no código herdado: sessão em cookie HttpOnly, Secure por padrão, SameSite=Lax; nenhum bearer token novo em localStorage; autorização backend por perfil; limite de login/PIN; CSRF por Origin/Fetch Metadata; CORS sem wildcard credenciado; validação Pydantic e transações/replay no servidor. 221 testes isolados de autenticação, autorização, CSRF, caminhos e métricas passaram localmente. Não constituem teste de penetração.

Os nomes/IDs lembrados no login são preferências existentes, não credenciais. Cookie Secure não obriga o servidor a rejeitar HTTP: terminação HTTPS, redirecionamento e cabeçalhos devem ser configurados e testados antes de liberar homologação externa. Não foi alterada a infraestrutura. Revisão completa de XSS/CSP, rate limiting de tráfego público, isolamento de estabelecimentos, logs operacionais e expiração entre abas permanece pendente. A branch paralela do instalador contém evolução independente que exige conciliação explícita; não presumir suas correções presentes nesta base.

## Online/offline e recuperação

Navegador: enqueue, replay, modo forçado, cache novo de menu, retry e descarte da fila ficam desabilitados. Filas antigas permanecem intactas para conciliação assistida. SyncPanel explica o limite e o botão legado de contingência fica oculto na entrada web. Nenhum service worker/PWA novo foi instalado.

Em falha de rede, PDV web não confirma venda nem limpa carrinho; orienta consultar histórico. Repetição com payload idêntico na mesma montagem reaproveita client_ref. Payload diferente é bloqueado enquanto o resultado permanece incerto. **A referência não é persistida após reload/fechamento; conciliação assistida continua necessária.** Isso não certifica recuperação financeira web. Desktop preserva sua fila e comportamento anteriores, cobertos pelas seis regressões existentes; Windows/múltiplas janelas não foram homologados aqui.

## Impressão

Reutiliza receipt.ts/printTicket.ts: comprovantes e tickets via diálogo/iframe do navegador; relatórios/fechamento dependem das telas existentes. Impressão silenciosa, escolha por nome de dispositivo e integração térmica local continuam via bridge Electron. Sem acesso USB direto. Um diálogo fechado não prova impressão física nem exatamente uma cópia; printHtml legado não fornece confirmação física. Testes de impressão real, cancelamento do diálogo, paginação e todas as larguras de papel permanecem pendentes.

## Execução local de homologação

```sh
cd frontend
npm install --ignore-scripts --package-lock=false
npm run typecheck
npx vite --config vite.web.config.ts
# http://127.0.0.1:3001/login — /api encaminha a 127.0.0.1:8001
npx vite build --config vite.web.config.ts
```

Backend: usar somente réplica MongoDB descartável e DB_NAME exclusivo; seguir deploy/homologation/README.md e backend/tools/run_replica_tests.py. Para desenvolvimento HTTP loopback, COOKIE_SECURE=false apenas no ambiente de testes; jamais em produção. Não apontar este frontend ao servidor real. Para servir o build por FastAPI, SERVE_FRONTEND_DIR deve ser caminho absoluto de dist-web; mesma origem para API e cookies, TLS obrigatório fora de loopback.

```sh
node --experimental-vm-modules --test frontend/tests/offline-queue.test.mjs
cd tests
npm install --ignore-scripts --package-lock=false
npx playwright install chromium
npx playwright test --config p5.playwright.config.ts
```

P5_BASE_URL permite escolher servidor de testes; P5_CHROMIUM é opcional para Chromium de sistema. O workflow novo p5-web.yml instala Chromium e executa 12 cenários UI com respostas sintéticas em desktop/tablet/mobile. Os workflows financeiros herdados continuam executando réplica real. Não confundir mocks de interface com homologação financeira.

## Validação e limites

- Typecheck, build legado, build web, lint e sintaxe Electron aprovados. Nove avisos lint existentes; duas advertências CSS existentes e alerta de bundle legado grande.
- Sete regressões offline aprovadas, incluindo bloqueio web e preservação de fila antiga.
- 221 testes backend isolados aprovados (test_auth_security, test_csrf_origin, test_role_permissions, test_frontend_paths, test_transaction_metrics).
- Playwright local: 12 falhas de infraestrutura antes da abertura do browser; Chromium aborta com `socket() failed: Operation not permitted`. Nenhuma dessas falhas conta como aprovação/reprovação funcional. Relatório original em evidence/playwright-blocked.json.
- MongoDB 7.0.16 oficial baixado; inicialização recusada por `open: Operation not permitted`, registrada em evidence/mongo-blocked.log. Integração financeira, concorrência e recuperação com réplica real **não executadas nesta missão**. Evidências anteriores não substituem revalidação.
- Navegador de revisão abriu /login, título Apollo PDV · Web e formulário visível; conferência visual desktop apenas. Sem autenticar, sem criar transação. Captura desktop em evidence/login-desktop.jpg. Capturas automatizadas de 390/820/1440 px serão artefatos do workflow, quando aprovado.
- Não medidos: p50/p95/p99 web/API, carregamento em rede lenta, memória, recursos do servidor, concorrência de operadores e impressão. Backend #19 ainda registra 503 em soak; bloqueio crítico permanece.

## Desempenho de build

Mesma instalação e host: build legado eager ≈1.267 kB JS (≈368 kB gzip); entrada web ≈242 kB JS (≈78 kB gzip). Página Dashboard é chunk separado ≈415 kB. Esses números são tamanho de arquivos, não tempo de carregamento nem total transferido. CSS/fontes e chunks compartilhados também são carregados; não alegar redução equivalente de latência. Builds sem lockfile não são reprodutíveis byte a byte; a execução resolveu Vite 8.3.8 pela faixa existente. Não houve alteração de dependências.

## Critério de saída

Entrega é uma base web funcional para desenvolvimento e revisão, com controles adicionais, **não homologação dos 20 módulos**. Antes de aceitar: aprovar CI web e testar fluxos completos com API/Mongo reais, concorrência e recuperação, matriz de autorização, impressão, dispositivos e navegadores compatíveis; resolver capacidade #19; conciliar PRs paralelos e P2/P3/P4; medir desempenho real. Sem isso a liberação permanece bloqueada.

## Publicação

PR em rascunho: https://github.com/paulobhzt-tech/Apollo/pull/20. Quatro commits de implementação/CI mais este registro visual/documental. Publicação via API GitHub com comparação dos SHAs de árvore local/remoto; hashes de commit diferem por metadados. Workflow P5 acionado no HEAD funcional `7fffdb2dc86ccb3d11d85df67932e826599f04a3`: https://github.com/paulobhzt-tech/Apollo/actions/runs/43896171908 (em execução na última consulta). Nenhuma aprovação remota dos 12 cenários é alegada neste registro.
