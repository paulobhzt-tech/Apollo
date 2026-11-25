# P64.2 — continuidade da reformulação

Candidata `a116da3`, na mesma branch `feat/p64-funcionalidades-completas`. A etapa anterior entregou o zoom e a janela de pagamento. Esta etapa expandiu a adaptação aos fluxos de trabalho além do pagamento. [Commits e arquivos](https://github.com/paulobhzt-tech/Apollo/compare/727b260...a116da3)

| Área | Entrega | Validação e pendência |
|---|---|---|
| Navegação | Faixa de atalhos recolhível, mantendo os menus, as preferências do operador e a busca. Cabeçalho padrão de módulos reorganizado. | Ação de recolher e restaurar exercitada no Caixa. |
| Caixa | Grade de painéis se adapta à largura. Histórico de turnos e movimentos passam a cartões com rótulos quando a largura disponível é reduzida. | Suprimento fictício registrado e exibido em 800×600 a 175%. |
| Estoque e compras | Insumos, compras, produção e movimentos usam a apresentação adaptativa. Os dados e ações continuam no mesmo fluxo. | Ação Movimentar aberta a 175% sobre o insumo fictício. |
| Pessoas, Contas e Financeiro | Clientes, fornecedores, contas a pagar/receber e comparação anual do DRE receberam a mesma estrutura. | Auditoria visual geral e verificações do DRE na execução Playwright. Cobertura individual de todas as operações pendente. |
| Impressão | Incorporados o protótipo C# e os registros da P63 até `3717ea9`, incluindo diário por via, rejeição de repetição e reteste físico registrado pelo proprietário. | Registro físico corresponde ao laboratório C#. Filas autenticadas do PWA e homologação ponta a ponta pelo Apollo continuam pendentes. |
| Referências | A matriz textual P63 continua disponível. Os quatro links ilustrativos da nova solicitação retornaram HTTP 403 ao serem consultados. | Imagens originais ausentes nesta etapa. Comparação direta com elas pendente. |

[Caixa em 800×600 a 175%](caixa-adaptativo.png) · [Estoque em 800×600 a 175%](estoque-adaptativo.png) · [Capturas anteriores](README.md)

O código permanece em uma branch de desenvolvimento, com operações executadas em uma base fictícia local e nos laboratórios de CI. Ainda faltam a padronização individual de todas as telas, a revisão de rolagens remanescentes e os testes físicos na Espeteria. O [roteiro de instalação e rollback](README.md#atualização-e-rollback-de-homologação) e a [matriz P64.2](MATRIZ.md) registram o histórico anterior.

## Validação desta candidata

- Build Web com 37 arquivos verificados contra o manifesto. As 67 verificações Vitest passaram na rodada anterior desta etapa. O último ajuste foi no CSS e no identificador de teste.
- A primeira regressão local na largura de 390 px detectou que os cabeçalhos visualmente recolhidos ainda expandiam o documento. Após limitar a caixa dos cabeçalhos, a auditoria local em ambos os temas e o teste de Caixa e Estoque a 175% passaram.
- [Build Web/PWA e pacote Docker](https://github.com/paulobhzt-tech/Apollo/actions/runs/45564353090) · [Regressão de navegador](https://github.com/paulobhzt-tech/Apollo/actions/runs/45564349385) · [Bateria geral](https://github.com/paulobhzt-tech/Apollo/actions/runs/45564349127) · [Segurança e compilação](https://github.com/paulobhzt-tech/Apollo/actions/runs/45564349119).
