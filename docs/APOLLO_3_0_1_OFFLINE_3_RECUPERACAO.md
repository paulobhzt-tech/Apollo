# Apollo PDV 3.0.1 — offline 3.0, alertas e recuperação

Data: 10/11/2026. Base funcional `ef7ddd8`; preservado o relatório posterior `4d96bbb`. Branch: `feat/apollo-3.0.1-caixa-offline-auditoria`. Último código desta rodada: `9c6bccf`.

Sem publicação em produção, merge na principal, cobranças/vendas reais ou instalação no computador do usuário. Os bancos de teste são descartáveis e têm guardas explícitas. Não houve exclusão de dados reais.

## Etapa 1 — isolamento e recuperação offline

- Identidade de sincronização fornecida pelo servidor autenticado: estabelecimento, instalação do servidor e operador. Instalações legadas sem tenant_id usam a identidade da instalação como estabelecimento; isso não converte o restante do sistema em multitenant compartilhado.
- Filas, recusas, histórico revisado, menu e log de sincronização em chaves v3 separadas por essa identidade. Sessão encerrada limpa o contexto de memória, sem apagar as filas.
- Antes do reenvio, contexto autenticado é conferido novamente. Mudança de sessão/servidor preserva a fila original. Se houver troca durante uma chamada em voo, a resposta é persistida na fila de origem e não limpa a fila do próximo operador.
- Backend valida o contexto antes de procurar/criar pedido; escopo de outro servidor/operador retorna 403 antes de tocar nas vendas.
- Referência idempotente e fingerprint existentes preservados; campo novo de contexto não altera fingerprints antigos. Tentativas com mesma referência e payload diferente são bloqueadas também no dispositivo.
- Confirmações online novas também enviam o contexto confirmado. Clientes antigos continuam aceitos no formato anterior; servidor antigo pode operar online, mas não habilita fila v3 sem identidade confirmada.
- **Filas antigas ficam preservadas e isoladas para revisão. Não são automaticamente atribuídas ao operador ou estabelecimento atual.** Nenhuma migração destrutiva foi executada.
- Desktop grava temporário completo, confirma flush do arquivo, mantém cópia anterior validada e renomeia. Arquivo principal ausente pode ser recuperado da cópia válida. Arquivo principal corrompido não é substituído automaticamente; evidência e backup são preservados.

Não há garantia absoluta contra perda física de disco. Não foi executado ensaio físico de corte de energia. O login offline após reinício continua indisponível por segurança; as filas reaparecem após autenticação válida e reconexão.

## Etapa 2 — auditoria e alertas

- Alertas administrativos somente leitura para HMAC inválido, diferença de caixa ≥R$20, desconto acima de 20%, pelo menos três cancelamentos/estornos do mesmo ator na amostra e sangria ≥R$500.
- Alertas referenciam eventos e operador, não contêm payload de cliente, não comprovam fraude e não autorizam punições/bloqueios automáticos. A amostra é limitada aos 500 eventos recentes; não é uma auditoria integral de todo o histórico.
- Permissão de administrador verificada antes da consulta. A tela `/auditoria` apresenta indicadores e limites da amostra.
- Sangria/suprimento compara atomicamente o número de movimentações lidas com o estado atual; duas sangrias simultâneas não podem ambas usar o mesmo saldo antigo. Conflitos pedem atualização.
- Selos de eventos assinados são preservados ao restaurar: timestamps canônicos de `audit_events` não são convertidos em outro formato.

**Proteção antifraude ainda parcial:** HMAC opcional depende de chave segura fora do banco. Não detecta exclusão completa de registros nem substitui retenção externa ou transações de todos os efeitos financeiros/estoque/fiscal. Clientes legados sem contexto mantêm as limitações anteriores.

## Etapa 3 — backup e recuperação

- Backup passa a incluir compras/lotes, consumo por lote, inventário, produção, financeiro, categorias, meios de pagamento, cotações, auditorias, ponto e música ao vivo, além das coleções anteriores.
- Exportação exclui hashes de senha e PIN. Restauração ignora credenciais injetadas, preserva as credenciais locais existentes e não sobrescreve o administrador autenticado.
- Identidade da instalação, conexão Drive e estado de autoteste não são importados nem apagados por um backup de outra instalação.
- Antes da primeira substituição, uma cópia comprimida e com SHA256 do estado atual é obrigatoriamente salva em `restore_safety_backups`. Falha ou limite de tamanho bloqueia o início da restauração. A cópia interna contém credenciais atuais para recuperação, não é exportada e não é podada automaticamente.
- Exportação com mais de 100.000 registros por coleção é bloqueada em vez de truncar dados silenciosamente. Cópia anterior à restauração tem limite de 15 MB comprimidos.
- Identificadores duplicados são rejeitados no preflight. Contadores anteriores e maior número de pedido são preservados para não reutilizar numeração ao restaurar snapshot antigo.
- Teste real faz backup/restauração de entidades de estoque e auditoria, credenciais, identidade, contadores e selo HMAC; verifica a cópia do estado anterior. Exige `APOLLO_ALLOW_DISPOSABLE_RESTORE=1`, banco `apollo_restore_test_*` inicialmente vazio e MongoDB descartável. Só essa base criada para o teste é removida ao final.

A restauração ainda **não é uma transação única**. Uma falha intermediária pode exigir recuperação assistida pela cópia interna. A cópia no mesmo banco não substitui backup externo contra perda da máquina/disco. Recuperação automática de cópia interna ainda não foi implementada.

## Etapa 4 — previsão de estoque

- Consulta `/inventory/forecast`, somente leitura e protegida por perfil, usa consumo bruto de movimentos de vendas em janela de 7–90 dias; perdas são mostradas separadamente.
- Prazo de entrega informado entre 1–60 dias e margem de segurança entre 0–30 dias. A meta respeita o maior entre estoque mínimo e consumo médio no período de cobertura.
- Exige pelo menos três datas distintas de venda para sugerir quantidade. Histórico insuficiente, movimentos inválidos ou limite de 50.000 movimentos não são tratados como previsão confiável; amostra truncada bloqueia sugestões.
- Quantidades em unidades inteiras arredondam para cima. Painel opcional na tela de estoque consulta somente quando aberto e válido. Não executa compras ou movimentações.

O prazo é informado para a simulação; não é cadastro automático por fornecedor. A média usa a janela solicitada e pode subestimar consumo se o registro histórico estiver incompleto. Estornos não são descontados do consumo bruto. Isso é planejamento, não previsão estatística validada.

## Commits por etapa

| Commit | Entrega | Link |
|---|---|---|
| 64ea309 | feat(offline3): isolate authenticated queues by establishment server and operator | [commit](https://github.com/paulobhzt-tech/Apollo/commit/64ea30908465d80ebd098b43e0eae6abce3903e4) |
| a060f57 | feat(audit): add admin review alerts and fence concurrent cash withdrawals | [commit](https://github.com/paulobhzt-tech/Apollo/commit/a060f570c3ad08b23c18e1c8b76b7617eeef5149) |
| dc16650 | fix(backup): preserve inventory audit credentials and installation identity on restore | [commit](https://github.com/paulobhzt-tech/Apollo/commit/dc166508a49a34866c1f93f6f79b28f8ae9ae5a3) |
| 2085dff | feat(stock): forecast consumption and replenishment using history and delivery lead time | [commit](https://github.com/paulobhzt-tech/Apollo/commit/2085dff253b0640e78436315e346e45cb1dc1b59) |
| 6b3a81e | fix(desktop): flush offline storage and recover a missing primary safely | [commit](https://github.com/paulobhzt-tech/Apollo/commit/6b3a81ee9618260e0c145824c98b27682b8c296c) |
| f7ec0ac | fix(recovery): preserve issued sequence numbers across older backup restores | [commit](https://github.com/paulobhzt-tech/Apollo/commit/f7ec0ac11888c9a92ba9d8ca71cdaf684d149d7b) |
| 7a78adf | ci: validate scoped sync alert rules forecasts and durable desktop recovery | [commit](https://github.com/paulobhzt-tech/Apollo/commit/7a78adf9ed51bf2aff2a547cca274a2a47e58448) |
| 9c6bccf | fix(sync): bind online confirmations and reject changed queued retry payloads | [commit](https://github.com/paulobhzt-tech/Apollo/commit/9c6bccfb7bf6629c2f10557a911782eaa824e085) |

## Evidências de testes

| Ambiente | Resultado |
|---|---|
| Python local | 158 aprovados + 3 subtestes; 1 integração ignorada por ausência de MongoDB local |
| Frontend Vitest | 30 aprovados em 5 arquivos |
| Desktop Node | 8 aprovados |
| TypeScript, build Vite, compileall, diff-check | Aprovados |
| Restauração real em CI, código 7a78adf | 4 testes aprovados; inclui roundtrip em MongoDB descartável e 3 verificações isoladas |

A integração ignorada localmente não foi considerada aprovada localmente. [Evidência de restauração 7a78adf](https://github.com/paulobhzt-tech/Apollo/actions/runs/42925517245/job/130210875406). A última revisão funcional acrescenta o vínculo de confirmação online e a rejeição de payload divergente; o teste de restauração também é repetido nela no CI.

Cobertura: perfis/CSRF, replay, pagamentos simulados, selos e alertas, operações simultâneas, identidade, troca durante sincronização, filas legadas preservadas, armazenamento com falha de flush/corrupção, previsão de estoque, backup/pré-validação e restauração descartável. Não representa aprovação de todos os fluxos do restaurante.

## CI e novo instalador

Para o código final `9c6bccf`:

- [Testes e restauração descartável](https://github.com/paulobhzt-tech/Apollo/actions/runs/42925788094).
- [Segurança e integração](https://github.com/paulobhzt-tech/Apollo/actions/runs/42925788034).
- [Frontend/PWA](https://github.com/paulobhzt-tech/Apollo/actions/runs/42925788044).
- [Instalador Windows](https://github.com/paulobhzt-tech/Apollo/actions/runs/42925788147).

**Resultado final conferido: os quatro workflows do código 9c6bccf passaram**, incluindo pagamentos integrados e restauração real em MongoDB descartável (4 testes aprovados nessa bateria).

[Restauracao descartável da revisão final](https://github.com/paulobhzt-tech/Apollo/actions/runs/42925788094/job/130211788957).

[Artefato Apollo-PDV-Setup-test de 9c6bccf](https://github.com/paulobhzt-tech/Apollo/actions/runs/42925788147/artifacts/13813752196). Artefato verificado por ID/commit, não expirado na consulta, com 82873539 bytes e expiração em 24/11/2026. Instalação/abertura e comparação do mesmo EXE aprovadas em Windows Server 2025 e 2022.

SHA256 do ZIP: `59dd28f01416e8b4efd9f09541a34109c8752192fb32632a062cbf3a50c2f15b`.

SHA256 do EXE: `57F4CE719FFF1AECA5712EE49B59A3333F8711FB6A3B1D08F0A88FEEB960A49C`.

O relatório será um commit posterior de documentação; o artefato acima identifica exatamente o código funcional validado.

Um instalador intermediário de `6b3a81e` compilou, mas o processo NSIS encerrou com código `-1073741819` antes de abrir o aplicativo: [execução](https://github.com/paulobhzt-tech/Apollo/actions/runs/42925129905). Essa falha histórica não foi mascarada como sucesso. O build posterior `7a78adf` já passou na instalação/abertura em Windows Server 2025; a causa da falha intermediária não foi estabelecida. Conferir os testes e artefato da revisão final antes de distribuição.

O canal continua `test`, sem publish/release, com servidor `http://localhost:18080`; API/MongoDB não vêm embutidos. Não foi instalado nada no computador do usuário. Smoke do CI em Windows Server não substitui teste real no Windows 10/11 e celular.

## Pendências e próximas prioridades

1. Migração assistida das filas antigas com confirmação de origem e reconciliação das referências; elas foram preservadas, não automaticamente importadas.
2. Teste E2E real de duas janelas/origens desktop simultâneas e múltiplos dispositivos. Web Locks e idempotência do servidor não tornam todos os writes locais entre janelas uma transação única.
3. Recuperação de fila criptografada após perda completa da máquina/conta Windows, exportação segura de contingência e login offline autenticado após reinício.
4. Atomicidade completa de pagamento/fiado/estorno/cozinha/estoque/fiscal, retenção externa de auditoria, gestão/rotação da chave HMAC e monitoramento da falha NSIS intermediária.
5. Restauração transacional ou rollback automático e recuperação assistida da cópia interna, com backup externo e teste de perda da máquina. A nova cópia interna melhora a proteção, mas não é garantia de rollback automático.
6. Cadastro de prazo por fornecedor e validação da qualidade/completude do histórico antes de previsão mais avançada. Integrações de compras permanecem manuais.
7. Homologação real no Windows 10/11, celular, impressoras e ensaio de queda de energia continuam pendentes. Bundle acima de 500 kB e aviso pytest/anyio permanecem; não bloquearam os testes executados.
