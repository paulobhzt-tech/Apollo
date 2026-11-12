# Conferência de estoque e pagamentos — Apollo PDV 3.0.1

- Venda de balcão em MongoDB replicado grava pedido, pagamento, baixa, lotes, fiado, ticket e nota simulada na mesma transação. Se a baixa falhar, as gravações são desfeitas. Repetir uma referência já concluída devolve o pedido registrado.
- Em MongoDB replicado, estornos integrais e por item do fluxo de pedidos também gravam cancelamento, baixa reversa, lotes e efeitos internos juntos. Lotes válidos são consumidos antes do saldo histórico sem lote.
- No MongoDB independente, a venda de balcão registra uma indicação de baixa pendente até o término. Se uma venda paga ficar pendente, o reenvio não cobra novamente e o estorno fica bloqueado para evitar devolver estoque que talvez não tenha saído.
- Em Estoque → Relatórios, o administrador pode conferir baixas históricas sem referência, vendas com baixa pendente e saldos de lotes superiores ao estoque. A consulta não altera registros. O relatório por período mostra movimentos, custos registrados e total das compras.
- O alerta de excesso aparece acima do máximo cadastrado e o planejamento de reposição respeita esse teto.

## Pendências

- Aprovação e execução administrativa de uma reconciliação auditável de dados históricos.
- Recuperação automática e segura das pendências do MongoDB independente.
- Transações e testes de falha para os fluxos específicos de comandas e delivery, inclusive o cancelamento parcial lançado pela própria comanda.
- Validação funcional em Windows 10/11, Android e iPhone.

## Conferência administrativa

Em **Estoque → Relatórios → Conferência de estoque**, abra um pedido pendente ou um lote histórico e gere a prévia. O administrador confere as evidências, registra a justificativa e confirma a aprovação. O servidor recalcula a prévia antes da escrita e recusa aprovação desatualizada, divergência de quantidade ou ficha técnica ausente. O evento registra operador, data, justificativa e identificador da prévia.

Para lote histórico, o vínculo exige uma anotação exata de balcão ou delivery e um número de pedido único. A aprovação grava metadados de auditoria. O vínculo pode ser usado em estornos autorizados posteriores. A aprovação por si só mantém saldos, quantidades restauradas e pagamentos. Vínculos sem evidência, divergências e falhas parciais sem registro completo exigem análise individual. No MongoDB independente, um aceite interrompido fica pendente e bloqueia reenvios da baixa.

## Roteiro físico de homologação

Use um servidor descartável, operadores fictícios e pedidos simulados. Repita no Windows 10 e no Windows 11 e execute os cenários QR no Android e iPhone via PWA.

1. Instalar, abrir e autenticar. Anotar versão, sistema, commit e execução do instalador.
2. Lançar itens fracionados por caixa, comanda e QR. Confirmar um único lançamento por tentativa e conferir lote, saldo, total e KDS.
3. Aceitar um delivery em dois terminais simultaneamente. Conferir uma baixa e um lançamento por setor. Cancelar outro delivery ainda pendente e verificar o saldo.
4. Em MongoDB independente, simular falha durante o aceite e reiniciar. Conferir bloqueio do reenvio. Testar aprovação por administrador com evidência completa e recusa com divergência. Confirmar que um operador sem permissão recebe acesso negado.
5. Em replica set, simular falha de estoque no lançamento, cancelamento parcial e pagamento. Conferir rollback do pedido, mesa, estoque, cozinha, caixa e fiado.
6. Registrar capturas, IDs fictícios e resultados. Usar somente documentos fiscais simulados.

## Ordem das etapas

Após as correções críticas, seguir para Mesas e Comandas Premium. Centro de Diagnóstico ocupa a Etapa 11. Planos Comerciais e Revenda ocupa a Etapa 12.
