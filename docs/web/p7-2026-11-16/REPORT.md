# Apollo P7 — contenção transacional

**PRODUÇÃO BLOQUEADA.** Esta entrega não faz merge nem deploy. Todo banco usado é fictício e descartável. O resultado de carga está em `evidence/acceptance-result.json`.


## Resultado final de aceitação

**P7: REPROVADA NA ACEITAÇÃO DE CARGA. Produção continua bloqueada.** Ensaio de 50 operadores, 1.800 segundos ativos e 1801.873 s incluindo drenagem. P6: 149 HTTP503; P7: 0 erros HTTP/transporte. Pares completos: 21,223 → 59,899; throughput: 11.77 → 33.24 pares/s. p95 HTTP: 12285.36 → 1359.15 ms; p99: 23136.73 → 1574.31 ms.

Limites não atendidos: `request_p95_ms_maximum`, `sale_cancel_pair_p95_ms_maximum`. Não foram ajustados depois de observar os resultados. A redução de contenção/503 é comprovada; não se declara a capacidade tecnicamente aprovada enquanto esses limites permanecerem reprovados.

Integridade final dos seis ensaios comparativos aprovada pelo harness real: zero referências/números duplicados, estoque restabelecido, pedidos/marcadores/contador compatíveis e movimentos/versão de caixa iguais a duas vezes os pedidos. Falhas/recuperação e regressão web/desktop estão descritas abaixo, separadamente dos agregados de carga.

## Base e coordenação

PR #21 confirmado em `adfbdcd43263161c03d280b775f73a3e387d38f2`, árvore `4347c2bc88a7c4dbc266b6fb780bac2a2fcadae9`. PRs #19 (`ef3de4a9a5e54c92533551990e9a9f21df9c3d34`) e #20 (`70905439235a5b298156f50ad29d72d91a5f1053`) consultados; relatório e matriz P6 lidos integralmente. Branch exclusiva `fix/p7-transaction-contention`; [PR #22 em rascunho](https://github.com/paulobhzt-tech/Apollo/pull/22), empilhado sobre #21. P5/P6 e testes existentes preservados.

Código funcional validado no CI: `dfca52809f45d223c5aea0d6045d30c5c6e46b32`, árvore `2aa96cf18ef1846ea840e4c94c9e29494bb327d4`. O checkout local P6 tem metadados de commit distintos, mas a mesma árvore remota; a comparação usa essa árvore, não outro desenvolvimento paralelo.

## Causa medida e correção

Antes de editar a implementação, a P6 reproduziu dois HTTP 503 em venda durante o estágio final de 222 s de um ensaio de aproximadamente 300 s. p95 8.993,20 ms, p99 17.718,52 ms; referência reapresentada sem duplicação. Diagnóstico: `WriteConflict` 112 no contador de pedidos e na sessão de caixa, seguido de repetição do callback até esgotar o orçamento. A P6 já serializava esses documentos no MongoDB, mas abria snapshots concorrentes antes dessa serialização e repetia trabalho abortado.

A P7 admite os escritores deste processo em uma fila FIFO por cliente Mongo/event loop **antes** de abrir a sessão/snapshot. A espera consome o orçamento original de 30 s; não foram aumentados retries, timeout de commit ou política de backoff. A fila é uma otimização local, não uma trava de integridade distribuída. Transações MongoDB, verificações condicionais e marcadores continuam responsáveis pela correção entre processos.

Contador, estoque, lotes, caixa, marcadores e pedido continuam na mesma unidade transacional. Não há reserva externa de números, pagamento assíncrono, novo backend ou lógica financeira no navegador. Leitura `snapshot`, primário e confirmação `majority` com journal permanecem iguais. Commit desconhecido repete somente o commit, com a mesma sessão/txnNumber. Nenhum pagamento incerto é reenviado automaticamente pela interface.

As consultas auditadas de conciliação P6 e exportação de backup usam `read_only=True`, mantendo a transação de leitura e dispensando apenas a admissão de escritores. Restauração e todas as mutações continuam admitidas. A primeira execução da suíte descobriu uma regressão no teste existente de backup durante venda: a leitura aguardava a venda que ela própria disparava enquanto retinha a fila. A classificação explícita de snapshots corrigiu o problema; evidência da falha preservada em `backend-first.txt`, sem remoção de teste.

Índices não foram alterados. `_id` do contador já indexa a disputa; o problema medido é atualização concorrente do mesmo documento, não varredura desse contador. O índice de `kitchen_tickets.order_id` herdado permanece verificado no harness. Mais índices não eliminariam a exclusão de escrita desses documentos.

## Regressões e evidências

- Backend completo, Mongo replica set/HTTP descartáveis: **363 testes e 3 subtestes aprovados**, local e CI. A contagem inclui testes isolados e integrações financeiras reais; não são 363 vendas simuladas.
- Seis testes novos da admissão: FIFO, cancelamento de espera/ativo, orçamento, clientes independentes e leitura concorrente. O teste de sobreposição falha na P6 (dez callbacks simultâneos), passa na P7 (um).
- Duas integrações novas: 50 vendas e cancelamentos distintos, numeração contínua, estoque/lotes/caixa/marcadores; dois processos independentes com vendas concorrentes e integridade Mongo. Não usam mocks de persistência.
- **44/44 cenários P6** (11 × desktop/notebook/tablet/mobile), zero skips/flaky, FastAPI e Mongo reais; preservados os **12 testes P5**.
- **14 testes Node** de offline/recuperação/impressão, typecheck, lint, build web e build desktop aprovados. Os avisos herdados de lint/CSS/bundle continuam nos logs; não representam certificação Windows.
- [CI P7 43911034137](https://github.com/paulobhzt-tech/Apollo/actions/runs/43911034137) aprovado nas quatro resoluções. Artefatos por projeto, IDs/digests em `evidence/ci-artifacts.json`. `browser-summary.json` identifica resultados e os 44 snapshots financeiros/API; 40 observações Navigation Timing porque quatro cenários fecham a página original.

Detalhes financeiros e fronteiras de prova: [INTEGRITY.md](INTEGRITY.md). Metodologia, quantis, variação e recursos: [BENCHMARK.md](BENCHMARK.md). A aprovação de um cenário não significa homologação integral do módulo.

## Compatibilidade, segurança e limites

Nenhum arquivo de aplicação Electron foi alterado. O build do frontend desktop legado (TypeScript/Vite), regressões existentes e `node --check` de `desktop/main.js`, `preload.js` e `scripts/build-web.js` passaram. O job Windows do CI valida sintaxe PowerShell/certificado local; não executa o PDV com dispositivos. Pacote Electron/instalador Windows completo e hardware não foram homologados nesta missão. Nenhuma venda offline/PWA foi habilitada.

Cookies, CSRF, perfis, expiração, logout/troca de operador, acesso direto e duas abas foram revalidados nos cenários P6. HTTPS local com certificado verificado confirma Secure/HttpOnly/SameSite, 403 para CSRF entre esquemas e CORS hostil recusado (`tls-*.json`). Não substitui auditoria externa XSS/CSP/tenant, rate limiting e deployment HTTPS.

A fila é local ao processo/cliente. Vários workers/hosts continuam podendo disputar no MongoDB; o teste de dois processos comprova integridade naquele cenário, não capacidade sustentada distribuída. Acima da capacidade testada a admissão pode esgotar os 30 s e retornar 503; a referência continua exigindo conciliação. Uma transação já iniciada não foi transformada em timeout/cancelamento financeiro forçado.

O uso de `asyncio.timeout_at` requer Python 3.11 ou superior (matriz validada usa 3.11/3.12). A serialização evita starvation local, mas aumenta a mediana de latência e serializa também mutações independentes que compartilham o cliente. Isso é uma troca explícita; não foi declarada melhoria universal.

Impressão física, adquirente bancário/SEFAZ, múltiplos dispositivos, perda deliberada do storage, aparelhos reais/Firefox/Safari e homologação comercial completa de mesas/QR/delivery/estornos/relatórios seguem pendentes conforme P6. Impressão browser confirmada manualmente não certifica papel nem spooler. Produção não é liberada automaticamente mesmo se os critérios desta carga passarem.

## Reprodução

Usar apenas ambiente descartável, Python ≥3.11, dependências do workflow e MongoDB oficial 7.0.16:

```sh
export MONGOD_BIN=/caminho/para/mongod
# Checkout separado do HEAD P6 acima; não alterar durante a campanha.
export P7_BASELINE_ROOT=/caminho/para/checkout-p6
python backend/tools/run_p7_campaign.py
python backend/tools/summarize_p7.py
cd backend
python tools/run_replica_tests.py --http -q tests
cd ..
python backend/tools/run_p6_web.py --project desktop
# Repetir notebook, tablet, mobile; instruções completas no workflow p7-validation.yml.
```

O benchmark usa loopback 27029/8002, diretório Mongo novo por execução e processos encerrados no `finally`. Integração/UI usam seus auxiliares P6 existentes. Dados e índices são criados a partir dos schemas/índices existentes. Não apontar esses comandos para um banco externo. A campanha executa ABBA de 5/10/20/30/50 operadores e 30 minutos P6 + 30 minutos P7; não reduzir a duração para chamar o resultado de aceitação.

## Recomendação de continuidade

Manter o PR em rascunho e produção bloqueada. A fila local reduz o trabalho abortado sem remover proteções financeiras. Antes de ampliar a homologação, investigar a latência com crescimento de cardinalidade e os planos das leituras de pedidos usando profiler/explain em ambiente descartável; a janela diagnóstica de dez segundos mostrou `find:orders` predominante no tempo de comandos, mas não identifica sozinha qual consulta ou plano é a causa. Não aumentar retries nem relaxar atomicidade para cumprir um alvo. Repetir ABBA e ensaio prolongado após qualquer nova correção de aplicação/índices. Depois, validar múltiplos workers/hosts, segurança externa, hardware e os módulos comerciais pendentes.

O commit final acrescenta relatório, ferramenta de sumarização e evidências; não muda a aplicação validada no HEAD funcional acima. Os checks desse HEAD estão em `ci-runs.json`. Checks automáticos do commit final ficam vinculados ao PR. Nenhum merge/deploy foi executado.
