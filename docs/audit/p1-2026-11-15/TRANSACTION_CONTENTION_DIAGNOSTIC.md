# P1 — diagnóstico de HTTP 503 sob concorrência (parcial)

Base: PR #17, HEAD `4483149996a930e19e74777ebc072812778df44b`.
Branch: `fix/p1-transaction-contention`.

## Hipóteses, não causas comprovadas
- O helper `backend/lib/transactions.py` aplica orçamento de 30 s para repetição de transações; conflitos classificados `TransientTransactionError` aguardam 10 ms constantes. Isso pode participar da saturação, mas ainda **não demonstra** a causa dos HTTP 503.
- `touch_cash` escreve `cash_sessions.financial_version` dentro das transações para preservar concorrência com fechamento. Não removê-lo sem prova formal de segurança.
- O relatório do PR #17 mostra 1.563 respostas HTTP 503 em 7.345 tentativas da fase de 50 sessões (~21,28%), p95 de 30.193 ms, 4,37 requests/s. As latências incluem tentativas HTTP, não latência de uma intenção financeira completa.
- O benchmark atual reutiliza a referência lógica da venda nas tentativas, mas não grava o resultado de cada operação única e não mede explicitamente espera de pool, tempos de callback/commit nem rótulos do driver.

## Alteração realizada
- `backend/lib/transaction_observability.py` define `TransactionProbe` habilitado somente com `APOLLO_TX_METRICS=1`.
- `backend/lib/transactions.py` registra uma linha JSON por chamada transacional: tentativas de callback, número de commits, abortos, tempos agregados de callback/commit/abort/espera, motivo de retry, classe/código/labels de exceção. Nunca registra mensagens de exceção, cliente, PIN, pedido, referência de replay ou corpo HTTP.
- Teste unitário novo verifica opt-in e ausência de mensagem sensível.
- Nenhuma política de retries, write concern, timeout, controle de caixa, transação, integração externa ou contrato HTTP foi alterada.

## Pendências de validação
1. Executar testes unitários e regressões financeiras no CI, incluindo os testes com MongoDB replica set.
2. Reproduzir os 503 em ambiente descartável isolado, com mesma versão de Python, MongoDB, worker count, dataset, warmup, retries, duração e recursos.
3. Habilitar `APOLLO_TX_METRICS=1` somente na reprodução isolada. Correlacionar contagem de 503 com a distribuição das fases e labels, diferenciando causa de coincidência temporal. Não exportar dados de operação sensíveis.
4. Coletar métricas de espera no pool (não instrumentadas nesta entrega), perfil de CPU, queries e hot documents. Reavaliar o benchmark para contabilizar intenções únicas e todas as tentativas HTTP.
5. Só então criar uma correção de desempenho mínima, um teste que falhe antes e passe depois, benchmark A/B e soak prolongado de 30 minutos, sem suítes concorrentes.
6. Verificar novamente os P0, pagamentos, estornos, fechamento, idempotência e failover com seed secundário.

## Limites da entrega
Neste ambiente de execução não havia binário `mongod`, bibliotecas Motor/PyMongo nem rede funcional para baixar dependências. Logo, **não foi executado benchmark real** nem demonstrada correção dos HTTP 503. Não afirmar ganho de capacidade, regressões aprovadas ou produção pronta sem executar os testes. Esta é uma entrega diagnóstica parcial e instrumentação pendente de homologação.
