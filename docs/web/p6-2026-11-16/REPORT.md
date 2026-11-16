# Apollo P6 — homologação financeira e estabilidade web

**REPROVADO PARA PRODUÇÃO.** Escopo: ambiente descartável, produtos/usuários/clientes fictícios. Sem merge, deploy ou acesso à produção.

## Base e coordenação

PR #20 confirmado em `70905439235a5b298156f50ad29d72d91a5f1053`; 18 checks consultados aprovados. Relatório P5, inventário e 12 testes Playwright existentes revisados e preservados. PR #19 permanece em `ef3de4a9a5e54c92533551990e9a9f21df9c3d34`, com falha de capacidade documentada. Todos os 16 PRs abertos foram consultados; nenhuma outra branch foi alterada.

Branch exclusiva `test/p6-web-financial-validation`; [PR #21 em rascunho](https://github.com/paulobhzt-tech/Apollo/pull/21), empilhado sobre #20. Não modifica Electron, bridge de dispositivos, banco de produção, política de retry, write concern ou unidade financeira. P6 acrescenta somente uma consulta autenticada de conciliação no backend existente.

## Correções e fronteiras de recuperação

1. **Identidade perdida em reload/fechamento.** P5 mantinha o payload/client_ref somente em useRef. A P6 persiste antes do envio apenas UUID opaco e timestamp. Nenhum carrinho, token, valor, modalidade, cliente, CPF ou senha é salvo pelo mecanismo. Web Locks serializa a finalização entre abas da mesma origem; falta de suporte, quota ou JSON corrompido bloqueia envio. A chave global também impede que troca de operador abandone uma operação pendente.
2. **Pagamento incerto não é reenviado.** Toda falha mantém a referência e bloqueia outra venda. Não há fila de venda offline ou replay automático. O operador pode apenas consultar GET /api/pdv/operations/{reference}; caixa/admin têm acesso conforme a política existente de consulta de vendas. Snapshot/majority verifica marcador confirmado, referência, versão atômica e pedido pago/cancelado. A consulta não toca caixa, pagamento, estoque ou impressão. Ausência retorna needs_review, nunca “falhou”.
3. **Conciliação confirmada limpa rascunho.** A confirmação limpa a referência e o carrinho, inclusive nas outras abas que recebem o evento de remoção. Isso evita que o carrinho de uma operação já confirmada vire nova intenção. Não reimprime automaticamente.
4. **Troca de operador em abas.** Login/logout sinalizam uma fronteira de sessão sem tokens; outras abas limpam cache e retornam ao login. O servidor continua validando cookie, expiração, funcionário ativo e perfil em cada request. O bloqueio visual não substitui RBAC.
5. **ACK de impressão incorreto.** P5 capturava exceção de print() e resolvia a Promise; a Central podia marcar o ticket como impresso. A regressão falha na base (“Missing expected rejection”) e passa após a correção. No navegador, falha rejeita a operação, automático permanece desligado e confirmação manual do papel é exigida antes de marcar o ticket. Reimpressão confirmada exige aviso adicional. O caminho Electron permanece igual.

A solução é conservadora: referência sem marcador pode bloquear indefinidamente, inclusive após erro 4xx ou perda antes do envio. Não existe liberação automática segura baseada em ausência de registro. Conciliação assistida exige parar as abas/dispositivo, confirmar término das requisições e inspecionar marcador, pedidos, estoque e caixa antes de qualquer intervenção. Não apagar a chave nem repetir pagamento com nova referência por tentativa. Perda deliberada do armazenamento, outro navegador/perfil/dispositivo e XSS não são resolvidos por Web Locks; não há garantia global de identidade de intenção entre dispositivos.

## Ambiente real e isolamento

MongoDB oficial 7.0.16, réplica de um membro, bind 127.0.0.1, diretório temporário e processos finalizados pelo auxiliar. `--nounixsocket` permitiu executar os testes Mongo locais que antes falhavam na inicialização. FastAPI real e frontend Vite existentes; fixture usa schemas, índices e ensure_finance_defaults/ensure_environments reais. Banco exclusivo `apollo_p6_web`, nomes p6-* e cliente fictício. Nenhuma rota HTTP de reset/failpoint foi criada: controle de dados e failpoints ocorre por subprocesso local guardado por URL/banco de teste.

Testes de browser usam HTTP loopback com COOKIE_SECURE=false somente no processo descartável. Um segundo FastAPI HTTPS usa certificado temporário com SAN 127.0.0.1, verificado pelo cliente, sem desativar validação TLS. Secure/HttpOnly/SameSite, sessão HTTPS, CSRF entre esquemas e CORS hostil foram assertados; resultado em evidence/tls-security.json. Certificado/chave não entram no Git.

A fixture usa bcrypt custo 4 para reduzir preparação de UI; a carga usa custo 12. Portanto o tempo de login da fixture não representa desempenho de autenticação de produção.

## Validação e rastreabilidade

- Local: 63 testes reais P0/P1/contenção aprovados; 4 novos testes reais de conciliação aprovados, incluindo timeout de entrega da resposta após commit real (sem repetir o pagamento). Testes incluem falhas antes/depois de commit, commit desconhecido, rollback, processo morto, estornos/cancelamentos, caixa e estoque concorrentes.
- 14 regressões Node (7 offline herdadas, 5 recuperação, 2 impressão) aprovadas. Teste de impressão contra a base: 1 falha esperada e 1 aprovado, preservados em evidence/print-before.txt.
- Typecheck, lint, build web e build desktop aprovados localmente; nove avisos lint e avisos CSS/bundle herdados. Nenhum teste existente removido ou desabilitado.
- CI intermediário 43899772030: **354 testes backend (incluindo integrações financeiras reais e testes isolados) +3 subtestes**, 12 P5 Playwright e 14 Node aprovados. O novo fluxo UI falhou porque o reset da fixture apagava as formas de pagamento. Isso foi corrigido reutilizando a inicialização real do app. A falha foi preservada, sem classificá-la como aprovação financeira. Na execução 43900746356, quatro cenários reais passaram; o quinto reproduziu um modal de pagamento cobrindo a conciliação. A correção fecha apenas o diálogo web em erro e mantém carrinho/referência; correção aprovada na suíte final de 44 cenários.
- **Suíte P6 aprovada no CI 43901788525: 44/44, zero skips e zero flaky**, no HEAD funcional 220cc0185c148b8a6e0ecb081ded8b6f4e0c89bb. São 11 cenários em 4 resoluções (1440x900, 1366x768, 820x1180, 390x844), sem mocks financeiros. Inclui abertura/fechamento, quantidade/desconto admin, dinheiro/fiado, confirmação em Mongo, perda de resposta depois do commit, reload/fechamento, duas abas, duplo clique e 10 replays concorrentes, falha permanente antes de commit, commit desconhecido, cookie/CSRF/RBAC/expiração/logout e cancelamento de confirmação de impressão.
- Artefatos contêm capturas por cenário, snapshots do Mongo, observações de status/TTFB da API e Navigation Timing da interface. Tempos da API, navegação e cenário completo são distintos; não derivar p95 comercial do tamanho de bundle.
- Chromium local não iniciou (socket Operation not permitted). Browser automatizado foi executado no GitHub Actions. Artefato: https://github.com/paulobhzt-tech/Apollo/actions/runs/43901788525/artifacts/14246330137 . Não houve teste em aparelhos físicos, Firefox, Safari ou Windows real nesta missão.

## Benchmarks pareados

Mesma máquina, Mongo temporário limpo por execução, mesmo dataset/índices, um processo FastAPI, bcrypt 12, conexões HTTP persistentes, 50 contas distintas. Ordem: P5 primeiro, P6 depois; uma execução por versão. 5/10/20/30/50 operadores, 15 s por etapa, completando 300 s com 50 operadores. Tempo observado total: 301,81 s antes e 302,35 s depois. Lotes são cobertos pelas integrações dedicadas, não pelo dataset deste benchmark. Não é ensaio de 30 minutos nem teste de múltiplos hosts.

Não houve otimização da política transacional. Os quantis abaixo agrupam requests POST de venda/cancelamento; throughput refere-se a requests, não a vendas novas. O harness herdado exercita replays com a mesma referência (nunca gera outra intenção para o retry); não representa replay automático da interface P6. A distribuição de latência de um par completo venda+cancelamento não foi medida separadamente. Carga de UI com 50 browsers não foi executada.

| Etapa | P5 p50/p95/p99 (ms) | P6 p50/p95/p99 (ms) | P5/P6 req/s | Erros P5/P6 |
|---|---|---|---|---|
| 5 | 10.76/41.8/1685.85 | 9.85/41.87/994.72 | 85.55/96.83 | 0/0 |
| 10 | 11.79/442.59/3300.65 | 10.34/287.41/3148.05 | 78.0/90.8 | 0/0 |
| 20 | 12.75/1923.96/4628.82 | 11.63/1867.29/4268.73 | 69.66/74.6 | 0/0 |
| 30 | 15.0/3348.14/7482.78 | 14.44/3189.84/6926.43 | 54.83/59.61 | 0/0 |
| 50 | 23.44/6089.36/12870.81 | 18.67/5603.53/10061.28 | 37.26/44.09 | 0/0 |
| 50 (soak) | 22.56/7233.52/13913.12 | 23.63/7191.06/14358.57 | 43.11/41.88 | 1/1 |

Soak final: 1 HTTP 503 em cada versão (0,0105% e 0,0107% dos requests), p95 ≈7,2 s e p99 ≈14 s. Não há melhoria de capacidade comprovada. Telemetria registrou WriteConflict 112, dezenas de milhares de ocorrências, e uma unidade transacional falha em cada execução. Ensaio diagnóstico adicional de 60 s, separado da comparação: o último snapshot registrou 10.625 conflitos em findAndModify:counters e 2.239 em update:cash_sessions, sem falha de checkout de pool observada (máximo 44 conexões em uso). Erros 251 de abort são consequência de transações já abortadas; não representam novos pagamentos. Os 503 pareados esgotaram ~30 s após 105/108 tentativas de callback; portanto não foi erro de impressão ou falta de token. Contadores são amostrados, não um inventário exaustivo de todos os comandos. Backend RSS máximo ≈81,5 MiB; Mongo ≈290 MiB. CPU e recursos completos constam dos JSON comprimidos, sem alegação de SLA.

Integridade: P5 7.362 pedidos/7.362 marcadores/14.724 movimentos; P6 7.556/7.556/15.112. Em ambos o estoque retornou a 1.000, nenhum pedido pago remanescente e zero referências duplicadas. O harness concluiu replays idempotentes; isso não elimina a resposta 503 nem o risco operacional de latência. Dados completos em evidence/load-before.json.gz, load-after.json.gz e benchmark-summary.json.

## Matriz de homologação

A matriz separada MATRIX.md distingue backend comprovado, browser aprovado no cenário e funcionalidades não homologadas. Mesmo um cenário aprovado representa apenas o cenário/dataset descritos, não certificação integral do módulo.

## Execução

```sh
# Usar somente Python/Node de teste e Mongo oficial instalado.
export MONGOD_BIN=/caminho/para/mongod
python backend/tools/run_p6_web.py
# Opcional: --tls-only; --serve mantém serviços fictícios para revisão local.
# P6_CHROMIUM aponta para Chromium local, se permitido; no CI usa Playwright.
cd backend
python tools/run_replica_tests.py --http -q tests
cd ..
node --experimental-vm-modules --test frontend/tests/*.test.mjs
```

Instalação e comandos completos estão em .github/workflows/p6-web-real.yml. A réplica de integração usa 27027, UI 27028/8001/3001/8443 e carga 27029/8002, sempre loopback. O auxiliar encerra processos e remove o banco temporário. Não apontar as variáveis para produção.

Para reproduzir a comparação: criar checkout isolado da árvore P5, definir P6_BASELINE_ROOT para ele e executar `python backend/tools/run_p6_load.py`. P6_LOAD_SECONDS controla o orçamento total por execução; padrão 300. As saídas incluem recursos e integridade. Não comparar com resultados de outra máquina como se fossem o mesmo ensaio.

## Pendências que impedem produção

HTTP 503 reproduzido e latência alta; soak de maior duração e carga distribuída; liberação assistida/auditável de intenções sem confirmação; operação entre dispositivos e perda do storage; impressão térmica física, falhas de spooler e garantia de cópias; aparelhos/navegadores reais; auditoria XSS/CSP/tenant/rate limit completa; enforcement HTTPS no deployment externo; teste comercial completo de mesas/QR/delivery/estornos/relatórios no browser. Nenhuma venda offline/PWA foi habilitada. Emissão fiscal e PIX dinâmico continuam simulados pelos módulos existentes; os testes comprovam persistência interna, não liquidação bancária nem SEFAZ.

## Evidências finais e leitura

44 snapshots financeiros completos: evidence/financial-final.json.gz; 44 conjuntos de observações de API: api-observations.json.gz; Navigation Timing de 40 cenários: interface-navigation.json.gz (quatro cenários fecham a página original). Sumário por resolução: interface-api-summary.json. JSON da suíte em browser-results.json; capturas cash-closed-desktop/notebook/tablet/mobile.png e reconciled-desktop.png. Conteúdo completo e traces de falha permanecem no artefato do workflow. As capturas de sucesso contêm apenas dados fictícios.

Timeout adicional é uma injeção de atraso **na entrega da resposta depois de uma transação Mongo real já confirmada**, validada no backend; não é simulação de banco ou de cobrança bancária. O browser cobre perda de resposta depois do commit e HTTP 503 antes do commit; não foi medido timeout de um adquirente externo. Testes separados não equivalem a hardware ou liquidação financeira externa homologados.

O último commit de evidências acrescenta relatório/artefatos, opções do auxiliar diagnóstico e essa regressão adicional; não altera o código de aplicação validado nos 44 cenários. SHAs de árvore local/remota são conferidos na publicação. PR segue em rascunho, sem merge/deploy. **A aprovação dos cenários não revoga a reprovação para produção.**

## Encerramento da regressão

Após acrescentar o teste específico de timeout pós-commit, a suíte backend completa foi reexecutada localmente com réplica/HTTP descartáveis: **355 aprovados e 3 subtestes aprovados**, sem skips (44,94 s), em evidence/backend-final-local.txt. Isso se soma como cobertura à execução CI anterior de 354, sem somar contagens sobrepostas. A aplicação browser permanece exatamente a validada no HEAD 220cc018; as alterações posteriores são teste, auxiliar diagnóstico e evidências.

O ensaio principal terminou em 301,81/302,35 s e conservou os 503. O diagnóstico adicional confirma conflito no contador/caixa, não elimina a necessidade de correção de capacidade e de um ensaio mais longo. Nenhuma afirmação de homologação global/produção é feita.
