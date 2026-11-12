# Apollo PDV 3.0.1 — Checklist de homologação

Base revisada: `ba2a8a8` na branch `feat/apollo-3.0.1-caixa-offline-auditoria`. O instalador #278 é a referência aprovada em Windows Server. Os PRs #10, #11 e #12 são rascunhos em outras branches e não contam como entregas desta branch.

| Etapa | Implementado na base | Parcial | Pendente de confirmação ou implementação |
| --- | --- | --- | --- |
| 1. Mesas e comandas | Tempo, consumo, garçom, autoria dos itens, vários clientes, divisão por itens, fechamento parcial, transferência, união e QR. O cliente pode enviar pedidos e consultar a mesa pelo QR. O cancelamento exige operação autenticada. | Divisão por valor, percentual e pessoa no pagamento. O recebimento parcial por itens já aceita pagador, mas a seleção parte dos nomes nos itens. Pagamento parcial exige réplica MongoDB. | Vincular a prévia ao recebimento, incluir pagadores com consumo compartilhado e validar a jornada em Windows 10/11, celular e tablet. |
| 2. Cozinha e bar | Setores por produto/categoria, monitor, tempo e prioridade, aviso opcional de pronto, impressão manual e fila automática por setor. | Fila de impressão no servidor, com janela de três horas. | Confirmar reimpressão com autorização, fila persistente sem rede e impressoras físicas. |
| 3. Estoque e compras | Recebimento, FEFO, validade, ficha técnica, custo de produção, baixa, contagem por lote, alertas, bloqueio de saldo negativo e trilha de estorno. | Compras idempotentes com referência. Recuperação em MongoDB independente pode exigir revisão administrativa. | Exercitar falhas e concorrência nos fluxos de compra, contagem e estorno. |
| 4. Financeiro e Apollo IA | DRE, fluxo e projeções, indicadores, lucratividade por produto, previsão de consumo e relatórios por funcionário. | Há relatórios de perdas e indicadores gerenciais. | Validar alertas de desperdício e custo com dados representativos e conferir a qualidade das projeções. |
| 5. Garçom mobile e cardápio | Pedidos no celular, catálogo com fotos, QR por mesa, estado de preparo e permissões nas rotas. | O acompanhamento e a sincronização dependem da jornada e do tipo de pedido. | Homologar em aparelhos reais, incluindo reconexão e visibilidade do histórico por perfil. |
| 6. Segurança, offline e backup | Fila do caixa com contexto de sincronização, referências idempotentes, auditoria e testes de restauração isolada. | Recuperação e backup têm fluxos separados para desktop e servidor. | Confirmar credencial offline com expiração e revogação, ensaio de dois caixas e um celular e rotina automática criptografada de ponta a ponta. |

A classificação descreve o código revisado. A aprovação em aparelho físico depende de evidência no ambiente de homologação.
