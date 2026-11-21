# Apollo PDV 3.0.1 — resultado final P45

**Candidata experimental aprovada nas verificações automatizadas descritas abaixo. Não liberada para operação na loja.**

Branch: `audit/p45-liberacao-operacional-web-pwa`.

Aplicação e build testados: [d8aff0cc41f5ac960c2306935a08ef7782abd34e](https://github.com/paulobhzt-tech/Apollo/commit/d8aff0cc41f5ac960c2306935a08ef7782abd34e). Commits posteriores acrescentam coleta comparativa, recibos de CI e este documento; não alteram backend ou frontend da candidata validada.

## Evidências e pacotes

- [Execução completa P45, aprovada](https://github.com/paulobhzt-tech/Apollo/actions/runs/44915308907).
- [Pacote Web/PWA, fonte, histórico Git, relatório, instalação, logs e SHA-256](https://github.com/paulobhzt-tech/Apollo/actions/runs/44915308907/artifacts/14711701725).
- [Comparação complementar P44/P45, aprovada](https://github.com/paulobhzt-tech/Apollo/actions/runs/44916287986).
- [Relatório e JSON da comparação](https://github.com/paulobhzt-tech/Apollo/actions/runs/44916287986/artifacts/14711537284).

O primeiro relatório registra indisponibilidade da comparação por HTTP 401 no download histórico. A coleta foi corrigida para remover a autorização GitHub ao redirecionar para outro host. O complemento acima leu os artefatos imutáveis das duas versões e substitui essa indicação inicial. O build permanece exatamente o da execução completa.

O artefato principal contém `Apollo-P45-homologacao.zip`, `Apollo-P45-source.zip`, `Apollo-P45-history.bundle`, `frontend/dist`, `Apollo-P45-Auditoria.md`, `INSTALACAO-P45.txt`, logs/XML e manifests SHA-256. O pacote de homologação é um ZIP com aplicação, build e instruções; não é um instalador Windows assinado.

SHA-256 do ZIP completo de evidências:

```text
deaf91d2d3bc04ba621986b5d9b8d5e195e43a457083e7f0b6cf3afe976e736b
```

SHA-256 do complemento comparativo:

```text
3759df8858c3d54a0a5f4a2fad15fe638492f90a22ca812ac7f8b24729525288
```

## Problemas corrigidos

1. Caixa global único: modo padrão agora separa os turnos por operador, com índice único, abertura, saldo, recebimentos, movimentações, fechamento e histórico individuais.
2. Pagamento concorrente com fechamento: revisão financeira transacional e conferência vinculada à revisão apresentada ao caixa.
3. Sangrias/suprimentos repetidos: referência persistente e impressão digital do pedido; repetição não duplica movimentação.
4. Devoluções de turno anterior: lançamentos negativos auditáveis no caixa ativo do operador autorizado, preservando o fechamento original. Exigem caixa ativo.
5. Último item de pagamento misto: preservada a saída efetiva de dinheiro no estorno.
6. Fila offline em outro turno: novas vendas preservam o caixa original; turno alterado recebe 409 sem cobrança ou baixa. Filas identificadas antigas sem turno recebem 422 para revisão.
7. Consulta do painel: seleciona o caixa do operador autenticado.
8. Sessões novas: sete dias por padrão, configuráveis entre 1 e 720 horas; expiração, logout, bloqueio/troca e revogação continuam ativos. Nova aba mantém a política existente de bloqueio.
9. Backup/restauração: incluídos os lançamentos de devolução, seus identificadores estáveis e as evidências de sobrevivência ao reinício.

O modo `shared` permanece para compatibilidade e regressão legada. Os ensaios operacionais financeiros e de navegador desta candidata usam `operator`, que é o padrão novo.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| Backend | 441 testes e 3 subtestes aprovados |
| Frontend | 56 testes aprovados |
| Chromium | 55 testes aprovados: 32 com API simulada e 23 com servidor real |
| Layout | 9 combinações de largura/zoom, incluídas no total Chromium |
| Lint/typecheck | Zero erros; 8 avisos de lint |
| Build Web/PWA | Duas compilações com hashes iguais |
| Dependências Python/JavaScript | Zero vulnerabilidades conhecidas nos scanners executados |
| Dois caixas e garçom | 10 vendas, 10 reenvios, pedido do garçom, fiado, sangrias/suprimentos e devoluções; diferença R$ 0,00 |
| Pico financeiro | 50 requisições, 25 vendas únicas, zero duplicação/erro HTTP e diferença R$ 0,00 |
| Backup real do ensaio | Restaurado em outro banco descartável; repetição preservou os 2 ajustes sem duplicá-los |
| Reinício | Backend e MongoDB reiniciados; integridade das coleções preservada |
| Rollback | Por processos para a referência 28ea95ce, retorno e reenvio idempotente aprovados em banco descartável |

A regressão cobre mesas/comandas, transferências, pagamentos, clientes/fiado, compras, lotes, estoque, produção, cozinha, impressão simulada, QR, relatórios, permissões, backup e recuperação, conforme testes e logs. Navegação por telas não equivale a executar todas as combinações possíveis de cada funcionalidade. Fiscal e marketplaces existentes não recebem aprovação de integração real por testes simulados.

A instalação PWA em dispositivos físicos e a saída em papel não foram testadas. A fronteira offline real do service worker foi testada no Chromium, com TLS de teste confiável. Primeira abertura sem rede permanece indisponível; reabertura desconectada pode mostrar aviso público. Venda offline exige a aplicação previamente carregada e autenticada. Respostas privadas da API e HTML autenticado não entram no CacheStorage público.

## Desempenho e comparação

Leituras autenticadas, 30 segundos por cenário:

| Sessões | Requisições P45 | p95 P44 | p95 P45 | Erros P45 |
|---|---:|---:|---:|---:|
| 10 | 2.773 | 20,19 ms | 16,57 ms | 0 |
| 30 | 6.910 | 65,41 ms | 58,29 ms | 0 |
| 50 | 8.681 | 126,43 ms | 127,66 ms | 0 |

O p95 melhorou com 10/30 sessões e variou +0,97% com 50; uma rodada por cenário não demonstra regressão estatística consistente.

O ensaio de dois caixas mediu p95 de 0,628 s em 57 chamadas HTTP bem-sucedidas. O pico de 50 pagamentos/reenvios no mesmo operador teve p95 de 6,628 s: essa latência de pico continua sendo um limite de desempenho observado. A P44 não registrou p95 financeiro; pelos timestamps, o bloco financeiro completo levou aproximadamente 6,50 s na P44 e 6,69 s na P45, medidas de duração total que não substituem p95.

## P32

Bundle localizado: `Apollo-P32-Base-Recuperada.bundle`, metadados de 2.301.923 bytes. Patch e relatório atuais da P32, versão 5, foram lidos. Declaram mudança de teste, sem correção de produção implementada naquela recuperação.

O requisito recuperado foi testado diretamente na P45: processo morto depois das gravações transacionais, recuperação com a mesma referência em 75,78 s dentro do prazo de 100 s, uma venda, uma baixa, estoque/lote 99 e diferença R$ 0,00.

SHA-256 original, `git bundle verify`, fsck e ancestralidade do binário permanecem não verificados. Não foi inventado hash nem declarada equivalência de todo o histórico desconhecido. O executor local falhou e não havia canal privado configurável para transferir o binário ao runner; URLs assinadas não foram publicadas. O teste equivalente resolve o requisito conhecido do patch, sem transformar o binário em bloqueio para executar as demais tarefas.

## Instalação, backup e retorno

Usar exclusivamente ambiente novo de homologação e dados fictícios: Python 3.11, Node 22 e MongoDB 7 com réplica dedicada. O build pronto está em `frontend/dist`; a reconstrução usa os lockfiles incluídos. Configurar `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS` HTTPS exato, `COOKIE_SECURE=true`, `APOLLO_CASH_MODE=operator` e `SERVE_FRONTEND_DIR` absoluto. Não reutilizar credenciais, .env ou dados da loja.

Antes de futura atualização: encerrar ambos os turnos, suspender gravações, preservar backup consistente do banco/configuração e o build anterior. Restaurar primeiro em outro banco descartável e conferir vendas, estoque, caixa e ajustes. Não ativar versão anterior para gravar com turnos independentes abertos. O rollback ensaiado não comprova o procedimento na VPS.

## Pendências e parecer

- Impressora térmica 80 mm física: saída, duas vias, setores e recuperação reais.
- Instalação/uso PWA em Android, iPhone e Windows físicos.
- Destino: acesso, isolamento de banco/credenciais/serviços/volumes, HTTPS, backup e rollback.
- Integridade e comparação do bundle P32 original, com a ressalva funcional acima.
- Filas legadas sem identificação de turno exigem conferência administrativa; não são migradas automaticamente.
- Latência do pico financeiro de 50 requisições: p95 de 6,63 s, conforme limite observado.
- Integrações fiscais/marketplace reais não comprovadas nesta missão.

Não há link de homologação externo validado nem credencial pública nova. As contas dos testes são fictícias e ficam nos scripts do pacote.

**Parecer: candidata disponível para validação presencial em homologação isolada. Aprovação operacional continua pendente dos requisitos não executados e da decisão explícita do proprietário. Nenhum merge na principal, deploy em produção, venda real ou alteração de dados reais foi realizado.**
