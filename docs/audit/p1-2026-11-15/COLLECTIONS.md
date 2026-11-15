# Inventário lógico de coleções P1

Inventário confrontado com rotas/lib, índices declarados e testes. Coleções futuras/dinâmicas exigem revisão; não é dump genérico de um servidor desconhecido.

| Coleção | Política |
|---|---|
| employees | Snapshot e restauração v2; preservar `_id` |
| suppliers | Snapshot e restauração v2; preservar `_id` |
| categories | Snapshot e restauração v2; preservar `_id` |
| products | Snapshot e restauração v2; preservar `_id` |
| ingredients | Snapshot e restauração v2; preservar `_id` |
| stock_moves | Snapshot e restauração v2; preservar `_id` |
| tables | Snapshot e restauração v2; preservar `_id` |
| orders | Snapshot e restauração v2; preservar `_id` |
| kitchen_tickets | Snapshot e restauração v2; preservar `_id` |
| invoices | Snapshot e restauração v2; preservar `_id` |
| cash_sessions | Snapshot e restauração v2; preservar `_id` |
| expenses | Snapshot e restauração v2; preservar `_id` |
| fiado_customers | Snapshot e restauração v2; preservar `_id` |
| customer_moves | Snapshot e restauração v2; preservar `_id` |
| printers | Snapshot e restauração v2; preservar `_id` |
| settings | Snapshot e restauração v2; preservar `_id` |
| environments | Snapshot e restauração v2; preservar `_id` |
| counters | Snapshot e restauração v2; preservar `_id` |
| financial_operations | Snapshot e restauração v2; preservar `_id` |
| purchases | Snapshot e restauração v2; preservar `_id` |
| lot_consumptions | Snapshot e restauração v2; preservar `_id` |
| bills | Snapshot e restauração v2; preservar `_id` |
| account_categories | Snapshot e restauração v2; preservar `_id` |
| payment_methods | Snapshot e restauração v2; preservar `_id` |
| inventory_counts | Snapshot e restauração v2; preservar `_id` |
| production_batches | Snapshot e restauração v2; preservar `_id` |
| employee_time_entries | Snapshot e restauração v2; preservar `_id` |
| cron_runs | Snapshot e restauração v2; preservar `_id` |
| sessions | Excluída: credentials/sessions |
| login_attempts | Excluída: transient security counters |
| server_backups | Excluída: recursive archives |
| status_checks | Excluída: transient diagnostics |

employees: hashes de PIN/senha excluídos; importação mantém empregado inativo. settings: drive/selftest_last são privados/locais e excluídos. O arquivo contém dados financeiros e de clientes: exigir proteção operacional.

Índices conhecidos são recriados pela CLI via lib/db.py INDEXES; índices arbitrários/customizados e validators de servidor não fazem parte do arquivo. Backup de arquivos externos/segredos/infraestrutura continua pendente.
