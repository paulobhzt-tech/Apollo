# P10 — preparação de homologação HTTPS isolada

**Não executar este roteiro na HostGator sem autorização específica.** Nenhum comando abaixo foi aplicado à VPS. Não alterar DNS nem publicar o domínio nesta etapa. O CI usa somente runners e volumes descartáveis; seu certificado é de teste e não autoriza publicação pública.

## Componentes e limites preparados

| Componente | Rede/porta | Limites de runtime | Controle |
|---|---|---|---|
| Web compilada | rede privada; loopback do host 18082 | 0,75 CPU / 384 MiB | UID 10001, filesystem read-only, sem capabilities |
| Mongo 7.0.16 | somente rede privada, sem porta pública | 1 CPU / 768 MiB; cache 0,25 GiB | réplica p10, keyFile, usuário readWrite só no banco de teste |
| Proxy TLS de ensaio | loopback 18443; rede privada e edge | 0,25 CPU / 128 MiB | UID 101, TLS 1.2/1.3, origem preservada, forwarded headers substituídos |

A rede `private` é Docker `internal: true`; a Web não participa de `edge`. O guard Python bloqueia conexões TCP exceto para o Mongo permitido. Rotas Drive/cron/webhook/importação ficam bloqueadas em homologação. Métodos PIX/cartão e emissão fiscal da aplicação são registros/simulações locais, não liquidação ou transmissão externa. Nenhum segredo de provedor é aceito no ambiente P10.

O modo rejeita URI SRV, hosts arbitrários, proxies na URI, bancos/usuários de produção e papéis Mongo amplos. A aceitação de uma senha arbitrária não pode provar sua procedência: use **somente** `generate_secrets.py`, que cria segredos novos e nunca sobrescreve diretório existente. O operador não deve inserir dados pessoais reais. O marcador sintético só pode ser criado em banco vazio, com réplica gravável. Bootstrap HTTP exige peer loopback e segredo montado privado; não existe admin/admin. Nunca exponha o Mongo.

## Gate de infraestrutura — Virtualmin / AlmaLinux 9

1. Depois de autorização de leitura, inventariar CPU/RAM/disco, swap, portas, containers, serviços, limites SELinux/firewalld e carga do sistema já hospedado. Não presumir capacidade livre. Não instalar pacotes, reiniciar serviços nem executar benchmarks no site existente.
2. Obter backup do sistema existente e evidência de restauração em destino separado. Se não houver capacidade e reversão verificadas, usar **outra VM/host isolado**. Planejamento inicial de 2 vCPU/4 GiB não é capacidade certificada; medir o consumo real antes de reservar recursos.
3. Confirmar que 18082/18443 e a sub-rede 172.31.240.0/28 não conflitam com nada existente. Os exemplos não devem reutilizar volumes, usuário, banco, diretórios ou certificados do outro site.
4. Criar um virtual server **separado** para `homolog.apollo-pdv.com` no Virtualmin, com usuário e logs próprios, somente após autorização de infraestrutura/DNS. O modelo Apache é `apache-virtualmin.conf.example`; `Require local` bloqueia exposição até definir IP/VPN de teste autorizado. Revisar módulos, sintaxe, vhost e SELinux no host real. Não substituir a configuração global nem a do site atual.
5. Certificado público: emitir via Virtualmin/ACME apenas após domínio/DNS autorizados e validados. Nunca usar o certificado autoassinado do CI em público. Revisar renovação e monitorar expiração. Não ativar includeSubDomains/preload no HSTS sem auditoria dos outros subdomínios.
6. O exemplo Apache ainda exige validação no Virtualmin/AlmaLinux reais. O proxy Nginx é o ensaio Docker do CI, não uma prova de implantação no Apache da HostGator.

## Preparação futura em host dedicado autorizado

Usar checkout do HEAD aprovado e diretórios fora do Git, com segredos protegidos. Os comandos abaixo ilustram o procedimento **futuro**, não constituem autorização de execução na VPS:

```sh
# Executar apenas em host de homologação novo/autorizado, nunca no projeto existente.
sudo python3 deploy/p10/generate_secrets.py /srv/apollo-p10-private --container-owners
export P10_SECRETS_DIR=/srv/apollo-p10-private
export P10_CERTS_DIR=/srv/apollo-p10-approved-certs
export P10_IMAGE_TAG=HEAD_APROVADO
docker compose -p apollo-p10 -f deploy/p10/compose.yml config --quiet
docker compose -p apollo-p10 -f deploy/p10/compose.yml build web
docker compose -p apollo-p10 -f deploy/p10/compose.yml up -d p10-mongo
# Repetir até confirmar PRIMARY; o comando não imprime a senha.
docker compose -p apollo-p10 -f deploy/p10/compose.yml exec -T p10-mongo mongosh --quiet /opt/p10/replica-init.js
docker compose -p apollo-p10 -f deploy/p10/compose.yml run --rm --no-deps web python tools/p10_environment.py init
docker compose -p apollo-p10 -f deploy/p10/compose.yml up -d web
docker compose -p apollo-p10 -f deploy/p10/compose.yml exec web python tools/p10_environment.py bootstrap
```

Bootstrap solicita senha/PIN no terminal sem echo; não passar segredos em argumentos ou colar em issues. Remover a montagem de bootstrap após provisionar e antes de exposição. O serviço não concede sessão automaticamente ao provisionar. A senha deve ter 12–72 bytes e PIN não previsível; contas existentes com senha acima de 72 bytes exigem redefinição segura, pois bcrypt legado truncava entradas. Nenhuma senha real foi migrada nesta missão.

Para uso do Apache no host, publicar somente o loopback 18082 e configurar o gateway Docker real na allowlist `TRUSTED_PROXY_IPS`. Não usar `*`. Apache deve descartar `Forwarded`/X-Forwarded-For enviados pelo cliente e gerar os seus próprios. O backend só confia nos IPs de proxy explicitamente definidos. Manter uma única origem HTTPS para SPA e API, CORS vazio ou exatamente essa origem e cookie Secure/HttpOnly/SameSite.

## Health, logs e monitoramento

- Readiness: `/api/health/ready`, com Host autorizado; exige PRIMARY e índices únicos financeiros. `/api/` prova somente liveness.
- Alertar readiness 503, mudanças de primary, tentativas 429, negações 401/403, erro 5xx inesperado, memória/CPU/disco, expiração TLS e falha do backup. Não alertar como regressão um 403/429 intencional de teste.
- Logs do serviço vão a stdout/stderr; separar logs do vhost. Não registrar bodies de login, cookies, headers de autorização ou arquivos secretos. O teste de container verifica ausência dos segredos gerados e redige qualquer ocorrência antes de publicar artefato.
- Definir rotação e retenção antes de exposição; proteger leitura de logs. Docker `json-file` precisa de max-size/max-file no host dedicado ou driver equivalente, sem alterar o daemon compartilhado sem permissão.
- Capturar image ID/digest, commit, `pip freeze`, lock frontend, configuração sem segredos e resultado dos testes. Tags de base Docker podem variar; a publicação futura deve usar a imagem efetivamente validada por digest ou repetir a validação após rebuild.

## Backup, restauração e rollback

O backup lógico autenticado `/api/backup` é somente para administrador. Exclui hashes de senha/PIN, sessões, tokens Drive e marcadores locais de provisionamento/isolamento. O endpoint Web de restauração fica **bloqueado em homologação** para impedir importação arbitrária; restauração é uma operação local supervisionada, exclusivamente de backup fictício validado, em destino vazio e dedicado. A regressão real de backup/restore verifica manifesto, integridade financeira e preservação da identidade e dos marcadores locais.

Antes de qualquer publicação, demonstrar o ciclo com dados fictícios: exportar snapshot, verificar manifesto/hash, guardar cópia criptografada fora do volume Mongo, restaurar em **outro** banco vazio com credenciais próprias e verificar caixa/estoque/lotes/marcadores/contadores. Não testar restauração apagando o banco original. Backups não incluem credenciais de login; provisionar a identidade local do destino sob controle do operador. Definir responsável, frequência e ensaio periódico antes de exposição. Nada foi agendado ou enviado a serviço externo nesta missão.

Rollback deve parar/recriar apenas a Web P10 com a imagem anterior aprovada e os mesmos volumes, após backup e verificação de compatibilidade. Não usar `down -v` em ambiente a preservar, não trocar schema financeiro para mascarar falha e não reiniciar Apache/Mongo do outro site. Se houver incompatibilidade de dados, restaurar a cópia em **novo** destino e reconciliar antes de redirecionar tráfego autorizado. Alterações de DNS e tráfego sempre dependem de autorização separada.

## Executar novamente sem VPS

Workflow: `.github/workflows/p10-operational.yml`, branch `homolog/p10-operational-web`. O CI cria Mongo descartável, executa regressões P5/P6/P10 e destrói somente seus próprios containers/volumes. Nenhuma campanha P9 de 30 minutos é repetida. Os limites e garantias financeiros P6–P9 permanecem nos testes de regressão. Artefatos incluem resultados Playwright, screenshots, snapshots fictícios, logs, testes de recuperação e resultado TLS/container.

Impressão térmica, gaveta, leitor, celulares físicos, instalador Windows, WAN, capacidade multi-host, certificado público e aceite humano de operação continuam pendentes. Aprovação automatizada no escopo do CI não libera produção nem substitui a homologação operacional pública.
