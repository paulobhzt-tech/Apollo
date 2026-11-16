# P8 FINAL — benchmark REPROVADO no SLA HTTP p95

Critérios congelados em ACCEPTANCE.json; [veredito estruturado](evidence/acceptance-result.json). Uma sequência **ABBA**, duas execuções por versão em cada carga (a1/b1/b2/a2), mais um prolongado de 30 minutos por versão e um par histórico. Não são dois ciclos ABBA. Bancos descartáveis novos, mesmo runner, contas distintas, keep-alive e fontes de índices corretas.

## Prolongados de 50 operadores

| Versão | Pares | Pares/s | HTTP p50 / p95 / p99 (ms) | Par p50 / p95 / p99 (ms) | Erros / esgotadas |
|---|---|---|---|---|---|
| P7 | 40800 | 22.64 | 1039.04 / 1791.83 / 2052.15 | 2175.48 / 2782.55 / 2947.28 | 0 / 0 |
| P8 | 54415 | 30.21 | 823.68 / 1055.64 / 1186.79 | 1606.83 / 1999.96 / 2159.12 | 0 / 0 |

Zero erros e operações esgotadas, mas P8 HTTP p95 1.055,64 > 1.000 ms; par p95 1.999,96 ms passa sem margem. P8 não pode ser aprovada. Há apenas um prolongado por versão; não há intervalo de confiança, estabilidade universal ou extrapolação para multiworker. Ordem prolongada P7→P8; alternância somente no ABBA. Volumes finais diferentes (40.800 / 54.415) refletem throughput, com mesma fixture inicial. Histórico separado começa em 60.000 documentos em ambas.

Pares/s usa pares completos divididos por tráfego+drenagem (exclui autenticação). request_throughput_s e unique_completed_operations_s legados incluem autenticação em duration_s; não confundir denominadores. Os resultados brutos preservam ambos. Medição HTTP do cliente inclui resposta; app/driver têm outros intervalos.

## Todas as rodadas

| Rodada / operadores | Pares | Pares/s | HTTP p50 / p95 / p99 ms | Par p50 / p95 / p99 ms | Erros / esgotadas |
|---|---|---|---|---|---|
| h1 / 50 | 450 | 13.64 | 1802.52 / 2888.07 / 3197.03 | 3582.44 / 4059.06 / 4102.01 | 0 / 0 |
| h2 / 50 | 871 | 28.06 | 880.92 / 1083.31 / 1116.46 | 1762.83 / 1826.57 / 1870.35 | 0 / 0 |
| a1 / 5 | 455 | 30.06 | 83.52 / 102.77 / 106.62 | 164.92 / 171.56 / 213.17 | 0 / 0 |
| a1 / 10 | 440 | 29.04 | 171.11 / 212.75 / 236.38 | 340.85 / 377.81 / 396.44 | 0 / 0 |
| a1 / 20 | 444 | 29.04 | 343.51 / 421.58 / 441.02 | 682.13 / 719.78 / 761.92 | 0 / 0 |
| a1 / 30 | 452 | 29.46 | 505.14 / 622.85 / 639.08 | 1009.02 / 1086.89 / 1093.12 | 0 / 0 |
| a1 / 50 | 450 | 27.95 | 877.83 / 1145.98 / 1383.12 | 1741.51 / 2066.59 / 2075.42 | 0 / 0 |
| b1 / 5 | 445 | 29.57 | 84.83 / 103.38 / 112.56 | 167.87 / 177.05 / 220.65 | 0 / 0 |
| b1 / 10 | 450 | 29.48 | 169.44 / 205.14 / 218.03 | 338.04 / 352.56 / 381.86 | 0 / 0 |
| b1 / 20 | 450 | 29.17 | 340.50 / 413.34 / 437.34 | 676.54 / 731.18 / 753.60 | 0 / 0 |
| b1 / 30 | 450 | 28.45 | 523.66 / 634.50 / 676.34 | 1045.19 / 1090.61 / 1149.65 | 0 / 0 |
| b1 / 50 | 450 | 28.75 | 863.32 / 1052.97 / 1090.22 | 1722.78 / 1845.23 / 1852.08 | 0 / 0 |
| b2 / 5 | 448 | 29.64 | 84.40 / 103.28 / 110.17 | 167.53 / 176.33 / 214.27 | 0 / 0 |
| b2 / 10 | 430 | 28.25 | 175.92 / 218.42 / 238.69 | 349.63 / 380.12 / 405.10 | 0 / 0 |
| b2 / 20 | 440 | 28.10 | 353.76 / 432.93 / 456.43 | 707.28 / 751.31 / 768.26 | 0 / 0 |
| b2 / 30 | 450 | 28.70 | 519.26 / 636.18 / 668.86 | 1035.45 / 1130.33 / 1136.76 | 0 / 0 |
| b2 / 50 | 450 | 28.15 | 874.53 / 1094.15 / 1194.19 | 1743.57 / 1930.55 / 1939.99 | 0 / 0 |
| a2 / 5 | 440 | 29.07 | 85.36 / 106.37 / 116.86 | 170.62 / 183.66 / 208.40 | 0 / 0 |
| a2 / 10 | 440 | 28.85 | 172.02 / 213.16 / 241.06 | 343.46 / 363.28 / 401.90 | 0 / 0 |
| a2 / 20 | 440 | 28.58 | 347.72 / 431.23 / 460.08 | 694.62 / 729.25 / 758.01 | 0 / 0 |
| a2 / 30 | 443 | 28.02 | 528.07 / 659.82 / 703.19 | 1066.47 / 1132.16 / 1143.23 | 0 / 0 |
| a2 / 50 | 450 | 28.36 | 870.80 / 1079.95 / 1127.35 | 1744.76 / 1811.76 / 1818.17 | 0 / 0 |
| p7long / 50 | 40800 | 22.64 | 1039.04 / 1791.83 / 2052.15 | 2175.48 / 2782.55 / 2947.28 | 0 / 0 |
| acceptance / 50 | 54415 | 30.21 | 823.68 / 1055.64 / 1186.79 | 1606.83 / 1999.96 / 2159.12 | 0 / 0 |

## Variação observada ABBA

| Operadores | Versão | Pares/s min–máx | HTTP p50 min–máx | HTTP p95 min–máx | HTTP p99 min–máx |
|---|---|---|---|---|---|
| 5 | P7 | 29.07–30.06 | 83.52–85.36 | 102.77–106.37 | 106.62–116.86 |
| 5 | P8 | 29.57–29.64 | 84.40–84.83 | 103.28–103.38 | 110.17–112.56 |
| 10 | P7 | 28.85–29.04 | 171.11–172.02 | 212.75–213.16 | 236.38–241.06 |
| 10 | P8 | 28.25–29.48 | 169.44–175.92 | 205.14–218.42 | 218.03–238.69 |
| 20 | P7 | 28.58–29.04 | 343.51–347.72 | 421.58–431.23 | 441.02–460.08 |
| 20 | P8 | 28.10–29.17 | 340.50–353.76 | 413.34–432.93 | 437.34–456.43 |
| 30 | P7 | 28.02–29.46 | 505.14–528.07 | 622.85–659.82 | 639.08–703.19 |
| 30 | P8 | 28.45–28.70 | 519.26–523.66 | 634.50–636.18 | 668.86–676.34 |
| 50 | P7 | 27.95–28.36 | 870.80–877.83 | 1079.95–1145.98 | 1127.35–1383.12 |
| 50 | P8 | 28.15–28.75 | 863.32–874.53 | 1052.97–1094.15 | 1090.22–1194.19 |

As execuções curtas têm 15 segundos por carga e ruído sobreposto entre versões; não demonstram melhoria universal em baixa cardinalidade. A 50 operadores, ambas as repetições P8 têm p95 >1.000 ms, consistente com a reprovação longa. Não usar apenas o menor p95 nem agregar percentis como se fossem amostras brutas. [Resumo min/média/máx](evidence/abba-summary.json).

## Componentes no prolongado

| Versão / operação | Componente | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|
| P7 / sale | admission_wait | 1010.82 | 1757.45 | 2016.63 |
| P7 / sale | session_create | 0.64 | 0.76 | 0.86 |
| P7 / sale | transaction_start_local | 0.01 | 0.01 | 0.03 |
| P7 / sale | snapshot_first_command | 0.31 | 0.40 | 0.54 |
| P7 / sale | db_read | 16.89 | 27.80 | 29.45 |
| P7 / sale | db_write | 3.18 | 3.91 | 5.57 |
| P7 / sale | callback | 28.61 | 40.34 | 43.73 |
| P7 / sale | commit | 1.76 | 2.35 | 2.67 |
| P7 / sale | before_response_start | 1044.26 | 1801.56 | 2062.82 |
| P7 / sale | response_send | 0.37 | 0.44 | 0.49 |
| P7 / sale | http_app_total | 1045.05 | 1802.42 | 2063.57 |
| P7 / cancel | admission_wait | 1012.59 | 1759.43 | 2015.84 |
| P7 / cancel | session_create | 0.58 | 0.73 | 0.85 |
| P7 / cancel | transaction_start_local | 0.01 | 0.01 | 0.03 |
| P7 / cancel | snapshot_first_command | 0.37 | 0.48 | 0.73 |
| P7 / cancel | db_read | 2.02 | 2.47 | 3.54 |
| P7 / cancel | db_write | 2.77 | 3.84 | 6.23 |
| P7 / cancel | callback | 9.42 | 11.28 | 14.44 |
| P7 / cancel | commit | 1.55 | 2.16 | 2.44 |
| P7 / cancel | before_response_start | 1028.42 | 1775.31 | 2032.32 |
| P7 / cancel | response_send | 0.33 | 0.42 | 0.49 |
| P7 / cancel | http_app_total | 1029.17 | 1776.06 | 2032.99 |
| P8 / sale | admission_wait | 800.55 | 1027.62 | 1157.15 |
| P8 / sale | session_create | 0.62 | 0.80 | 0.90 |
| P8 / sale | transaction_start_local | 0.01 | 0.02 | 0.03 |
| P8 / sale | snapshot_first_command | 0.31 | 0.52 | 0.66 |
| P8 / sale | db_read | 3.70 | 5.03 | 6.61 |
| P8 / sale | db_write | 4.42 | 5.66 | 7.19 |
| P8 / sale | callback | 16.99 | 21.03 | 23.78 |
| P8 / sale | commit | 1.74 | 2.34 | 2.67 |
| P8 / sale | before_response_start | 824.83 | 1055.37 | 1186.23 |
| P8 / sale | response_send | 0.36 | 0.47 | 0.51 |
| P8 / sale | http_app_total | 825.56 | 1056.28 | 1187.17 |
| P8 / cancel | admission_wait | 800.47 | 1029.12 | 1157.09 |
| P8 / cancel | session_create | 0.58 | 0.81 | 0.91 |
| P8 / cancel | transaction_start_local | 0.01 | 0.01 | 0.03 |
| P8 / cancel | snapshot_first_command | 0.38 | 0.69 | 0.86 |
| P8 / cancel | db_read | 2.04 | 2.71 | 3.62 |
| P8 / cancel | db_write | 2.73 | 4.52 | 6.17 |
| P8 / cancel | callback | 9.53 | 12.85 | 14.83 |
| P8 / cancel | commit | 1.60 | 2.22 | 2.57 |
| P8 / cancel | before_response_start | 816.82 | 1048.49 | 1178.50 |
| P8 / cancel | response_send | 0.34 | 0.46 | 0.52 |
| P8 / cancel | http_app_total | 817.56 | 1049.52 | 1179.53 |

Unidades ms; p50/p95/p99 por requisição instrumentada. Venda e cancelamento separados. FIFO é o local comprovado de acumulação restante: p95 >1.000 ms nas duas operações P8. Isso não prova que retirar a fila seja seguro ou que somente um comando explique o tempo de serviço. Snapshot_first_command inclui primeiro acesso ao banco; db_read/db_write estão no callback; commit inclui driver; before_response_start e http_app_total incluem estágios anteriores. **Não somar percentis nem tratar componentes como disjuntos.** response_send mede envio ASGI, não confirmação do cliente/browser. Todos os grupos e cargas estão em request-components.json.gz.

## Recursos amostrados

| Rodada | CPU backend (s / núcleos médios) | RSS backend máx MiB | CPU Mongo (s / núcleos médios) | RSS Mongo máx MiB | Conexões Mongo máx |
|---|---|---|---|---|---|
| h1 | 25.82 / 0.74 | 82.99 | 22.29 / 0.64 | 271.66 | 27 |
| h2 | 34.34 / 1.14 | 83.09 | 10.14 / 0.34 | 259.20 | 27 |
| a1 | 94.23 / 1.11 | 83.03 | 26.00 / 0.31 | 204.26 | 28 |
| b1 | 95.14 / 1.12 | 83.07 | 24.28 / 0.29 | 206.16 | 28 |
| b2 | 95.46 / 1.12 | 82.92 | 24.34 / 0.29 | 206.46 | 28 |
| a2 | 93.96 / 1.10 | 83.03 | 25.91 / 0.30 | 204.74 | 28 |
| p7long | 1115.16 / 0.62 | 83.54 | 976.52 / 0.54 | 405.12 | 28 |
| acceptance | 1507.52 / 0.84 | 83.41 | 582.77 / 0.32 | 417.35 | 27 |

CPU: delta de segundos do processo e equivalente médio de núcleos no intervalo amostrado, não percentual global da máquina. RSS é máximo amostrado por processo, não toda a memória do host. Conexões vêm do serverStatus. Séries em load-*.json.gz; amostras posteriores ao início da auditoria excluídas da síntese. Não foram coletadas todas as métricas de disco, cache, pausas do host ou concorrência externa; não atribuir causalidade exclusiva à CPU.

## Transações e segurança da comparação

Callbacks tiveram p50/p95/p99 de uma tentativa e zero retries/falhas instrumentadas em todas as oito rodadas. Counters e cash_sessions foram mantidos transacionais. Ausência de erro WriteConflict reportado é do escopo da instrumentação cliente; não é uma auditoria de todo contador interno do servidor. Contratos de índice únicos foram verificados por rodada. Comparação histórica usa profiler somente em h1/h2 nas mesmas condições; prolongados não usam profiler completo. Dados e logs brutos: artefato do run43960177013, com SHA-256 e expiração em artifact-provenance.json. Critérios e orçamento de 30 segundos não foram alterados.
