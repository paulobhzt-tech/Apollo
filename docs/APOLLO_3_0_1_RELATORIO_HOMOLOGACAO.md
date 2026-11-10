# Apollo PDV 3.0.1 — relatório de homologação

Data: 10/11/2026. Repositório: paulobhzt-tech/Apollo. Branch exclusiva: `feat/apollo-3.0.1-caixa-offline-auditoria`.

**Sem publicação em produção, merge na principal, cobranças reais ou alteração de dados existentes.** Testes locais usaram funções isoladas/mocks; integração no CI usa MongoDB descartável.

## Implementações desta sessão

| Área | Entrega | Commit |
|---|---|---|
| Auditoria/replay | Referência vinculada ao conteúdo validado da venda por SHA256; reutilização com dados diferentes retorna 422 para revisão; compatibilidade com pedidos legados | [61ab0da](https://github.com/paulobhzt-tech/Apollo/commit/61ab0da9b635d85d2b5bbaddb48e117ef3f7e171) |
| Fornecedores/insumos | Entrada numérica brasileira validada, sem converter erro em zero; nomes normalizados; dados legados tolerados; diálogos com rolagem vertical e botão Salvar acessível por rolagem | [91fc1cf](https://github.com/paulobhzt-tech/Apollo/commit/91fc1cf377b8d09a98273578f3ee73240d380387) |
| Navegação | Menu superior por área com ícones, grades responsivas, busca no menu completo e tema no celular; sem faixa de navegação com rolagem horizontal | [e2bd91a](https://github.com/paulobhzt-tech/Apollo/commit/e2bd91a6d9b8aa5acfd2081f2ea13a6b63650425) |
| Offline | Fila ilegível não é sobrescrita; sincronização automática comunica falhas de armazenamento; testes de autenticação, rejeição, FIFO e novas vendas durante sincronização | [221f7be](https://github.com/paulobhzt-tech/Apollo/commit/221f7be3ee680e6cc6964a38816b054632bf32f5) |
| Testes de operação | Pagamentos simulados, troco, desconto, taxa, cartão/bandeira, caixa fechado, permissões, verificação de backup e mocks Motor isolados | [9d1527d](https://github.com/paulobhzt-tech/Apollo/commit/9d1527d20a93df78c758e85636b58a1cd999c202) |
| Caixa rápido | F3 foca busca; código exato tem prioridade mesmo fora da categoria selecionada; busca por nome ignora acentos; categorias quebram linha | [00a3a23](https://github.com/paulobhzt-tech/Apollo/commit/00a3a23ca8510976dfd475bf1d8b641a9f016d5b) |
| CI | Todos os testes frontend e regressões de caixa, auditoria, backup e edição de insumos incluídos | [a3b6854](https://github.com/paulobhzt-tech/Apollo/commit/a3b6854c9e9a9b6c11304e0c7c3089ab37376d9e) |
| Estoque concorrente | Edição moderna envia saldo original; atualização atômica retorna 409 se o saldo mudou; abas de estoque adaptadas ao celular | [76662b0](https://github.com/paulobhzt-tech/Apollo/commit/76662b0b91dd35bcadf5acd3a102420a1e88a35c) |

Além das entregas acima, [9334e3e](https://github.com/paulobhzt-tech/Apollo/commit/9334e3e58c8274e3af9529c3b9e1ac785fd5a1d7) mantém a referência da venda durante novas tentativas, inclusive falhas ao salvar offline, e restringe a limpeza de pedidos que falharam ao status aberto. Um erro posterior ao pagamento não pode apagar o registro pago. A recuperação de cozinha/estoque/fiscal ainda exige testes adicionais.

## Testes locais aprovados

| Bateria | Resultado | Escopo |
|---|---:|---|
| Python | 60 testes + 3 subtestes | Replay, pagamento simulado, permissões, integridade/pré-validação de backup, concorrência de insumos, autenticação, CSRF, demo guard e PWA |
| Vitest | 12 testes | Persistência/reconexão/sincronização offline, números dos formulários e busca do caixa |
| Node desktop | 3 testes | Detecção de servidor, atualização de configuração e isolamento do canal de teste |
| TypeScript/Vite | Aprovado | Compilação da interface; aviso de bundle acima de 500 kB permanece |
| Python compileall e git diff --check | Aprovados | Sintaxe e consistência do patch |

Comando Python: `MONGO_URL=mongodb://127.0.0.1:27017 DB_NAME=apollo_unit python -m pytest -q -n 0 backend/tests/test_offline_replay.py backend/tests/test_counter_payment_unit.py backend/tests/test_serverbackup_integrity.py backend/tests/test_ingredient_edit_concurrency.py backend/tests/test_auth_security.py backend/tests/test_csrf_origin.py backend/tests/test_demo_guard.py backend/tests/test_pwa_static.py`.

Frontend: `cd frontend && npx vitest run` e `npm run build`. Desktop: `node --test desktop/scripts/server-connection.test.js`.

## CI e instaladores verificados

O commit base [4804780](https://github.com/paulobhzt-tech/Apollo/commit/480478076c7b4e48e4569a39caa923c992707a7a) passou nos quatro workflows, incluindo pagamentos com MongoDB descartável. O instalador existe, não expirou na consulta e passou em instalação/abertura automática em Windows Server 2025 e 2022, com conferência de SHA256.

- [Instalador base 4804780, artefato 13810083398](https://github.com/paulobhzt-tech/Apollo/actions/runs/42918437886/artifacts/13810083398).
- SHA256 do EXE base: `5DC0F8808256AC91AE8198288B4BB2968B74A8AF9B0873AE31170F692EBDD0B1`.
- [Pacote com formulários e menu e2bd91a, artefato 13810932766](https://github.com/paulobhzt-tech/Apollo/actions/runs/42919332428/artifacts/13810932766). Instalador e ambos os testes Windows Server aprovados; ainda não contém as alterações posteriores de offline, busca e estoque concorrente.

Cada commit funcional foi enviado individualmente, disparando o CI. Para o último código 76662b0:

- [Instalador e smoke Windows](https://github.com/paulobhzt-tech/Apollo/actions/runs/42919753909).
- [Bateria de testes e pagamentos integrados](https://github.com/paulobhzt-tech/Apollo/actions/runs/42919753693).
- [Segurança, pagamentos parciais, Windows, infraestrutura e painel](https://github.com/paulobhzt-tech/Apollo/actions/runs/42919753698).
- [Frontend e PWA](https://github.com/paulobhzt-tech/Apollo/actions/runs/42919753738).

O pacote [76662b0, artefato 13810519646](https://github.com/paulobhzt-tech/Apollo/actions/runs/42919753909/artifacts/13810519646) foi verificado e passou nos dois testes Windows Server; a bateria de testes também passou. Não contém a correção posterior de retenção da referência de tentativa.

Última revisão de código: **9334e3e**, com estas execuções:

- [Instalador e smoke Windows](https://github.com/paulobhzt-tech/Apollo/actions/runs/42920136067).
- [Bateria de testes de operação](https://github.com/paulobhzt-tech/Apollo/actions/runs/42920135895).
- [Segurança e integração](https://github.com/paulobhzt-tech/Apollo/actions/runs/42920135857).
- [Frontend e PWA](https://github.com/paulobhzt-tech/Apollo/actions/runs/42920135834).

**Resultado final conferido: os quatro workflows de 9334e3e foram aprovados.** O artefato abaixo foi consultado por ID/commit, está disponível e passou na instalação/abertura automática em Windows Server 2025 e 2022, com comparação de SHA256 do EXE entre os runners.

**Pacote recomendado para iniciar a homologação:** [Apollo-PDV-Setup-test — 9334e3e](https://github.com/paulobhzt-tech/Apollo/actions/runs/42920136067/artifacts/13811880833).

ZIP com 82.867.961 bytes, expiração informada pelo GitHub em 24/11/2026. SHA256 do ZIP: `ea9b02c88e6ea2fe935f35251ae8739ea942d38b9986c36e57b8471fe98b2104`.

SHA256 do EXE: `000CF9924F4DB55FD8E905827B260F7D6EEFCAFA086C6C4EC829837BB1733335`.

Esse é um pacote **de teste**, sem release/publish. Aprovação no Windows Server não constitui aprovação em Windows 10/11 reais.

## Como iniciar a homologação

1. Baixar o ZIP do artefato do commit escolhido e extrair `Apollo-PDV-Setup.exe`.
2. Usar exclusivamente PC/dados de homologação. O canal `test` aponta a `http://localhost:18080` e exige backend de homologação/túnel local previamente configurado; o instalador não embute MongoDB/API.
3. Instalar no Windows 10 e 11 e conferir login/perfis, operação com dados fictícios, impressoras, queda/reconexão, reinicialização e atualização.
4. No celular, usar o backend de homologação acessível por HTTPS. `localhost` no celular não aponta para o computador.
5. Conferir fila vazia/rejeitados revisados e totais de caixa reconciliados. Validar backup e restauração em ambiente descartável, nunca sobre base existente.

## Pendências para liberação do piloto

- Teste real em Windows 10/11 e iPhone/Android. Smoke de Windows Server não substitui esses testes.
- Teste visual automatizado local bloqueado: Chromium não conseguiu criar sockets neste ambiente (`Operation not permitted`). Nenhuma captura ou validação visual em 390 px foi declarada aprovada; apenas revisão do layout e compilação.
- Confirmar cadastro/edição completos contra API de homologação, impressoras e persistência após queda de energia.
- Auditoria ainda é inicial: eventos embutidos no pedido e fingerprint não fornecem imutabilidade criptográfica do banco. Faltam painel, trilhas completas de descontos/estornos/cancelamentos/sangria/suprimento e alertas.
- Estoque otimista protege o saldo do editor novo; clientes antigos continuam compatíveis sem a guarda. Não cobre metadados concorrentes nem saldo que mudou e voltou ao valor original.
- Ainda avaliar isolamento da fila por estabelecimento/servidor/operador, múltiplas janelas sem Web Locks e recuperação de fila corrompida. A fila ilegível é preservada e bloqueada, não reparada automaticamente.
- Simular falhas entre pagamento, estoque, cozinha e emissão fiscal. Não afirmar atomicidade completa do fluxo de venda.
- Backup aprovado aqui significa integridade e pré-validação com mocks; ainda falta restauração ponta a ponta em base descartável e recuperação após perda de máquina.
- Bundle frontend acima de 500 kB; otimização fica após estabilizar o piloto.

## Próximas etapas sem bloquear o piloto

Priorizar revisão de rejeitados offline, trilhas de operações sensíveis e conclusão da matriz real Windows/celular. Manter cozinha/bar, validade/lotes, QR de mesa, conciliação financeira, atualização com rollback e Apollo IA em etapas posteriores conforme o plano existente. Não incluir novas integrações comerciais antes de estabilizar caixa, sincronização e backup.
