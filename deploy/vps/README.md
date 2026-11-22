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
