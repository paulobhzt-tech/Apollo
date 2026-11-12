# Produtos Premium e compras — Apollo PDV 3.0.1

A interface parte do commit `1d13802`. O editor agora apresenta as abas Principal, Estoque, Ficha Técnica, Complementos e Perguntas. Na aba Principal ficam foto, cadastro, preços, margem, lucro bruto e canais. A ficha técnica calcula o custo e o preço sugerido. A configuração de preparo e impressão continua no cadastro.

A duplicação abre um cadastro novo, inativo e sem código. Ela reaproveita a foto, a ficha e as opções. O original permanece cadastrado com o mesmo identificador. Produtos antigos conservam disponibilidade em todos os canais até que o operador selecione outra configuração.

O backend aplica os canais Caixa, Comanda, QR Code e Delivery na entrada de pedidos e filtra os cardápios públicos. Unidade, quilo e litro são cadastráveis. Os lançamentos continuam com quantidades inteiras. Grupos existentes continuam disponíveis em Complementos, e Perguntas podem ser cadastradas em aba própria.

Nas compras de insumos, a atualização de quantidade e custo médio passa a usar uma operação atômica no documento de estoque. O registro de compra e o histórico de movimentações ainda são gravações separadas. Compras diretas de produtos acabados, venda fracionada e bloqueio configurável de saldo negativo ficam pendentes.

A validação física no Windows 10/11 e no celular, incluindo a comparação visual e o salvamento contra o servidor de homologação, precisa ser feita com conta e catálogo de teste. Os fluxos restantes de caixa, atendimento, impressão, offline e gestão seguem para as etapas posteriores.
