# P10.5 — backup e recuperação HostGator

17/11/2026. PR #25. Base preservada: `3e0df24930f7b916d5416a61141f5d6725f8cd03`, posterior a P10.4 `a6cd4dedf67bc12f30fcdfade6b581a79a3bc5c9`.

**Veredito: BLOQUEADO para implantação operacional e produção.** Revisão e testes unitários concluídos. Não há restauração real desta revisão nem verificação de backups reais. P10.6/P10.7 não liberadas. Nenhuma conexão à VPS, parada, mudança de agendamento, instalação ou alteração de dados foi realizada.

## Origem e diferenças verificáveis

Repositório e `deploy/p10/RUNBOOK.md`, P10.4 HOSTGATOR/REPORT e P10.5 STATUS recuperados. O inventário anteriormente enviado pelo proprietário, `Texto colado(7).txt`, foi lido integralmente. É evidência fornecida, não uma nova inspeção remota.

| Arquivo instalado relatado | SHA-256 | Diferença |
|---|---|---|
| Produção: backup-mongo.sh | `cfec29a27686db8730e7837ea9ac5ec740631e44b0153bd8d5228f6141c1c581` | Coincide com os bytes da base Git; banco fixo e exclusão por idade |
| Homologação: backup-mongo.sh | `0754a475a02dd3ab827d96636bb6501d35ff013e5157ac7c3a205f90538506ed` | Acrescenta GZIP/SHA, mas mantém banco e destino fixos e exclusão por idade |
| Homologação: restore-drill.sh | `054868ea134bdf8f14dbea34046e35d3bc78683d2652aff61f164653a875a33a` | Ausente na base Git; usa imagem mutável, sem limites e aceita qualquer contagem positiva |

Containers relatados: `apollo-pdv-{apollo,mongo}-1` e `apollo-homologacao-{apollo,mongo}-1`. Variáveis DB_NAME/MONGO_URL e nomes das variáveis root foram identificados; **valores efetivos, autenticação válida e volumes ainda não foram comprovados**. A base Compose define apollo_pdv; isso não prova o banco em uso no servidor. Saídas de cron ficaram incompletas/ocultadas: não concluir que não há agendamentos.

Recursos informados/saída anterior: 1 vCPU, 1,7 GiB RAM, ~786 MiB disponíveis, 1,4 de 3 GiB swap ocupada, 23 GB livres. Não há série de pico/IO/reserva do outro site. **Não iniciar outro Mongo nessa VPS**. Os scripts de restauração destinam-se a host descartável separado, com capacidade própria; uma variável de confirmação não detecta fisicamente o host, cabendo ao operador garantir a separação.

## Correções

- Wrappers Bash executam núcleo Python 3, sem avaliação de arquivos .env ou parâmetros shell arbitrários.
- Ambiente explícito producao/homologacao, banco validado/confirmado, containers distintos e projeto Compose conferido nos dois containers. Confere DB_NAME e destino IPv4/porta de MONGO_URL dentro da aplicação, sem devolver URI/credenciais. Conexões SRV, múltiplos hosts ou topologias não comprovadas falham fechadas.
- Diretório privado preexistente 0700, pertencente ao operador, terminado no nome do ambiente. Um flock não bloqueante por diretório serializa execução; todos os agendamentos do mesmo destino devem usar esse diretório canônico. Não executar scripts antigos em paralelo.
- Exige confirmação de todas as gravações suspensas. Contagens antes/depois são uma guarda adicional, **não comprovam ausência de atualização de documentos**.
- Dump autenticado com configuração temporária privada dentro do Mongo; senha não é passada em argumento do mongodump. Erros das ferramentas não são propagados, pois podem conter detalhes de conexão. Não habilitar tracing. Configuração temporária é removida no término normal/erro; SIGKILL pode exigir limpeza supervisionada do arquivo temporário no container.
- Staging exclusivo, GZIP integral, SHA-256, tamanho, fsync e publicação por rename de diretório completo com UUID. Não sobrescreve arquivos legados. Manifesto e arquivo devem permanecer juntos e protegidos. SHA sem assinatura protege contra corrupção acidental; não contra alteração maliciosa de ambos.
- Reserva mínima prévia de 2 GiB; não estima o tamanho do banco nem garante espaço durante a execução. Monitorar disco/IO e cancelar de forma supervisionada se necessário. Timeout por comando: 30 minutos; após timeout verificar processos remotos antes de repetir.
- **Retenção conservadora: nenhuma cópia completa é excluída automaticamente.** Mantém a última recuperável e todas as demais até haver prova de restore externo. Alertar capacidade e idade; meta futura: 7 diárias + 4 semanais + 3 mensais, sempre preservando a última restauração aprovada e uma cópia externa independente. Exclusão posterior requer política revisada e autorização; esse coletor destrutivo não foi implementado.
- Upload preparado exclusivamente para `apollo-criptografado:apollo/AMBIENTE/BUNDLE`, imutável e seguido de rclone check --download. Exige confirmação local de que o remote é crypt, nunca imprimir rclone config. Não há retenção/exclusão remota automática.
- Ensaio cria Mongo por digest já disponível, rede none, sem portas, sem bind mounts/volumes persistentes, RAM 768 MiB sem swap, CPU 0,5, tmpfs limitado. Restaura namespaces em banco novo, compara todas as coleções/contagens e executa `lib.reconciliation.audit` sobre documentos restaurados (marcadores/pedidos, pagamentos, fiado, lotes, estoque e caixa). Qualquer achado bloqueia; não repara registros. Ausência de achado não prova integridade histórica. Índices/restrições, login e operação completa ainda exigem validação adicional. O tmpfs de 384 MiB limita o tamanho do ensaio: bases maiores exigem planejamento em outro host, não remoção improvisada dos limites.

## Consistência standalone: requisito obrigatório

Mongo standalone não oferece snapshot transacional multicoletânea no mongodump; contagens iguais não bastam e `--oplog` não resolve standalone. Identificar todos os clientes que escrevem: Web, desktop, jobs, integrações e acesso direto. Reservar janela aprovada pelo proprietário, concluir operações em andamento, controlar novas gravações por mecanismo previamente ensaiado e verificar ausência de escritores por toda a captura. Não basta bloquear novas requisições HTTP se existirem outros clientes.

O script não para PDV nem aplica fsyncLock automaticamente. Se não houver forma comprovada de controlar todas as gravações sem afetar operação, **não marcar APOLLO_WRITES_QUIESCED=YES**; solicitar janela e procedimento específico. fsyncLock/unlock, se escolhido após análise, requer supervisão e plano de desbloqueio em falhas. Antes de retomar gravações, confirmar término do dump e validação. Backups consistentes de produção e homologação devem ser feitos separadamente; manter bloqueio durante toda a operação relevante.

## Comandos de leitura na HostGator

Disponibilizar estes arquivos em diretório de revisão separado; não substituir `/opt/apollo` ou `/opt/apollo-homologacao` nesta etapa. Conferir hashes contra o commit do PR. Após disponibilização e autorização de acesso, executar somente leitura:

```bash
bash deploy/vps/inspect-recovery.sh
bash -n deploy/vps/backup-mongo.sh deploy/vps/restore-drill.sh deploy/vps/inspect-recovery.sh
python3 -m unittest discover -s deploy/vps/tests -v
```

A inspeção mostra banco/host interno/projeto/montagens, hashes dos scripts, metadados de agendamento e recursos, sem segredos. Revisar nomes e caminhos localmente antes de publicar. Inventariar também crontabs de outros usuários e timers customizados sob supervisão, sem colar seus comandos no PR. Comparar os hashes atuais com os acima; mudanças posteriores exigem nova revisão.

Para arquivos legados, somente leitura, usar Python gzip em streaming e hashlib SHA-256 e comparar com o token de 64 caracteres do sidecar, sem executar seu conteúdo nem confiar em caminhos nele contidos. Ausência de checksum original permite detectar GZIP inválido, mas não certificar integridade histórica. Não converter/renomear/remover arquivos originais. Nenhum arquivo de backup real foi disponibilizado nesta sessão.

## Preparação operacional — NÃO executar antes da autorização específica

Dependências: Python 3 stdlib, Bash, Docker, mongosh e MongoDB Database Tools com --config no container; aplicação com Python e URI de host único; root auth no banco admin disponível via variáveis já existentes. Outras credenciais/topologias exigem adaptação e ensaio, nunca inclusão de segredo em argumentos. Upload exige rclone e crypt remoto autenticado e conferido localmente. Host descartável requer Docker/imagem Mongo compatível por digest e dependências BSON do backend aprovado para reconciliação.

Depois de confirmar os valores reais pela inspeção, preencher variáveis **sem segredos**. Os nomes abaixo são candidatos do inventário, não configuração certificada. Preparação de diretórios, execução de backup e upload são intervenções operacionais e dependem da autorização específica desta missão:

```bash
# Diretório de scripts revisados; não substituir o checkout de produção.
install -d -m 0700 /var/backups/apollo/producao /var/backups/apollo/homologacao
export APOLLO_ENV=producao
export APOLLO_COMPOSE_PROJECT=apollo-pdv
export APOLLO_MONGO_CONTAINER=apollo-pdv-mongo-1
export APOLLO_APP_CONTAINER=apollo-pdv-apollo-1
export APOLLO_BACKUP_ROOT=/var/backups/apollo/producao
# Preencher SOMENTE com o banco real confirmado na aplicação e no Mongo.
read -r -p 'Banco confirmado: ' APOLLO_DB
export APOLLO_DB
export APOLLO_EXPECTED_DB="$APOLLO_DB"
# Só após janela aprovada, controle comprovado de todos os escritores:
export APOLLO_WRITES_QUIESCED=YES
bash deploy/vps/backup-mongo.sh
unset APOLLO_WRITES_QUIESCED
```

Repetir em outra janela para homologação, alterando ambiente para `homologacao`, projeto para `apollo-homologacao`, containers correspondentes e raiz para `/var/backups/apollo/homologacao`. Confirmar DB_NAME próprio; nunca copiar configurações da produção por suposição. Até um backup antigo pode ser do banco errado: conferir conteúdo somente no host isolado.

```bash
# BUNDLE = diretório completo emitido pelo backup; não é o arquivo archive isolado.
python3 deploy/vps/mongo_recovery.py verify "$BUNDLE"
# Após verificar localmente crypt/config/permissões e autorizar upload:
export APOLLO_CRYPT_REMOTE_VERIFIED=YES
python3 deploy/vps/mongo_recovery.py upload "$BUNDLE"
unset APOLLO_CRYPT_REMOTE_VERIFIED
```

Reidratar o bundle externo para diretório novo no host separado (rclone copy, nunca sync/delete), verificar e ensaiar:

```bash
# SOMENTE no host descartável separado com capacidade e acesso restrito.
export APOLLO_DISPOSABLE_HOST=YES
# Definir APOLLO_MONGO_IMAGE=mongo@sha256:<digest aprovado de 64 hex>.
bash deploy/vps/restore-drill.sh "$BUNDLE"
unset APOLLO_DISPOSABLE_HOST
```

Esse ensaio remove apenas o container aleatório que ele criou, com dados temporários em tmpfs. Não apaga volumes Docker. O retorno PASS só existe depois de mongorestore real, contagens e reconciliação. Falta testar esse caminho real; dryRun e mocks não substituem esse requisito. Reconciliador pode exigir memória maior que o dump comprimido; dimensionar no host isolado. Backups BSON contêm dados e credenciais de aplicação: tratar como material sensível, controlar acesso e descarte dos temporários e não publicar no CI/PR.

## Recuperação e rollback

1. Preservar imagem/digest/configuração e os volumes originais; registrar versão e horário do incidente. Não executar reset, prune ou exclusão de volumes.
2. Validar SHA/GZIP e restaurar backup externo em novo destino isolado compatível, com credenciais próprias. Comparar coleções, documentos, índices, relatórios e invariantes; reconciliar diferenças posteriores ao backup com documentos de origem, sem deduplicação/reparo automático.
3. Ensaiar aplicação contra destino novo, validar identidades e integrações sob bloqueio de escrita. Full dump inclui hashes/sessões/tokens; planejar revogação e rotação antes de conectar serviços externos.
4. Troca de tráfego/conexão e interrupção do PDV exigem autorização específica, plano de janela e compatibilidade de versão. Jamais apontar homologação para banco real como atalho.
5. Rollback de scripts: reinstalar bytes anteriores somente se necessário para diagnóstico; **não reativar agendamento antigo que apaga cópias ou seleciona banco errado**. Manter agendamentos preservados até revisão explícita. Rollback de aplicação/dados fica fora desta execução e exige cópia prévia e restauração em novo volume/destino; nunca sobrescrever o original.

RPO/RTO ainda não medidos. Proposta pendente: backup diário e antes de mudanças; frequência real deve respeitar janela/impacto. Alertar falhas, ausência de cópia externa validada, idade desde último backup/restore e espaço livre. Não prometer RPO de 24h enquanto agendamento e cópias não forem comprovados.

## Evidências e próximos bloqueios

`evidence/backup-tests.txt`: 18 testes unitários aprovados; incluem corrupção, hash, arquivos inesperados, symlinks, permissões, lock, banco/projeto incorretos, falha de dump sem perda de backup anterior, mudança de contagens, publicação exclusiva e guardas de restauração/upload. Chamadas Docker/rclone são simuladas, GZIP/hashes/arquivos/lock locais são reais. Mensagens PASS no teste de upload são resultado do mock, não prova de transmissão. Bash -n, py_compile e git diff --check aprovados. Nenhum teste da aplicação foi repetido.

Executor sem Docker/MongoDB/shellcheck disponíveis: não foi possível executar restauração BSON real, integração autenticada, upload/download externo ou medição de recursos do Mongo. Não atribuir aprovação dos testes anteriores P10.4 a estes scripts novos. São necessários: identidade/acesso seguro ao host, inspeção atual, bancos/conexões/volumes/autenticação confirmados, backups reais acessíveis, revisão dos agendamentos, janela de consistência autorizada, capacidade do destino isolado, ensaio real e reconciliação, cópia crypt recuperada e RPO/RTO medidos. Somente então reavaliar o parecer.
