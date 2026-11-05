# Apollo SaaS — uma instalação isolada por restaurante

Primeira etapa do provisionamento. **Não substitui homologação**: não há cobrança recorrente externa, monitoramento, backup externo ou validação em produção.

## Prepare o host Linux (Ubuntu/Debian e Docker Compose v2)
1. Configure seu domínio e registros DNS A de cada subdomínio para o IPv4 público da VPS.
2. Instale o Docker Engine e Compose v2 seguindo a documentação do fabricante; configure o firewall: apenas 22 (SSH restrito), 80 e 443 publicamente.
3. Na raiz do repositório, compile uma imagem da aplicação que será usada para os clientes:

```bash
docker build --tag apollo-pdv:latest .
```

4. Crie a rede externa e copie os arquivos de gateway para a pasta usada pelo provisionador:

```bash
sudo install -d -m 700 /opt/apollo-saas/gateway/sites /opt/apollo-saas/tenants
sudo cp deploy/saas/gateway/compose.yaml deploy/saas/gateway/Caddyfile /opt/apollo-saas/gateway/
docker network create apollo_edge
cd /opt/apollo-saas/gateway
docker compose up -d
```

5. Em `/opt/apollo-saas/gateway/Caddyfile`, substitua o email de exemplo pelo seu email real para notificações de certificado.

## Criar restaurante isolado
Na raiz do repositório, execute, alterando o domínio:

```bash
python3 -m management.provision --base /opt/apollo-saas create --slug restaurante1 --domain restaurante1.seudominio.com.br
```

O comando **não sobe contêineres nem altera DNS**. Ele gera:
- `/opt/apollo-saas/tenants/restaurante1/.env`, modo 600, com senha Mongo gerada automaticamente.
- `/opt/apollo-saas/tenants/restaurante1/compose.yaml`, com rede privada e volume do Mongo **exclusivo do cliente**.
- `/opt/apollo-saas/gateway/sites/restaurante1.caddy` apontando o domínio do cliente para seu contêiner dedicado.

Depois de confirmar DNS, portas 80/443, recursos disponíveis e backup, ative usando:

```bash
cd /opt/apollo-saas/tenants/restaurante1
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d
cd /opt/apollo-saas/gateway
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
cd /opt/apollo-saas/tenants/restaurante1
docker compose exec apollo python first_run.py
```

Para criação + ativação em um comando, acrescente `--apply` ao provisionador **apenas depois de garantir que o gateway está funcionando**.

Cada cliente possui contêiner Mongo e volume separados; sua aplicação pode acessar somente o próprio banco. O gateway atende todos por subdomínios independentes, sem publicar a porta de banco. **O servidor não está pronto para vários restaurantes até testar isolamento, recuperação, disponibilidade e capacidade.**

## Mensalidades
Use o painel administrativo isolado `python -m management.panel`, disponível somente em localhost, para controlar vencimento e registrar recebimentos manualmente. Nenhum cliente terá o caixa bloqueado automaticamente por atraso: isso exige regras claras e validação contratual.

## Backup isolado por restaurante (implementado, ainda não implantado)
- O script `deploy/vps/backup-mongo.sh` é **para a instalação única antiga**. Para SaaS use `management/backup_tenants.py` na raiz do repositório.
- Exemplo de execução na VPS, **após** provisionar o restaurante e instalar Docker:

```bash
python3 -m management.backup_tenants backup --tenant restaurante1
python3 -m management.backup_tenants verify /var/backups/apollo-saas/restaurante1/ARQUIVO.archive.gz
```

- O comando mantém cópias locais separadas por cliente, com permissão restrita, verificação da integridade gzip e retenção padrão de 7 dias. **Ele não é agendado automaticamente**: configure timer de systemd ou cron em horários de menor movimento depois de validar backups reais.
- A verificação gzip detecta arquivos corrompidos, mas **não substitui um teste completo de restauração em MongoDB separado**. Não restaure sobre o banco em produção.
- Envie cópias criptografadas para armazenamento externo, fora da VPS, com controles de acesso e política de retenção. Backups no mesmo disco não protegem contra falha do servidor.
- Backups, recuperação, disponibilidade e privacidade precisam de validação antes de liberar clientes pagantes.
- VPS com apenas 2 GB de RAM pode não comportar vários MongoDB independentes. Faça benchmark real: você pode começar com um restaurante e migrar para servidor maior conforme escalar.
