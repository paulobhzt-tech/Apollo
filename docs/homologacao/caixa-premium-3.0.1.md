# Caixa Premium — homologação do Apollo PDV 3.0.1

O diálogo de pagamento organiza formas de pagamento, lançamento e resumo em colunas no desktop e em blocos no celular. Mostra itens, lançamentos, saldo, percentual quitado e troco. Há atalhos de valor, preenchimento do saldo, cotas por pessoa com distribuição de centavos, e cálculo por percentual do total. A divisão por itens continua no fluxo de pagamento parcial da comanda.

No PIX manual, o operador seleciona uma chave configurada quando disponível, informa a referência e confirma o recebimento. É possível registrar observação e referência de comprovante. O backend rejeita referências manuais repetidas no mesmo recebimento e exige confirmação quando o cliente envia metadados de PIX manual. Clientes antigos e filas antigas continuam aceitos com o contrato anterior. Chaves adicionais e bandeiras disponíveis no seletor podem ser configuradas em Empresa & PIX.

O recebimento integral usa uma atualização condicional sobre o estado e os itens do pedido. Uma segunda tentativa concorrente não reaplica o recebimento nem o saldo do fiado. Os efeitos seguintes do fiado e da emissão de nota permanecem operações separadas. A auditoria registra o operador, o horário e a justificativa de desconto quando informada. O registro não guarda a chave PIX completa.

A finalização bloqueia saldo em aberto. O operador escolhe finalizar ou finalizar e imprimir. Em contingência, a venda segue o fluxo de fila existente e o comprovante ainda depende do processamento da operação.

## Pendências de homologação

- Testar o fluxo visual e o fechamento de uma comanda fictícia em Windows 10/11 e celular, incluindo a impressão.
- Definir um provedor autorizado para PIX integrado e validar seu retorno em sandbox.
- Verificar duplicidade de referências PIX entre pedidos distintos e tornar os efeitos complementares de fiado e nota transacionais.
- Anexar arquivos de comprovantes. Nesta versão é possível registrar o identificador do comprovante em texto.
- Implementar as próximas etapas de Estoque e Compras, Mesas, Cozinha, Offline, Segurança, Interface, Financeiro, Delivery e Apollo IA na sequência.
- Incluir Minha Assinatura em Configurações na última etapa comercial, com plano, validade e módulos vinculados ao estabelecimento.
