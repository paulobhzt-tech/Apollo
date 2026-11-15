# Apollo PDV — auditoria e homologação parcial, 15/11/2026

**Parecer: REPROVADO para liberação em produção.** Há defeitos P0 reproduzidos com persistência simulada e testes essenciais bloqueados. Nenhum merge, deploy, migração, acesso a banco de produção ou alteração de credenciais reais foi executado.

## Estado inicial e rastreabilidade

- Repositório: `paulobhzt-tech/Apollo`; principal: `paulobhzt-tech/Apolo`, `b94730282029248b7e1e6153f30381621dfebb51`.
- `audit/advanced-301-local` ausente entre as 18 branches remotas retornadas e no clone. `400a9923beb2877e1141f9b50297e6975b8629bf` não está no clone; GitHub retornou 422, “No commit found”. Não é possível reproduzir exatamente a homologação anterior a partir desses identificadores.
- Base disponível: PR #14, `security/role-permissions-hardening`, `bad9139ab4bc86de5498af888c84d3e50844966c`.
- Branch de trabalho: `audit/master-validation-20261115`.
- PR #13 (`0fb260e778db61cf71f8e1fc6b6c80c7e859d007`) incorporado por cherry-pick local `ca1218c`. Conflitos apenas nas listas de testes de dois workflows; preservadas ambas as suítes. Branches originais e principal preservadas.
- Runs remotos observados: #14 `43650089549`, `43650021660`, `43650021644` concluídos com sucesso; #13 `43649003744`, `43648976060`, `43648976048` com sucesso. Esses resultados pertencem aos commits anteriores, não às novas alterações.

## Diagnóstico por criticidade

| Prioridade | Evidência e efeito | Situação |
|---|---|---|
| P0 | `quick_sale` cria pedido, finaliza pagamento e só então movimenta estoque. Falha injetada em `move_stock` retorna 409, mas o pedido permanece pago; replay retorna esse pedido sem tentar estoque. | Reproduzido isoladamente; correção transacional bloqueada por MongoDB indisponível. |
| P0 | `cancel_order` lê o estado antes da autorização e atualiza sem comparação de status. Duas chamadas que leem o mesmo pedido pago executam duas devoluções de estoque. | Reproduzido com interleaving determinístico e persistência simulada. |
| P0 | `syncQueue` gravava ao final uma lista baseada no início da sincronização, apagando vendas adicionadas durante os awaits. | Corrigido; três testes falham antes e passam depois. Limite: mesma instância JavaScript. |
| P1 | bcrypt síncrono em handlers async bloqueia o event loop; uma requisição simples pode esperar toda uma sequência de logins. | Corrigido com pool de threads limitado do Starlette/AnyIO. Custo bcrypt 12 preservado. |
| P1 | Backup JSON excluía `pin_hash`, mas incluía `password_hash`. Restauração aceitava hash de senha importado e preservava apenas PIN local. | Corrigido; exportação omite ambos e restauração preserva ambos os hashes locais. Novos funcionários sem credenciais locais ficam inativos. |
| P1 | `BACKUP_COLLS` não inclui `purchases`, `lot_consumptions`, `bills`, `account_categories` e `payment_methods`, embora os módulos usem essas coleções. | Omissão estática confirmada; round-trip completo não homologado. Não tratar JSON como backup integral. |
| P1 | `deploy/vps/compose.yaml` inicia `mongo:7.0` sem replica set; pagamento parcial exige transações. | Incompatibilidade de configuração identificada; não alterada nem implantada. |
| P2 | `adjust_balance` faz `$inc`, depois `$set` com saldo previamente lido; há janela para sobrescrever incremento concorrente. | Risco confirmado por sequência de código; concorrência real não executada. |
| P2 | `ensure_indexes` roda em background e captura erros; a aplicação pode aceitar tráfego antes de concluir índices únicos relevantes. | Risco de inicialização identificado; sem mudança especulativa de índices. |
| P2 | Busca por PIN percorre funcionários bcrypt; custo cresce com quantidade de contas. | Offload evita bloquear event loop; custo total e política de admissão ainda exigem medição real. |
| P2 | Fila offline compartilhada não tem transação entre janelas; rejeitados são limitados a 200, e JSON inválido é tratado como vazio. | Riscos pendentes; correção entregue não resolve esses caminhos. |
| P3 | Build produz JS de aproximadamente 1,27 MB, dois avisos de seletor CSS; lint tem nove avisos, incluindo estado não usado e dependência React instável. | Build/lint passam com avisos; sem redesenho ou refatoração ampla. |
| A investigar | Há um arquivo de backup JSON versionado em `backend/backups/`. | Conteúdo não inspecionado nem publicado neste relatório. Revisar exposição com responsável antes de qualquer remoção. |

A simulação financeira usa as funções reais de orquestração, mas substitui persistência e efeitos de domínio. Ela demonstra a ordem incorreta e a ausência de guard concorrente; não é teste de transação MongoDB, rollback real nem comprovação de duplicidade em produção. `backend/tools/audit_financial_reproduction.py` verifica os defeitos existentes; seu exit 0 significa **defeitos reproduzidos**, não aprovação financeira.

## Alterações e commits

| Commit | Mudança |
|---|---|
| `ca1218c` | Preserva PR #13 sobre PR #14 e concilia workflows. |
| `be1bc8a` | Preserva vendas adicionadas durante sincronização offline; adiciona teste Node sem dependência nova. |
| `1a088fe` | Executa hashing e verificação bcrypt de autenticação em threadpool; cinco regressões e harness de carga. |
| `9870b8a` | Exclui hashes de senha de backups e preserva credenciais locais na restauração; duas regressões. |

Arquivos funcionais: `frontend/src/lib/offline.ts`, `backend/lib/auth.py`, `backend/routers/auth.py`, `backend/routers/config.py`. Testes: `frontend/tests/offline-queue.test.mjs`, `backend/tests/test_auth_nonblocking.py`, `backend/tests/test_backup_credentials.py`. Workflows: `.github/workflows/quality-checks.yml` e `validacao-pdv.yml`. Código herdado de #13: `backend/server.py`, `backend/tests/test_frontend_paths.py`. Harnesses e documentação ficam nesta branch.

A exportação passa a omitir hashes; consumidores que indevidamente esperavam esse campo precisam se adaptar. A restauração usa hashes existentes no destino, sem aceitar credenciais de um arquivo importado. Backup não equivale a transferência de contas entre instalações.

## Testes executados e limites

- Linha de base com #13 e #14 combinados: **268 testes e 3 subtestes passaram**.
- Offline: três cenários falharam antes, os mesmos três passaram depois: nova venda durante sucesso, nova venda durante erro de rede, replay em duas passagens.
- Bcrypt: cinco casos falharam antes, depois passaram; cobrem lookup por PIN, verificação de unicidade, migração do hash legado, login por senha e criação de funcionário. Suíte direcionada: **200 passaram**.
- Backup: teste de exportação falhou antes; teste de restauração falhou antes da correção da preservação. Após correção, **194 testes direcionados passaram** (duas regressões + matriz de permissões).
- Gestão comercial isolada: **21 testes e 8 subtestes passaram**, usando arquivos temporários e comandos de infraestrutura simulados.
- TypeScript `npm run typecheck`, `npm run build`, `npm run lint`: executados com sucesso. Build e lint têm avisos descritos acima.
- `node --check` em main/preload/build-web do desktop e `python -m compileall -q backend`: executados com sucesso.
- `git diff --check`: executado após alterações.
- **Seis integrações não executadas**, somente coletadas: duas em `test_partial_payment_integration.py` e quatro nos três `test_tscheck_*`. Não foram contornadas nem removidas do CI.
- Suíte backend isolada final: **275 testes e 3 subtestes passaram** (`evidence/final-backend.txt`). CI anterior não substitui CI desta branch.

Ambiente local: Python 3.12.14, Node 24.22.1; CI usa Python 3.11 e Node 22. Dependências de execução e teste necessárias foram instaladas no ambiente, sem alterar manifests. PyMongo 4.18.2 e pacotes Google foram ajustados às versões fixadas; faixas abertas podem diferir do CI. Não foi gerado lock novo nem alegada instalação integral de `requirements.txt`. Vulnerabilidades de dependências não foram certificadas.

## Desempenho: comparação controlada, escopo de autenticação

HTTP real em loopback, Uvicorn em processo separado, bcrypt real com custo 12, uma conexão persistente por cliente e uma conexão de sondagem. Cada cliente faz GET de aquecimento e POST de login. Banco é adaptador sintético; não há MongoDB ou escrita real. Uma rajada por nível, sem ensaio prolongado; percentis por nearest-rank. Amostras pequenas não estimam caudas de produção.

| Sessões | Login p95 antes/depois (ms) | Sondagem máxima antes/depois (ms) | Logins/s antes/depois | Erros |
|---|---|---|---|---|
| 1 | 188,21 / 194,79 | 166,69 / 1,43 | 4,79 / 4,71 | 0 / 0 |
| 5 | 942,60 / 195,35 | 919,45 / 3,25 | 5,19 / 23,21 | 0 / 0 |
| 10 | 1.883,92 / 308,13 | 1.860,12 / 4,96 | 5,24 / 30,30 | 0 / 0 |
| 20 | 3.551,26 / 572,62 | 3.709,99 / 57,84 | 5,31 / 33,36 | 0 / 0 |
| 30 | 5.429,75 / 763,90 | 5.572,38 / 59,89 | 5,32 / 37,61 | 0 / 0 |
| 50 | 9.000,35 / 1.271,40 | 9.327,04 / 100,33 | 5,31 / 38,77 | 0 / 0 |

JSONs anexos incluem p50, p95, p99, amostras e duração. Houve pequena piora de login na carga de uma sessão; não se afirma ganho universal. O ganho observado é responsividade sob concorrência e paralelismo de bcrypt neste host. CPU, memória, conexões de banco, utilização do MongoDB, consultas/explain, N+1, contenção, sessões reais e escrita financeira sob carga **não foram medidos**. Nenhum índice ou timeout foi alterado. Esse achado não comprova a causa da falha histórica de keep-alive cuja base está ausente.

## Bloqueios e cobertura das fases

MongoDB/Docker não estavam instalados. Tentativa de MongoDB 8.0.16 abortou em tcmalloc por detecção de CPU do ambiente; alternativa MongoDB 7.0.16 encerrou com `open: Operation not permitted`. Nenhuma instância pôde ser iniciada em dados temporários. Não há acesso autorizado a infraestrutura externa de homologação com replica set.

| Fase e atividades | Cobertura efetiva | O que falta |
|---|---|---|
| 1: 1–25 | Inventário, tecnologias, 160 rotas, modelos/guards, build e revisão estática direcionada | Revisão exaustiva, ciclos, código morto e cobertura quantitativa |
| 2: 26–55 | Regressões #13/#14, guards, sessões, CSRF, hashes e backup | Pentest completo, CVEs, força bruta distribuída, upload/XSS/Electron dinâmico |
| 3: 56–80 | Duas reproduções de P0, helpers financeiros e testes isolados existentes | Atomicidade, rollback, recuperação e conciliação com banco real |
| 4: 81–95 | Leitura de estoque/FEFO, testes isolados e reprodução de devolução duplicada | Jornadas e concorrência real, restauração de lotes |
| 5: 96–115 | Índices e cliente Motor inspecionados | explain, métricas, sessões, pooling e conflitos reais |
| 6: 116–135 | Rajadas 1/5/10/20/30/50 no harness de login | PDV completo, CPU/RAM, leituras/escritas reais e longa duração |
| 7: 136–150 | HTTP persistente no harness; bloqueio do event loop corrigido | Falha histórica, leaks, reconexão e encerramento de transações |
| 8: 151–165 | Fila e replay lidos; perda durante sync corrigida e testada | Offline real, múltiplas janelas, fechamento inesperado e banco |
| 9: 166–185 | Estrutura, API/state, tipos, build e lint | Validação visual, acessibilidade, mobile/Windows e cliques reais |
| 10: 186–205 | Regressões novas, suites isoladas e harnesses | Seis integrações, carga financeira/estoque e rollback |
| 11: 206–225 | Compose, scripts, envs, CI e backup inspecionados | Readiness real, restauração, monitoramento e reinicialização |
| 12: 226–245 | Relatório, mapa de rotas, inventário, guias e pendências | Guias operacionais só poderão ser homologados em infra própria |
| 13: 246–260 | Revisão das alterações, tipos/lint e riscos | Cobertura quantitativa e auditoria completa de acoplamento |
| 14: 261–280 | Simulações isoladas de erro/replay/concorrência | Jornada real, sobrecarga/recuperação e transações |
| 15: 281–295 | Branches/PRs/CI/commits inspecionados; branch e commits isolados | Checks desta branch após publicação; sem merge |
| 16: 296–310 | Matriz abaixo | Critérios essenciais ainda não demonstrados |
| 17: 311–330 | Entrega documental e evidências disponíveis | Não equivale à execução de todas as 330 atividades |

`CHECKLIST_330.csv` rastreia os 330 números; APROVADO vale apenas para a tarefa/escopo indicado, não para toda uma área. NÃO TESTADO significa ausência de evidência suficiente. BLOQUEADO indica dependência concreta de banco/infra ausentes. Não somar inspeção estática como teste de integração aprovado.

## Prontidão para produção (296–310)

| ID | Requisito | Estado | Motivo |
|---|---|---|---|
| 296 | Segurança mínima obrigatória | NÃO TESTADO | Correções direcionadas não constituem avaliação completa |
| 297 | Integridade financeira | REPROVADO | Venda paga sobrevive falha de estoque no cenário isolado |
| 298 | Integridade de estoque | REPROVADO | Cancelamento concorrente devolve duas vezes |
| 299 | Estabilidade | BLOQUEADO | Sem banco e jornadas reais |
| 300 | Desempenho | NÃO TESTADO | Apenas benchmark isolado de autenticação |
| 301 | Recuperação após falhas | BLOQUEADO | Falta infraestrutura transacional |
| 302 | Backup/restauração | BLOQUEADO | Omissões de coleções e ausência de round-trip real |
| 303 | Observabilidade | NÃO TESTADO | Sem validação de alertas/métricas reais |
| 304 | Compatibilidade | NÃO TESTADO | Tipos/build passam; Windows/mobile pendentes |
| 305 | Cobertura de testes críticos | BLOQUEADO | Seis integrações e cenários P0 pendentes |
| 306 | Configuração de produção | NÃO TESTADO | Compose sem replica set incompatível com parcial |
| 307 | Gestão de segredos | NÃO TESTADO | Correção de backup é limitada; exposição histórica não avaliada |
| 308 | Procedimentos operacionais | NÃO TESTADO | Runbook documentado, sem exercício real |
| 309 | Procedimentos de rollback | NÃO TESTADO | Reversão de código documentada; dados não exercitados |
| 310 | Riscos residuais | NÃO TESTADO | Lista existe, sem aceite operacional ou mitigação completa |

## Próximas prioridades

1. Disponibilizar clone/patches e evidências da branch local ausente, se precisarem ser preservados; esta branch não recupera trabalho que nunca chegou ao remoto.
2. Em replica set descartável, reproduzir P0 e implementar unidade transacional para pedido/pagamento/fiado/estoque/lotes/tickets; idempotência deve só reconhecer operação integralmente confirmada. Não resolver com lock de processo ou flag isolada.
3. Aplicar a mesma unidade transacional a cancelamento/estorno com condição de estado; validar concorrência, interrupção entre cada write e repetição após commit de resultado desconhecido.
4. Testar fechamento de caixa concorrente com pagamento, saldo/limite de fiado e estorno com lotes de origem. Rever `adjust_balance` sob concorrência real.
5. Homologar backup que cubra todas as coleções e restauração atômica em destino novo. Corrigir compose de homologação para transações, sem tocar produção.
6. Medir carga real com 1–50 sessões, recursos e queries; executar 30–60 minutos, falhas/reconexão e Windows/offline com múltiplas janelas. Medir antes de criar índices ou alterar pooling/timeouts.
7. Revisar CVEs e backup versionado, monitoramento, alertas, segredos e plano operacional. Liberar produção somente após resolver P0 e demonstrar requisitos essenciais.
