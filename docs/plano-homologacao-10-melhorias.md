# Plano de homologação — 10 melhorias Apollo PDV 3.0

Branch de trabalho: `feature/seguranca-permissoes-homologacao`. **Não fazer merge, deploy, vendas ou cobranças reais sem homologação.**

| # | Melhoria | Estado verificado em 10/11/2026 | Próxima validação |
|---|---|---|---|
| 1 | Meu Menu inteligente | Parcial: favoritos por operador neste dispositivo, agrupamento, ícones e ordenação de exibição; ainda sem reordenação manual | Build TS, teste visual Windows/celular, persistência e troca de operador |
| 2 | Mesas com tempo, consumo, garçom e status | Não validado nesta etapa | Revisar API/UI e testar com mesas fictícias |
| 3 | Caixa rápido, troco e divisão | Não validado nesta etapa | Fluxos simulados sem transação real |
| 4 | Estoque automático por ficha técnica | Não validado nesta etapa | Testar ficha técnica e baixa em pedido fictício |
| 5 | Compras e fornecedores | Parcial: compra fictícia registrada na homologação; nomes de selects corrigidos no código | Build e verificar estoque após compra, lotes/validade |
| 6 | Notificações | Não validado | Identificar eventos e requisitos |
| 7 | Tema, zoom, responsividade | Parcial: alternância de tema existente, menu responsivo alterado | Testes em resoluções pequenas e zoom |
| 8 | Atalhos de teclado | Pendente | Definir atalhos sem conflito com navegador |
| 9 | Backup e recuperação | Protótipos em PRs separados; restauração não homologada | Teste backup/restore com dados fictícios |
| 10 | Sincronização PC/celular e offline | Não homologado | Testes de concorrência, reconexão e conflitos |

## Etapa 1 — Interface (obrigatória antes de liberar)
- [ ] `cd frontend && npm ci && npm run typecheck && npm run build`
- [ ] Em administrador: Meu Menu mostra mesas, PDV, produtos, estoque, delivery.
- [ ] Selecionar/desmarcar favoritos, recarregar e confirmar persistência.
- [ ] Entrar como garçom: produtos, estoque e caixa não devem aparecer se não autorizados.
- [ ] Alternar operadores: não reutilizar os favoritos de outro usuário no mesmo dispositivo.
- [ ] Alternar entre Operação, Cadastros, Financeiro, Relatórios, Sistema e Meu Menu.
- [ ] Windows 10/11, celular: sem barra horizontal no cabeçalho, sem perda de botões.
- [ ] Validar correção dos nomes Fornecedor/Insumo no formulário de compras.

## Etapa 2 — Estoque
- [ ] Conferir saldo do insumo Carne Bovina Teste após compra fictícia de 5 kg (saldo esperado 15 kg se não houve outras movimentações).
- [ ] Associar ficha técnica ao produto fictício, verificar custo e baixa de insumo.
- [ ] Testar compra, quantidade, custo, validade, lote, estorno e estoque mínimo.
- [ ] Testar simultaneidade e integridade transacional no backend.

## Etapa 3 — Segurança e estabilidade
- [ ] Revalidar autorização no backend por perfil e estabelecimento.
- [ ] Simular perda de conexão e reconexão sem duplicar pedidos.
- [ ] Testar backup e restauração isolados.
- [ ] Executar testes automatizados e instalador Windows em ambiente de homologação.

**Registro de execução:** consulta às execuções de GitHub Actions associadas ao commit `68f1399246f3e4bcc557e8ea4dcfacf045109341` retornou lista vazia; portanto nenhum build/teste CI aprovado foi confirmado para este commit. Não considerar os checkboxes acima como executados.

## Política de versões de homologação
- Numerar as prévias progressivamente como `3.0.1`, `3.0.2`, `3.0.3` etc.; cada nova entrega testável incrementa o último número.
- `3.0.1`: interface, Meu Menu, ícones e menu superior. **Planejada; não liberada.**
- `3.0.2`: compras, estoque e fornecedores. **Planejada.**
- `3.0.3`: segurança e permissões. **Planejada.**
- `3.0.4`: mesas, comandas e caixa. **Planejada.**
- `3.0.5`: backup e restauração. **Planejada.**
- `3.0.6`: sincronização PC/celular. **Planejada.**
- `3.0.7`: notificações e atalhos. **Planejada.**
- `3.0.8`: homologação final. **Planejada.**
- Antes de publicar cada instalador, alinhar o número de versão no aplicativo, no empacotamento Windows e no nome do artefato; executar build, testes e registrar commit.
- Atualização limpa é autorizada **somente para a instalação local de homologação** após backup verificado; não apagar banco remoto ou dados de produção.
