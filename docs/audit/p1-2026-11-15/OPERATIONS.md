# Recuperação e conciliação — procedimento P1

## Backup

A exportação administrativa e o backup de servidor usam `lib/backups.py`: snapshot transacional de 28 coleções, incluindo financial_operations, purchases, lot_consumptions, bills, account_categories e payment_methods. Preservam `_id` e tipos BSON por Extended JSON. O manifesto inclui nomes, contagens e SHA-256. O hash detecta alteração acidental; não autentica a origem. Armazenar o arquivo como informação financeira sensível, criptografado fora do servidor, com acesso restrito e retenção definida. Hashes de senha/PIN, sessões e configurações privadas de integrações não são portáveis.

Excluídas explicitamente: sessions, login_attempts, server_backups e status_checks; settings drive/selftest_last também são locais. Não há backup de arquivos externos, imagens, binários, segredos, índices arbitrários, integrações, tickets de impressora física ou configuração operacional fora dessas coleções. Não chamar isso de recuperação integral de toda infraestrutura.

## Restauração segura

1. Obter exportação v2 de origem confiável, conferir manifesto e guardar cópia imutável. Backup legado/parcial é rejeitado; não preencher coleções ausentes com arrays vazios para contornar validação.
2. Preparar replica set descartável/novo, URI exclusiva de recuperação em `MONGO_URL` e nome novo `DB_NAME=apollo_recovery_<identificador>`. Nunca apontar para banco em uso.
3. No diretório backend, executar `python tools/recover_backup.py export.json`. O comando recusa destino existente, exige senha nova local de 12+ caracteres, cria índices conhecidos e administrador `recovery-admin`, importa em uma transação e mantém empregados importados inativos. Credenciais não vêm do arquivo.
4. Se falhar, não ativar o destino. Pode restar bootstrap/índices locais, mas a transação impede importação parcial de registros de negócio. Diagnosticar e usar outro nome novo; não excluir banco sem conferir ambiente e autorização apropriada.
5. Conferir contagens, referências, lotes, marcadores, venda/replay e acessos em homologação. Reconfigurar credenciais de integrações e empregados por procedimento seguro. O teste automatizado validou funções reais de importação e replay; o diálogo interativo da CLI não foi homologado manualmente.
6. Só planejar mudança de backend após revisão e homologação. Não há troca automática de banco nem sobrescrita de dados existentes.

A rota administrativa de restauração também recusa dados de negócio existentes; admite apenas o administrador local autenticado e configurações privadas. Preserva identidade, papel e credenciais desse administrador. Não é uma ferramenta de mesclagem ou de reparação do banco atual. Um conjunto inconsistente de dados legados não se torna consistente por ser restaurado.

## Conciliação somente leitura

Executar `python tools/reconcile_backup.py export.json resultado.json` com destino inexistente e diferente da entrada. A ferramenta não possui conexão MongoDB nem comandos de escrita no banco. Produz regra, gravidade, ID da operação, hash da evidência e recomendação de revisão. O relatório ainda contém identificadores: protegê-lo como dado financeiro.

Pedidos legados pagos ficam pendentes de comprovação. Diferença de saldo sem saldo inicial comprovado é REVISÃO, não autorização para lançar pagamento. Examinar documentos originais, comprovantes, extratos, histórico de estoque e trilhas do operador. Não criar financial_operations retrospectivos por suposição. Nenhum reparo financeiro automático foi implementado. Identificadores duplicados e devolução de lote maior que consumo são alertas; ausência de alerta não certifica integridade. Regras não cobrem toda duplicidade semântica, cancelamento antigo sem vínculo ou todos os estornos.

## Transações e operação

Replica set é obrigatório para os fluxos financeiros transacionais. `deploy/homologation` prepara três membros autenticados, sem portas públicas MongoDB; não altera o compose VPS de produção. O teste nativo multinó é real, mas no mesmo host. TLS, três domínios de falha, privilégios mínimos, backup externo, alertas, RPO/RTO e restauração operacional precisam de homologação própria.

`GET /api/health/ready` responde 503 sem primary/replica set ou índices únicos críticos. Não expõe URI/segredos. Não substitui monitoramento, nem valida todos os índices. O retry transacional é limitado e preserva commit incerto; efeitos de impressora física/CRM externos não participam do commit. Não repetir efeitos externos dentro de callback transacional.

Rollback de código deve respeitar o formato v2 e marcadores novos: nunca apagar financial_operations ou voltar a restaurador parcial antigo. Preservar backup e evidências antes de qualquer plano de rollback. Não há autorização de merge/deploy neste trabalho.
