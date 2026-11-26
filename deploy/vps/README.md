# Apollo PDV — implantação em VPS Linux (HostGator)

Os arquivos deste diretório preparam **o deployment**, sem acessar sua VPS e sem migrar automaticamente dados da Emergent. O serviço usa 3 contêineres: Apollo (FastAPI + React), MongoDB privado e Caddy (HTTPS automático).

## Compatibilidade P46 — BLOQUEADO para caixas independentes

O `compose.yaml` deste diretório inicia MongoDB standalone. O Apollo P45/P46 usa `APOLLO_CASH_MODE=operator` por padrão e exige réplica MongoDB com transações; a inicialização recusará esse banco. A validação sintática do Compose não comprova compatibilidade operacional. Não execute esta receita para homologar P46 nem altere para `shared` para contornar o bloqueio. Prepare uma réplica dedicada, autenticada, com banco, credenciais, volumes, diretório e serviços exclusivos de homologação. Valide backup/restauração, HTTPS e isolamento antes de publicar. Nenhum servidor de destino foi validado por este documento.

## Antes de instalar
- Confirme o status **Ativo** da VPS, o IP público e a distribuição Linux. Este procedimento foi planejado para Ubuntu/Debian com Docker Compose v2.
- Configure um domínio DNS próprio (registro A para o IPv4 da VPS). **Não use o hostname provisório se ele ainda não resolve**. O Caddy precisa que o domínio resolva e que as portas TCP 80/443 estejam acessíveis para emitir certificado.
- Faça um backup dos dados existentes e planeje a migração cuidadosamente antes de usar o sistema na loja. Banco criado aqui inicialmente estará vazio.
- Instale Docker Engine e o plugin Compose conforme a documentação oficial do Docker para sua distribuição. Não use instaladores remotos sem revisão.
- No firewall do sistema operacional e no painel da hospedagem, permita somente SSH (idealmente restrito ao IP administrativo), HTTP 80 e HTTPS 443. Não exponha MongoDB (27017) nem a API interna (10000).

## Configuração
No servidor, com o repositório clonado na branch principal do projeto:

```bash
cd Apollo/deploy/vps
cp .env.example .env
chmod 600 .env
# Edite .env com domínio real e segredos fortes exclusivos (não os envie no chat).
test -z "$(git status --porcelain)"
export APOLLO_SOURCE_COMMIT="$(git rev-parse HEAD)"
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
docker compose ps
```

Defina `APOLLO_DOMAIN`, `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_URL` e `WEBHOOK_CRON_SECRET`. O `MONGO_URL` precisa usar o mesmo usuário/senha configurados no serviço MongoDB. Caracteres especiais no usuário/senha precisam de codificação percentual na URI. Depois de gerar as credenciais, **não as altere sem procedimento de rotação**, pois a inicialização do Mongo aplica as credenciais apenas quando o volume do banco está vazio.

## Verificação
```bash
curl -fsS https://SEU_DOMINIO/api/
docker compose logs --tail=100 apollo
docker compose logs --tail=100 caddy
```

Verifique login, autorização por perfil, abertura de caixa, vendas simuladas, mesas, comandas, cozinha e relatórios em ambiente de testes **antes** de colocar a loja em produção.

## Backup e recuperação
```bash
chmod +x backup-mongo.sh
./backup-mongo.sh
```
O script salva backups compactados em `/var/backups/apollo-pdv` e retém os últimos sete dias. Programe-o diariamente no agendador do servidor, e **copie um backup criptografado para armazenamento externo**. Teste a restauração em um banco de testes separado antes de depender dos backups. Backup somente no mesmo disco da VPS não protege contra falha do servidor.

## Acesso Windows
Após publicar e validar HTTPS, configure a variável GitHub Actions `PDV_SERVER_URL=https://SEU_DOMINIO` e execute o workflow `Instalador Windows`. Não inclua segredos do MongoDB no instalador: ele acessa apenas a API HTTPS.

## Limitações
- Não há acesso remoto automático ou deploy nesta etapa.
- O domínio, a VPS e o banco em produção precisam ser confirmados após a liberação do serviço.
- O modo offline do desktop ainda exige validação própria. Evite depender dele em horário de caixa até que seja homologado.

## Conferência pública de um build auditado

```bash
python deploy/vps/verify-public-build.py frontend/dist/build-integrity.json \
  --origin https://homologacao.apollo-pdv.com
```

Execute da raiz do repositório, com o manifesto do build aprovado no CI. A conferência usa GET por HTTPS e rejeita redirecionamento, manifesto servido como HTML, commit divergente e arquivos faltantes ou alterados. O resultado mede a identidade pública dos arquivos. A aprovação administrativa exige evidência separada da identidade do serviço, réplica do MongoDB, credenciais e volumes exclusivos de homologação, backup e rollback exercitado.

## Apache na homologação

`apache-web.conf` é um trecho versionado para o VirtualHost HTTPS da homologação. Defina `APOLLO_DOCUMENT_ROOT` como o diretório exclusivo do build conferido e `APOLLO_BACKEND_ORIGIN` como a origem do backend exclusivo, sem barra no fim. O trecho requer `mod_proxy`, `mod_proxy_http`, `mod_rewrite`, `mod_headers`, `mod_mime`, `mod_dir` e `mod_authz_core`.

O fallback atende navegações GET e HEAD. Arquivos estáticos faltantes e erros de API mantêm o status original. Antes de qualquer troca autorizada do diretório público, verifique a árvore em um diretório de release separado com `node frontend/scripts/verify-build.mjs DIRETORIO_DO_BUILD`. O verificador rejeita arquivos extras e hashes divergentes. Preserve o diretório anterior para rollback. O ensaio do CI usa Apache descartável e dados fictícios.

## Conferência do pacote antes da troca

Mantenha o manifesto extraído do artefato de CI aprovado em um caminho separado da árvore que será publicada. Use o SHA da execução aprovada.

```bash
EXPECTED_COMMIT=SHA_APROVADO EXPECTED_MANIFEST=CAMINHO_DO_MANIFESTO_AUDITADO \
  node frontend/scripts/verify-build.mjs DIRETORIO_DO_BUILD
```

Em caso de erro, interrompa a troca. A conferência rejeita inclusive uma árvore adulterada cujo manifesto foi recalculado para parecer consistente. Para homologação isolada e autorizada, mantenha duas árvores de release independentes. Registre o DocumentRoot e a árvore vigente antes de mudar o apontamento, preserve seu manifesto e verifique o retorno do manifesto, do worker e de `/login` após a troca. Em caso de rollback, recoloque o apontamento anterior e rode o verificador público contra o manifesto daquela versão. A troca do build não requer restaurar o MongoDB.

## Backup externo da instância isolada

O timer `apollo-cloud-backup.timer` inicia um backup completo a cada 15 minutos. O dump é
criptografado com a chave pública `age` antes de tocar o disco. O script relê o objeto
remoto para conferir o SHA-256 e publica o manifesto correspondente após essa conferência.
O backup usa o Mongo da instância identificada pelo arquivo e pelo projeto Compose.

Instale `age`, `rclone`, `flock` e Docker Compose no host. Crie uma identidade com
`age-keygen` em um ambiente separado e mantenha a chave privada disponível para a equipe
de recuperação. Configure um remoto rclone com transporte autenticado e criptografado
(HTTPS ou SFTP com verificação de host) e um prefixo exclusivo para a instância.
Proteja a configuração do rclone e o arquivo `/etc/apollo/cloud-backup.env` com modo
`0600`. Exemplo de variáveis para homologação:

```dotenv
APOLLO_BACKUP_COMPOSE_FILE=/opt/apollo/deploy/vps/compose.yaml
APOLLO_BACKUP_PROJECT=apollo-p645-homolog
APOLLO_BACKUP_DATABASE=apollo_pdv
APOLLO_BACKUP_STATE=/var/lib/apollo/cloud-backup
APOLLO_BACKUP_REMOTE=homologacao:backup/apollo-p645
APOLLO_BACKUP_RECIPIENT=age1...
RCLONE_CONFIG=/etc/apollo/rclone.conf
```

Ajuste o caminho em `ExecStart` para o checkout instalado e instale as unidades em
`/etc/systemd/system`. Após `systemctl daemon-reload`, execute
`systemctl start apollo-cloud-backup.service` para o primeiro backup manual. Confira o
histórico com `journalctl -u apollo-cloud-backup.service` e o próximo horário com
`systemctl list-timers apollo-cloud-backup.timer`.

Antes de ativar o timer com `systemctl enable --now apollo-cloud-backup.timer`, execute
`bash deploy/vps/restore-cloud-drill.sh NOME.archive.gz.age` em um host de recuperação
com Docker e as variáveis `APOLLO_BACKUP_REMOTE`, `APOLLO_BACKUP_DATABASE`,
`RCLONE_CONFIG` e `APOLLO_BACKUP_IDENTITY`. Use espaço temporário privado para o arquivo
decifrado. O ensaio importa apenas o banco informado em um contêiner sem rede, volumes
do host ou portas publicadas.

Configure no provedor a retenção do prefixo dedicado, com a mesma duração para o
arquivo e o manifesto. Monitore falhas da unidade e a idade do último manifesto com
o monitoramento do host. O script preserva os backups existentes. Em Mongo standalone,
o dump pode capturar coleções em instantes diferentes durante escritas concorrentes.
A janela de 15 minutos descreve a frequência agendada. Para validar o RPO, meça o
atraso das cópias verificadas e a consistência dos dados restaurados.
