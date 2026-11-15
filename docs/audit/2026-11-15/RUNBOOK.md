# Guias de arquitetura, desenvolvimento e operação

Documento baseado no código, não em exercício operacional de produção. O parecer em REPORT.md prevalece.

## Arquitetura e módulos

- `frontend/`: React 19.2.8, TypeScript 7.0.2, Vite 8.1.5, React Query e Tailwind. Páginas por domínio em `src/pages`; sessão em cookie HTTP-only; API relativa `/api`; persistência offline em `src/lib/offline.ts` e ponte `desktop.ts`.
- `backend/server.py`: FastAPI 0.141.1, middlewares CORS e origem/CSRF, registro dos routers e ciclo de vida. Pode servir SPA local opcionalmente. Inicializa defaults e índices; encerra cliente Motor no shutdown normal. Falhas durante startup/shutdown precisam de ensaio real.
- `backend/routers`: auth/funcionários; catálogo/estoque; mesas; vendas/caixa/notas; relatórios; cardápio/delivery público; fiado; configuração/backup; produção/KDS; Drive e sistema. Mapa de 160 endpoints em ENDPOINTS.md, além das rotas raiz/demo de server.py.
- `backend/lib/orders.py`: cálculos e orquestração de estoque, lotes, pagamento, fiado, tickets e nota simulada; concentra responsabilidades críticas. `auth.py`: sessões e autorização; `db.py`: cliente e índices; `csrf.py`: proteção de origem.
- `backend/models/schemas.py`: modelos Pydantic compartilhados pelas rotas. Interfaces TypeScript são mantidas manualmente e podem divergir; typecheck não garante contrato entre linguagens.
- `desktop/`: Electron, preload isolado, `contextIsolation`, sandbox e Node desativado no renderer. Armazenamento usa safeStorage quando disponível, com fallback sem criptografia; validar política do sistema de destino.
- `management/`: provisionamento multi-instância, licenças, backups por tenant e painel comercial; suíte própria usa diretórios temporários/comandos simulados.
- `deploy/`, `local-server/`: infraestrutura Caddy/Mongo/aplicação, scripts Windows e certificados. Não foram implantados.

## Banco e transações

Motor 3.7.1/PyMongo 4.18.2, banco selecionado por DB_NAME. Índices únicos existentes incluem IDs, client_ref e um caixa aberto. Conferir `backend/lib/db.py`; a tentativa de criação em background com erros capturados não garante readiness.

Coleções centrais: employees/sessions/login_attempts; products/categories/ingredients/purchases/lot_consumptions/stock_moves; tables/orders/kitchen_tickets; invoices/cash_sessions; fiado_customers/customer_moves; bills/account_categories/payment_methods/expenses; settings/counters/environments e backups. Inventário não implica validação de dados.

Pagamento parcial de mesa usa `start_session` e `start_transaction`, com writes explícitos na sessão, e falha fechado sem suporte transacional. Vendas integrais, cancelamentos, fiado e estoque têm writes separados e riscos documentados. Não anunciar atomicidade geral ou rollback garantido.

Notas fiscais em `emit_invoice` são **simulações**, sem transmissão SEFAZ. Não emitir parecer fiscal ou usar a chave gerada como documento fiscal profissional.

## Configuração e instalação de homologação

Consultar README.md, deploy/vps/README.md e local-server/README.md para procedimentos já existentes; eles precisam ser validados no destino. Não copiar configurações ou bancos de produção para estes testes.

1. Usar máquina/containers descartáveis, Python compatível com o CI (3.11), Node 22, gerenciador do lock existente e MongoDB **replica set** com banco fictício exclusivo.
2. Instalar requirements do backend conforme workflow do repositório; existe dependência Emergent em índice adicional. Frontend tem yarn.lock. Não regenerar manifests/locks sem necessidade.
3. Definir MONGO_URL, DB_NAME, APP_URL, COOKIE_SECURE, CORS_ORIGINS e segredos exigidos pelo ambiente. Nomes adicionais constam em INVENTORY.json; valores não foram exportados. Usar credenciais fictícias.
4. Mesmo em homologação, usar origem coerente e HTTPS quando validar cookies Secure. Não desabilitar guards para obter melhor benchmark. Compose atual não configura replica set; precisa ser adaptado e validado antes das integrações.
5. Iniciar backend apenas apontado ao banco de testes: `python -m uvicorn server:app --host 127.0.0.1 --port 8001`, a partir de backend. Frontend: scripts dev/build existentes. O comando não foi usado com o banco real nesta auditoria.

## Testes reproduzíveis

A partir de backend, com MONGO_URL e DB_NAME exclusivos para testes:

```bash
python -m pytest -q -n 0 \
  --ignore=tests/test_partial_payment_integration.py \
  --ignore=tests/test_tscheck_autoteste.py \
  --ignore=tests/test_tscheck_delivery_simulate.py \
  --ignore=tests/test_tscheck_nfce_invoice.py
python tools/audit_financial_reproduction.py
python tools/audit_auth_load.py --output /tmp/apollo-auth-load.json
```

O primeiro comando executa somente a suíte isolada e declara as integrações excluídas; não substitui suíte completa. O segundo confirma defeitos P0, sem tocar banco. O terceiro usa banco simulado e HTTP real em loopback; mede apenas autenticação. A porta padrão é 28191 e pode ser alterada com `--port`.

Com infraestrutura descartável ativa, rodar separadamente as seis integrações excluídas e depois toda a suíte. Rever fixtures: não apontar os testes para dados reais. As integrações existentes fazem escritas e limpezas de registros de cenário.

A partir da raiz:

```bash
node --experimental-vm-modules --test frontend/tests/offline-queue.test.mjs
python -m pytest -q management
python -m compileall -q backend
node --check desktop/main.js
node --check desktop/preload.js
node --check desktop/scripts/build-web.js
git diff --check
```

Em frontend: `npm run typecheck`, `npm run build`, `npm run lint`. O teste Node usa stripTypeScriptTypes disponível nas versões recentes de Node 22 e Node 24; flags experimentais geram avisos. Não afirma teste do Electron/Windows.

## Offline e diagnóstico

Suporte observado: fila de vendas de balcão, menu em cache e reenvio ao endpoint client_ref. Não há evidência de offline completo para autenticação, caixa, mesas, emissão fiscal, fiado ou operações administrativas.

Ao investigar divergência, preservar referência client_ref, ID/número do pedido, horário, caixa, movimentos de estoque/lotes e estado da fila. Não reenviar com novo client_ref antes de reconciliar a operação original: isso pode gerar uma segunda venda. Não limpar localStorage/kv ou rejeitados para “resolver” erro. A correção entregue preserva entradas novas na mesma instância; não garante atomicidade entre janelas nem resiliência a corrupção do armazenamento.

Para lentidão, correlacionar logs HTTP, fila de threads, bcrypt, tempo de banco e conexões. O benchmark demonstrou bloqueio por bcrypt, mas não diagnosticou a falha histórica ausente. Para transações, verificar topologia replica set, conexão do driver e índices antes de atribuir culpa a keep-alive. Não aumentar pools ou timeouts sem medir.

## Backup, recuperação e restauração

O export JSON atualmente não cobre todas as coleções; não usá-lo como único backup de negócio. O script `deploy/vps/backup-mongo.sh` gera archive gzip via mongodump e remove cópias antigas conforme retenção; apenas inspecionado, não executado. Requer destino protegido e cópia fora do servidor. Verificação de arquivo/gzip não prova restauração funcional.

Uma restauração operacional deve ocorrer primeiro em **destino novo e isolado**, com aprovação e cópia preservada do estado original. Verificar versão/schema, índices, contagens por coleção, totais por caixa/pedido/pagamento, saldos de fiado, ingredientes/lotes e trilhas de auditoria. Validar contas existentes e inatividade das contas sem credenciais locais. Fazer exercício de reinício, reconexão e replay antes de qualquer uso real.

O endpoint JSON de restauração substitui coleções em sequência, sem transação global; interrupção pode deixar estado parcial. Não foi executado contra banco. A correção de credenciais foi verificada apenas com substitutos de persistência. Backup/restore completo permanece bloqueado/reprovado conforme REPORT.md.

## Rollback e operação

Os commits são pequenos e podem ser revertidos em branch separada, com `git revert <commit>`, seguido de regressão e revisão. Isso reverte código, não desfaz dados; reverter a proteção do backup reintroduz exposição de hashes, e reverter a fila reintroduz perda de vendas. Não executar reversão automática em produção.

Antes de liberar: concluir requisitos 296–310, eliminar P0, homologar restauração em destino novo, definir alertas/readiness e responsáveis por conciliação e recuperação. Esta auditoria não autoriza nem executa deploy.
