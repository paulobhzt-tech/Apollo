# P7 — integridade financeira e recuperação

**Produção bloqueada.** Os testes usam FastAPI/MongoDB reais em replica set temporário, sem dados reais nem liquidação bancária. Não houve mudança na unidade financeira, preços, descontos, permissão, pagamentos ou estoque para obter desempenho.

## Evidência por garantia

| Garantia | Prova executada | Limite |
|---|---|---|
| 50 vendas distintas no mesmo caixa | `test_50_distinct_sales_keep_gapless_numbers_and_avoid_local_retry_storm`: 50 pedidos/marcadores, números 1–50, caixa R$500, estoque 100→50 | Fixture pequena, um processo |
| 50 cancelamentos concorrentes | Mesmo teste: estoque/lote retornam a 100, 100 movimentos, versão de caixa 100, nenhum pago remanescente | Não certifica interface completa de estorno |
| Concorrência entre processos | `test_independent_processes_still_rely_on_mongo_for_integrity`: dois processos ×10 vendas, números 1–20, marcadores/estoque e cancelamentos | Integridade no cenário; sem benchmark distribuído prolongado |
| Reenvio idempotente | P0 2/10/50 replays; processo independente; P6 duplo clique e dez POST iguais pela interface | Referência persistida antes do envio; nova referência representa nova intenção |
| Pagamentos parciais/fiado/estornos | Integrações existentes de crédito, saldo, limite, concorrência e estorno por item aprovadas | Não adquirente bancário real |
| Falha antes do commit | Failpoints Mongo, rollback de cancelamento e processo morto antes de commit aprovados | Não simula energia/disco físico |
| Falha depois do commit | Perda/timeout de resposta após confirmação real, consulta read-only e replay com mesma referência aprovados | Não reenvia automaticamente pagamento incerto |
| Commit desconhecido | Failpoint real: repete somente commit, sem reexecutar efeitos; cenário web preservado | Proteção herdada, não nova política de retry |
| Processo cai e volta | Teste P0 `test_killed_backend_before_commit_rolls_back_then_replay_succeeds`; processo novo consulta/reenvia mesma intenção | Replica de um membro local |
| Refresh/fechamento/abas | 44 testes P6: UUID opaco preservado, conciliação após reload/fechamento e Web Locks | Não garante identidade entre browsers/dispositivos nem storage apagado |
| Backup simultâneo | Snapshot exportado durante venda e restore/replay aprovados | Leitura explicitamente dispensa a fila; Mongo snapshot permanece |
| Segurança real | RBAC/CSRF/sessão em backend + UI, TLS local verificado | Auditoria externa pendente |
| Offline | Sete regressões Node herdadas e cenário P6: navegador permanece bloqueado | Nenhuma venda offline homologada/habilitada |

A suíte final tem 363 testes e três subtestes, sem somar execuções repetidas como cobertura adicional. Contém testes isolados e financeiros reais. Os seis testes novos de fila usam sessões falsas exclusivamente para provar agendamento/cancelamento; **não substituem** nenhuma evidência financeira real. As duas integrações novas usam Mongo descartável.

## Critérios e inspeção da carga

Cada par é uma venda real via HTTP seguida de cancelamento real do mesmo pedido. Mesmo caixa/produto/ingrediente, 50 contas fictícias distintas. O harness drena os pares iniciados antes de inspecionar o banco.

Para cada execução são assertados no próprio Mongo:

- `orders == markers == counter`, sem referências nem números duplicados; mínimo 1 e máximo igual ao total de pedidos.
- `stock_moves == cash_version == 2 × orders`.
- Estoque final 1.000, nenhum pedido pago remanescente após os cancelamentos.

Os resultados completos ficam em `evidence/load-*.json.gz` e `benchmark-summary.json`. O benchmark não cria lotes de compra; a integridade dos lotes é verificada nas integrações dedicadas. As contagens finais verificam o conjunto de efeitos desse dataset; a prova de rollback/commit parcial também depende dos testes de injeção de falhas acima. Não se infere cobertura de todos os módulos comerciais apenas dessas contagens.

## Preservação da recuperação

A fila não muda `client_ref`, marcadores ou comportamento de reconciliação. A referência durável P6 continua sendo apenas um UUID opaco e timestamp, sem credenciais/payload financeiro. Web Locks não se torna uma trava financeira distribuída. Ausência de marcador não autoriza criar outro pagamento. Commit desconhecido nunca executa novamente o callback pelo caminho de retry de commit.

A ordenação comprovada é a numeração única e contínua dos pedidos confirmados, gerada pelo contador dentro da transação. FIFO refere-se à admissão local; não foi criada uma promessa de ordem global de chegada entre processos ou dispositivos. Não há reserva antecipada nem descarte de número fora da transação.

A fila é liberada em sucesso, erro e cancelamento. Espera expirada não inicia callback nem sessão; o teste correspondente prova esse comportamento. Se um cancelamento ocorrer com transação iniciada, o encerramento de sessão/aborto e os marcadores Mongo continuam necessários; a fila não certifica o resultado financeiro.

As consultas de backup e conciliação auditadas continuam em transações snapshot, apenas sem admissão de escrita. É obrigatório revisar qualquer novo uso futuro de `read_only=True`: passar uma mutação como leitura removeria a otimização local, embora não removesse as garantias Mongo. Nenhuma função existente de mutação foi marcada como leitura.

## Evidências de interface

`financial-snapshot.json.gz`: 44 snapshots reais anexados pelo Playwright; `api-observations.json.gz`: 44 conjuntos de respostas API; `interface-navigation.json.gz`: 40 conjuntos de navegação. `browser-summary.json` tem zero unexpected/skipped/flaky por resolução. As capturas `cash-closed-*.png` e `reconciled-desktop.png` são cópias dos artefatos de CI, sem edição ou dados reais.

Nenhuma impressora física, banco/adquirente externo ou SEFAZ foi usado. Cancelar a confirmação browser e recusar ACK automático continua sendo evidência do fluxo de interface, não de saída de papel.

## Inspeção final dos ensaios comparativos

| Execução | Pedidos = marcadores = contador | Movimentos = versão caixa | Estoque | Pago remanescente | Referências/números duplicados |
|---|---|---|---|---|---|
| a1 | 2472 | 4944 | 1000.0 | 0 | 0/0 |
| b1 | 4009 | 8018 | 1000.0 | 0 | 0/0 |
| b2 | 3880 | 7760 | 1000.0 | 0 | 0/0 |
| a2 | 2375 | 4750 | 1000.0 | 0 | 0/0 |
| p6long | 21223 | 42446 | 1000.0 | 0 | 0/0 |
| acceptance | 59899 | 119798 | 1000.0 | 0 | 0/0 |

Todos passaram também na verificação mínimo/máximo da numeração, sem lacunas nesse dataset. A P6 conservou integridade apesar dos HTTP503; a P7 não troca consistência por sucesso HTTP. A aprovação financeira dos cenários não altera o veredito de latência nem a reprovação de produção.
