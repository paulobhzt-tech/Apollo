# P9 — campanha remota em andamento; PRODUÇÃO BLOQUEADA

## Estado e escopo
PR #24 permanece em rascunho sobre a P8, sem merge/deploy. Base P8 e670c5e24321cc6bc1de69348da3d55bc7730887. Estado inicial desta retomada: d5115f3ce245ed90a93da3bbf729901b55d043f3. Relatório anterior preservado no histórico git.
O executor local permaneceu indisponível, mas o runner remoto e MongoDB 7.0.16 passaram em https://github.com/paulobhzt-tech/Apollo/actions/runs/43979973812 (ping/version confirmados). Diagnósticos financeiros posteriores usam replica set descartável de um membro, não o standalone do check inicial.

## Medições anteriores à otimização
Primeiro diagnóstico: https://github.com/paulobhzt-tech/Apollo/actions/runs/43980582669.
Aplicação inalterada, cinco cargas de 30 segundos, controle seguido de perfil. A 50 operadores: controle HTTP p95/p99 710,33/745,43 ms, par p95 1.250,36 ms, 43,25 pares/s; perfil 993,01/1.030,45 ms, par p95 1.722,42 ms, 30,75 pares/s. Zero erros, esgotadas, duplicações/divergências/parciais; 6.856 ordens no controle e 4.505 no perfil auditadas.
Não é comparação P8/P9 nem prova de melhora: código igual, overhead de profiling e outro runner. Dados em evidence/remote-diagnostic-first.json.
O primeiro run não salvou cpu.prof; sua ausência foi preservada e corrigida via flush no shutdown ASGI, com falha explícita se o arquivo faltar. Perfil corrigido completo: run43981545854, artefato14283607222, SHA256 b217523a1c69e2d5f04f797d4b0b64a8da1a5eca45340f39558160046d17d77e. Perfil de chamadas inclui espera I/O e contexto assíncrono; não é atribuição exclusiva de CPU por transação nem seus tempos cumulativos são aditivos.

Sonda focada: https://github.com/paulobhzt-tech/Apollo/actions/runs/43981924464; fonte336a62c70563e7c995c03ec9f59b58eadcb7368d.
50 operadores/30s com perfil intrusivo e coleta adicional: 588 pares, zero erros/esgotadas, auditoria financeira completa sem divergências/duplicações/parciais. Artefato14283617410, SHA256 5b20088e8c2b776fa2b39076a06d7cbf20a75f5e7dbdf4aebc37b5378ce1b4ec. Métricas integrais: evidence/focused-components.json.

| Componente na sonda intrusiva | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|
| Posse FIFO (venda/cancelamento agrupados) | 22,386 | 76,111 | 182,799 |
| Admissão venda | 1.167,810 | 1.992,770 | 2.818,610 |
| Admissão cancelamento | 1.156,372 | 2.927,892 | 3.480,980 |
| Callback venda | 20,252 | 21,632 | 24,146 |
| Callback cancelamento | 11,609 | 12,710 | 14,653 |
| Commit venda | 1,787 | 48,796 | 162,512 |
| Commit cancelamento | 1,673 | 68,174 | 170,955 |

Event-loop lag p95 2,979 ms/p99 13,757 ms (684 observações). Pool: 22.012 aquisições, 1.376.152 µs cumulativos de espera, máximo20 conexões, sem checkout_failed registrado. Última amostra Mongo: fila global0, conexões rejeitadas0, totalAborted0; espera amostrada ReplicationStateTransition w=4.370 µs/W=1 µs. Amostragem não exclui eventos entre coletas. ServerStatus não é prova exaustiva de ausência de conflitos; callbacks/comandos são mantidos nos artefatos.
Diagnóstico: fila acumula a espera causada pelo serviço serial. A cauda de commit nesta sonda contribui para a posse prolongada; não se alteram write concern, journal ou FIFO. Não se atribui toda a P8 a um único comando ou à CPU.

## Otimização segura implementada
Na sonda foram medidos 1.176 finds de produtos na venda +588 no cancelamento para588 pares (0,736782 s de comandos no total, média~0,418 ms/chamada, sob profiling). A inspeção de move_stock demonstra que a consulta ao catálogo era executada mesmo quando todos os itens já continham stock_recipe, caso em que seu resultado não era utilizado.
Commitac3158ed44eeb5b752b22279a95b730ce0d824e5 limita a busca de receitas de fallback aos itens ativos com stock_recipe=None. Snapshots completos e snapshots vazios continuam autoritativos; itens legados e mistos mantêm a consulta transacional.
Hipótese testável: reduzir de três para um find de produtos por par sintético diminui o custo serial; não há promessa de atingir o SLA antes da comparação controlada. Não remove validação de produtos em build_items, leituras de ingredientes, controle de estoque/lotes, contador, marcadores, caixa, transações ou políticas de retry/commit. Sem caching fora do snapshot.
Quatro integrações reais adicionadas em64777f5: snapshot, legado, misto e snapshot vazio, spy que encaminha consultas ao Mongo real, validação de consumo/devolução de estoque/lotes e uso da sessão nas consultas restantes.

## Regressões
Antes da otimização: https://github.com/paulobhzt-tech/Apollo/actions/runs/43981100922, HEADac604e62b6fe4ac7e5bb28dd77bf6dfc23bc138c, 369 backend +3 subtestes,44 P6 reais (11 por resolução),12 P5 e14 Node aprovados; typecheck/lint/builds web/frontend desktop e sintaxe Electron aprovados. Nove avisos lint herdados. Não somar execuções duplicadas como cobertura.
Uma execução inicial do workflow de regressão (43980964329) falhou por caminho incorreto do script Electron; corrigido para desktop/scripts/build-web.js. Nenhum teste removido.
Regressão da aplicação otimizada concluída: https://github.com/paulobhzt-tech/Apollo/actions/runs/43983196839, HEAD d7043f807394e12d08fe4c9bc740af2d10abf10c. 373 backend + 3 subtestes, 44 P6 reais (11 em cada resolução), 12 P5 e 14 Node aprovados. Typecheck, lint (nove avisos herdados), builds web/frontend desktop e sintaxe Electron aprovados. Quatro novos testes de estoque/lotes com MongoDB real aprovados; nenhum teste financeiro removido ou desabilitado.
Triggers financeiros/diagnósticos/regressões foram limitados a push com paths relevantes, evitando reexecuções em alterações apenas documentais. Runs anteriores disparados por pull_request podem repetir a mesma aplicação por avaliarem o diff cumulativo; não são novas comparações independentes.

## Campanha de homologação
https://github.com/paulobhzt-tech/Apollo/actions/runs/43983212080
HEAD configurado: dd10ded324ee8ea378349705e9bbeb81ef410ed8.
Workflow p9-acceptance.yml reutiliza o mesmo run_p8_load.py e benchmark/auditoria P8 para ambas as versões, runtime compartilhado, Mongo7.0.16/replica1/cache0,25GiB/worker1, HTTP keep-alive e dados sintéticos descartáveis.
Plano: par histórico60k, ABBA P8/P9/P9/P8 com5/10/20/30/50 operadores e15s/carga, seguido de1.800s ativos por versão a50, com drenagem. Autenticação fora do relógio de tráfego, todos os erros/tentativas contados.
Critérios copiados sem alterações e comparados byte a byte à P8. Novo sumarizador exige integridade em todas as rodadas e limites simultâneos em todas as linhas candidatas; campanha incompleta resulta INCONCLUSIVA. Workflow verde indica execução/coleta; acceptance-result.json decide o SLA.
P8 histórica: HTTPp95 1.055,64 ms, p99 1.186,79; parp95/p99 1.999,96/2.159,12;30,21 pares/s; REPROVADA. Não substituir esse veredito pelo controle curto em runner diferente.

## Veredito e limites
P9 INCONCLUSIVA até conclusão e revisão da campanha e das regressões da otimização. ABBA/prolongados ainda sem resultados consolidados. Sem autorização automática de produção.
Multiworker/hosts, segurança externa, impressão física/dispositivos, Windows/instalador executável e homologação comercial integral continuam fora desta homologação. Não usar dados financeiros reais.
