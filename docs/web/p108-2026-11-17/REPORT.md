# P10.8 — HostGator, segurança Web e preparação rs0

17/11/2026. PR #25, branch homolog/p10-operational-web. Base preservada `8dfdabe286d3f1d4be156d153b725036d23c2260`. Não houve merge, deploy ou mudança de serviço na VPS.

**VEREDITO: HOMOLOGAÇÃO BLOQUEADA. Migração rs0 NÃO EXECUTADA.** Correção Web e ferramentas de preparação entregues para revisão; nenhuma janela de manutenção foi iniciada/confirmada nesta execução.

## Estado recuperado e evidências

PR aberto/draft no HEAD acima, checkout inicialmente limpo. P10.4–P10.5, guard transacional/isolamento/readiness e Compose de laboratório recuperados. Arquivo `Texto colado(20261117-153414).txt` lido integralmente (471 linhas) como evidência de execução **pelo proprietário**, não pelo Work. Contém comandos parcialmente truncados: não é cópia íntegra e auditável dos scripts instalados.

O arquivo registra:

- URI sanitizada: host mongo, porta 27017, banco apollo_homologacao, authSource configurado, sem replicaSet. Mongo com `mongod --auth --bind_ip_all`; usuário autenticado em admin, papel root e replSetConfigure confirmado. A consulta anterior sem autenticação que retornou authenticatedUsers vazio foi sucedida por teste autenticado positivo.
- Volume de dados `apollo-homologacao_mongo_homologacao_data`; `/data/configdb` também possui volume. Preservar **ambos**, inclusive o volume anônimo de configdb; não recriar por suposição.
- Diretório original de configuração preservado com SHA dos arquivos, e backup novo em `/root/apollo-backups/rs0-backup-20261117-123243/homologacao-pre-rs0.archive.gz`, 7.243 bytes, SHA-256 `ebbb6988098a5d910bfe65503ba84fd5d7e18ea2b7df7c1da13a844246c4c2cb`.
- Aplicação de homologação foi parada para captura e reativada. Não há prova de controle de **todos** os escritores. `mongorestore --dryRun` terminou com zero documentos restaurados; isso é leitura de ensaio, **não restauração real desse arquivo**.
- Primeiro HTTPS 502 imediatamente após reativação; segunda consulta, às 12:33:59 -03:00, encontrou HTTPS/local 200 e ambos os containers de produção running. Evidência suporta recuperação histórica do 502, sem certificar toda a saúde financeira/operacional.
- Memória disponível informada nessa captura ~815 MiB, swap usada 1,4 GiB, disco ~23 GiB livres. 349 MB em /data/db é dado informado nesta missão, ainda sem classificação física/lógica por banco.

Os caminhos `/root/apollo-preparar-rs0.sh`, `/root/apollo-verificar-502.sh` e diretórios de preservação estão localizados **no relato fornecido**. Não foram abertos pelo Work via SSH. Não executar o preparador antigo como diagnóstico: já contém parada da aplicação; rever conteúdo/hash localmente antes de qualquer reutilização.

## Verificações efetivamente executadas pelo Work

1. Tentativa SSH explícita, com configuração isolada `-F /dev/null`, BatchMode e StrictHostKeyChecking=yes, retornou exit 255 / Network is unreachable. Sem agente/known_hosts disponibilizados. Nenhuma sessão remota, comando Docker ou leitura de arquivo privado na VPS foi executada. Faltam conectividade e identidade/autenticação SSH segura, não uma aprovação genérica para diagnósticos.
2. GETs públicos sem autenticação no domínio **homologacao.apollo-pdv.com**, distinto do antigo homolog.apollo-pdv.com. Primeira rodada teve falhas URLError; segunda rodada obteve quatro HTTP 200 por HTTPS com cliente padrão verificando certificado. Não ocultar a intermitência. Não houve teste de renovação, relatório de cadeia/expiração ou acesso ao Virtualmin.
3. Comparação limitada a 1 MiB por resposta; os quatro corpos completos tinham 1.400 bytes e SHA-256 idêntico `adbe9ff7a298ff6e0f469c6b675b8f7d6a8897ebbdf520ee7be190cb12b1bf4b` para `/`, `/index.html`, `/.git/config` e `/.git/HEAD`. Content-Type text/html; sem assinatura de config/HEAD Git. **Essas respostas são fallback SPA; não demonstram exposição de Git.** Não é auditoria de todos os arquivos internos.
4. Headers observados: X-Content-Type-Options=nosniff, X-Frame-Options=DENY e Referrer-Policy=no-referrer. HSTS e CSP ausentes nas respostas amostradas. Recomendar política por vhost após inventário; não adicionar CSP arbitrária que possa quebrar a SPA, HSTS includeSubDomains ou alteração global Virtualmin nesta execução.
5. Revisão/reprodução de defeito no código: `_frontend_file` limitava caminho ao frontend, mas permitia arquivos ocultos dentro dele e aliases internos. Com fixture `.git/config`, `.env`, `.env.local` e symlink para `.env`, os 11 novos casos retornavam 200 antes da correção. Nenhum segredo real foi criado/usado no teste.

**Readiness público consultado:** `/api/health/ready` retornou HTTP 200 com Content-Type text/html, sem JSON e sem `ready:true`. Isso é incompatível com a resposta da rota de readiness do código revisado (JSON/200 ou JSON/503). Pode indicar versão antiga, fallback ou roteamento incorreto; a causa ainda exige inspeção do runtime/proxy. Não equivale a prontidão financeira. Resultados HTTP estão no JSON de evidências.

## Correção de segurança implementada — ainda NÃO implantada

`backend/server.py` agora recusa segmentos ocultos tanto no caminho pedido quanto no destino resolvido, antes de servir arquivo ou fazer fallback SPA. Responde 404 para `.git`/`.env` e aliases para esses arquivos. Mantém containment/symlinks seguros e precedência da API. A proibição também inclui dotpaths como `.well-known` na rota de frontend: ACME/arquivos públicos necessários devem ser atendidos explicitamente no vhost revisado, fora da SPA, antes de eventual implantação.

Validação: 11 casos novos reprovam o código anterior; **29 testes de frontend/caminhos aprovados** após correção. Incluem traversal, symlink externo, alias interno público, índice ausente/loop, rotas normais e precedência API. Execução local com imports de DB/routers substituídos pela suíte existente, sem Mongo real. Dependências de teste temporárias no executor, sem alteração dos locks; avisos de compatibilidade pytest/asyncio preservados no log. Não houve build/pacote novo nem deploy do fix; o domínio continua refletindo a versão instalada.

## Preparação de migração entregue

[Runbook e pré-condições](../../../deploy/vps/rs0/README.md), `preflight.py` de leitura, `prepare_uri.py` para override privado de conexão, modelo Compose e `init-rs0.js` condicionado à janela/provas. O script de inicialização não foi enviado/executado na VPS. Testes Mongo são mocks; não certificam replica set real.

- Mantém intenção rs0 de nó único, membro DNS mongo:27017, autenticação e keyfile privado; volumes/redes/imagem da base precisam ser confrontados antes do merge Compose. Nenhum serviço/volume de produção aparece como alvo mutante.
- URI é gerada em arquivo privado novo, preservando credenciais codificadas, sem editar .env/imprimir segredo. Recusa projeto/banco/host/opções inesperados e perfil P10 incompatível.
- Inicialização recusa janela >30 min, não confirmada/vencida ou com menos de 10 min restantes; exige declaração respaldada de restore/rollback. Só inicia em NotYetInitialized, nunca reconfigura set/host diferente. O operador precisa demonstrar as provas; variável YES não equivale a prova.
- Cache/oplog/healthcheck preparados, mas CPU/RAM não foram dimensionadas: modelo exige orçamento explícito. P10 de laboratório exige p10/p10-mongo/banco/origem restritos; identificar APOLLO_ENV/runtime reais antes de aplicar rs0. Não enfraquecer os guards aprovados para encaixar o destino.

Testes: **8 testes Node de guardas de inicialização**, **8 testes Python de auxiliares**, **18 regressões unitárias do backup anterior**, py_compile, node --check, estrutura YAML e diff --check aprovados. Total local: 63 casos (29+8+8+18), incluindo ferramentas externas simuladas onde declarado. Sem Docker local; não houve validação do merge Compose real, restore BSON, rollback, rs.initiate real ou testes financeiros nesta retomada.

## Backup de 7 KB: parecer

**NÃO APROVADO como pré-requisito de migração; ensaio de restauração desse arquivo PENDENTE.** GZIP/SHA no relato são positivos para integridade do arquivo; não há falha de restauração medida para chamá-lo de corrompido. Volume físico versus dump comprimido não determina aprovação/reprovação: dados físicos incluem estruturas/journal/índices e possivelmente outros bancos, enquanto dump seleciona dados/metadados/definições de índices. Hipótese de pouco dado/journal não foi comprovada no host.

Para decidir: executar inventário de bancos, dbStats físico/lógico, contagens exatas/índices da aplicação, usuários/roles necessários e conteúdo restaurado em destino isolado, com comparação de origem/ponto. Parar apenas Web não prova que jobs/desktop/outros clientes deixaram de escrever. O dump de um banco não prova inclusão das identidades administrativas em admin. Não executar segundo Mongo pesado na VPS; escolher host isolado para restore/rollback. Não considerar restauração histórica de outro arquivo como certificação automática deste novo dump.

## Estado final e veredito

| Item | Estado verificável |
|---|---|
| Migração rs0 | NÃO EXECUTADA; não houve janela iniciada nem rs.initiate |
| Backup | GZIP/SHA informados; NÃO APROVADO para migração até restore/consistência comprovados |
| Restauração do arquivo atualizado | NÃO EXECUTADA pelo Work / PENDENTE, sem reprovação real medida |
| Rollback | NÃO VALIDADO; hashes de configuração não bastam; impede iniciar migração |
| HTTPS | APROVADO somente para transporte/GETs da amostra pública; intermitência inicial, readiness/renovação/aceite separados |
| Segurança | Fallback .git esclarecido; fix de arquivos ocultos testado no PR, não implantado; auditoria vhost/redes/portas/permissões pendente |
| Integridade financeira | PENDENTE no destino rs0; nenhuma venda real/fictícia foi executada remotamente pelo Work |
| Produção | Nenhuma ação do Work a modificou; preservada quanto às nossas ações; saúde final não revalidada por SSH |
| Containers finais | Estado atual não observado pelo Work; último relato = produção/homologação running, standalone |
| Capacidade da VPS | NÃO COMPROVADA para migração/produção; dados de amostra e risco de swap compartilhada preservados |
| Impressão/equipamentos/humano | PENDENTES; CI não substitui teste físico |
| RPO/RTO | NÃO MEDIDOS |
| Homologação / produção | BLOQUEADAS |

Próximas ações: acesso SSH com rota disponível, fingerprint verificada e autenticação segura **ou execução assistida do preflight de leitura**; então ensaio real de backup/rollback em host separado, comparação de dados/índices/usuários e orçamento de recursos. Somente com essas evidências apresentar plano final e confirmar nova janela de até 30 min. Após migração comprovada, executar trilha fictícia reconciliada e aceite humano, mantendo produção bloqueada até aprovação expressa.

## Referências técnicas

Fontes oficiais consultadas em 17/11/2026: [conversão standalone](https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/), [keyfile](https://www.mongodb.com/docs/manual/tutorial/enforce-keyfile-access-control-in-existing-replica-set/), [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/) e [dbStats](https://www.mongodb.com/docs/manual/reference/command/dbStats/). O procedimento concreto depende do Compose/runtime reais; documentação oficial não comprova execução no destino. Nó único não oferece redundância.
