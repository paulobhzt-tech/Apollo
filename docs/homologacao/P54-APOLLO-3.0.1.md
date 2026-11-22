# Apollo PDV 3.0.1 — P54

**P54 BLOQUEADA PARA LIBERAÇÃO OPERACIONAL.**

Em 22 de novembro de 2026, o remoto da P53 confirmou `af44229d7103502eca7c6cfd452b656a44bada39`. A branch `audit/p54-offline-integral-vps-validacao-final` partiu desse commit. Entre o código P53 `0bbb1e8e123e3462fae0611d9f1b914ad26d804c` e o SHA final P53, o único arquivo alterado é o relatório P53. A suíte ampliada passou antes e depois da proteção de pagamentos. O código final é `09aa9be42a67aa5c50fa897706b9574c5779f528`, que acrescenta a proteção de pagamentos da fila legada e o teste correspondente.

## Implementação

- Caixa ou administrador prepara online um cofre exclusivo do perfil do navegador. A API usa uma sessão normal, limita a validade local a oito horas ou ao vencimento original da sessão, e entrega apenas identificação do operador, catálogo elegível e mapa resumido de mesas. O cofre em IndexedDB usa PBKDF2-SHA-256 com 600 mil iterações e AES-GCM com IV aleatório. A senha local é independente e a chave fica em memória durante a abertura do cofre.
- A rota `/mesas-offline` faz parte do shell público. Com o cofre previamente preparado, o operador pode abrir a tela após desligamento real de HTTPS, consultar o mapa salvo e registrar produtos, quantidades e observações em novas mesas ou comandas. A preparação local não emite sessão de API. Troca de operador, logout e respostas de autorização reconhecidas bloqueiam a abertura offline. A política offline depende do relógio do dispositivo e de revogações já observadas. O isolamento do dispositivo corresponde ao armazenamento do perfil do navegador.
- Cada pedido recebe uma referência antes do envio. A API exige sessão online, role de caixa ou administrador, identidade de sincronização correspondente e banco com transações. Uma transação cria mesa, atendimento, itens, ticket, baixa e recibo de idempotência. A repetição de referência e conteúdo devolve o recibo; colisão de números, preços alterados e referências com conteúdo divergente geram conflito. A fila preserva conflitos para revisão e a restauração inclui os recibos.
- O operador inicia o envio após reconectar. O cofre preserva rascunhos em caso de falha de transporte, conserva as referências até confirmação e só permite apagar o cofre vazio após validar online o operador do cofre. O cofre não recebe pagamentos. A contingência legada de balcão aceita apenas dinheiro para finalização offline. Tentativas de outros meios com resposta inconclusiva e registros legados são preservados para conferência, sem reenvio automático ou manual pela fila.
- A matriz mantém as asserções estritas da P53. A P54 adiciona evidência de uma consulta direta sem cache antes da navegação e registra a exceção de navegação para os casos em que o navegador aborta. O teste adicional do cofre usa um proxy HTTPS descartável que é desligado e religado no mesmo endereço.

## Evidências

| Execução | Ambiente e resultado |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `vitest run` | 58 testes passaram, incluindo reenvio de dinheiro com segregação de PIX para revisão. Lint terminou com avisos existentes e typecheck passou. |
| `npm run build`, `node scripts/verify-build.mjs`, com SHA esperado | Build final local e no CI com 37 arquivos verificados. O CI também executou validações negativas. [Artefato do código final](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856996/artifacts/14765881406) |
| `playwright test --config=p47.config.ts p54-offline-tables.spec.ts` | Chromium local com MongoDB 7 em réplica e HTTPS em loopback. A revisão `62b12cc` passou por desligamento real, reinício do navegador, senha errada, expiração simulada, gravação de uma mesa e uma comanda, conciliação, repetição concorrente, conflito de preço, isolamento por operador e limpeza do cofre vazio. |
| `playwright test --config=p47.config.ts p47-browser.spec.ts p48-offline-interruption.spec.ts` | Na revisão `62b12cc`, Firefox local repetiu a falha de emulação e passou com desligamento real. Chromium passou nos dois métodos. |
| Regressões, transações, frontend, Electron, restauração, recuperação de administrador e integração da fila de impressão | O primeiro CI encontrou acesso indevido a `request.state` em um chamador de autenticação. O reteste após a correção passou os cinco jobs no commit final. [Bateria de testes final](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856986) |
| Segurança e compilação | Passou no commit final. [Execução](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856982) |
| Matriz de seis perfis | Código final com 28/30 na matriz histórica e 6/6 no novo ensaio do cofre. [Execução final](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856962) |
| Aceitação isolada Web/PWA | Passou no código final. Incluiu integração HTTP e Chromium, dois caixas conciliados, carga, recuperação, restauração, rollback de processo e benchmark. [Execução](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856942) · [Artefato](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856942/artifacts/14765827696) |
| `npm audit --audit-level=moderate --json` | Zero vulnerabilidades informadas no frontend. |

O grupo local de réplica passou com 420 testes, dois skips e três subtestes na primeira revisão P54. Uma rodada posterior esgotou o espaço do executor local e derrubou o MongoDB descartável. Os resultados dessa rodada local afetada ficam fora dos números de aprovação. O CI com runners independentes executou o reteste de `a2d13f9`. Nenhum resultado P53 foi contado como P54.

### Diagnóstico de navegador

Na primeira execução P54, os seis perfis passaram no teste novo do cofre e no desligamento real. Os cinco cenários da matriz histórica somaram 28/30. A única falha de Firefox e de WebKit naquela execução foi na emulação. No reteste local de Firefox a consulta direta de API falhou com `navigator.onLine=false`, enquanto a navegação retornou HTTP 200 sem o cabeçalho de fallback. Em WebKit no CI a navegação emulada abortou com erro interno antes de produzir resposta. O Playwright usa `Browser.setOnlineOverride` em Firefox e `Network.setEmulateOfflineState` em WebKit. Os resultados separam o comportamento desses mecanismos da indisponibilidade real de HTTPS. As asserções continuam em vigor.

Em `a2d13f9`, a matriz histórica repetiu **28/30** e o desligamento real passou **6/6**. O cofre passou em cinco perfis na primeira tentativa. Chromium esgotou os cinco segundos de espera pelo controle do Service Worker na primeira tentativa e passou na repetição do mesmo job, com as mesmas asserções. A P54 preserva a falha inicial e o resultado do reteste. [Chromium, tentativa 1](https://github.com/paulobhzt-tech/Apollo/actions/runs/45050800453/artifacts/14765910715) · [Chromium, tentativa 2](https://github.com/paulobhzt-tech/Apollo/actions/runs/45050800453/artifacts/14765956498) · [Firefox](https://github.com/paulobhzt-tech/Apollo/actions/runs/45050800453/artifacts/14765492383) · [WebKit](https://github.com/paulobhzt-tech/Apollo/actions/runs/45050800453/artifacts/14765825652) [Primeira execução P54](https://github.com/paulobhzt-tech/Apollo/actions/runs/45050583140)

| Perfil | Matriz histórica | Cofre com HTTPS desligado | Artefato final |
| --- | ---: | ---: | --- |
| Chromium | 5/5 | 1/1 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856962/artifacts/14765767886) |
| Google Chrome | 5/5 | 1/1 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856962/artifacts/14765532524) |
| Microsoft Edge | 5/5 | 1/1 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856962/artifacts/14766241504) |
| Firefox | 4/5 | 1/1 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856962/artifacts/14766326164) |
| Android emulado | 5/5 | 1/1 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856962/artifacts/14766271467) |
| WebKit com perfil iPhone | 4/5 | 1/1 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45051856962/artifacts/14765977498) |

No commit final, o cenário integrado de 25 vendas concorrentes e 25 reenvios, com o garçom offline, passou em todos os perfis. Os dois caixas fecharam com diferença de R$ 0,00. O ensaio verificou estoque fracionário e baixa única do pedido recuperado. O processo de teste usa navegador real no runner Linux, com Android e iPhone emulados.

## VPS e pendências

**VPS NÃO VALIDADA.** A consulta pública de leitura voltou a encontrar `apollo-public-v2` e HTTP 200 com HTML em `/build-integrity.json`. O manifesto Web público coincidiu com o build P54. Os hashes do Service Worker, do CSS e do JavaScript públicos divergiram do manifesto local. Sem acesso administrativo autorizado, o SHA instalado e o isolamento de Apache, MongoDB, credenciais, serviços, volumes e filas permanecem sem comprovação. A recuperação do ambiente descartável cobre o processo da aplicação. A reversão da VPS e a restauração de um backup anterior à coleção de recibos com uma fila P54 ainda pendente requerem validação. Um recibo preservado de um pedido removido por esse tipo de restauração pode exigir conferência manual.

- A entrada offline cobre novas mesas e comandas com pelo menos um item, catálogo reduzido e um operador de caixa ou administrador por perfil. Pagamentos eletrônicos, operações de caixa offline, alterações de atendimentos existentes após reinício, impressoras físicas, testes em dispositivos reais e auditoria da VPS continuam fora da validação concluída.
- Conflitos permanecem na fila para revisão. A edição e reemissão guiadas do conflito e o envio automático ao restabelecer internet continuam pendentes. O backend exige a identidade original e revalida preços e estoque no envio. A fila legada de balcão permanece no armazenamento anterior do navegador.
- A validade usa o relógio do cliente e o bloqueio conhecido depende do armazenamento local íntegro. A revogação remota durante isolamento físico só pode ser confirmada na reconexão. A aprovação operacional permanece pendente.

## Commits e arquivos alterados

- `41c37c9` implementação do cofre, endpoint transacional, ensaio HTTPS e acionamento de CI.
- `62b12cc` expiração, limpeza do cofre, isolamento e diagnóstico da emulação.
- `a2d13f9` separação da validade da sessão para preservar a recuperação administrativa.
- `09aa9be` segregação de pagamentos não confirmados e regressão da fila.
- Workflows `.github/workflows/p48-browsers.yml`, `p48-integrity.yml` e `p48-web-audit.yml`.
- Backend `backend/lib/auth.py`, `backend/routers/config.py` e `backend/routers/tables.py`.
- Frontend `frontend/public/sw.js`, `frontend/src/App.tsx`, `frontend/src/lib/auth.ts`, `frontend/src/lib/session.ts`, `frontend/src/lib/offline-table-vault.ts`, `frontend/src/pages/Login.tsx`, `frontend/src/pages/Mesas.tsx` e `frontend/src/pages/OfflineTables.tsx`, `frontend/src/pages/Pdv.tsx`, `frontend/src/lib/offline.ts` e `frontend/src/lib/offline.test.ts`.
- Testes `tests/e2e/p47-browser.spec.ts` e `tests/e2e/p54-offline-tables.spec.ts`.
- Relatório `docs/homologacao/P54-APOLLO-3.0.1.md`.

Não houve alteração em produção, acesso a vendas reais, merge, migração ou deploy.
