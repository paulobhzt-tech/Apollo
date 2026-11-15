# Matriz das 200 atividades — P1

APROVADO limita-se à evidência descrita, com dados sintéticos. NÃO TESTADO inclui cobertura parcial insuficiente para aprovar o requisito completo. A aprovação de uma atividade técnica não aprova produção.

| Nº | Atividade | Resultado | Evidência e limite |
|---:|---|---|---|
| 1 | Inventariar coleções | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 2 | Comparar BACKUP_COLLS | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 3 | Identificar ausências | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 4 | Incluir financial_operations | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 5 | Verificar purchases | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 6 | Verificar lot_consumptions | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 7 | Verificar bills | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 8 | Verificar account_categories | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 9 | Verificar payment_methods | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 10 | Verificar coleções adicionais | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 11 | Preservar referências | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 12 | Preservar identificadores | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 13 | Preservar idempotência | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 14 | Consistência pedido/pagamento | NÃO TESTADO | Restauração preserva registros; não reconcilia integralmente todas as relações financeiras históricas. |
| 15 | Consistência estoque/lotes | NÃO TESTADO | Restauração preserva IDs e lotes; não prova correção de todo saldo legado. |
| 16 | Dados de clientes | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 17 | Proteger hashes | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 18 | Rejeitar credenciais importadas | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 19 | Backup concorrente | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 20 | Restauração em banco descartável | APROVADO | lib/backups.py; testes P1 de snapshot, integridade, credenciais, restauração e replay. Escopo: 28 coleções enumeradas, dados sintéticos. |
| 21 | Identificar legado pré-marcador | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 22 | Registros financeiros inconsistentes | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 23 | Pagamentos órfãos | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 24 | Pago sem baixa comprovada | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 25 | Movimentos duplicados | NÃO TESTADO | Detecta IDs duplicados, não toda duplicidade semântica de movimentação. |
| 26 | Estornos inconsistentes | NÃO TESTADO | Cobertura histórica incompleta: não inferir devoluções/estornos por semelhança; análise humana obrigatória. |
| 27 | Cancelamento sem devolução | NÃO TESTADO | Cobertura histórica incompleta: não inferir devoluções/estornos por semelhança; análise humana obrigatória. |
| 28 | Devoluções duplicadas | NÃO TESTADO | Cobertura histórica incompleta: não inferir devoluções/estornos por semelhança; análise humana obrigatória. |
| 29 | Diferenças de caixa | NÃO TESTADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 30 | Saldos de fiado | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 31 | Ferramenta somente leitura | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 32 | Relatório por operação | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 33 | Gravidade | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 34 | Preservar evidências | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 35 | Propor reparações verificáveis | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 36 | Testes de conciliação | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 37 | Dados sintéticos | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 38 | Impedir alteração silenciosa | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 39 | Revisão de reparações | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 40 | Procedimento operacional | APROVADO | lib/reconciliation.py e tests/test_reconciliation.py; classificador somente leitura. Sem auditoria de dados reais nem reconstrução de eventos ausentes. |
| 41 | Abertura de mesa | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 42 | Criação de comanda | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 43 | Inclusão de produtos | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 44 | Exclusão de produtos | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 45 | Transferência | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 46 | Divisão da conta | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 47 | Pagamentos parciais | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 48 | Fechamento | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 49 | Cancelamento | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 50 | Estorno | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 51 | Operações não transacionais | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 52 | Condições de corrida | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 53 | Pagamentos simultâneos | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 54 | Fechamento concorrente | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 55 | Transferência durante pagamento | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 56 | Falha de estoque | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 57 | Rollback | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 58 | Replay | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 59 | Correções comprovadas | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 60 | Regressões financeiras | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 61 | Pedidos QR | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 62 | Autenticação/autorização QR | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 63 | Geração de pedidos | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 64 | Duplicação de solicitações | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 65 | Inclusão de itens | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 66 | Alteração de pedidos | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 67 | Cancelamento | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 68 | Estoque | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 69 | Tickets KDS | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 70 | Consistência financeira | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 71 | Pedidos delivery | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 72 | Pagamentos delivery | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 73 | Cancelamentos delivery | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 74 | Estornos delivery | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 75 | Status delivery | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 76 | Concorrência | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 77 | Rollback | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 78 | Replay | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 79 | Correções reproduzidas | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 80 | Integração existente | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 81 | Criação de cliente | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 82 | Alteração de limite | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 83 | Venda fiada | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 84 | Recebimento | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 85 | Pagamento parcial | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 86 | Cancelamento | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 87 | Estorno | NÃO TESTADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 88 | Exclusão de cliente | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 89 | Histórico | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 90 | Saldo | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 91 | Concorrência | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 92 | Atualização atômica | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 93 | Operações simultâneas | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 94 | Falha de persistência | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 95 | Rollback | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 96 | Replay | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 97 | Saldo negativo indevido | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 98 | Recebimentos duplicados | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 99 | Correções | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 100 | Relatório de conciliação | APROVADO | test_p1_integrity_integration.py, regressões P0/parciais e inspeção dos fluxos alterados. Ver REPORT.md para limites por fluxo. |
| 101 | Compose VPS | NÃO TESTADO | Compose VPS existente continua sem alteração; não homologado como transacional de produção. |
| 102 | Dependências transacionais | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 103 | Preparar replica set de homologação | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 104 | Inicialização | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 105 | Autenticação | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 106 | Persistência | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 107 | Health checks | NÃO TESTADO | Health/readiness backend testado; healthchecks Docker preparados, execução Docker bloqueada. |
| 108 | Readiness | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 109 | Conexão backend | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 110 | Pool | NÃO TESTADO | Driver/configuração inspecionados; sem otimização ou dimensionamento certificado de pool/timeouts. |
| 111 | Timeouts | NÃO TESTADO | Driver/configuração inspecionados; sem otimização ou dimensionamento certificado de pool/timeouts. |
| 112 | Recuperação desconexão | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 113 | Reinício Mongo | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 114 | Reinício backend | NÃO TESTADO | Não executada interrupção do backend durante fluxo P1 no ensaio multinó. |
| 115 | Multinó descartável | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 116 | Failover real | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 117 | Medir reconexão | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 118 | Transações interrompidas | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 119 | Consistência recuperada | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 120 | Configuração necessária | APROVADO | failover.json e failover-final.txt: 3 processos nativos autenticados, mesmo host. Compose preparado, Docker não executado. |
| 121 | Linha de base | NÃO TESTADO | Sem carga equivalente executada antes da correção; não existe comparação honesta antes/depois de desempenho. |
| 122 | 1 sessão | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 123 | 5 sessões | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 124 | 10 sessões | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 125 | 20 sessões | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 126 | 30 sessões | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 127 | 50 sessões | REPROVADO | Etapa prolongada: 21,28% das tentativas HTTP retornaram 503. soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 128 | 100 sessões | REPROVADO | 100 sessões produziram erros HTTP; ver categorias e percentis em soak.json. REPROVADO como capacidade homologada. |
| 129 | Conexões persistentes | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 130 | Vendas simultâneas | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 131 | Pagamentos | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 132 | Cancelamentos | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 133 | Estoque | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 134 | Consultas | NÃO TESTADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 135 | Fechamento caixa | NÃO TESTADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 136 | p50 | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 137 | p95 | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 138 | p99 | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 139 | Throughput | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 140 | Taxa de erros | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 141 | CPU | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 142 | Memória | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 143 | Conexões Mongo | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 144 | Contenção | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 145 | Ensaio 30–60 min | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 146 | Gargalos | NÃO TESTADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 147 | Otimizações comprovadas | NÃO TESTADO | Nenhuma otimização implementada sem prova de benefício; preservar integridade. |
| 148 | Repetir medições | NÃO TESTADO | Sem carga equivalente executada antes da correção; não existe comparação honesta antes/depois de desempenho. |
| 149 | Comparação | NÃO TESTADO | Sem carga equivalente executada antes da correção; não existe comparação honesta antes/depois de desempenho. |
| 150 | Limitações | APROVADO | soak.json: HTTP real, Mongo real, dados sintéticos, pares venda/cancelamento e conexões persistentes; sem atestar capacidade de produção. |
| 151 | Inicialização Windows | BLOQUEADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 152 | Electron | BLOQUEADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 153 | Frontend/backend | BLOQUEADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 154 | Armazenamento local | BLOQUEADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 155 | Fila offline | APROVADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 156 | Sincronização | APROVADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 157 | Múltiplas janelas | BLOQUEADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 158 | Perda conexão | APROVADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 159 | Reconexão | BLOQUEADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 160 | Fechamento inesperado | BLOQUEADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 161 | Dados corrompidos | APROVADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 162 | Persistência operações | APROVADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 163 | Replay | APROVADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 164 | Duplicidade financeira | NÃO TESTADO | Idempotência backend validada; segurança offline entre janelas e reinícios não homologada integralmente. |
| 165 | Conflitos estoque | NÃO TESTADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 166 | Comandas offline | NÃO TESTADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 167 | Recuperação reinício | BLOQUEADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 168 | Erros visíveis | APROVADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 169 | Correções | APROVADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 170 | Cenários pendentes | APROVADO | offline-before/after.txt: seis testes Node de armazenamento simulado; ambiente Windows e Electron real indisponíveis. |
| 171 | Credenciais versionadas | APROVADO | Varredura estrutural de arquivo versionado não encontrou hashes/tokens não vazios; não é varredura integral do histórico Git. |
| 172 | Arquivos de backup | APROVADO | Backup JSON versionado permanece; precisa revisão humana de privacidade/retenção. Ignorar novos arquivos não limpa o histórico. |
| 173 | Dependências vulneráveis | REPROVADO | Após Vite/Vitest: 6 entradas de pacotes vulneráveis (2 altas, 3 moderadas, 1 baixa). Não usar audit fix --force. |
| 174 | Proteção endpoints | APROVADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 175 | Controle acesso | APROVADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 176 | Permissões admin | APROVADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 177 | PIN | APROVADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 178 | Limites tentativas | APROVADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 179 | Logs sensíveis | NÃO TESTADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 180 | Configuração insegura | NÃO TESTADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 181 | Dados financeiros | NÃO TESTADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 182 | Validação entradas | NÃO TESTADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 183 | Segurança importações | APROVADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 184 | Duplicidades | APROVADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 185 | Tratamento erros | APROVADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 186 | Recuperação falhas | APROVADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 187 | Segredos | NÃO TESTADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 188 | Observabilidade | NÃO TESTADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 189 | Alertas operacionais | NÃO TESTADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 190 | Corrigir riscos | NÃO TESTADO | Suíte de segurança existente, revisão das alterações e dependencies-before/after.json; não é pentest integral. |
| 191 | Unitários | APROVADO | full-suite-344.txt, p1-final.txt, frontend-final.txt, frontend-lint-final.txt; CI remoto registrado em PUBLICATION.md. |
| 192 | Integração | APROVADO | full-suite-344.txt, p1-final.txt, frontend-final.txt, frontend-lint-final.txt; CI remoto registrado em PUBLICATION.md. |
| 193 | Transacionais | APROVADO | full-suite-344.txt, p1-final.txt, frontend-final.txt, frontend-lint-final.txt; CI remoto registrado em PUBLICATION.md. |
| 194 | Concorrência | APROVADO | full-suite-344.txt, p1-final.txt, frontend-final.txt, frontend-lint-final.txt; CI remoto registrado em PUBLICATION.md. |
| 195 | Recuperação | APROVADO | full-suite-344.txt, p1-final.txt, frontend-final.txt, frontend-lint-final.txt; CI remoto registrado em PUBLICATION.md. |
| 196 | Regressões #13–#16 | APROVADO | full-suite-344.txt, p1-final.txt, frontend-final.txt, frontend-lint-final.txt; CI remoto registrado em PUBLICATION.md. |
| 197 | Typecheck | APROVADO | full-suite-344.txt, p1-final.txt, frontend-final.txt, frontend-lint-final.txt; CI remoto registrado em PUBLICATION.md. |
| 198 | Build | APROVADO | full-suite-344.txt, p1-final.txt, frontend-final.txt, frontend-lint-final.txt; CI remoto registrado em PUBLICATION.md. |
| 199 | Lint | APROVADO | full-suite-344.txt, p1-final.txt, frontend-final.txt, frontend-lint-final.txt; CI remoto registrado em PUBLICATION.md. |
| 200 | CI completo | APROVADO | Consultar PUBLICATION.md; status final remoto só é aprovado após jobs efetivamente concluídos. |
