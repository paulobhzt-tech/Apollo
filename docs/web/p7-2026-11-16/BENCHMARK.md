# P7 — comparação reproduzível P6/P7

**Produção bloqueada.** Critérios de aceitação congelados antes do ensaio prolongado em `ACCEPTANCE.json`. Este documento separa requests HTTP, pares financeiros completos e interface. Não é um teste de 50 browsers simultâneos.

## Método

Mesma máquina/configuração, MongoDB oficial 7.0.16 com replica set de um membro e cache WiredTiger 0,25 GiB, um worker FastAPI, loopback e HTTP keep-alive. Cada execução começa com diretório Mongo novo, mesmos índices e dados fictícios: caixa compartilhado, produto de R$10, ingrediente com estoque 1.000, 50 usuários distintos, bcrypt 12. Valores de pagamentos persistem internamente; não há adquirente externo. Metadados em `evidence/environment.json`.

Ordem ABBA: P6 a1, P7 b1, P7 b2, P6 a2. Cada estágio recebe 15 s de tráfego ativo, depois de todos os operadores autenticarem; pares iniciados são drenados ao final. Estágios 5, 10, 20, 30 e 50. Duas repetições por versão, ordem alternada; mediana e faixa min–max são descritivas, sem alegação de significância estatística. P6/P7 usam o mesmo arquivo de benchmark P7; a barreira de login e a medição dos pares corrigem a comparabilidade em relação aos números históricos P6.

Latências HTTP agrupam POST venda/cancelamento, incluindo tentativas que retornam erro. Par financeiro mede venda+cancelamento completos; throughput de pares é pares concluídos / tempo de tráfego incluindo drain, excluindo login. Para requests normalizados usar `requests / traffic_duration_s`; o campo legado `request_throughput_s` inclui login e não é usado como throughput financeiro neste relatório. O harness exercita até quatro tentativas com **a mesma referência**; conta todos os erros, mesmo recuperados. Isso não ativa replay automático na interface.

## ABBA — mediana das duas execuções

| Operadores | P6 p50/p95/p99 HTTP (ms) | P7 p50/p95/p99 HTTP (ms) | Pares/s P6 → P7 | Par p95/p99 P6 → P7 (ms) |
|---|---|---|---|---|
| 5 | 11.44/43.86/1477.46 | 44.61/62.45/82.38 | 42.17 → 54.87 | 328.21/3221.68 → 119.06/140.90 |
| 10 | 12.40/763.30/2905.31 | 90.21/120.37/144.67 | 38.05 → 54.59 | 1738.28/3628.64 → 221.05/247.66 |
| 20 | 14.50/2026.86/5627.41 | 194.96/257.81/291.73 | 31.41 → 50.83 | 3475.85/6643.66 → 463.41/492.95 |
| 30 | 18.04/3661.98/7480.55 | 296.17/418.06/494.15 | 25.43 → 49.83 | 5487.84/9162.15 → 747.66/821.60 |
| 50 | 35.18/8531.95/13152.85 | 503.87/703.94/794.10 | 15.14 → 48.48 | 10802.55/15574.62 → 1205.10/1230.74 |

Todos os estágios ABBA tiveram zero erros HTTP/transport e operações esgotadas. Na carga 50, faixa de p95: P6 8.327,48–8.736,43 ms; P7 687,74–720,14 ms. Pares/s: P6 14,04–16,24; P7 48,07–48,90. p99: P6 12.940,44–13.365,26 ms; P7 772,47–815,72 ms. Faixas completas dos demais níveis em `abba-summary.json`.

Há uma troca mensurável: p50 com 50 operadores sobe de 35,18 para 503,87 ms; com cinco operadores, p95 sobe de 43,87 para 62,45 ms. A fila torna a espera mais uniforme e reduz caudas e trabalho abortado, mas não melhora todos os quantis. Não há alegação de redução universal de latência.

## Diagnóstico antes/depois

A reprodução anterior à correção teve dois HTTP 503 no estágio final e manteve integridade ao reapresentar a mesma referência; não é usada como par A/B porque ainda tinha o harness histórico sem barreira. Durante ABBA, o último snapshot cumulativo do driver registrou:

| Execução | Counter WriteConflict112 | Cash WriteConflict112 | Reexecuções callback | Tentativas callback p95/p99/máx |
|---|---|---|---|---|
| P6 a1 | 7.354 | 2.300 | 9.659 | 14/30/60 |
| P7 b1 | 0 | 0 | 0 | 1/1/1 |
| P7 b2 | 0 | 0 | 0 | 1/1/1 |
| P6 a2 | 7.287 | 2.210 | 9.497 | 15/32/63 |

Os snapshots de comando são amostrados aproximadamente uma vez por segundo, podendo omitir a cauda final. As contagens de tentativas vêm dos eventos de transação completos; não somar abort251 como novos pagamentos. `serverStatus.metrics.operation.writeConflicts` ficou zero mesmo na P6 com comandos112 observados; esse campo **não é tratado como prova de ausência de conflitos**. A comparação usa os erros explícitos do driver e os callbacks.

Recursos ABBA (amostragem 5 s, processo e não máquina inteira): backend pico RSS P6 81,05–81,07 MiB, P7 72,77–72,93 MiB; Mongo P6 231,86–234,23 MiB, P7 216,53–218,69 MiB. Conexões Mongo máximas P6 53, P7 28–29. CPU média P6 backend 1,05–1,06 núcleos equivalentes, Mongo 0,49; P7 backend 0,94–0,95, Mongo 0,37. Não é percentual normalizado por todos os núcleos nem perfil completo de memória.

## Ensaios prolongados

Controle P6 concluído: 1.800 s ativos, 1.803,467 s incluindo drenagem; 21.223 pares completos, 42.595 requests, 149 HTTP503 (0,3498%), zero operações esgotadas após os reenvios com a mesma referência. p50/p95/p99 HTTP: 45,33/12.285,36/23.136,73 ms; par p95/p99: 16.747,68/28.033,04 ms; 11,77 pares/s. Integridade final aprovada. A aceitação P7 terminou nas mesmas condições e em réplica nova; resultados abaixo.

Critérios: zero HTTP503/outros erros/transporte/operações esgotadas, zero divergências/duplicações/confirmações parciais; p95 HTTP ≤1 s, p99 ≤2 s; par p95 ≤2 s, p99 ≤4 s. A fila conserva o orçamento original; esses limites não são um SLA geral nem autorização de produção.

## Reprodutibilidade e limites

`run_p7_campaign.py` registra ABBA e os dois ensaios de 30 minutos. `summarize_p7.py` lê somente arquivos completos e gera JSONs comprimidos, sumário de recursos/retries e veredito de carga contra os limites congelados. Hashes SHA256 identificam os JSONs de origem e diagnósticos. Quantis dos eventos de transação usam a observação ordenada inferior; os quantis HTTP/pares são os do harness. Os JSONs comprimidos preservam métricas agregadas por estágio e a série temporal completa de recursos; não contêm cada latência HTTP individual. O diagnóstico agregado preserva contadores finais e todos os eventos de transação falha, sem payloads/credenciais. Os arquivos de driver completos são intermediários locais identificados por SHA256, não distribuídos no repositório.

A campanha prolongada tem uma repetição por versão; ABBA tem duas. Variação entre máquinas, múltiplos hosts/workers, maior catálogo, várias empresas e consumidores externos não foi homologada. Cinquenta é a maior carga **testada**, não um máximo absoluto descoberto. Atomicidade não foi relaxada para obter os números.

A carga é fechada: cada operador aguarda a resposta antes do próximo passo, sem think time. Não é um gerador de taxa de chegada independente nem uma prova de filas ilimitadas. Quantis prolongados agregam a execução inteira; não há alegação de SLA por janela de tempo. Recursos têm série temporal de cinco segundos nos JSONs completos.

## Interface observada separadamente

Nos testes funcionais sequenciais, Navigation Timing `loadEventEnd` p50/p95 ficou em 316/404 ms (desktop), 333/408 (notebook), 251/303 (tablet), 312/384 (mobile), dez observações por resolução. TTFB API p95: 22,50/34,61/27,99/24,55 ms respectivamente. Isso não mede página plenamente interativa nem capacidade de cinquenta browsers. `interface-api-summary.json` preserva os detalhes. Cada resolução contém um HTTP503 **deliberadamente injetado** no cenário de falha pré-commit e respostas401 esperadas dos testes de sessão; não são falhas espontâneas da aceitação de carga e não foram ocultadas.

## Resultado prolongado final

| Métrica | P6 | P7 |
|---|---|---|
| Tráfego + drenagem (s) | 1803.467 | 1801.873 |
| Pares completos | 21223 | 59899 |
| Requests tentados | 42595 | 119798 |
| Pares/s | 11.77 | 33.24 |
| HTTP503 | 149 | 0 |
| Taxa de erros | 0.0034980631529522243 | 0.0 |
| Operações esgotadas | 0 | 0 |
| HTTP p50 (ms) | 45.33 | 679.2 |
| HTTP p95 (ms) | 12285.36 | 1359.15 |
| HTTP p99 (ms) | 23136.73 | 1574.31 |
| Par p50 (ms) | 1626.33 | 1514.79 |
| Par p95 (ms) | 16747.68 | 2063.44 |
| Par p99 (ms) | 28033.04 | 2185.99 |

### Critérios congelados e veredito

| Critério | Limite | P7 observado | Passou |
|---|---|---|---|
| active_traffic_seconds_minimum | 1800 | 1801.873 | True |
| http_503_maximum | 0 | 0 | True |
| other_http_or_transport_errors_maximum | 0 | 0 | True |
| exhausted_operations_maximum | 0 | 0 | True |
| request_p95_ms_maximum | 1000 | 1359.15 | False |
| request_p99_ms_maximum | 2000 | 1574.31 | True |
| sale_cancel_pair_p95_ms_maximum | 2000 | 2063.44 | False |
| sale_cancel_pair_p99_ms_maximum | 4000 | 2185.99 | True |

**REPROVADA NA ACEITAÇÃO DE CARGA.** Integridade assertada aprovada; veredito completo em `acceptance-result.json`. O p50 maior continua sendo uma troca observada, não escondida pela melhoria das caudas. O número final de pedidos difere entre versões porque a P7 concluiu mais pares; a equivalência é do dataset/índices iniciais e da carga, não de volumes finais artificialmente igualados.

### Recursos e retries do ensaio prolongado

| Medida | P6 | P7 |
|---|---|---|
| backend rss_mib_max | 81.965 | 73.488 |
| backend cpu_seconds_delta | 1686.900 | 863.990 |
| backend mean_cpu_core_equivalent | 0.936 | 0.480 |
| mongo rss_mib_max | 406.105 | 370.512 |
| mongo cpu_seconds_delta | 2753.140 | 1078.630 |
| mongo mean_cpu_core_equivalent | 1.528 | 0.599 |
| mongo_connections_max | 53 | 26 |
| sample_count | 361 | 361 |
| sample_span_s | 1802.191044807434 | 1801.8515615463257 |
| transaction_count | 42744 | 119798 |
| callback_attempts_sum | 412815 | 119798 |
| callback_retries_sum | 370071 | 0 |
| callback_attempts_p50_p95_p99_max | [1, 47, 84, 125] | [1, 1, 1, 1] |
| commit_calls_sum | 42595 | 119798 |
| commit_retries_sum | 0 | 0 |
| commit_calls_p50_p95_p99_max | [1, 1, 1, 1] | [1, 1, 1, 1] |
| findAndModify:counters:error:112 (último snapshot) | 318101 | 0 |
| update:cash_sessions:error:112 (último snapshot) | 52119 | 0 |

RSS é máximo amostrado, CPU média usa o intervalo entre primeiro/último sample e inclui preparação coberta pela amostragem. CPU está em núcleos equivalentes do processo. Contadores de driver não são auditoria exaustiva; `benchmark-summary.json` preserva os snapshots completos e todos os eventos de transação falha. O ensaio P6 teve 149 erros recuperados com mesma referência; eles permanecem contados como erros. Não houve operação esgotada nem divergência final.

Eventos transacionais também incluem consultas de replay após erro; uma consulta confirmada sem efeitos não equivale a outra venda. Não somar `outcomes.committed` aos pedidos. A integridade usa os pedidos/marcadores efetivos do banco, não a contagem de logs.
