# Apollo PDV 3.0.1 — evolução 2 antes da homologação

Data: 10/11/2026. Base funcional: `9334e3e`, preservando o relatório posterior `209e01f`. Branch: `feat/apollo-3.0.1-caixa-offline-auditoria`.

Não houve publicação, merge na principal, instalação no PC do usuário, cobranças reais, migração destrutiva ou acesso a dados reais. Os testes locais usaram mocks; o CI usa bases descartáveis para pagamentos integrados.

## Funcionalidades implementadas

### Auditoria operacional ampliada

- Pagamento de balcão, mesa e parcial registra ator, data, correlação, total, desconto, serviço e troco.
- Cancelamento de pedido registra justificativa e autorizador e usa comparação de status antes de devolver estoque; operações simultâneas não podem cancelar o mesmo estado duas vezes.
- Estorno/cancelamento de item, abertura/fechamento de caixa, sangria/suprimento e etapas da cozinha/bar registram eventos junto da gravação de negócio.
- Novo painel administrativo `/auditoria` com filtros por ação/registro; API `/audit/operations` nega acesso ao caixa antes de ler o banco.
- HMAC SHA256 opcional, configurado somente por `AUDIT_SIGNING_KEY` com pelo menos 32 caracteres. Sem chave, eventos são explicitamente não assinados. A chave nunca é gravada em eventos ou no código. Manter a mesma chave em armazenamento seguro; rotação ainda exige planejamento.
- Datas legadas e ISO são ordenadas cronologicamente; PIN, senha, CPF e payload de cliente não entram nos eventos novos.

**Não declarar antifraude completa:** HMAC detecta alteração de eventos assinados se a chave permanecer fora do banco, mas não prova ausência de exclusão de registros, não fecha todas as transações entre pagamentos/estoque/fiscal e não substitui segurança do banco. Auditorias financeiras, usuários e backups já existentes permanecem separadas e preservadas. Eventos legados não foram regravados.

### Offline 2.0 — primeira entrega

- Espera progressiva de 5 segundos a 5 minutos após erros transitórios; ordem FIFO e referência idempotente preservadas.
- Painel mostra tentativas, motivo e próxima tentativa; sincronização manual ignora a espera automática.
- Revisão de recusa arquiva payload original antes de remover da lista ativa; armazenamento cheio/ilegível bloqueia remoção para preservar evidência.
- Histórico local de recusas revisadas, sem considerar arquivamento como pagamento ou cancelamento no servidor.
- Falha encontrada no teste estático do contrato de reenvio foi corrigida em `effe64d`; teste real de armazenamento cheio foi acrescentado. Workflows históricos anteriores à correção podem continuar vermelhos.

### Caixa ultrarrápido 2.0

- Favoritos locais por produto, estrela acessível e filtro opcional, sem gravar vendas ou modificar produtos.
- Código exato continua tendo prioridade mesmo com favoritos/categoria ativos; produtos inativos não aparecem. Preservados F2/F3/F4, Enter e opções dos produtos.
- Preferências corrompidas ou indisponíveis não impedem operação; usuário recebe aviso se a preferência não puder ser salva.

### Estoque inteligente

- Planejamento de reposição em 1×, 2× ou 3× o mínimo, quantidade sugerida e custo conhecido estimado.
- Saldos negativos exigem revisão; mínimo zero não inventa quantidade; itens em unidades inteiras arredondam para cima; custo desconhecido não é tratado como gratuito.
- Consulta protegida por perfil em `/inventory/replenishment`; nenhuma compra ou movimentação é executada.

### Cozinha/bar

- Contadores por ambiente de aguardando, preparando, pronto, atrasado, crítico e maior espera.
- Filtro de atrasados muda cartões, mantendo o total de prontos e de produção do ambiente. Entregues ficam fora dos indicadores.
- Histórico de etapa ganha autoria na trilha operacional, preservando as transições já existentes.

### Backup e interface

- `/backups/server/health`, somente administrador e somente metadados: atraso, idade, tamanho, automação e checksum disponível.
- Tela de backup mostra diagnóstico; botão Verificar confere integridade por API de leitura sem restaurar dados.
- Integridade não é presumida pela idade/checksum disponível; `last_verified_at` permanece nulo porque não existe histórico persistido de verificações.
- Abas de configuração quebram linha em telas menores. Mantidos menus, permissões e funções anteriores.

## Commits separados

| Commit | Funcionalidade | Link |
|---|---|---|
| d578db0 | feat(audit): append operational trails atomically and add admin integrity view | [commit](https://github.com/paulobhzt-tech/Apollo/commit/d578db02fb14812aa8eede733e7e96e57ba22a36) |
| 4663d3d | feat(offline): add retry backoff and preserve reviewed rejected sales | [commit](https://github.com/paulobhzt-tech/Apollo/commit/4663d3da8c206d93a7cdd38250e52623df8f3205) |
| 0a07a1c | feat(caixa): add accessible local product favorites without changing sales | [commit](https://github.com/paulobhzt-tech/Apollo/commit/0a07a1c569ccbaecacfc5430e6ef7fe6f3091888) |
| bb33b78 | feat(stock): plan replenishment with configurable targets and cost review | [commit](https://github.com/paulobhzt-tech/Apollo/commit/bb33b7897328aa3c10806685bf4fed3757e456ea) |
| 7800717 | feat(kds): show station readiness and waiting indicators independently of filters | [commit](https://github.com/paulobhzt-tech/Apollo/commit/7800717d9266c6f239fbaab9fe93f30f32575b90) |
| f58ed18 | feat(backup): expose read-only admin backup health diagnostics | [commit](https://github.com/paulobhzt-tech/Apollo/commit/f58ed180e8935dc60540bb5d7feac63526d85c2b) |
| effe64d | fix(offline): preserve durable retry contract when clearing backoff metadata | [commit](https://github.com/paulobhzt-tech/Apollo/commit/effe64d6a4023fefaacdfae91a068b2abbb76435) |
| 7ff736c | fix(audit): order legacy timestamps consistently in operational history | [commit](https://github.com/paulobhzt-tech/Apollo/commit/7ff736c3cf23549976f3aa751ca2867c99878f5e) |
| 6cceb06 | test(kds): verify station readiness and late-ticket filtering | [commit](https://github.com/paulobhzt-tech/Apollo/commit/6cceb0617f288bb32e8a11bb49d7a28cded7be17) |
| b7dc775 | feat(backup-ui): display backup health and verify archives without restoring | [commit](https://github.com/paulobhzt-tech/Apollo/commit/b7dc775f1034110bdcd9229b54c9248bcc150e32) |
| ef7ddd8 | ci: validate expanded audit stock kitchen and backup test coverage | [commit](https://github.com/paulobhzt-tech/Apollo/commit/ef7ddd88999b9eccf987667f9dfc3b40196e79c5) |

## Validação local final

| Bateria | Resultado |
|---|---|
| Python | 105 aprovados + 3 subtestes |
| Vitest | 25 aprovados em 5 arquivos |
| Desktop Node | 3 aprovados |
| TypeScript e build Vite | Aprovados |
| Python compileall e git diff --check | Aprovados |

Cobertura executada: autenticação/CSRF, proteção demo, replay offline, pagamentos simulados, troco/bandeira/caixa fechado/permissões, integridade e saúde de backup, concorrência de insumos, auditoria/HMAC, transições KDS, reposição e PWA; no frontend, favoritos, busca, indicadores de cozinha, números e persistência/backoff/recusas offline. Não equivale à aprovação de todos os fluxos reais do restaurante.

Comandos principais: `cd frontend && npx vitest run`, `npm run build`, `node --test desktop/scripts/server-connection.test.js` e `MONGO_URL=mongodb://127.0.0.1:27017 DB_NAME=apollo_unit python -m pytest -q -n 0` com a lista isolada em `.github/workflows/quality-checks.yml` acrescida de `backend/tests/test_pwa_static.py`.

## CI e instalador

Último código desta rodada: `ef7ddd8` (inclui a ampliação do CI). Cada etapa foi enviada separadamente e disparou o CI.

- [Bateria de testes](https://github.com/paulobhzt-tech/Apollo/actions/runs/42922531945).
- [Segurança e integração](https://github.com/paulobhzt-tech/Apollo/actions/runs/42922531714).
- [Frontend/PWA](https://github.com/paulobhzt-tech/Apollo/actions/runs/42922531625).
- [Instalador Windows](https://github.com/paulobhzt-tech/Apollo/actions/runs/42922531764).

**Conferência final do código ef7ddd8: quatro workflows aprovados**, incluindo testes integrados de pagamento e instalação/abertura automática em Windows Server 2025 e 2022.

[Artefato Apollo-PDV-Setup-test de ef7ddd8](https://github.com/paulobhzt-tech/Apollo/actions/runs/42922531764/artifacts/13812386837). ID 13812386837; ZIP com 82871118 bytes; expira em 24/11/2026. Consultado por ID e SHA do commit, sem expiração na consulta.

SHA256 do ZIP: `4293070e6241db8d010ac82d0b2dccbc338d4a1a5facb97a1928001640415691`.

SHA256 do EXE, conferido nos logs: `56528A4E0B2E40FAB3D3AF5BBD6DA0D6AAA60AE764507535297CAEBF9CA1B7E0`.

O relatório é uma alteração de documentação posterior ao código testado; o artefato acima identifica exatamente a revisão funcional.

Canal continua `test`, servidor `http://localhost:18080`, empacotamento sem publish/release. O pacote exige backend de homologação/túnel configurado e não embute API/MongoDB. Não foi solicitado instalar agora. Smoke do CI em Windows Server não substitui homologação real no Windows 10/11 e celular.

## Pendências e limites

1. Auditoria antifraude ainda não completa: configurar/verificar chave fora do banco, retenção externa/antideleção, cobertura transacional de estornos/fiado/cancelamentos concorrentes e falhas entre pagamento, estoque, cozinha e fiscal.
2. Offline ainda precisa de isolamento completo da fila por estabelecimento/servidor/operador, teste de múltiplas janelas, reconciliação de referências antigas e recuperação assistida de corrupção. A fila continua no formato compatível anterior, sem migração destrutiva.
3. Consulta de auditoria precisa de medição e paginação para bases grandes; eventos novos não retroagem às operações anteriores à atualização.
4. Planejamento de estoque usa mínimo e custo cadastrados, sem previsão por vendas, prazo de fornecedor ou cotações automáticas. Nenhuma sugestão é uma compra aprovada.
5. Verificação de backup não comprova restauração. Falta exercício ponta a ponta em base descartável e recuperação após perda de máquina.
6. Homologação visual/funcional no celular, impressoras e Windows 10/11 reais foi adiada conforme solicitado; não registrar como aprovada. Nenhum novo teste visual foi executado nesta rodada.
7. Bundle frontend segue acima de 500 kB; aviso não bloqueou compilação. Permanece aviso de depreciação do plugin pytest/anyio.

Próxima etapa: concluir as proteções de identidade da fila e as transações das operações sensíveis, mantendo o piloto sem novas integrações de cobrança ou publicação automática.
