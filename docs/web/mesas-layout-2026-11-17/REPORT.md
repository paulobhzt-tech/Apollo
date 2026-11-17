# Mesas & Comandas — correção responsiva

PR #26 (rascunho), branch fix/mesas-responsive-panel, base homolog/p10-operational-web em 836ea2121297876dd34480f3d736561348d2db61.

## Resultado

Correção validada em Chromium/Playwright nas cinco larguras com dados exclusivamente fictícios. A execução [44126736901](https://github.com/paulobhzt-tech/Apollo/actions/runs/44126736901), commit e00260d7e832e0e96516f379ab3b60669f2e9553, passou: 5 reproduções do defeito original, 15 casos do candidato e mais 15 comparações dos snapshots no mesmo runner. [Capturas, métricas e resultados](https://github.com/paulobhzt-tech/Apollo/actions/runs/44126736901/artifacts/14347782839), SHA-256 do ZIP 7d93c376e5dd7838144bd67dd33857b263b932c7c40b7cb75fdca4fb15d0ba1f. Referências revisadas visualmente e versionadas neste PR; workflow final compara sem atualizar snapshots. Comparação final sem atualização de snapshots: [44127866188](https://github.com/paulobhzt-tech/Apollo/actions/runs/44127866188), aprovada; execução do PR [44127883169](https://github.com/paulobhzt-tech/Apollo/actions/runs/44127883169), aprovada. P5 Web no mesmo commit também aprovado.

## Causa e correção

As variantes do Sheet limitavam o painel a 75% no celular e 384 px no desktop. Conteúdo intrínseco das linhas flex excedia esse espaço; nomes truncados e controles rígidos disputavam largura com os valores.

CSS específico de Mesas define largura integral até 46rem, colunas minmax(0,1fr), quebra de textos e áreas independentes para descrição, preços e exclusão. Cabeçalho e rodapé de subtotal/pré-conta/fechamento ficam fora da região de rolagem vertical. Transferência, produtos pendentes e diálogos respeitam a viewport. Não foi aplicado overflow-x:hidden para ocultar o defeito. O modo compacto de ProductGrid apresenta nomes completos; PaymentDialog recebe apenas classe visual opcional.

Diálogos internos foram aninhados para preservar o foco do painel ao usar Escape. O botão de remover cliente reserva seu próprio espaço quando há nomes longos. Campos técnicos do Base UI que são aria-hidden, fixos e recortados em 1px não são tratados como conteúdo visível; os controles visíveis seguem verificados. Inputs editáveis mantêm sua rolagem interna de texto, sem ampliar o painel.

## Geometria medida

| Viewport | Painel antes | Painel depois | scrollWidth/clientWidth depois | Elementos excedentes | Controles sobrepostos |
|---|---:|---:|---:|---:|---:|
| 375 | 281.25 | 375 | 374/374 | 0 | 0 |
| 390 | 292.5 | 390 | 389/389 | 0 | 0 |
| 768 | 384 | 736 | 735/735 | 0 | 0 |
| 1366 | 384 | 736 | 735/735 | 0 | 0 |
| 1920 | 384 | 736 | 735/735 | 0 | 0 |

A altura dos ensaios foi 900 px. Nomes, adicionais e observações incluem sequências longas sem espaços, 12 itens e subtotal sintético de R$ 1.189.481,40. Capturas no início e no fim da rolagem foram examinadas. A quebra de nomes exageradamente longos ocupa mais linhas, mas preserva acesso aos controles e valores.

## Validação

- Typecheck, lint e builds Web/Electron: aprovados localmente e no job de layout. Avisos herdados de lint/CSS/configuração permanecem; não foram convertidos em novos erros.
- Regressões offline-queue, web-sale-recovery e browser-print: 14/14 aprovadas.
- Playwright: geometria, valor monetário integral, botões acessíveis, foco/Tab/Escape, pagamento/pré-conta/divisão/QR, seleção de transferência, inclusão local de produto e permissão de garçom, em 375/390/768/1366/1920 px.
- Comparação AST confirmou que as 23 chamadas de API de Mesas mantêm métodos, endpoints e argumentos.
- Bateria geral e P5 passaram no commit e00260d; inclui pagamentos concorrentes e failover em bancos descartáveis. Conferir as execuções do PR para os demais commits.

As tentativas anteriores continuam registradas. Chromium local não iniciou por restrição de socket. O primeiro job do candidato 6706fd0 falhou: botão de remoção encolhido e campo técnico oculto contado como overflow. O commit e00260d corrigiu a apresentação e a medição; os resultados anteriores não foram apagados nem mascarados por retries.

## Escopo e pendências

A missão autoriza branch e PR separados, testes e correção de layout. Nenhum backend, cálculo financeiro, payload de API, dado real ou configuração da VPS foi alterado. Toda escrita de API do teste de layout é respondida com 405 e a suíte exige lista de escritas vazia.

Sem merge ou implantação. Produção permanece bloqueada. O ensaio sintético não certifica transações reais, impressão física, operação em dispositivos físicos ou aceite humano na VPS. A revisão do PR e a decisão posterior de implantação continuam pendentes.

## Capturas antes/depois

Conteúdo exclusivamente sintético; capturas do runner isolado, sem acesso à VPS.

| Largura | Antes | Depois | Fim da rolagem |
|---|---|---|---|
| 375 | [Antes](evidence/before-width-375.png) | [Depois](evidence/after-width-375.png) | [Ações](evidence/after-bottom-width-375.png) |
| 390 | [Antes](evidence/before-width-390.png) | [Depois](evidence/after-width-390.png) | [Ações](evidence/after-bottom-width-390.png) |
| 768 | [Antes](evidence/before-width-768.png) | [Depois](evidence/after-width-768.png) | [Ações](evidence/after-bottom-width-768.png) |
| 1366 | [Antes](evidence/before-width-1366.png) | [Depois](evidence/after-width-1366.png) | [Ações](evidence/after-bottom-width-1366.png) |
| 1920 | [Antes](evidence/before-width-1920.png) | [Depois](evidence/after-width-1920.png) | [Ações](evidence/after-bottom-width-1920.png) |

Não há operação de junção de contas nesta versão de Mesas: “Agrupar quantidades” organiza a apresentação dos itens. Divisão e transferência existentes foram preservadas; nenhuma nova regra financeira foi introduzida.
