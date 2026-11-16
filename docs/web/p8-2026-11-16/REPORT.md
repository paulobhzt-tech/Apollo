# P8 FINAL — REPROVADA

**PRODUÇÃO BLOQUEADA.** Campanha completa e verificável; a reprovação é de desempenho, não uma execução inconclusiva. HTTP p95 **1.055,64 ms** excedeu o limite congelado de **1.000 ms** em 55,64 ms (5,564%). Não houve erro HTTP/transporte, esgotamento, divergência, duplicação ou confirmação parcial nos ensaios. Nenhum limite foi alterado.

HEAD executado: `908007e1130e40502a8d61c114cd5bf323a83267`. Aplicação de referência: `47ad2fca98b7dc8c280846ece8f1e75ce9bb6a93`. P7: `0a0766421d57f13ec2fbfd31aa8e1cd45461bb77`, PR #22. PR #23 continua em rascunho e empilhado sobre #22. [Campanha e logs](https://github.com/paulobhzt-tech/Apollo/actions/runs/43960177013); [artefato bruto](https://github.com/paulobhzt-tech/Apollo/actions/runs/43960177013/artifacts/14279180466).

## Critérios simultâneos

| Critério | Limite congelado | P8 observado | Resultado |
|---|---|---|---|
| Tráfego ativo + drenagem (s) | ≥ 1800 | 1800.846 | PASSOU |
| HTTP 503 | ≤ 0 | 0 | PASSOU |
| Outros erros HTTP/transporte | ≤ 0 | 0 | PASSOU |
| Operações esgotadas | ≤ 0 | 0 | PASSOU |
| HTTP p95 (ms) | ≤ 1000 | 1055.64 | FALHOU |
| HTTP p99 (ms) | ≤ 2000 | 1186.79 | PASSOU |
| Par p95 (ms) | ≤ 2000 | 1999.96 | PASSOU |
| Par p99 (ms) | ≤ 4000 | 2159.12 | PASSOU |
| Divergências financeiras | ≤ 0 | 0 | PASSOU |
| Referências duplicadas | ≤ 0 | 0 | PASSOU |
| Números duplicados | ≤ 0 | 0 | PASSOU |
| Confirmações parciais | ≤ 0 | 0 | PASSOU |

Configurados 1.800 segundos ativos por prolongado, seguidos de drenagem. A duração observada de 1.800,846 s inclui drenagem; o tempo ativo configurado não foi reduzido. Autenticação é anterior ao relógio de tráfego. Espera de admissão integra o orçamento original de 30 segundos; nenhuma mudança na fila, retries, transações ou política de commit foi feita.

## Comparação prolongada

| Versão | Pares | Pares/s | HTTP p50 / p95 / p99 (ms) | Par p50 / p95 / p99 (ms) | Erros / esgotadas |
|---|---|---|---|---|---|
| P7 | 40800 | 22.64 | 1039.04 / 1791.83 / 2052.15 | 2175.48 / 2782.55 / 2947.28 | 0 / 0 |
| P8 | 54415 | 30.21 | 823.68 / 1055.64 / 1186.79 | 1606.83 / 1999.96 / 2159.12 | 0 / 0 |

P8 melhorou o p95 HTTP em 41.09% e pares/s em 33.44% nesta comparação. Isso não satisfaz o limite de p95. O par p95 de 1.999,96 ms passou por apenas 0,04 ms, sem margem operacional. Há uma execução prolongada por versão; não se afirma estabilidade universal.

## Ambiente e rastreabilidade

Runner Linux x86_64, quatro CPUs visíveis, Python 3.12.16, MongoDB 7.0.16, replica set descartável de um membro, cache WiredTiger 0,25 GiB e um worker FastAPI. HTTP loopback keep-alive, 50 contas fictícias distintas, um caixa e um produto/ingrediente compartilhados, pagamento PIX sintético de R$10 seguido de cancelamento; sem adquirente externa. Mesmo runner, runtime, ferramenta de carga e índices de origem por versão. Cada rodada começa com banco novo. Histórico de 60.000 pedidos é fixture de cardinalidade, não 60.000 pagamentos homologados. O candidato terminou com mais pedidos devido ao throughput.

| Rodada | Fonte | Início UTC−3 | Fim UTC−3 | Processo (s) | Tráfego + drenagem (s) | Exit |
|---|---|---|---|---|---|---|
| smoke | P8 | 2026-11-16 18:27:22 | 2026-11-16 18:27:26 | 3.86 | smoke 2 s | 0 |
| h1 | P7 | 2026-11-16 18:27:32 | 2026-11-16 18:28:10 | 38.03 | 32.986 | 0 |
| h2 | P8 | 2026-11-16 18:28:17 | 2026-11-16 18:28:53 | 36.51 | 31.035 | 0 |
| a1 | P7 | 2026-11-16 18:28:57 | 2026-11-16 18:30:24 | 87.09 | 15.134 / 15.153 / 15.287 / 15.341 / 16.101 | 0 |
| b1 | P8 | 2026-11-16 18:30:26 | 2026-11-16 18:31:54 | 87.67 | 15.049 / 15.265 / 15.425 / 15.816 / 15.652 | 0 |
| b2 | P8 | 2026-11-16 18:31:57 | 2026-11-16 18:33:25 | 87.69 | 15.115 / 15.219 / 15.66 / 15.68 / 15.985 | 0 |
| a2 | P7 | 2026-11-16 18:33:28 | 2026-11-16 18:34:56 | 88.20 | 15.136 / 15.25 / 15.398 / 15.813 / 15.867 | 0 |
| p7long | P7 | 2026-11-16 18:34:59 | 2026-11-16 19:05:08 | 1808.67 | 1802.158 | 0 |
| acceptance | P8 | 2026-11-16 19:05:11 | 2026-11-16 19:35:19 | 1808.32 | 1800.846 | 0 |

Datas: 16/11/2026, America/Sao_Paulo (UTC−3); epochs e tempos exatos estão em [timeline.json](evidence/timeline.json). O job completo teve timestamps UTC 2026-11-16T21:26:54Z a 2026-11-16T22:35:59Z; os dados exatos estão em ci-tested-head.json.

Os 31 arquivos emitidos pelo coletor foram recuperados integralmente do log e verificados por tamanho e SHA-256 contra [runner-manifest.json](evidence/runner-manifest.json). O manifesto final inclui a documentação consolidada. Séries de recursos, resultados e planos comprimidos estão versionados; drivers e logs completos ficam no artefato (58.186.609 bytes; SHA-256 `0b61aaf4b25877673eabe400cffa120ab56a6d895b30712f98ffcc5b8be31514`, expiração informada 14/02/2027). O verde do workflow significa execução/coleta concluída; o resultado de aceitação é explicitamente REPROVADA em [acceptance-result.json](evidence/acceptance-result.json).

## Gargalo restante e decisão

O índice não parcial `client_ref_lookup` eliminou o COLLSCAN financeiro comprovado. Na campanha longa, o comando de lookup por referência caiu de média 14,0212 para 0,3941 ms. A espera FIFO continua dominante: p95 P8 1.027,6207 ms na venda e 1.029,1243 ms no cancelamento, antes do trabalho transacional. Callback p95 21,0283 / 12,8544 ms e commit p95 2,3445 / 2,2209 ms. Percentis de componentes se sobrepõem e não devem ser somados. A fila é o ponto medido de acumulação; não se inferiu uma causa de CPU, lock específico ou solução segura sem ensaio adicional.

Nenhuma correção adicional de aplicação foi aplicada: reduzir/remover admissão ou mover gravações financeiras fora da transação exigiria prova própria e nova campanha. A melhoria existente foi preservada. Próximo trabalho necessário dentro da P8: investigar/reduzir custo do serviço serial e espera sob 50 operadores, mantendo contador, estoque, caixa e recuperação, e repetir a aceitação afetada. Não iniciar P9 nem repetir ensaios até conseguir um resultado favorável sem mudança causal comprovada.

## Regressões do HEAD executado

369 testes backend +3 subtestes, 44 cenários P6 reais (11 em desktop/notebook/tablet/mobile), 12 P5, 14 Node, typecheck, lint e builds web/frontend desktop aprovados. Lint: nove avisos herdados, zero erros. Sintaxe main/preload/build-web e teste real de recuperação/failover também aprovados. [CI e excertos verificados](evidence/ci-tested-head.json). A suíte funcional e a auditoria MongoDB real não foram substituídas por mocks. O código financeiro, frontend e Electron é idêntico ao HEAD de referência nesta finalização; o preflight do Actions verificou o diff. Build frontend desktop e sintaxe Electron não significam teste de instalador Windows ou hardware físico.

## Interrupções, cobertura e bloqueios

Ensaios locais anteriores a esta campanha estavam interrompidos ou sem saída completa verificável (a2 e prolongado P8); não foram usados como aprovação. O executor local desta sessão estava indisponível, por isso foi criada esta campanha isolada no Actions. Todas as oito rodadas novas saíram com exit 0, integridade auditada e evidências completas; não houve retomada de dados parciais.

Continuam pendentes o SLA a 50 operadores, múltiplos workers/hosts, segurança externa, impressão física, dispositivos reais e homologação comercial integral. A carga não representa todas as operações comerciais, rede móvel/WAN ou banco/adquirente externos. Recuperação/idempotência vêm também das regressões específicas, não de alegação de injeção de falha em cada par da carga. Venda offline no navegador permanece bloqueada. Sem merge, deploy, dados reais ou liberação de produção.
