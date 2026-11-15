# Desempenho e concorrência P1

HTTP real com keep-alive, autenticação, um cliente persistente por sessão, MongoDB 7.0.16 replica set de um membro, dados fictícios. Pares venda/cancelamento, estoque sintético inicial 1000. Etapas de 8 s com drenagem de requisições; carga prolongada final com 50 sessões. Retry de até quatro tentativas com a mesma referência; percentis contam todas as tentativas HTTP e não o tempo de uma intenção completa. Não inclui tempo de login nos percentis. Tickets KDS persistidos, sem emissão fiscal externa ou impressora física; não há lotes na semente HTTP (cobertos na integração). Ambiente compartilhado com outras validações, sem isolamento de CPU: não é capacidade de produção.

Duração total: **1811.074 s**. Resultado pytest: 1 teste aprovado em 1811,15 s. Integridade final: `{"stock": 1000.0, "paid_orders": 0, "duplicate_refs": 0, "orders": 3966}`. Não houve venda paga remanescente, referência duplicada nem diferença no estoque deste ensaio.

| Sessões | Duração s | Pares concluídos | Requests | p50 ms | p95 ms | p99 ms | Req/s | Erros |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8.004 | 419 | 838 | 8.98 | 12.54 | 13.59 | 104.7 | 0.00% |
| 5 | 8.12 | 247 | 494 | 16.32 | 483.77 | 1293.58 | 60.84 | 0.00% |
| 10 | 8.339 | 122 | 244 | 34.64 | 1564.44 | 2535.97 | 29.26 | 0.00% |
| 20 | 9.442 | 60 | 120 | 105.55 | 5528.68 | 7666.03 | 12.71 | 0.00% |
| 30 | 11.753 | 57 | 114 | 146.52 | 8980.96 | 10629.29 | 9.7 | 0.00% |
| 50 | 20.593 | 65 | 130 | 219.74 | 18920.43 | 19213.89 | 6.31 | 0.00% |
| 100 | 62.958 | 105 | 291 | 15519.04 | 30324.6 | 30410.53 | 4.62 | 27.84% |
| 50 | 1681.844 | 2891 | 7345 | 5254.38 | 30193.33 | 30247.92 | 4.37 | 21.28% |

## Recursos reais amostrados

362 amostras de /proc e serverStatus, aproximadamente a cada 5 s. CPU abaixo é média em percentual de um núcleo (delta de CPU-segundos dividido pelo intervalo de parede), não percentual da máquina inteira.

| Processo | CPU média % de um núcleo | RSS máximo MiB |
|---|---:|---:|
| backend | 110.98 | 81.05 |
| mongo | 82.93 | 326.99 |

Conexões Mongo simultâneas máximas: 54. Memória residente Mongo máxima reportada: 326 MiB. writeConflicts reportados pelo campo amostrado: início 0, fim 0; não inferir ausência de toda contenção a partir desse único contador.

Categorias de falha por etapa:
- 1 sessões / 8.004 s: `{}`.
- 5 sessões / 8.12 s: `{}`.
- 10 sessões / 8.339 s: `{}`.
- 20 sessões / 9.442 s: `{}`.
- 30 sessões / 11.753 s: `{}`.
- 50 sessões / 20.593 s: `{}`.
- 100 sessões / 62.958 s: `{"/api/pdv/sale:503": 81}`.
- 50 sessões / 1681.844 s: `{"/api/pdv/sale:503": 1563}`.

## Interpretação e comparação

100 sessões tiveram 503 e latências elevadas; a etapa longa de 50 deve ser avaliada pelos erros e percentis acima, não apenas pelo teste de integridade aprovado. REPROVADO como homologação de capacidade para 100 sessões. O teste aprovado comprova os asserts finais no cenário executado; não prova ausência universal de corrupção.

Não existe carga equivalente antes das correções P1. Não foi implementada otimização de throughput nem há ganho antes/depois a declarar. A comparação de correção é verificável nos testes antes/depois, não em um benchmark inventado. É necessária análise adicional de perfis, respostas 503, hot documents financeiros, CPU e escalonamento antes de propor alterações. Não remover touch_cash ou garantias transacionais para elevar throughput.

Ensaio multinó e failover foram separados: failover.json mede eleição/retry/reinício autenticados, mas não mede esta carga distribuída em três membros ou três hosts. Backup concorrente foi testado na integração; backup durante 30 minutos de carga e fechamento de caixa sob carga não foram executados. Recursos brutos: evidence/soak.json. Código: backend/benchmarks/soak_real.py; reproduzir com runner --http, APOLLO_SOAK_SECONDS=1800 e APOLLO_SOAK_OUTPUT para caminho absoluto em ambiente descartável.
