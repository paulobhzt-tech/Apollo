# Matriz de auditoria P64.2

Candidata 727b260. Consulte o [relatório](README.md) para commits de origem, capturas, resultados e procedimentos.

| Item | Área | Situação | Evidência ou pendência |
|---|---|---|---|
| 2 | AUDITORIA DAS REFERÊNCIAS DO CONSUMER | Parcial | Matriz textual P63 recuperada. Imagens originais indisponíveis. |
| 3 | INTERFACE COMPLETA | Parcial | Preferências globais aplicadas; reformulação individual dos módulos pendente. |
| 4 | MENU SUPERIOR NO PADRÃO CONSUMER | Parcial | Navegação P63 mantida e controles de visualização ampliados. |
| 5 | ZOOM COMPLETO DE 50% ATÉ 175% | Validado em laboratório | 26 níveis × 6 resoluções em Chromium, persistência e autoajuste. |
| 6 | ELIMINAÇÃO DAS BARRAS DE ROLAGEM | Parcial | Modal de pagamento sem rolagem horizontal testada; área central com rolagem vertical localizada quando necessária. |
| 7 | PADRÃO DE TODAS AS JANELAS | Parcial | Rodapé e cabeçalho fixos no pagamento. Padronização e movimentação das demais janelas pendentes. |
| 8 | MESAS E COMANDAS | Parcial | Grade responsiva e regressão de atendimento, cópia e transferência. |
| 9 | JANELA DE ATENDIMENTO | Parcial | Rodapé, quantidade e revisão validados na regressão. Reformulação integral pendente. |
| 10 | MENU MAIS OPÇÕES | Herdado · validação parcial | Cópia e transferência verificadas. Demais ações pendentes de revisão individual. |
| 11 | PAGAMENTO COMPLETAMENTE REFORMULADO | Parcial | Novo pagamento, consumo paginado e rodapé visível. Venda mista concluída em base descartável. |
| 12 | DIVISÃO E PAGAMENTOS MISTOS | Parcial | Dinheiro e cartão no mesmo pagamento verificados; suíte CI parcial sem homologar todos os estornos e divisões. |
| 13 | CAIXA/PDV NO PADRÃO CONSUMER | Parcial | Total unitário e total por linha ligados ao consumo do pagamento. F3 herdado. |
| 14 | ABERTURA E FECHAMENTO DE CAIXA | Herdado · validação parcial | Regressão visual Caixa. Concorrência de fechamento não reavaliada neste roteiro. |
| 15 | ESTOQUE E INSUMOS | Herdado · validação parcial | Teste de cópia e transferência verifica estoque. Revisão completa de telas, FEFO e inventário pendente. |
| 16 | COMPRAS E FORNECEDORES | Pendente de verificação | Compras e fornecedores herdados. |
| 17 | IMPRESSÃO AUTOMÁTICA EPSON | Parcial | Ajustada pré-conta; impressão automática física da loja e identificação da causa pendentes. |
| 18 | APOLLO PRINT AGENT | Parcial | Print Lite incorporado; integração autenticada e instalação como agente PWA pendentes. |
| 19 | COZINHA E BAR | Pendente de verificação | KDS herdado; reformulação e notificações pendentes. |
| 20 | CLIENTES, DELIVERY E FIADO | Pendente de verificação | Módulos herdados; revisão individual pendente. |
| 21 | FINANCEIRO E RELATÓRIOS | Herdado · validação parcial | Comparação anual do DRE passou nos três navegadores no roteiro existente. |
| 22 | APOLLO IA | Pendente de verificação | Apollo IA herdado; validação de indicadores pendente. |
| 23 | LOGIN E OPERADORES | Herdado · validação parcial | Login exercitado nos três navegadores. Fluxos de recuperação e PIN não reavaliados em campo. |
| 24 | FUNCIONAMENTO OFFLINE | Herdado · validação parcial | Testes CI de filas offline passaram. Impressão local integrada ao PWA pendente. |
| 25 | MODO COMPACTO E MODO DE DESEMPENHO | Parcial | Três densidades e redução de efeitos. Medições locais em Chromium; ASUS, CPU e RAM total pendentes. |
| 26 | CENTRAL DE DIAGNÓSTICO | Pendente de verificação | Central completa de diagnóstico não entregue nesta etapa. |
| 27 | RECUPERAR TODAS AS MELHORIAS JÁ AUDITADAS | Parcial | Consolidação P63 por ancestralidade. Referências remotas com os nomes indicados indisponíveis. |
| 28 | NOVAS MELHORIAS DE USABILIDADE | Parcial | Preferências visuais persistentes, consumo paginado. Demais melhorias não reavaliadas individualmente. |
| 29 | TESTES DE RESOLUÇÃO E ZOOM | Parcial | Matriz 26×6 em Chromium e auditoria Firefox/WebKit. Windows nativo e equipamentos reais pendentes. |
| 30 | TESTES AUTOMATIZADOS DE INTERFACE | Parcial | Playwright, capturas comparativas Apollo e verificação de viewport no pagamento. |
| 31 | AUDITORIA TÉCNICA E OPERACIONAL | Parcial | Build, testes locais e CI. Ensaio de rollback executado na base P63, sem repetir para cada artefato P64. |
