# Conferência de estoque e pagamentos — Apollo PDV 3.0.1

- Venda de balcão em MongoDB replicado grava pedido, pagamento, baixa, lotes, fiado, ticket e nota simulada na mesma transação. Se a baixa falhar, as gravações são desfeitas. Repetir uma referência já concluída devolve o pedido registrado.
- No MongoDB independente, a venda de balcão registra uma indicação de baixa pendente até o término. Se uma venda paga ficar pendente, o reenvio não cobra novamente e o estorno fica bloqueado para evitar devolver estoque que talvez não tenha saído.
- Em Estoque → Relatórios, o administrador pode conferir baixas históricas sem referência, vendas com baixa pendente e saldos de lotes superiores ao estoque. A consulta não altera registros. O relatório por período mostra movimentos, custos registrados e total das compras.
- O alerta de excesso aparece acima do máximo cadastrado e o planejamento de reposição respeita esse teto.

## Pendências

- Aprovação e execução administrativa de uma reconciliação auditável de dados históricos.
- Recuperação automática e segura das pendências do MongoDB independente.
- Transações e testes de falha para estornos parciais e totais, comandas e delivery.
- Validação funcional em Windows 10/11, Android e iPhone.
