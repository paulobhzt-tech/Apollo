# P8 FINAL — consultas e diagnóstico restante

Fonte P7 `0a0766421d57f13ec2fbfd31aa8e1cd45461bb77`; fonte P8 `908007e1130e40502a8d61c114cd5bf323a83267`. Contratos de índices reais separados; o coletor verificou sua presença/ausência e preservação da unicidade em todas as oito rodadas. MongoDB 7.0.16 real, executionStats e amostras de consulta em transação; volumes 0, 1.000, 10.000, 54.415 (maior volume final prolongado), 60.000. Profiler de orders também coletado no par h1/h2, disponível no artefato.

## Planos reais antes/depois

| Versão | Volume | Consulta | Plano vencedor | Docs | Chaves | Transação p50/p95/p99 ms |
|---|---|---|---|---|---|---|
| P7 | 54415 | sale_ref_absent | LIMIT → PROJECTION_SIMPLE → COLLSCAN | 54415 | 0 | 33.44 / 39.54 / 39.54 |
| P7 | 54415 | sale_ref_present | LIMIT → PROJECTION_SIMPLE → COLLSCAN | 54415 | 0 | 33.91 / 34.75 / 34.75 |
| P7 | 54415 | list_default | PROJECTION_SIMPLE → SORT → COLLSCAN | 54415 | 0 | 49.53 / 49.76 / 49.76 |
| P7 | 54415 | list_status | LIMIT → PROJECTION_SIMPLE → FETCH → IXSCAN:status_created | 100 | 100 | 1.21 / 1.30 / 1.30 |
| P7 | 60000 | sale_ref_absent | LIMIT → PROJECTION_SIMPLE → COLLSCAN | 60000 | 0 | 36.66 / 50.33 / 50.33 |
| P7 | 60000 | sale_ref_present | LIMIT → PROJECTION_SIMPLE → COLLSCAN | 60000 | 0 | 37.32 / 37.65 / 37.65 |
| P7 | 60000 | list_default | PROJECTION_SIMPLE → SORT → COLLSCAN | 60000 | 0 | 55.03 / 55.25 / 55.25 |
| P7 | 60000 | list_status | LIMIT → PROJECTION_SIMPLE → FETCH → IXSCAN:status_created | 100 | 100 | 1.41 / 1.61 / 1.61 |
| P8 | 54415 | sale_ref_absent | LIMIT → PROJECTION_SIMPLE → FETCH → IXSCAN:client_ref_lookup | 0 | 0 | 0.57 / 0.71 / 0.71 |
| P8 | 54415 | sale_ref_present | LIMIT → PROJECTION_SIMPLE → FETCH → IXSCAN:client_ref_lookup | 1 | 1 | 0.55 / 0.60 / 0.60 |
| P8 | 54415 | list_default | PROJECTION_SIMPLE → SORT → COLLSCAN | 54415 | 0 | 48.52 / 49.04 / 49.04 |
| P8 | 54415 | list_status | LIMIT → PROJECTION_SIMPLE → FETCH → IXSCAN:status_created | 100 | 100 | 1.24 / 1.34 / 1.34 |
| P8 | 60000 | sale_ref_absent | LIMIT → PROJECTION_SIMPLE → FETCH → IXSCAN:client_ref_lookup | 0 | 0 | 0.56 / 0.68 / 0.68 |
| P8 | 60000 | sale_ref_present | LIMIT → PROJECTION_SIMPLE → FETCH → IXSCAN:client_ref_lookup | 1 | 1 | 0.57 / 0.60 / 0.60 |
| P8 | 60000 | list_default | PROJECTION_SIMPLE → SORT → COLLSCAN | 60000 | 0 | 53.23 / 53.83 / 53.83 |
| P8 | 60000 | list_status | LIMIT → PROJECTION_SIMPLE → FETCH → IXSCAN:status_created | 100 | 100 | 1.21 / 1.31 / 1.31 |

Igualdade original `{client_ref: valor}`, sem adicionar predicado de tipo: P7 faz COLLSCAN embora exista índice único parcial de strings; P8 utiliza `client_ref_lookup`, índice não parcial e não único. A unicidade continua no índice parcial original, além do marcador financeiro e transações inalterados. Ausência de ref em 60.000 docs: 60.000 documentos examinados na P7, zero na P8; presença: 60.000 contra um. Consulta ausente p50 36,6649→0,5567 ms nesta sonda isolada; não confundir com HTTP. Planos completos em query-plans-P7.json.gz e query-plans-P8.json.gz, filtros e executionStats resumidos em query-summary.json.

## Efeito durante tráfego e custo

No prolongado, find:orders:client_ref totalizou 572.064,611 ms /40.800 chamadas (média 14,0212 ms) na P7 e 21.444,415 ms /54.415 (0,3941 ms) na P8. Isso confirma impacto do lookup no workload real, com distribuição de volumes distinta. Callback de venda p95 40,3413→21,0283 ms. O custo de todas as leituras e escritas por request está em request-components.json.gz; não interpretar total absoluto de comandos sem normalizar throughput.

A 60.000 documentos o novo índice ocupou 1.482.752 bytes na amostra; total de índices P7 11.956.224 e P8 13.574.144 bytes. Variações dos demais índices também existem; a diferença total não é um custo puro isolado. Tempos de seed e collectionStats constam dos planos brutos e não equivalem ao custo isolado de escrita financeira. Construção do índice com tráfego em produção não foi ensaiada.

## Gargalo comprovado restante

Com o scan financeiro corrigido, P8 ainda espera p95 1.027,6207 ms (venda) /1.029,1243 ms (cancelamento) na admissão FIFO. HTTP p95 1.055,64 ms reprova o teto de 1.000. O ponto de acumulação comprovado é a espera pela capacidade serial; não foi demonstrado que relaxar locks, particionar por caixa ou aumentar retries manteria segurança no estoque/contador compartilhados. Callback e commit são menores, mas seus percentis não são aditivos. Investigar custo do caminho serial e event loop/CPU com profiling adicional controlado antes de alterar a fila; nenhuma causa de CPU específica é afirmada.

Listagem sem filtro permanece COLLSCAN+SORT nas duas versões; list_status usa status_created. A listagem não é executada pelo par venda/cancelamento, portanto não foi apresentada como causa do p95 da campanha. Consultas por id, reconciliação e alternativa tipada constam dos planos; nenhuma leitura final, autorização ou regra financeira foi removida.
