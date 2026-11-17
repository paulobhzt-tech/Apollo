# P10.8 — rs0 da homologação: pacote de revisão, não implantado

Escopo único: projeto `apollo-homologacao`, serviço `mongo`, aplicação `apollo`, diretório operacional `/opt/apollo-homologacao/deploy/homologacao`. Nunca aplicar ao Compose de produção ou ao P10 de laboratório. Nenhuma janela de manutenção foi aberta pelo Work nesta missão.

## Material preparado

- `preflight.py`: leitura de containers, identidade/projeto/volumes, perfis, bancos/contagens/índices/usuários sem credenciais, tamanho lógico/físico/journal, amostra de escritores e recursos. Opcionalmente lê o arquivo de backup conhecido com GZIP/SHA. Não cria diretórios/backups, não restaura nem altera serviços.
- `prepare_uri.py`: recebe Compose já resolvido pelo stdin e cria **um novo arquivo privado** de override contendo apenas MONGO_URL para a aplicação de homologação. Não imprime URI nem altera .env. Recusa projeto/banco/host/perfil inesperados; exige diretório 0700 do operador. É preparação que escreve arquivo: não executar durante mera auditoria sem concordância para esse destino.
- `compose.rs0.yml.example`: modelo de override somente para o Mongo, com keyfile read-only, rs0, cache 0,25 GiB, oplog 128 MiB e healthcheck autenticado de PRIMARY. CPU/RAM precisam ser preenchidas após orçamento real. Herda volumes/redes/imagem do Compose real, que ainda precisa ser inspecionado. Não adicionar `ports` ao Mongo.
- `init-rs0.js`: etapa **mutante**, nunca executada pelo Work; inicia apenas servidor já configurado para rs0/keyfile e ainda NotYetInitialized. Recusa set/host divergentes, janela >30 min/expirada/com <10 min restantes e falta de confirmação de restore/rollback. Não faz reconfig, não cria usuários, não reinicia nada. Variáveis de confirmação são atestados do operador, não produzem evidência por si.

## Pré-condições que bloqueiam execução

1. Identidade SSH autenticada e conectividade; fingerprint verificada por fonte independente. A tentativa local do Work retornou Network is unreachable. Não enviar senha/chave no chat ou aceitar host key presumida.
2. Preflight atual e inventário dos escritores, do Compose/entrypoint/comando, perfil de aplicação e volumes; duas aplicações/Mongo de produção saudáveis e sem compartilhamento de volumes com homologação. Verificar saúde funcional de produção por endpoint de leitura aprovado; running=true sozinho não basta.
3. Backup **deste ponto de homologação**, consistente com todos os escritores controlados; GZIP/SHA, namespaces, documentos/índices/usuários necessários identificados e restauração **real** em host separado concluída. O dryRun do arquivo de 7.243 bytes não atende ao requisito.
4. Rollback ensaiado em host separado com a mesma imagem/digest/FCV, configuração original e dados equivalentes. Medir duração e preservar configurações/volumes originais. Não afirmar que remover --replSet é rollback comprovado.
5. Orçamento CPU/RAM/disco/IO e reserva para o outro site aprovados. Conta inicial de 1 vCPU/1,7 GiB não é capacidade validada; não somar limites de containers como memória livre. `512 MiB` do container de restore antigo não prova que rs0 + app + mongosh cabem. Oplog/journal/cache exigem nova medição.
6. Compatibilidade de runtime: se APOLLO_ENV=homologation ativa o guard P10, ele espera p10, host p10-mongo, banco sintético dedicado e domínio antigo. `rs0`/mongo/apollo_homologacao/domínio homologacao não satisfazem esse perfil. Não desabilitar guard para aprovar. Identificar imagem/código e revisar perfil isolado antes de aplicar; app root@admin também não atende ao papel restrito do P10.
7. Janela **atual** explicitamente confirmada pelo proprietário, no máximo 30 min. A autorização de planejamento não confirma uma nova janela. Se backup+restore+aplicação+teste+rollback medidos não couberem no orçamento, não iniciar.

## Etapa autorizada de leitura assistida

Executar o preflight a partir de diretório de revisão separado ou enviá-lo por stdin via SSH. Não substituir checkouts existentes. Depois de obter o arquivo do commit deste PR, no PowerShell:

```powershell
$ApolloTarget = Read-Host 'Destino SSH autorizado (login@IP)'
$ApolloPreflight = Get-Content -Raw -LiteralPath '.\preflight.py'
$ApolloPreflight | ssh -T -p 22022 -o StrictHostKeyChecking=yes $ApolloTarget python3 - --verify-backup
```

Confirmar antes o fingerprint fora da conexão. A senha, se solicitada, é digitada somente no terminal local. Compartilhar apenas a saída sanitizada; revisar caminhos/nomes antes de publicar. O script produz hashes de arquivos de configuração, nunca seu conteúdo. Não executar `/root/apollo-preparar-rs0.sh` ou `/root/apollo-verificar-502.sh` como auditoria: primeiro conferir seus hashes/sintaxe/conteúdo **privadamente**, pois o primeiro já parou a aplicação em execução anterior e os logs do segundo podem conter informações sensíveis.

O preflight pode retornar incompleto se credenciais não estiverem nas variáveis esperadas do Mongo, se faltarem permissões ou se countDocuments exceder 5 s. Não copiar .env para o script como solução rápida. Amostra de currentOp sem escritores não comprova ausência de clientes adicionais; inventariar jobs, desktop, integrações e acesso administrativo.

## Backup: 349 MB físicos versus ~7 KB lógicos

São medidas diferentes. `/data/db` pode incluir journal pré-alocado, estruturas WiredTiger, espaço livre reutilizável, índices e todos os bancos. Dump lógico do banco selecionado contém documentos/metadados/definições de índices, comprimidos; não copia páginas, journal ou o mesmo volume físico dos índices. Isso torna uma diferença grande plausível, **não certifica o arquivo específico**.

Confrontar `dbStats.dataSize`, storageSize, indexSize, journal, lista de bancos e inventário do banco efetivo. Somar contagens exatas por coleção relevante (dbStats.objects é estatística) e identificar coleções ausentes/vazias/views. Comparar escopo do mongodump com a aplicação. O registro enviado contém usuário root@admin, mas um dump `--db apollo_homologacao` não prova inclusão das identidades administrativas. Conferir estratégia separada de usuários/roles ou dump autorizado com opção adequada; manter material com credenciais/hashes privado. Não inventar usuários recuperáveis a partir de um backup apenas de dados.

## Preparação futura de configuração — após revisão do Compose real

1. Fixar image ID/digest existente e UID/GID do usuário `mongodb` no container atual; não presumir 999. Não mudar versão de Mongo/FCV durante esta conversão.
2. Gerar keyfile novo em diretório privado fora do Git, com aleatoriedade criptográfica, 6–1024 caracteres base64; proprietário = UID/GID efetivos do mongod, modo 0400. Ancestrais/montagem precisam permitir leitura; validar contexto SELinux real. Não mudar política global SELinux nem usar :Z em diretório compartilhado. Não imprimir keyfile, não reutilizar senha de usuário como keyfile.
3. Copiar o modelo para arquivo **novo** revisado; configurar RS0_KEYFILE e limites explícitos. Analisar merge do Compose em memória e publicar somente resumo sanitizado. `docker compose ... config --quiet` valida sintaxe, não a segurança do merge.
4. Conferir que o merge mantém exatamente os mounts existentes de `/data/db` e `/data/configdb`, a mesma rede privada, alias mongo acessível pelo membro e pela aplicação, porta 27017 não publicada e imagem original. Não permitir criação silenciosa de outro volume por nome de projeto/caminho diferente. Capturar comparação de mount names/image IDs antes/depois.
5. Na preparação autorizada, o override de URI pode ser criado assim, a partir do diretório operacional auditado (substituir caminho do script revisado e escolher diretório privado NOVO fora do checkout):

```bash
# Escreve somente o override privado novo. Nao altera .env nem containers.
docker compose -p apollo-homologacao -f compose.yaml config --format json \
  | python3 /CAMINHO/REVISADO/prepare_uri.py --output /DIRETORIO/PRIVADO/uri.rs0.json
```

Esse arquivo contém segredo e NÃO vai ao GitHub. Preserva codificação de usuário/senha e adiciona replicaSet=rs0/authSource=admin. A aplicação deve resolver mongo:27017 na mesma rede; não usar IP volátil. URI não é impressa; erros são genéricos. Projetos/perfis/hosts/opções inesperados bloqueiam geração, exigindo revisão em vez de substituição cega.

## Janela controlada: roteiro condicionado, NÃO EXECUTADO

Definir T0, deadline T0+1800, responsável e canal de decisão; duração medida de rollback R deve estar disponível. Reservar pelo menos max(R+2 min,10 min) para retorno. Se R exceder a reserva ou não for conhecido, não começar. Medir estado funcional de produção antes/depois de cada fase, sem carga.

| Minutos indicativos | Etapa | Gate |
|---|---|---|
| 0–5 | Confirmar janela, saúde dos dois ambientes, bloquear todos os escritores de homologação e concluir operações | Nenhum escritor não controlado; produção intacta |
| 5–10 | Backup fresco consistente, validação local/externa planejada e restore/rollback exigidos para o ponto | Tempos previamente ensaiados e suficientes; não depender de dryRun |
| 10–15 | Parar somente Mongo de homologação pelo procedimento auditado; preservar ponto frio quando previsto; subir mesmo volume com override rs0/keyfile | Não mudar produção, não usar down/prune; verificar mounts/imagem antes de iniciar |
| 15–20 | Iniciar rs0 autenticado uma única vez; PRIMARY; recriar apenas app com URI privada e aguardar readiness | Perfil compatível, membro mongo:27017, API ready de verdade; não apenas / HTTP 200 |
| 20–30 | Retorno supervisionado se qualquer gate falhar; validar produção e estado final | Não iniciar novas tentativas ou ampliar janela tacitamente |

Os intervalos são **limites de planejamento, não tempos medidos**. Backup/restore do ponto novo podem ultrapassar 5 min; nesse caso replanejar antes de T0, sem usar essa tabela como promessa.

A sequência Compose exata deve ser derivada dos arquivos confirmados. Nunca `up` sem serviço alvo em um projeto compartilhado; quando revisado, usar projeto explícito, lista completa de arquivos e `up -d --no-deps` apenas para `mongo` ou `apollo`. Não executar `down`, `down -v`, `rm`, prune ou comandos contra containers de produção. A parada de um componente de homologação só ocorre dentro da janela confirmada.

Depois de subir o Mongo com rs0/keyfile e **só com as pré-condições comprovadas**, a etapa mutante preparada recebe o arquivo JS por stdin. Todos os valores abaixo dependem da janela real; não copiar YES para substituir evidência:

```bash
# APOLLO_RS0_WINDOW_START/END = epoch da janela confirmada; intervalo <=1800 s.
# CONFIRMED = HOMOLOGACAO_RS0_ONLY; RESTORE_ROLLBACK_PROVEN = YES apenas com provas.
docker exec -i \
  -e APOLLO_RS0_WINDOW_START -e APOLLO_RS0_WINDOW_END \
  -e APOLLO_RS0_WINDOW_CONFIRMED -e APOLLO_RS0_RESTORE_ROLLBACK_PROVEN \
  apollo-homologacao-mongo-1 mongosh --nodb --quiet < /CAMINHO/REVISADO/init-rs0.js
```

A saída RS0_INITIATED não significa PRIMARY/readiness. Aguardar com prazo limitado, autenticando e exigindo hello.setName=rs0 e isWritablePrimary=true; verificar configuração com exatamente um membro mongo:27017. Não repetir initiate/reconfig sem diagnóstico. Quando compatível e revisado, aplicar override privado à aplicação e aguardar /api/health/ready retornar 200 com JSON `ready:true`, Host correto e sessão HTTPS. A rota `/` pode retornar SPA 200 mesmo com backend financeiro indisponível.

502 logo após restart é transitório possível, como a evidência histórica demonstra. Readiness deve ter timeout/tentativas dentro do deadline; 502 persistente ou outro erro entra no gate de rollback, sem tentativas ilimitadas.

## Rollback — precisa ser ensaiado antes da migração

O hash de compose.yaml.original/env.original demonstra integridade dos arquivos, **não que uma reversão de dados/configuração foi exercitada**. Prever duas trilhas e escolher a comprovada:

- Retorno de configuração no mesmo volume somente se ensaio isolado provar que a versão exata reinicia em standalone com auth e dados/usuários preservados após rs.initiate. Não remover `local`/arquivos WiredTiger para forçar retorno; não assumir ausência de commits após a mudança.
- Se retorno de configuração não for comprovado, restaurar snapshot frio/backup validado em **novo** volume de destino e testar app antes de troca autorizada. Manter volume original intacto e comparar dados. Snapshot frio exige parada limpa e cópia de todo o conjunto consistente; tar de WiredTiger enquanto ativo não é prova. Dimensionar disco/tempo e planejar criação/ownership de volume no ensaio separado.

Rollback só retorna ao baseline anterior, que era standalone; não certifica que transações financeiras passam. Se testes fictícios geraram novas gravações, reconciliar essas alterações antes de restaurar ponto anterior. Não apagar volume original ou banco local. Na falha, manter escritores de homologação suspensos até decisão segura, sem encobrir indisponibilidade com HTTP 200 da SPA. Encerramento da janela inclui estado final e comunicação do incidente, não apenas término do comando.

## Aceite funcional depois de PRIMARY

Somente dados fictícios e integrações externas bloqueadas. Verificar conta/perfil/login/logout, criação de produto/estoque/lote, abertura de caixa, venda com referência única, cancelamento e recomposição exata de saldos/estoque; repetir a mesma referência sem duplicar. Concorrência inicial limitada a dois operadores, sem campanha de carga na VPS. Reinício/falha controlada somente com autorização da janela aplicável e reserva de tempo; persistência/recuperação exigem evidência de dados, não logs de processo.

Comparar índices únicos financeiros exigidos pelo readiness e reconciliador; guardar relatório sanitizado. Confirmar produção por teste de leitura aprovado e IDs/StartedAt/restarts/mounts inalterados. Encaminhar roteiro humano P10.3 para equipamentos/impressão; não declarar esses itens aprovados por CI. Produção e homologação não compartilham dados, credenciais novas ou liberações.

## Referências oficiais consultadas

- https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/
- https://www.mongodb.com/docs/manual/tutorial/enforce-keyfile-access-control-in-existing-replica-set/
- https://www.mongodb.com/docs/database-tools/mongodump/
- https://www.mongodb.com/docs/manual/reference/command/dbStats/

Um único membro habilita a topologia transacional, mas não acrescenta redundância/alta disponibilidade nem prova capacidade de produção. Nenhuma referência autoriza modificar a VPS sem os gates desta missão.
