# Apollo PDV 3.0.1 — retomada segura após interrupção do Work

Data: 2026-11-10
Branch: `feat/apollo-3.0.1-caixa-offline-auditoria`
Base funcional com CI aprovado: `9c6bccf`

## Verificação independente do GitHub

Comparação `9c6bccf...feat/apollo-3.0.1-caixa-offline-auditoria`: branch um commit à frente, apenas com a adição de `docs/APOLLO_3_0_1_OFFLINE_3_RECUPERACAO.md`. Não há, nessa comparação, commits de implementação da rodada interrompida.

Não inferir que arquivos locais do Work foram salvos no GitHub. Ao retomar, inspecionar `git status --short`, `git log -5 --oneline` e diffs locais antes de aplicar patches. Não usar `git reset --hard` nem `git clean -fd` sem revisar e preservar mudanças.

## Prioridade A — migração assistida de filas legadas

1. Inventariar chaves de fila antiga, recusas e histórico sem atribuir automaticamente tenant, servidor ou operador.
2. Exigir identificação de origem e confirmação explícita do administrador antes de migrar.
3. Validar referência idempotente e fingerprint contra pedidos existentes; em conflito, colocar em quarentena para revisão, nunca reenviar automaticamente.
4. Produzir prévia de contagem, itens, conflitos e backup local exportável antes de qualquer migração.
5. Garantir rollback lógico e não excluir a fila antiga até reconciliação e confirmação verificáveis.
6. Testes: origem incorreta, duplicação, mudança de sessão, armazenamento cheio, reinício no meio e dois clientes simultâneos.

## Prioridade B — restauração com falha

1. Mapear todas as coleções e efeitos externos alterados pela restauração.
2. Fazer preflight completo de esquema, integridade, credenciais, contadores, espaço e cópia de segurança.
3. Em ambiente MongoDB descartável, injetar falhas após cada fase e verificar se rollback/recuperação restaura estado anterior sem reutilizar números.
4. Preferir transação MongoDB quando suportada e viável; caso contrário, projetar protocolo durável de recuperação assistida antes de alterar o fluxo existente.
5. Não habilitar restauração automática em produção sem ensaio de falhas e revisão de segurança.

## Prioridade C — auditoria e instalador

- Investigar trilha de sangria, estorno e desconto, retenção externa, integridade e rotação de chaves sem afirmar antifraude completa.
- Investigar erro NSIS `-1073741819` da execução intermediária, coletando logs e comparando ambiente com o build aprovado; não atribuir causa sem reprodução.
- Manter o canal `test`, sem publish/release. Testes Windows Server 2022/2025 não substituem Windows 10/11 reais.

## Autenticação offline

Não ativar por padrão antes de revisar expiração, revogação, proteção do segredo em repouso, troca de operador, relógio alterado e comportamento após reinício. Sem autenticação confiável, preservar fila e exigir reconexão.

## Critérios para concluir a rodada

- Commits separados por correção; sem merge na principal.
- Testes Python, frontend, desktop, segurança e CI executados, com links e contagens reais.
- Testes de restauração apenas em banco descartável, nunca em dados reais.
- Nenhuma venda ou cobrança real, instalação no PC do usuário ou publicação em produção.
- Relatório final distingue implementado, testado em CI, testado em hardware real e pendente.

## Estado

Este documento registra análise e plano de testes; **não implementa nem homologa as correções descritas**.
