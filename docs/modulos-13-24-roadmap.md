# Apollo PDV 3.0 — Módulos 13–24

Autorização do proprietário: implementar na branch `fix/windows-production-server`, com testes e sem alterar produção.

## Critérios comuns de entrega
- Isolamento de dados por restaurante/empresa, permissões por perfil e auditoria de operações sensíveis.
- Validação no backend, tratamento de concorrência, idempotência onde houver transações e testes automatizados.
- Interface responsiva, acessível e com estados de carregamento/erro; preservar compatibilidade com dados existentes.
- Funcionalidade opcional por empresa quando aplicável; sem contratação automática de terceiros.
- Só marcar como concluído após implementação, CI verde e testes de aceitação apropriados.

## Backlog autorizado
| Nº | Módulo | Entrega mínima e critérios de aceite |
|---|---|---|
| 13 | Compras inteligentes e fornecedores | Cadastro e comparação de cotações; pedido de compra com estados rascunho/aprovado/recebido/cancelado; recebimento atualiza estoque uma única vez; trilha de auditoria. |
| 14 | Controle de funcionários | Escalas, ponto, comissões e gorjetas; permissões; evitar sobreposição de jornadas e dupla contabilização. |
| 15 | Engenharia de cardápio | Margem de contribuição por produto, custo de ficha técnica e popularidade; distinguir lucro bruto de líquido; filtros de período. |
| 16 | Previsão de movimento | Projeções por dia e faixa horária com histórico suficiente, intervalos de incerteza e explicação para ausência de dados. |
| 17 | Checklist de abertura e fechamento | Modelos por função/unidade, execução com responsável e horário, pendências e auditoria. |
| 18 | Controle de desperdício | Tipos de perda, quantidade, custo, motivo e responsável; baixa de estoque sem duplicação; relatórios. |
| 19 | Reservas e fila de espera | Capacidade, horário, status, prevenção de conflito e confirmação opcional via WhatsApp. |
| 20 | Controle de manutenção | Equipamentos, intervenções, prazos, custos e alertas; histórico por unidade. |
| 21 | Pesquisa de satisfação | Pesquisa por QR Code, prevenção de abuso, agregação de respostas e privacidade/LGPD. |
| 22 | Treinamento dentro do sistema | Guias por perfil, versões de conteúdo e progresso sem bloquear operação. |
| 23 | Contratos e despesas fixas | Vencimentos, reajustes, alertas e vínculo financeiro sem lançamento duplicado. |
| 24 | Central de saúde do sistema | Diagnóstico de banco, fila offline, impressoras, integrações e backups; sem expor segredos; alertas operacionais. |

## Inventário inicial e dependências
Há testes existentes com nomes relacionados a ponto de funcionários, desempenho, lotes, alertas de estoque, previsão de vendas, caixa e KDS. **A existência de testes não comprova cobertura completa**; antes de criar módulos, inspecionar endpoints, telas e modelos para reaproveitar funcionalidades e evitar duplicações.

## Ordem de execução sugerida
1. Auditar o código existente e os testes para cada módulo.
2. Módulo 13: fornecedores, cotações, pedidos e recebimento idempotente.
3. Módulos 18 e 15: perdas e margem realista, com custo confiável.
4. Módulos 14 e 17: equipe e checklists operacionais.
5. Módulos 23 e 24: contratos e monitoramento.
6. Módulos 19, 20, 21 e 22: reservas, manutenção, satisfação e treinamento.
7. Módulo 16: previsão, após qualidade e volume suficientes de dados.

## Limites
Este documento é o registro de escopo e **não representa implementação dos 12 módulos**. Integrações fiscais, financeiras e mensagens externas exigem configuração, homologação e testes específicos antes de serem habilitadas.
