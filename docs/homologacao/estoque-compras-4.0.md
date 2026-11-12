# Estoque e Compras 4.0 — homologação

- Balcão, comanda e cardápio aceitam até quatro casas decimais para kg e litro. Produtos vendidos por unidade continuam exigindo quantidades inteiras. Recebimento parcial, cancelamento, KDS e documento fiscal simulado preservam quantidades fracionadas.
- Produtos acabados podem ser comprados depois que o administrador vincula um item de estoque na mesma unidade em Produtos → Estoque. Ao vender, a baixa usa o saldo do produto acabado. Produtos sem vínculo continuam usando a ficha técnica.
- Compras registram fornecedor, quantidade, custo, lote, fabricação e validade. Em MongoDB com transações, compras com referência gravam saldo, custo médio, lote e histórico juntos. Uma repetição da mesma referência do operador devolve o registro original, e dados divergentes geram conflito.
- Estoque máximo pode ser cadastrado como referência. O bloqueio de saldo negativo vem ligado para insumos antigos e novos, e pode ser desativado por item para venda e saída. O FEFO continua bloqueando o uso de lotes vencidos.
- Novos itens de pedido registram a composição e a referência da baixa para que mudanças na ficha técnica ou transferência de mesa não desviem o estorno. Cancelamentos parciais de comanda registram operador, quantidade e motivo e rejeitam alterações concorrentes do pedido.

## Pendências

- MongoDB independente mantém o fluxo anterior de compras. Nesse modo, as gravações continuam separadas e uma falha de comunicação pode exigir conferência antes de reenviar.
- A liquidação de venda, a baixa e os efeitos de estorno ainda não compõem uma única transação. A recuperação de falhas entre essas operações e a reconciliação de lotes históricos sem referência precisam de tratamento adicional.
- O estoque máximo é um campo cadastral. Alertas de excesso e os relatórios consolidados de entradas, saídas, perdas e custos ainda precisam ser ampliados.
- Homologar cadastro, compra, venda e estorno em Windows 10/11 e celular com catálogo de teste.
