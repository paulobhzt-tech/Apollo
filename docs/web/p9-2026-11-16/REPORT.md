# P9 — APROVADA em desempenho no escopo testado

**PRODUÇÃO CONTINUA BLOQUEADA.** A conclusão resulta da revisão integral do artefato e da aplicação dos critérios congelados, não do status verde do workflow. Nenhum merge ou deploy foi realizado.

## Fontes e recuperação verificadas

- [Campanha 43983212080](https://github.com/paulobhzt-tech/Apollo/actions/runs/43983212080), concluída com sucesso; [artefato 14287487902](https://github.com/paulobhzt-tech/Apollo/actions/runs/43983212080/artifacts/14287487902), 101.870.347 bytes, SHA-256 `f5fa43a363e6ad80ed79c14e887fcbdb8b94ffd88c63335c3bbd819ef2a7e7c7`. Download integral, tamanho/SHA-256 conferidos contra a API e CRC de todos os membros ZIP aprovado. Expiração informada: 14/02/2027 às 23:54:14 UTC.
- Controle P8: `e670c5e24321cc6bc1de69348da3d55bc7730887`; candidata P9 executada: `dd10ded324ee8ea378349705e9bbeb81ef410ed8`. PR #24 continua em rascunho sobre a P8.
- Os 41 arquivos foram lidos e tiveram SHA-256 registrado. Todos os JSONs/JSONL foram analisados; logs integrais das oito rodadas foram percorridos. `comparison.json`, resultados brutos e mensagens `P9_RESULT` coincidem. Nenhum traceback, `ERROR:`, `FATAL` ou log Mongo de severidade E/F foi encontrado nos logs de carga.
- [Revisão independente e manifesto](evidence/acceptance-reviewed.json): critérios recalculados, contagens de eventos, comandos, percentis instrumentados, auditorias, cronologia e hashes. Os arquivos brutos completos permanecem no artefato, sem substituir sua análise por este resumo.
- Critérios P8 preservados byte a byte: SHA-256 `29942733b82407d0771454fed42507b183ea31e699ed41b41f6750d7115eb992`.

## Ambiente e comparação controlada

Mesmo runner para ambas as versões: Linux x86_64/glibc 2.43, quatro CPUs visíveis, Python 3.12.16, MongoDB 7.0.16, replica set descartável de um membro, cache WiredTiger 0,25 GiB e um worker FastAPI. Mesma ferramenta e instrumentação P8, HTTP loopback keep-alive, 50 contas fictícias distintas, caixa/produto/ingrediente compartilhados. Cada par consiste em venda PIX sintética de R$10 e cancelamento; nenhum dado real, adquirente ou SEFAZ.

Oito rodadas completas: histórico de 60.000 documentos por versão; ABBA P8/P9/P9/P8 com 5/10/20/30/50 operadores, 15 segundos ativos por carga; depois 1.800 segundos ativos por versão a 50 operadores, com drenagem. Réplica/dataset novos por rodada e índices idênticos em todas. A autenticação precede o relógio de tráfego. Todos os erros e tentativas são contabilizados. O volume final difere porque o throughput difere.

## Prolongados: P8 versus P9 no mesmo runner

| Indicador | Controle P8 | P9 |
|---|---:|---:|
| Tráfego + drenagem (s) | 1.800,37 | 1.800,33 |
| Pares completos | 87.400 | 89.201 |
| Pares/s (sem autenticação) | 48,54 | 49,54 |
| HTTP p50 / p95 / p99 (ms) | 513,63 / 638,33 / 684,45 | 501,14 / 646,38 / 708,64 |
| Par p50 / p95 / p99 (ms) | 1.024,87 / 1.135,32 / 1.188,29 | 987,01 / 1.176,65 / 1.265,41 |
| HTTP 503 / outros erros / transporte / esgotadas | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Divergências / referências duplicadas / números duplicados / parciais | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

Ambas as versões passam no prolongado contemporâneo. A P9 teve throughput +2,06% e p50 HTTP menor, mas **p95 HTTP +1,26%, p99 HTTP +3,53%, par p95 +3,64% e par p99 +6,49%** em relação ao controle: as caudas pioraram ligeiramente, permanecendo dentro dos limites. Não declarar melhora uniforme ou significância estatística.

A P8 histórica reprovou com HTTP p95 de 1.055,64 ms em outro ensaio/runner. O controle atual de 638,33 ms mostra variação de ambiente/campanha; a distância até a P9 atual não pode ser atribuída integralmente à otimização. No histórico de 60 mil documentos desta campanha, a P8 também excedeu HTTP p99 (3.167,46 ms); a P9 passou (730,62 ms). Essa reprovação do controle está preservada, não oculta.

## Critérios simultâneos da candidata

| Critério | Limite congelado | P9 prolongada | Resultado |
|---|---:|---:|---|
| Tráfego ativo configurado | ≥ 1.800 s | 1.800 s + drenagem | PASSOU |
| HTTP p95 | ≤ 1.000 ms | 646,38 ms | PASSOU |
| HTTP p99 | ≤ 2.000 ms | 708,64 ms | PASSOU |
| Par financeiro p95 | ≤ 2.000 ms | 1.176,65 ms | PASSOU |
| Par financeiro p99 | ≤ 4.000 ms | 1.265,41 ms | PASSOU |
| HTTP 503 | 0 | 0 | PASSOU |
| Outros erros HTTP/transporte | 0 | 0 | PASSOU |
| Operações esgotadas | 0 | 0 | PASSOU |
| Divergências financeiras | 0 | 0 | PASSOU |
| Referências/números duplicados | 0 | 0 / 0 | PASSOU |
| Confirmações parciais | 0 | 0 | PASSOU |

Todas as 12 linhas candidatas (histórico, duas repetições das cinco cargas e prolongado) satisfazem simultaneamente os limites aplicáveis. Os limites não foram aumentados, percentis não foram somados ou agregados como amostras individuais e execuções desfavoráveis não foram descartadas. Tabela completa: [BENCHMARK.md](BENCHMARK.md).

## Diagnóstico e alteração efetivamente comprovada

A instrumentação anterior mediu a admissão FIFO como ponto de acumulação, com variação do tempo de serviço/commit amplificando a espera. A sonda intrusiva [43981924464](https://github.com/paulobhzt-tech/Apollo/actions/runs/43981924464) registrou posse p95 76,111 ms, admissão p95 venda/cancelamento 1.992,770/2.927,892 ms e cauda de commit; pool e locks amostrados não comprovaram esgotamento. Esses números de profiling não são a aceitação. Dados preservados em [focused-components.json](evidence/focused-components.json).

`move_stock` consultava o catálogo mesmo quando todos os itens tinham `stock_recipe` e o resultado não era utilizado. A mudança `ac3158ed44eeb5b752b22279a95b730ce0d824e5` restringe a consulta aos itens ativos sem snapshot (`None`). Snapshots preenchidos ou vazios continuam autoritativos; itens legados/mistos preservam o fallback na mesma transação. Nenhuma escrita, FIFO, regra financeira, autorização, numeração, marcador, retry ou write concern foi relaxado.

**Efeito causal observado nos eventos completos:** no prolongado P8, 262.200 finds de produtos para 87.400 pares (3/par); na P9, 89.201 para 89.201 pares (1/par), redução de 66,67% nesse tipo de comando por par. A validação do produto em `build_items` permanece. A leitura evitada é comprovada; uma redução universal do p95 não é.

Nos prolongados, admissão p95 venda/cancelamento foi 623,866/622,606 ms na P8 e 630,004/630,828 ms na P9. Callback p50 venda/cancelamento caiu de 10,407/5,839 ms para 10,067/5,500 ms, mas os p95 aumentaram levemente. Não somar componentes sobrepostos nem atribuir todo o tempo ao Mongo, CPU ou a um comando isolado.

## Integridade financeira e concorrência

As oito rodadas auditaram **193.873 novas ordens** após drenagem. Foram analisados todos os 387.746 eventos de requisição e de transação; status HTTP 200, uma tentativa por callback, zero retries/falhas/esgotamentos instrumentados. Logs transacionais independentes concordam com essas contagens. Marcadores, movimentos, caixa, contador e referências conferem com o banco auditado.

| Rodada | Novas ordens/marcadores | Movimentos/versão de caixa | Estoque final | Duplicações/divergências/parciais |
|---|---:|---:|---:|---|
| p9h1 | 1.250 | 2.500 | 1.000 | 0 / 0 / 0 |
| p9h2 | 1.400 | 2.800 | 1.000 | 0 / 0 / 0 |
| p9a1 | 3.493 | 6.986 | 1.000 | 0 / 0 / 0 |
| p9b1 | 3.653 | 7.306 | 1.000 | 0 / 0 / 0 |
| p9b2 | 3.854 | 7.708 | 1.000 | 0 / 0 / 0 |
| p9a2 | 3.622 | 7.244 | 1.000 | 0 / 0 / 0 |
| p9base | 87.400 | 174.800 | 1.000 | 0 / 0 / 0 |
| p9candidate | 89.201 | 178.402 | 1.000 | 0 / 0 / 0 |

Zero marcadores órfãos, movimentos inesperados ou marcadores duplicados. No prolongado P9: contador e sequência contínua 1..89.201, estoque/lotes conforme auditorias e regressões; 89.201 marcadores, 178.402 movimentos e versão de caixa, nenhum pedido pago remanescente. A fixture histórica de 60.000 documentos não é contada como novas vendas auditadas.

## Regressões e rastreabilidade

[Regressão otimizada 43983196839](https://github.com/paulobhzt-tech/Apollo/actions/runs/43983196839), HEAD `d7043f807394e12d08fe4c9bc740af2d10abf10c`: 373 backend + 3 subtestes, 44 P6 reais (11 em cada resolução), 12 P5 e 14 Node aprovados; typecheck, lint (nove avisos herdados), builds web/frontend desktop e sintaxe Electron aprovados. Os quatro novos testes verificam snapshot, legado, itens mistos e snapshot vazio, com consumo/devolução de estoque/lotes e consultas encaminhadas ao MongoDB real. [Metadados](evidence/optimized-regression.json).

O diff entre o HEAD da campanha e o HEAD remoto recuperado nesta finalização (`47d5e04426227208761b9d63c25040cbbcff268d`) contém apenas documentação/evidências. Esta conclusão também altera somente documentação; não requer repetir a campanha. Os checks documentais posteriores são separados da aplicação efetivamente ensaiada.

Falhas de coleta anteriores foram preservadas: primeiro perfil sem cpu.prof, corrigido para gravar no shutdown ASGI e falhar se ausente; primeiro workflow de regressão com caminho incorreto do script Electron, corrigido sem remover testes. Gatilhos financeiros/diagnósticos/regressões passaram a push com paths relevantes para evitar repetição por commits somente documentais.

## Limitações e veredito

**APROVADA exclusivamente a homologação de desempenho na carga testada. PRODUÇÃO BLOQUEADA.** Há um prolongado por versão e duas repetições curtas por versão/carga; não há intervalo de confiança ou estabilidade universal. A ordem dos prolongados foi P8→P9, não alternada; somente o ABBA curto alterna versões. Variações entre runners, armazenamento e execuções permanecem relevantes.

O harness herdado não arquiva cada latência HTTP/par individual: os limites foram verificados independentemente a partir dos quantis gravados, enquanto todos os eventos transacionais, comandos e logs fornecidos foram percorridos. Não é possível recalcular percentis HTTP desde amostras individuais ausentes. O arquivo `progress.json` ficou com checkpoint `candidate-long` anterior à conclusão; oito saídas brutas completas, cronologia com exit 0, comparação e veredito finais comprovam a conclusão. O checkpoint não foi usado como prova de aprovação.

Não há certificação de capacidade multiworker/hosts, rede WAN, adquirente/SEFAZ, segurança externa, impressoras/dispositivos ou instalador Windows executado. Build/sintaxe Electron não equivalem a teste físico. Os testes de recuperação/idempotência provêm das regressões específicas, sem alegar injeção de falha em cada par da carga. Nenhuma venda offline foi habilitada. Sem merge, deploy ou dados financeiros reais.
