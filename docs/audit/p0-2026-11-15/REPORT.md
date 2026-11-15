# Apollo PDV 3.0.1 — missão P0, 15/11/2026

**Resultado: os dois P0 de referência não se reproduzem nos cenários reais executados após a correção. Produção continua REPROVADA.** Isso não significa ausência de outros defeitos financeiros, nem certificação de todo o sistema.

PR em rascunho: https://github.com/paulobhzt-tech/Apollo/pull/16

## Base e isolamento

PR #15 aberto/em rascunho; HEAD remoto confirmado `15a075f75c9d141e7e7243f9ec14b424fefc49d8`, igual ao esperado. Sem mudanças posteriores na base durante a preparação. Branch nova `fix/p0-financial-stock-atomicity`, empilhada sobre `audit/master-validation-20261115`. As proteções de caminhos, RBAC/PIN/limites, bcrypt, credenciais e fila offline foram preservadas. Principal, PR #15 e produção não foram modificados.

A publicação usa a conexão GitHub porque o terminal não dispõe de credencial de escrita. As árvores de todos os commits publicados foram comparadas às árvores locais testadas; o conteúdo corresponde exatamente. SHAs locais/remotos constam em PUBLICATION.md.

## Evidências antes e depois

| Defeito | Antes, MongoDB real | Depois |
|---|---|---|
| Venda paga após falha de estoque | Falha injetada após writes reais de estoque: pedido permaneceu no banco, contrariando rollback esperado. | Pedido, pagamentos/fiado, nota, KDS, estoque, lotes, movimentos, contadores e marcador são revertidos juntos. Replay posterior confirma apenas uma venda/baixa. |
| Devolução duplicada | Cancelamentos concorrentes com 2, 10 e 50 chamadas falharam na integridade; com 50 foi observado estoque 142 em vez de 100. | As mesmas regressões passam: uma única devolução; lotes e saldo retornam aos valores originais. |
| Commit desconhecido | Teste real `failCommand` no commit revelou que o helper Motor instalado deixava escapar erro no commit implícito. | Ciclo explícito repete somente commit da mesma sessão/txnNumber em resultado desconhecido. Testes reais de conflito e commit passam. |
| Estorno misto de fiado | Venda 6 fiado + 4 Pix, estorno integral: saldo do fiado ficava -4. | Distribuição do estorno respeita pagamentos líquidos restantes: 6 fiado e 4 Pix, saldo zero. |

`evidence/before.txt` registra **4 falhas** no código de referência, antes da implementação. `mixed-refund-before.txt` registra a falha adicional. `expanded.txt` registra a descoberta do caminho de commit ainda defeituoso na implementação intermediária; esse resultado foi corrigido, não ignorado.

## Unidade transacional e mapa de escritas

| Operação | Coleções participantes |
|---|---|
| quick_sale | financial_operations, orders, counters, cash_sessions, fiado_customers/customer_moves (quando aplicável), invoices (simulada), kitchen_tickets, ingredients, purchases, lot_consumptions, stock_moves |
| cancel_order | orders, cash_sessions (caixa pago), fiado_customers/customer_moves (fiado), ingredients/purchases/lot_consumptions/stock_moves, invoices, kitchen_tickets, tables (comanda aberta) |
| refund_item | orders, cash_sessions, ingredients/purchases/lot_consumptions/stock_moves, fiado_customers/customer_moves, invoices; totais da mesa quando aplicável |
| pagamento parcial | orders, tables, cash_sessions, counters; não dá nova baixa de estoque |
| fechamento | leitura consistente de orders/customer_moves/cash_sessions e escrita de cash_sessions |

Todos os reads/writes participantes recebem a mesma sessão explicitamente. Consultas de produto, categoria, ingrediente, forma de pagamento e fiado também usam o snapshot. Não há `asyncio.gather` dentro de uma transação/sessão. Não há lock de integridade exclusivamente em memória.

Configuração: `ReadConcern('snapshot')`, `ReadPreference.PRIMARY`, `WriteConcern('majority', j=True)`, `max_commit_time_ms=5000`. No teste há um único membro; majority+journal não equivale a homologação de failover/queda de energia com múltiplos membros.

`lib/transactions.py` inicia e confirma a transação explicitamente. Erros com `TransientTransactionError` abortam e repetem o callback com novo snapshot; `UnknownTransactionCommitResult` repete apenas o commit. Erro de negócio não é repetido. Erros permanentes retornam 503 com orientação para consultar/repetir a mesma identidade, sem afirmar que nenhuma gravação ocorreu. Cancelamento e erro durante o callback abortam a transação. Orçamento de retry: 30 s entre tentativas; uma chamada de driver em andamento pode ultrapassar esse orçamento.

No Motor 3.7.1 instalado, a inspeção do código mostrou `with_transaction` usando um contexto que confirma ao sair; erro nesse commit escapa do loop explícito subsequente. O failpoint reproduziu isso. A implementação não depende dessa combinação de helper/contexto e foi testada também pelo caminho de conflito.

## Idempotência, concorrência e recuperação

A venda reserva `financial_operations._id = pdv:sha256(client_ref)` dentro da mesma transação, usando unicidade nativa de `_id`, independentemente de o índice secundário de client_ref já ter sido criado. Armazena hash do payload, pedido associado e horário. Só um marcador integralmente confirmado permite replay; conteúdo diferente com mesma referência retorna 409. A resolução de um commit incerto ou disputa de chave consulta novamente o marcador confirmado, sem recriar efeitos.

Pedidos anteriores ao upgrade sem marcador **não são presumidos consistentes**: replay retorna 409 para conciliação. Nenhuma migração automática/destrutiva foi feita. O rollout deve reconciliar esses pedidos antes de uso real.

Cancelamento autoriza operador/PIN uma vez antes do callback, preservando orçamento de tentativas. A transação relê o pedido e faz atualização condicional pelo estado observado. Cancelado retorna o registro sem repetir efeitos, inclusive em outro processo. O audit trail existente conserva motivo, autorizador, data, movimentos de estoque e movimento financeiro de fiado.

A receita de estoque é capturada pelo servidor no OrderItem, incluindo adicionais vinculados; alterações futuras da ficha não mudam a devolução da venda nova. A restauração de lote usa a referência original, e o primeiro estorno reconhece `restored_qty` ausente como zero. Pedidos legados sem snapshot ainda dependem da receita atual; rastreabilidade antiga de lotes de mesas/QR exige trabalho adicional.

Pagamento/cancelamento/estorno tocam a versão financeira do mesmo documento de caixa dentro da transação. Fechamento calcula e grava o resumo em snapshot; disputa provoca retry e reconciliação. Pagamento parcial participa desse protocolo. Cancelar/estornar um caixa já fechado retorna 409 para não invalidar silenciosamente seu fechamento; política de ajuste pós-fechamento permanece pendente.

`adjust_balance` passa de `$inc` seguido de `$set` obsoleto para pipeline de atualização atômica com arredondamento a centavos. Compras de fiado e seus movimentos participam da transação; conflito no mesmo cliente faz revalidar limite. Estorno misto usa pagamentos líquidos por modalidade, descontando troco/estornos anteriores. Não certifica todas as rotas legadas de recebimento/exclusão de cliente.

## Efeitos externos

Não há chamada de adquirente, banco ou SEFAZ real na unidade implementada. Pagamentos são registros no PDV; emissão fiscal continua **simulada**. Tickets KDS são a fila durável existente e só ficam visíveis após commit. Não foi adicionado publicador externo dentro do callback. Impressão física, notificações e integrações futuras precisam de consumidor/outbox idempotente e confirmação do destino; exatamente uma impressão não é garantida aqui.

## Testes e ambiente

**Execução completa local: 319 testes e 3 subtestes aprovados, nenhum excluído, nenhum skip** (`evidence/full-suite-final.txt`). Composição:

- 275 regressões isoladas, incluindo #13/#14/#15;
- 38 novos testes de integração com persistência MongoDB real;
- 2 testes existentes de pagamento parcial com replica set;
- 4 testes HTTP antes pendentes, agora executados com Uvicorn real e dados sintéticos.

Cenários novos: rollback após criação, pagamento/fiado, nota simulada, ticket, estoque e lotes; interrupção antes de commit; resposta perdida após commit; replay com 2/10/50 clientes; cancelamento com 2/10/50 chamadas; falha no estorno; receita alterada; limite de crédito; 50 ajustes de saldo; última unidade de estoque; FEFO com vencidos; fechamento contra venda/cancelamento/estorno; estorno misto; novo processo repetindo venda/cancelamento; processo morto após writes e antes de commit; failpoints reais para conflito transitório e resultado de commit desconhecido.

Persistência e rollback não são simulados. Fault injection por wrapper executa o helper real e depois lança a falha na etapa escolhida. Outros casos usam failpoints do servidor e processos reais. Não confundir uma falha de negócio injetada com teste de queda de energia.

MongoDB local 7.0.16 em replica set descartável, bind somente loopback, diretório temporário, sem autenticação de produção. Foi possível iniciar sem socket Unix e sem coleta diagnóstica, com cache 256 MB. Cada invocação do executor isola rede/processos; `tools/run_replica_tests.py` mantém MongoDB, backend e pytest na mesma invocação e encerra os filhos. Failpoints e lifetime reduzido de transação são habilitados **somente nesse banco de teste/CI**.

Cada cenário novo usa banco `apollo_p0_<uuid>` e verifica flag de opt-in e URL loopback antes da criação/limpeza. HTTP usa banco sintético separado do banco dos pagamentos parciais. A primeira execução completa revelou colisão entre fixtures compartilhadas; separação dos bancos resolveu sem alterar a restrição de caixa único ou qualquer índice. Os quatro testes HTTP precisaram enviar Origin válido para respeitar CSRF e ignorar proxy do ambiente para o endpoint local; nenhuma proteção do servidor foi removida.

Resultados adicionais: typecheck/build/lint aprovados, mantendo avisos de CSS/bundle/lint existentes; três regressões offline aprovadas; sintaxe Python e diff check aprovados. Gestão comercial: ver evidence/management.txt. Não foram adicionadas dependências de produção ou alterações em deploy/vps, credenciais ou dados reais.

## Sessões, pooling e timeouts

Inspeção das opções efetivas locais do cliente Motor: maxPoolSize 100, minPoolSize 0, connectTimeout 20 s, serverSelectionTimeout 30 s; maxIdleTime, waitQueueTimeout e socketTimeout sem limite explícito. Não foram alterados sem medição. Sessão é encerrada pelo contexto ao terminar a unidade; os testes incluem processo encerrado antes de commit e nova tentativa após expiração/rollback do servidor. Não é ensaio prolongado de vazamentos ou saturação do pool, nem determinação da falha histórica de keep-alive.

## Reprodução

A partir de backend, com binário mongod instalado em MONGOD_BIN:

```bash
MONGOD_BIN=/caminho/para/mongod python tools/run_replica_tests.py --http -q tests
```

O helper cria e encerra a infraestrutura descartável; não baixa binários. Ele usa porta 27027 para MongoDB e 8001 para HTTP dentro da mesma invocação. Não apontar estes cenários para produção. Testes novos em CI usam o container descartável já existente com replica set e `APOLLO_P0_INTEGRATION=1`.

Na raiz: `node --experimental-vm-modules --test frontend/tests/offline-queue.test.mjs`, `python -m pytest -q management`, `python -m compileall -q backend`, `git diff --check`. Em frontend: scripts typecheck/build/lint existentes.

## Compatibilidade e riscos restantes

1. Replica set passa a ser obrigatório também para venda/cancelamento; standalone falha com erro de transação. A configuração de produção não foi modificada e não pode ser liberada com o compose standalone atual.
2. Replay legado sem confirmação atômica exige conciliação; não certificamos retroativamente dados antigos. Cancelamento já realizado passa de erro 400 a resposta idempotente 200. Pagamento parcial rejeita reutilização da referência com conteúdo diferente.
3. Snapshot `stock_recipe` é campo opcional adicional na resposta, calculado apenas no servidor; requisições antigas continuam compatíveis. Interfaces TS não precisam enviá-lo.
4. Backup integral precisa incluir financial_operations, snapshots e todas as coleções antes omitidas. Perder marcadores em restauração faz vendas legadas exigirem conciliação; não tentar reconstruí-los por suposição.
5. Demais caminhos de mesas/QR/delivery e recebimento/exclusão de fiado não foram todos convertidos à mesma unidade transacional. Não afirmar integridade global dessas áreas. Pedidos legados e cancelamentos de lotes sem referência original continuam riscos.
6. Falta homologação de failover real com vários nós, reinício do mongod durante commit, queda de energia, saturação prolongada, carga com recursos monitorados, Windows/offline entre janelas e impressão física.
7. A atualização de um documento de caixa por operação serializa parte da carga. É uma garantia de consistência, com possível contenção; throughput financeiro de produção ainda precisa ser medido. Não foram criados índices ou pools especulativos.
8. Não há cobrança externa integrada certificada nem emissão fiscal real. Produção permanece reprovada mesmo com os dois P0 de referência resolvidos no escopo testado.

## Encaminhamento

Revisar PR #16 sem merge automático, validar CI e planejar homologação em infraestrutura representativa. Antes de produção: conciliar dados legados, completar backup/restauração, ampliar atomicidade aos fluxos restantes, testar failover/carga e Windows/offline. O checklist das 100 atividades registra o escopo efetivamente atendido; não transforma inspeções ou testes limitados em certificação total.

## Resultados intermediários do CI e correção final

| HEAD | Resultado relevante | Ação |
|---|---|---|
| 58b2d69 | Um job: 35 integrações passaram, uma falhou por 409 no replay simultâneo. Outros jobs passaram. | Revalidar marcador antes de classificar registro como legado. |
| 58b0295 | Dois jobs com 39 integrações passaram; job do PR: 38 passaram, uma falhou no mesmo caminho. | O recheck na mesma transação foi insuficiente; reiniciar o snapshot. |
| eb5467e | Três workflows concluídos com sucesso; três jobs independentes aprovaram 40 integrações reais cada. | Código funcional validado; documentação final posterior sem alteração executável. |

A leitura de namespace recém-criado pode preceder o snapshot usado para pedidos — hipótese consistente com a primeira utilização, sem wire trace conclusivo. A versão final detecta pedido atomic_version=1 visível sem marcador, aborta e abre transação nova, com no máximo três reinícios específicos. Não confere sucesso pelo estado pago nem pela flag isolada. Se continuar sem marcador confirmado, retorna 409 para conciliação. Um teste com flag atômica mas marcador ausente comprova ausência de novas gravações. RetrySnapshot é condição interna de reinício de leitura; não se faz passar por label emitido pelo MongoDB.

Logs: ci-race-before.txt, ci-snapshot-before.txt e PUBLICATION.md. Código final publicado: eb5467ecf442d3694e2db0dadce0e413de571480. Suíte local: 319 testes e 3 subtestes; CI transacional: 40 testes reais aprovados em cada um de três jobs. Nenhum dos resultados intermediários foi ocultado ou contornado.
