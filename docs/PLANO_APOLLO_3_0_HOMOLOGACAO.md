# Apollo PDV 3.0 — Plano de entrega e homologação

Status: planejamento aprovado pelo proprietário; funcionalidades não são consideradas implementadas até passarem pelos testes. Branch de trabalho: `fix/windows-production-server`. Não liberar produção nem marcar como concluído com testes pendentes.

## Etapa 1 — piloto Windows, segurança e confiabilidade (bloqueante)
- Instalador único Windows 10/11 x64: build CI, artefato .exe, SHA-256, instalação/desinstalação e smoke test em Windows; validação física em ambas versões.
- Pedidos: cliente pode editar carrinho ANTES do envio. Após envio, API deve negar exclusão/alteração/cancelamento pelo cliente (incluindo requisições diretas); somente papel autorizado pode cancelar com motivo e trilha de auditoria imutável. Testes de autorização e concorrência.
- Caixa: abertura, fechamento, sangria, suprimento, pagamentos parciais/mistos, estorno autorizado, conciliação e recuperação após falha.
- Offline: persistência local, fila idempotente, sincronização sem duplicar vendas, resolução de conflitos, reconexão e queda de energia.
- Backup: cópia automática protegida, retenção, integridade e teste real de restauração.
- Segurança: autenticação e sessões, menor privilégio, isolamento entre empresas, validação server-side, HTTPS, proteção de segredos, auditoria, varredura de dependências e revisão LGPD.
- Impressão: teste com impressoras de cupom, falha/reenvio sem duplicar pedidos.
- Critério de aceite: todos os testes críticos verdes; zero vulnerabilidades críticas/altas conhecidas sem tratamento; evidências do build e instalação; testes reais concluídos. Falha bloqueia homologação.

## Etapa 2 — operação
1. Antifraude e cancelamentos protegidos (inicia na etapa 1).
2. KDS cozinha/bar e status de preparo.
3. Cronômetro e alertas de atraso.
4. Divisão inteligente da conta por pessoa, item ou percentual.
5. Estoque automático por ficha técnica.
6. Relatórios de vendas, margem, desperdício e desempenho.

## Etapa 3 — crescimento
7. WhatsApp para notificações com consentimento e integração autorizada.
8. Fidelidade, pontos, cupons e cashback.
9. Delivery e gestão de entregadores/integrações.
10. Reservas de mesas e fila de espera.

## Etapa 4 — revenda
11. Multiunidades, segregação por tenant e relatórios consolidados.
12. Assistente inteligente com alertas e recomendações auditáveis.

## Matriz mínima de evidências
Para cada item registrar: responsável, PR/commit, teste automatizado, teste manual, ambiente, resultado, evidência e pendências. Não confundir workflow verde com homologação de operação real.

## Próximos passos técnicos
1. Revisar PR #2 e workflow Windows, executar build e inspecionar artefato.
2. Localizar endpoints de pedidos e permissões; implementar bloqueio server-side pós-envio e testes de regressão.
3. Validar caixa/offline/backup, cobrindo recuperação e duplicidade.
4. Homologar em Windows 10 e 11 antes de distribuir.
