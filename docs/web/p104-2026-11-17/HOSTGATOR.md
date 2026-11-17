# P10.4 — implantação controlada na HostGator (PREPARADA, NÃO EXECUTADA)

Destino solicitado: `homolog.apollo-pdv.com`, AlmaLinux 9/Virtualmin, 1 vCPU/2 GB, outro site ativo. **Capacidade NÃO COMPROVADA; implantação NÃO AUTORIZADA.** Esta escolha do proprietário é mantida como destino preferido. Não há SSH, endereço de acesso nem autorização de inventário concedidos nesta missão.

## 1. Inventário a autorizar

Executar somente depois de autorização explícita de SSH/leitura e identificação do servidor pelo titular. Não inserir senha, chave ou token em PR/chat. Usar acesso fornecido por canal seguro e confirmar fingerprint por fonte independente. Não instalar ferramenta ausente. Comandos abaixo não fazem login nem concedem autorização.

```sh
date --iso-8601=seconds
cat /etc/os-release
uname -m
uptime
lscpu
free -m
swapon --show --bytes
vmstat 1 6
df -hT
df -i
ps -eo pid,comm,pcpu,pmem,rss --sort=-rss
systemctl list-units --type=service --state=running --no-pager
systemctl list-timers --all --no-pager
ss -lntup
httpd -v
httpd -M
httpd -S
httpd -t
getenforce
getsebool httpd_can_network_connect
getsebool httpd_can_network_relay
```

Se Docker já existir e sua leitura estiver autorizada:

```sh
docker version --format '{{.Server.Version}}'
docker compose version
docker info --format '{{.DockerRootDir}}'
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.BlockIO}}'
docker network ls
```

Completar [checklist P10.3](../p10-2026-11-16/P10.3-INFRASTRUCTURE-CHECKLIST.md): versões Virtualmin/Webmin/PHP/bancos, SELinux/firewall IPv4/IPv6, portas/sub-redes, histórico de pico do site, OOM/I/O e última recuperação comprovada. Revisar logs localmente; compartilhar só métricas sanitizadas. Não anexar journal/configuração completa, args de processos, env, cookies ou dumps. A captura pontual não substitui um ciclo com pico real do site. Não rodar stress, build, restore ou failover nesta VPS para medir folga.

## 2. Decisão de capacidade

A Web tem teto 384 MiB/0,75 CPU; Mongo, 768 MiB/1 CPU; proxy TLS de laboratório, 128 MiB/0,25 CPU. São limites, não consumo nem reserva comprovada. Sem proxy de laboratório, somam 1.152 MiB e quotas até 1,75 CPU, além de SO, painel, Docker, Apache e outro site. Concorrência CPU pode causar contenção em 1 vCPU. Swap não substitui RAM operacional.

O administrador precisa comparar picos observados, reserva acordada para o outro site, consumo do pacote ensaiado, disco para duas imagens, Mongo/journal/índices, logs, backup criptografado e restauração separada. Sem evidência, parecer **PENDENTE**, nunca “cabe” ou “não cabe”. Não reduzir limites/cache ou desligar serviços para forçar aprovação.

Se insuficiente: comparar orçamento real de upgrade da VPS atual com VM temporária isolada ou segunda VPS pequena para homologação. Não há cotação atual nem contratação autorizada. Mongo externo implica revisão de rede/guard/latência e não é substituição imediata compatível com este pacote. Compartilhar Mongo/banco/usuário do site existente não é alternativa aprovada.

## 3. Artefato, runtime e perímetro

Usar apenas pacote do workflow P104 com ensaio final PASS no mesmo source_head; baixar tar e checksum, guardar externamente hash obtido do CI confiável. O manifesto incluído no tar não autentica sua própria origem. O verificador confere integridade dos arquivos e identidades carregadas, não assinatura de fornecedor. Não usar artefato parcial de tentativa reprovada. Build no runner isolado; nunca na VPS compartilhada.

Comandos futuros de conferência, em diretório exclusivo já preparado/autorizado (nenhum executado no destino):

```sh
sha256sum -c apollo-p104-offline.tar.sha256
# Antes de extrair, revisar a listagem do tar autenticado e usar diretório vazio exclusivo.
tar -tf apollo-p104-offline.tar
# Extrair somente após validação de origem/caminhos e autorização de escrita.
# Na pasta do pacote extraído:
python3 verify_package.py .
```

Depois de autorização de instalação, revisão dos caminhos/mounts/SELinux/sub-rede e backup do site existente, carregar exclusivamente as imagens offline aprovadas:

```sh
docker load -i mongo.docker.tar
docker load -i nginx.docker.tar
docker load -i apollo-web.docker.tar
python3 verify_package.py . --loaded-images
```

Não há pull/build no Compose gerado; identidades e digests estão no manifesto/images.lock. O pacote remove a porta publicada da Web e a montagem permanente de bootstrap; Apache do host usa bridge privada `172.31.240.2:10000` após validar a rota real e ausência de conflito. O RUNBOOK antigo descreve o Compose de laboratório com loopback 18082: **não misturar seus comandos com o pacote offline**. Mongo não publica porta; rede private é internal. Não ativar o perfil tls-test/Nginx na VPS quando o TLS for terminado pelo Apache/Virtualmin. Revisar/retirar suas variáveis obrigatórias na configuração final, sem editar o pacote aprovado silenciosamente; qualquer adaptação deve receber diff e validação isolada.

Gerar segredos novos fora do Git com `generate_secrets.py`, proteger permissões/donos, e criar exclusivamente usuário/banco/volumes do Apollo. Configurar modo homologation, confirmação SYNTHETIC_ONLY_NO_REAL_DATA, integrações disabled, COOKIE_SECURE, APP_URL exata, origem e proxies conhecidos. Nunca copiar env/segredos do outro site. O provisionamento/recuperação local requer ACK explícito e identidade de destino; não habilitar restore HTTP. Revisar o `compose config --quiet` sem imprimir o env resolvido.

Virtualmin: virtual server/vhost/usuário/logs separados. DNS A/AAAA somente após validar destino e autorização. Certificado ACME público e renovação pelo Virtualmin após DNS autorizado; certificado de CI não é público. Revisar módulos proxy/headers/ssl, sintaxe e SELinux; não usar setenforce nem ampliar boolean global automaticamente. Manter Require local até autorizar lista IP/VPN. Não alterar o vhost do outro site. Reload/restart de Apache depende de autorização específica e checagem da disponibilidade do site existente.

## 4. Inicialização, operação e recuperação

Ainda não existe unidade systemd final aprovada para a VPS. Preparar unidade exclusiva com WorkingDirectory do pacote, EnvironmentFile privado, dependência Docker/network, ExecStart/ExecStop do projeto Apollo e procedimento de parada preservando volumes. Não habilitar timers, serviço ou restart global sem aprovação. Não alegar reinicialização automática validada pelo mero restart de container no CI.

Monitorar readiness com Host autorizado, liveness, 5xx inesperados, 429/401/403 intencionais separados, CPU/steal, MemAvailable/swap/OOM, disco/inodes/I/O, rotação de logs, backup e expiração TLS. Projeto offline limita logs json-file a 10 MiB ×3 por container; vhost precisa de retenção própria. Não alterar daemon Docker global. Escalonar alertas e definir responsável antes da exposição.

Backup: exportação fictícia consistente via CLI local P104 em banco sintético preparado, arquivo 0600, SHA-256, criptografia age e cópia fora do volume/host. Chave privada fica em guarda separada, nunca artefato/PR. Backup não inclui credenciais; destino recebe administrador próprio. Não usar backup de clientes reais. Definir frequência/retenção/destino e provar restore antes da publicação; ainda sem agendamento operacional.

Restore: outro Mongo/volume/banco vazio dedicado e autenticado; `prepare-target`, `inspect-target`, conferir hash e target_id, `restore --sha256 HASH --expect-target ID`, reconciliar pedidos/marcadores/estoque/lotes/caixa e login local. Não apontar CLI para o banco ativo; não apagar/limpar destino para contornar recusa. Arquivo temporário descriptografado também precisa ser 0600. A API HTTP continua bloqueada.

Rollback de primeira instalação: retirar somente acesso Apollo, parar só Web/proxy Apollo, preservar volume/evidências e recuperar configuração anterior do vhost exclusivo se necessário. O ensaio P104 cobre retirada e recuperação do volume original; **não prova rollback entre versões anteriores de código**. Futuras versões exigem imagem anterior aprovada e compatibilidade de schema, ou restore em novo destino. Nunca `down -v`, prune, reset de banco ou restart do site compartilhado no destino.

## 5. Autorizações e aceite

Próxima autorização solicitável: SSH exclusivamente para inventário de leitura do servidor identificado, sem sudo adicional não acordado, instalação, serviços, banco, DNS ou carga. Depois do diagnóstico, apresentar configuração/diff concreto para aprovações separadas de provisionamento, Virtualmin/SELinux/reload, DNS/TLS, publicação restrita, banco/migrações, recuperação e eventual carga.

Após publicação restrita autorizada: login/perfis/produtos/estoque/caixa/venda e cancelamento fictícios/fechamento/relatórios, sem carga, com evidência esperada/observada e aceite do proprietário. Usar roteiro humano P10.3; equipamentos e impressão física continuam pendentes. Uso exclusivo inicial não certifica arquitetura comercial multiempresa: isolamento de clientes/licenciamento/suporte/distribuição exigem missão futura. **Produção bloqueada.**
