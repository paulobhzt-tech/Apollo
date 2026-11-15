# Apollo PDV 3.0.1 — Missão P1 — 15/11/2026

**Parecer: REPROVADO PARA PRODUÇÃO.** Há correções funcionais e evidências reais de recuperação; a homologação global permanece incompleta. Não houve merge, deploy, uso de dados reais, alteração de credenciais de produção ou reparação financeira de registros legados.

## Base e escopo

PR #16 aberto e em rascunho; HEAD remoto conferido `09d3da735a4cb836cd05c43a81a47fde424475ab`, igual à referência. Branch P1 `audit/p1-global-integrity-recovery`, empilhada sobre `fix/p0-financial-stock-atomicity`. Preservados os testes e controles dos PRs #13–#16. Esta missão não refaz a auditoria de 330 atividades. A matriz [MATRIX.md](MATRIX.md) rastreia as 200 atividades P1, incluindo itens parciais, não testados e bloqueados.

## Defeitos reproduzidos e correções

| Prioridade | Evidência anterior | Correção e validação |
|---|---|---|
| P1 | Exportação não incluía marcadores financeiros e coleções essenciais; IDs BSON removidos | Exportação v2 de 28 coleções em snapshot transacional, IDs e tipos BSON preservados, manifesto com contagens/SHA-256. Roundtrip real, lotes e replay confirmados. |
| P1 | Recebimento podia alterar saldo antes de falha na gravação do histórico | Saldo, histórico, caixa e chave opcional de replay na mesma transação. Failpoint Mongo real aborta todo recebimento. Dez chamadas com mesma chave e dez chaves distintas não recebem duas vezes nem excedem saldo. |
| P1 | Inclusão de itens por funcionário/QR persistia comanda/KDS antes de falha de estoque | Uma unidade transacional inclui mesa, pedido, ticket, estoque e lotes. Falha após writes reverte tudo. Dez inclusões concorrentes mantêm uma comanda e dez baixas legítimas. |
| P1 | Aceite de delivery podia persistir ticket/estoque incompleto | Ticket, baixa e status transacionais. Dez aceites simultâneos baixam uma vez. Falha após baixa reverte status e ticket. |
| P1 | Cancelamento de delivery pendente devolvia estoque que nunca saiu | Marcador explícito stock_applied e guarda para pedidos pendentes/recusados. Teste real confirma saldo original e zero movimentos. |
| P1 | Exclusão de cliente quitado apagava histórico financeiro | Inativação transacional em vez de remoção; saldo não quitado impede operação, histórico preservado. |
| P1 | Recusadas offline limitadas a 200 descartavam operações antigas; corrupção permitia sobrescrita; erro ao arquivar removia pendentes | Sem truncamento silencioso; arquivo inválido bloqueia gravação e alerta operador; arquivar recusada antes de remover pendente. Três regressões reproduzidas e seis testes Node aprovados. |
| P2 | Dependências Vite/Vitest com advisories publicados | Vite 8.3.8 e Vitest 4.1.12; typecheck/build/lint aprovados. Auditoria ainda possui seis entradas vulneráveis: não é aprovação de segurança. |

As cinco primeiras regressões do pacote inicial falharam no código anterior com MongoDB 7.0.16 real (`evidence/before.txt`). Duas regressões adicionais foram executadas no worktree destacado do HEAD original e falharam (`additional-before.txt`): devolução de delivery pendente e apagamento de histórico. `offline-before.txt` registra três falhas antes da correção; `offline-after.txt`, seis aprovações. Sem evidência de dados reais afetados e sem tentativa de repará-los.

## Limites importantes dos fluxos

Transações usam sessões propagadas e writes de negócio internos ao commit. A reserva opcional de identidade em financial_operations guarda hash da requisição e resposta no mesmo commit. Reutilizar chave com corpo diferente retorna 409. Callbacks não executam impressão física. KDS persistido no Mongo participa da transação; CRM best-effort e integrações externas continuam fora, sem promessa de exactly-once. Não foi criado um novo sistema de impressão/outbox.

Clientes antigos sem client_ref continuam compatíveis, mas não permitem distinguir repetição de intenção legítima em inclusão/recebimento. Fiado no frontend envia referência estável para o formulário; novos contratos são opcionais. QR/staff aceitam referência, sem afirmar que todos os clientes existentes já a enviam. Replay do PDV mantém a implementação validada do PR #16.

Transferência e liberação de mesa foram incluídas em transações. O teste de transferência versus pagamento confirmou pedido pago sem mesa ainda vinculada. Divisão, todas as mutações de metadados, reservas, estorno de fiado durante fechamento, alteração de limite e todos os canais externos não receberam homologação exaustiva. Não há garantia global de todos os fluxos por inferência a partir destes testes.

A conciliação implementada é um classificador somente leitura, não um mecanismo de reparo. Detecta IDs duplicados, referências órfãs, marcadores obrigatórios ausentes, divergência de pagamentos, fiado e caixa e devolução de lote maior que consumo. Trata pedidos legados e saldo inicial desconhecido como revisão. Não detecta toda duplicidade semântica nem comprova todos os cancelamentos/estornos antigos. Ausência de alerta não prova consistência.

## Backup e recuperação

Consultar [OPERATIONS.md](OPERATIONS.md). A restauração é insert-only em destino novo; rejeita arquivo incompleto/adulterado, credenciais e banco ocupado. Preserva referências e marcadores para que replay continue seguro após recuperar. Empregados importados ficam inativos; o administrador local mantém sua identidade e credenciais. Não restaura sessões, segredos externos nem toda a infraestrutura. O formato anterior parcial é rejeitado explicitamente, uma restrição deliberada de segurança documentada; não existe migração automática de backups antigos.

Teste real: restaurar todas as coleções em banco descartável, preservar IDs de lot_consumptions, validar marcador, repetir a mesma venda sem nova baixa; erro intermediário durante importação deixa zero documentos de negócio; backup durante venda concorrente inclui apenas um estado completo. As verificações de referência não equivalem à conciliação integral de todos os registros históricos. Arquivo JSON protegido por SHA-256 continua precisando de origem confiável, controle de acesso e criptografia operacional.

## Evidências de execução

- `full-suite-344.txt`: **344 testes backend + 3 subtestes aprovados**, 45,90 s; replica set real isolado e backend HTTP iniciado pelo runner. Inclui regressões existentes e os quatro testes HTTP anteriormente pendentes. A contagem anterior de 340 foi obtida antes dos quatro testes adicionais, e permanece registrada.
- `p1-final.txt`: **25 testes aprovados** (23 casos P1 parametrizados + 2 de conciliação), 5,74 s. Não somar ao total de 344: estão contidos nele.
- `frontend-final.txt`: typecheck e build concluídos com Vite 8.3.8; avisos existentes de CSS, tamanho de bundle e configLoader. `frontend-lint-final.txt`: lint passou com avisos, sem desabilitar regras.
- `offline-after.txt`: seis testes Node aprovados. Armazenamento simulado; não é homologação Windows/Electron/múltiplas janelas.
- `failover.json` e `failover-final.txt`: três processos MongoDB reais com keyFile e autenticação; acesso anônimo negado; eleição durante transação, duas tentativas, um único débito/movimento, saldo final 90. Recuperação medida 10,314 s. SIGKILL do antigo primary e reinício com mesmo dbpath preservaram o dado. Todos os processos foram descartados.
- Tentativas de harness `failover.txt`/`failover2.txt` são falhas de preparação/encerramento, não aprovações. Corrigidos keyFile base64 e cenário explícito de crash/reinício. A execução final real é a evidência válida. O runner também passou a resolver cwd do backend para evitar falha de import ao chamar a partir da raiz.
- Python compileall e bash -n do bootstrap executados. Docker/Compose não executados: infraestrutura nativa multinó não certifica esse compose.

## Segurança e dependências

Preservados papéis, PIN gerencial, CSRF/origin, limites de login e proteção de caminhos. A suíte de regressão cobre essas proteções; não houve pentest completo. Varredura estrutural do arquivo de backup JSON já versionado não encontrou campos pin_hash/password_hash/token/token_hash não vazios. O arquivo não foi usado como dado de teste nem exposto neste relatório. Isso não comprova anonimização, não examina todo histórico Git e não dispensa revisão humana de privacidade/retenção. Novos backups e segredos de homologação foram adicionados ao ignore, sem apagar arquivos rastreados.

Auditoria npm em diretório temporário, sem lockfile novo no projeto: 9 entradas antes (3 altas/5 moderadas/1 baixa), 6 depois (2 altas/3 moderadas/1 baixa). São entradas de pacotes, não nove incidentes. Restam dependências transitivas de tooling (incluindo shadcn/zod/minimatch/deepmerge) que exigem correção compatível; não aplicado audit fix --force. Fontes primárias: [Vite advisory](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) e [Vitest advisory](https://github.com/advisories/GHSA-xp26-3454-mjgp). Não foi reproduzido exploit em produção, Windows ou dev server.

## Riscos e próximas prioridades

1. Revisar dados legados com documentos de origem e plano humano; não criar marcadores retrospectivos automaticamente.
2. Homologar recuperação operacional de arquivos externos, índices, segredos, permissões mínimas e backups criptografados externos, com RPO/RTO. CLI interativa e compose precisam ensaio operacional independente.
3. Completar pagamentos/estornos de mesas, divisão de conta, caixa concorrente e fiado em todos os canais; integrar chaves de intenção nos demais clientes.
4. Executar Windows real, Electron, múltiplas janelas, crash e reconexão; JSON local compartilhado ainda não tem coordenação atômica entre processos. Não homologar offline global.
5. Resolver contenção/capacidade com perfil mensurável, sem retirar serialização financeira nem desativar segurança. Etapa de 100 sessões apresentou 27,84% de erros e a etapa prolongada de 50 apresentou 21,28%; produção não dimensionada.
6. Homologar replica set em três hosts/domínios de falha, TLS, partições de rede, privilégios mínimos, alertas e restauração. O ensaio local multinó não comprova essas propriedades.
7. Tratar advisories residuais com atualização compatível e regressões.

O relatório de desempenho e a publicação registram o resultado final do ensaio prolongado e os checks remotos. As limitações acima impedem aprovação de produção, mesmo com regressões P0/P1 corrigidas no escopo executado.

## Resultado final do ensaio prolongado

30 min 11 s de HTTP real, 3966 pedidos sintéticos, estoque final 1000, zero vendas pagas remanescentes e zero referências duplicadas. Os asserts de integridade passaram. Entretanto, na etapa longa de 50 sessões houve 21,28% de tentativas com HTTP 503, p95 de 30,19 s e 4,37 requests/s. Não é aprovação de capacidade ou disponibilidade. Ver [PERFORMANCE.md](PERFORMANCE.md), incluindo CPU, memória, conexões e ausência de comparação de desempenho antes/depois.

## Regressão de infraestrutura encontrada no CI final

O job recovery-failover 132920515722 do run 43749642719 falhou em `No initial primary`; outros jobs e outro run do mesmo HEAD passaram. A investigação demonstrou que o harness aguardava a eleição especificamente do seed direto 27101, embora qualquer membro elegível pudesse ser eleito. Isso tornava o bootstrap aleatório, antes de qualquer transação de negócio.

A correção descobre o primário pela topologia do driver e mantém autenticação e asserts financeiros. A regressão real configura o seed com prioridade zero, impedindo que ele seja eleito, e exige `bootstrap_seed_secondary=true`. Ver evidence/ci-bootstrap-before.txt, failover-secondary-seed.json e failover-secondary-seed.txt. Não foi contornado ou removido o teste; a tentativa falha continua documentada. CI do novo HEAD deve ser consultado no PR.

Regressão corrigida executada localmente: bootstrap_seed_secondary=true, acesso anônimo negado, eleição em 10,551 s, duas tentativas transacionais, saldo 90 e um único movimento; crash/reinício preservou o dado. A primeira preparação com prioridade zero no próprio nó de rs.initiate foi rejeitada corretamente pelo MongoDB (InvalidReplicaSetConfig), registrada em failover-secondary-init-before.txt. A inicialização passou a ocorrer em membro elegível, mantendo o único seed do driver como secundário.
