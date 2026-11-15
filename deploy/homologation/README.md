# Replica set de homologação — não aplicar em produção

Três membros reais, volumes independentes, autenticação interna por keyFile e autenticação de usuários. MongoDB não publica portas; o backend expõe apenas loopback 18081. O compose é preparação, não um deploy executado ou uma certificação Docker deste ambiente.

1. Gerar um arquivo `secrets/replica.key` base64 aleatório (64+ bytes), permissões 0400, e credenciais exclusivas em arquivo `.env` protegido, fora do Git. Definir MONGO_USER, MONGO_PASSWORD, MONGO_URL e APP_URL HTTPS. Não reutilizar credenciais de produção. Senhas da URI precisam de percent encoding.
2. Subir somente mongo1/mongo2/mongo3 nesse ambiente isolado; executar `rs.initiate` autenticado em mongo1 com `_id: "apolloHomolog"` e membros `mongo1:27017`, `mongo2:27017`, `mongo3:27017`. O bootstrap é intencionalmente manual, sem executar comandos em um servidor já existente por engano.
3. Confirmar PRIMARY + dois SECONDARY. Criar usuário de aplicação com privilégios somente no banco apollo_homologation; MONGO_URL do backend deve listar os três hosts e `replicaSet=apolloHomolog`, com authSource correto.
4. Subir o backend; verificar `/api/health/ready` por túnel/origem HTTPS confiável. Ping do contêiner Mongo é liveness; não comprova eleição, índices ou prontidão financeira. Readiness exige primary/replica set e índices únicos críticos.
5. Exercitar testes fictícios, eleição e restauração em destino novo antes de qualquer liberação. Não usar `down -v` em dados a preservar. Backups externos, TLS entre máquinas, limites de recursos e monitoramento devem ser definidos antes de produção.

Foi executado também um ensaio nativo real com três mongod, keyFile e usuários efêmeros, stepDown durante transação e reinício por SIGKILL do antigo primary: ver `backend/tools/test_replica_failover.py` e relatório P1. Isso não comprova separação de hosts, domínios de falha, partições de rede ou a execução deste compose.
