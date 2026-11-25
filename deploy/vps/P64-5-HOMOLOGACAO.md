# P64.5 na Espeteria Churras Burguer

## Inspeção administrativa

Execute no terminal autorizado da homologação. Registre o horário, o operador e o SHA identificado. Em uma VPS compartilhada, obtenha a declaração de separação do responsável por produção sem acessar o banco de produção.

```bash
apachectl -S
ss -lnt
lsblk -o NAME,SIZE,FSUSE%,MOUNTPOINTS
df -h /srv/apollo-homologacao
free -h
curl -fsS https://homologacao.apollo-pdv.com/build-integrity.json |
  python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["commit"],d.get("release",""),d.get("artifact",""))'
```

Identifique o arquivo e o destino do VirtualHost HTTPS acima. Confira o certificado, DocumentRoot, proxy local, projeto Compose, IDs de imagens, redes, montagens, nomes e permissões. Inspecione somente os containers identificados como exclusivos da homologação. Restrinja a saída a metadados.

```bash
docker inspect --format '{{.Name}} {{.Image}} {{json .Mounts}} {{json .NetworkSettings.Ports}}' "$HOMOLOG_APP" "$HOMOLOG_MONGO"
docker stats --no-stream "$HOMOLOG_APP" "$HOMOLOG_MONGO"
docker inspect --format '{{.State.Status}} {{.RestartCount}}' "$HOMOLOG_APP" "$HOMOLOG_MONGO"
stat -c '%A %U %G %n' /srv/apollo-homologacao/web
```

Confirme no arquivo privado os nomes e destinos das variáveis, o MongoDB replica set e a identidade dedicada do usuário do banco. Verifique internamente que esse usuário só tem permissões para o banco fictício. Confirme que os serviços externos estão desativados ou em sandbox. Guarde recortes de logs de inicialização e saúde com credenciais e dados removidos. Registre a comparação de redes, volumes, portas, identidades, banco e serviços com o inventário aprovado de produção. Se o isolamento estiver inconclusivo, mantenha a release atual.

## Backup e ensaio de restauração

Use o banco exclusivo já identificado. O exemplo pressupõe o arquivo privado de configuração do Database Tools montado no container de homologação e o nome do banco confirmado em `HOMOLOG_DB`. Crie um diretório novo para cada execução. O comando preserva os arquivos existentes.

```bash
set -euo pipefail
umask 077
: "${HOMOLOG_MONGO:?}" "${HOMOLOG_DB:?}"
case "$HOMOLOG_DB" in apollo_homologacao|apollo_homologacao_*) ;; *) exit 2 ;; esac
backup_dir=$(mktemp -d /srv/apollo-homologacao/backups/p645.XXXXXXXX)
docker exec "$HOMOLOG_MONGO" mongodump --config /run/secrets/apollo-homolog-mongodump.yml \
  --db "$HOMOLOG_DB" --archive --gzip > "$backup_dir/mongo.archive.gz"
test -s "$backup_dir/mongo.archive.gz"
gzip -t "$backup_dir/mongo.archive.gz"
(cd "$backup_dir" && sha256sum mongo.archive.gz > mongo.archive.gz.sha256 && sha256sum -c mongo.archive.gz.sha256)
rollback_image=$(docker inspect --format '{{.Image}}' "$HOMOLOG_APP")
docker save "$rollback_image" | gzip > "$backup_dir/imagem-anterior.tar.gz"
(cd "$backup_dir" && gzip -t imagem-anterior.tar.gz && sha256sum imagem-anterior.tar.gz > imagem-anterior.tar.gz.sha256)
```

Restaure o arquivo em um MongoDB descartável, sem portas, rede externa ou montagens do ambiente ativo. Use `mongorestore --archive --gzip --stopOnError --nsFrom="$HOMOLOG_DB.*" --nsTo='apollo_restore_drill.*'` com redirecionamento do arquivo para a entrada padrão. Compare as coleções e os totais de controle fictícios. Preserve os hashes, a imagem anterior, os manifestos auditados e a evidência do ensaio. Execute a candidata com uma cópia restaurada antes de alterar o destino público. Documente o retorno à imagem anterior com a mesma cópia. A restauração da base ativa depende do impacto de migrações e exige preservar as gravações ocorridas após o backup.

## Publicação do frontend e retorno

O automatizador abaixo atende o VirtualHost cujo DocumentRoot foi previamente configurado como `/srv/apollo-homologacao/web/live`, com `live` apontando para a árvore relativa identificada pelo SHA. Use-o depois do ensaio, com a API compatível e estável no proxy de homologação. A atualização da imagem da API deve seguir o Compose observado e o plano de retorno ensaiado para aquele serviço. Registre o digest e o healthcheck do container em cada troca. O automatizador verifica a versão pública anterior, valida as duas árvores, troca o apontamento e retorna à anterior se a integridade pública ou a saúde da API falharem.

```bash
bash deploy/vps/promote-verified-web.sh /srv/apollo-homologacao/web \
  "$SHA_ATUAL" "$SHA_CANDIDATO" "$MANIFESTO_ATUAL" "$MANIFESTO_CANDIDATO"
```

Crie o primeiro administrador fictício pelo terminal interativo do serviço com `python first_run.py`. Use o cadastro de funcionários para dois caixas e um garçom, com senhas únicas entregues por canal privado. Só então execute o turno fictício, confira a conciliação e autorize o início dos testes físicos.

## Windows e PWA

Confirme `SOURCE.txt` e SHA-256 no pacote antes de instalar. Encerre o Apollo e o agente antes de atualizar. Preserve o perfil de impressão e a fila pendente em sua localização protegida. Para desinstalar o desktop use Aplicativos Instalados do Windows. No portátil, encerre o processo e retire o diretório de executáveis após preservar a configuração necessária. Para retirar o agente, remova a tarefa de autoinício com `apollo-print-agent-task.ps1 -Action Remove`, revogue o vínculo no Apollo e confirme os trabalhos indeterminados antes de reativar a fila.

No Chrome ou Edge, use Instalar aplicativo. No iPhone, use Safari, Compartilhar e Adicionar à Tela de Início. Valide Windows 10/11, Android e iPhone com dois caixas, um garçom e transações fictícias. Interrompa a internet durante o turno, reinicie os terminais e reconcilie pedidos, pagamentos e estoque. Na Epson TM-T20X, confira o nome da fila, o setor, a largura de 80 mm, o corte, os acentos e as duas vias no papel. Anote o aceite do spooler e a verificação física em campos separados. Consulte [o procedimento do agente](../../docs/homologacao/P64-3-PRINT-AGENT.md).
