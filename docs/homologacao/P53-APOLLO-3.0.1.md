# Apollo PDV 3.0.1 — execução P53

**Decisão — P53 BLOQUEADA PARA LIBERAÇÃO OPERACIONAL**

Execução de 22 de novembro de 2026. Branch `audit/p53-correcao-offline-vps-homologacao`, criada a partir de `audit/p52-pwa-offline-integral-vps-validacao` no SHA `eeb781801d247bfb8582b91b75b9feb20dc73396`. O SHA de código avaliado é `0bbb1e8e123e3462fae0611d9f1b914ad26d804c`.

Os ensaios com escrita usaram MongoDB 7 em contêiner descartável, contas fictícias, bancos distintos para concorrência e restauração, e HTTPS restrito ao loopback. Em GitHub Actions, cada perfil da matriz recebeu sua própria instância MongoDB. A VPS recebeu somente GETs públicos. A execução ocorreu sem merge, deploy, migração ou acesso a dados de produção.

## Alterações

- O build gera uma lista de arquivos públicos com hash SHA-256 para o Service Worker. O worker instala o cache da versão somente após verificar os arquivos, tenta a rede nas navegações e, em falha de transporte, timeout ou resposta 502/503/504, usa a interface estática para `/`, `/login`, `/pdv`, `/mesas` e `/comanda-mobile`. O conteúdo de API, sessões e registros comerciais fica fora do CacheStorage.
- Itens de uma mesa com atendimento já aberto têm a intenção de reenvio gravada no IndexedDB antes do POST, junto ao identificador e ao corpo do envio. Falhas transitórias deixam o registro pronto para o sincronizador global. Conflitos que exigem revisão preservam a submissão, com reenvio automático pausado. A API continua a validar operador, contexto e referência.
- A matriz diferencia emulação de rede, resposta HTTP 503 e desligamento real do HTTPS. O teste de desligamento fecha o navegador e reabre o mesmo perfil com o listener já encerrado. A resposta de fallback tem cabeçalho próprio para distinguir a origem de uma resposta 200.
- O teste integrado usa um garçom autenticado no navegador e dois caixas em sessões HTTP independentes. O garçom salva um pedido com a rede emulada como indisponível enquanto os caixas executam 25 vendas simultâneas com pagamentos mistos e 25 reenvios.

## Matriz e testes operacionais

A [linha de base P52](https://github.com/paulobhzt-tech/Apollo/actions/runs/45031162794) apresentou falha na emulação Firefox e WebKit. Na [primeira execução P53](https://github.com/paulobhzt-tech/Apollo/actions/runs/45035996173), quatro perfis passaram 5/5 cada e Firefox e WebKit passaram 4/5 cada. Os seis passaram no desligamento real com reabertura sobre o perfil persistente. Na emulação, o [Firefox](https://github.com/paulobhzt-tech/Apollo/actions/runs/45035996173/job/137249758458) devolveu uma página sem o marcador de fallback e o [WebKit](https://github.com/paulobhzt-tech/Apollo/actions/runs/45035996173/job/137249758466) encerrou a navegação com erro interno. No reteste local em Firefox, o trace registrou `navigator.onLine=false`, HTTP 200 e ausência de `x-apollo-offline-fallback`. A asserção estrita da emulação continua ativa.

A matriz do SHA de código final confirmou **28/30 cenários**, com **6/6 perfis aprovados no desligamento real**. O ensaio de 25 vendas com o garçom offline passou nos seis perfis. Os dois resultados de emulação que falharam foram preservados. Android e iPhone são perfis emulados em Linux. [Execução final](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902574)

| Perfil | Cenários aprovados | Artefato |
| --- | ---: | --- |
| Chromium | 5/5 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902574/artifacts/14759144219) |
| Google Chrome | 5/5 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902574/artifacts/14759844281) |
| Microsoft Edge | 5/5 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902574/artifacts/14760465428) |
| Firefox | 4/5 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902574/artifacts/14760207174) |
| Android emulado | 5/5 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902574/artifacts/14759812774) |
| WebKit com perfil iPhone | 4/5 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902574/artifacts/14759518506) |

No Chromium local, o teste integrado obteve 25 IDs de venda distintos, 25 reenvios devolvendo os mesmos IDs e diferença de **R$ 0,00 nos dois caixas**. Durante as vendas o garçom permaneceu offline, com zero POSTs de itens. A ficha técnica das porções consumiu 0,4 kg por venda, o que levou o saldo de 100 kg a 90 kg. O saldo do ingrediente do espetinho passou de 98 para 97 após a perda de resposta e o reenvio pela mesma referência. O pedido offline sincronizou após reautenticação fora de `/mesas`, levando esse saldo a 96, com o saldo das porções preservado. O ensaio verifica um efeito por operação, ainda que o transporte tente o mesmo POST mais de uma vez.

O ensaio financeiro adicional em loopback executou 57 requisições medidas sem erro inesperado. Foram verificados pagamentos mistos, cartão, sangria, suprimento, fiado, estornos, concorrência entre venda e fechamento e reconciliação de ambos os caixas com diferença zero. O backup desse ensaio foi restaurado em outro banco novo. A restauração repetida preservou os dois ajustes de estorno com os mesmos IDs e valores, sem duplicação. Também passaram o reinício real do contêiner e do backend com hashes das coleções comerciais preservados, e o rollback de processo para a referência `28ea95ce50863c7c3ce8368b91e8d98a6a5b99ec` com retorno à P53. A venda de teste feita na referência reapareceu na P53 com o mesmo ID e baixa única. O rollback de instalação na VPS permanece pendente.

## Verificações automatizadas

| Comando ou execução | Ambiente e resultado |
| --- | --- |
| `git fsck --full` e `git diff --check` | Clone P53, sem erro |
| `npm run build` e `EXPECTED_COMMIT=$(git rev-parse HEAD) node scripts/verify-build.mjs` | Node 24 local, 37 arquivos verificados no SHA de código final |
| `npm run lint`, `npm run typecheck` e `./node_modules/.bin/vitest run` | 57 testes passaram, typecheck passou e lint terminou com avisos |
| `playwright test p44-layout.spec.ts`, com URL de loopback ajustada na cópia local | Chromium local. 9/9 combinações de 1440, 1024 e 390 px com zoom de 100%, 125% e 150%, sem overflow horizontal nas seis telas do ensaio |
| `playwright test p44-pwa.spec.ts`, com URL de loopback ajustada na cópia local | Chromium local, 2/2. Interface pública disponível após cache, API privada fora do cache e primeiro acesso sem rede bloqueado |
| Ensaio negativo de integridade do Service Worker | Chromium e HTTPS local com `/index.html` alterado. O worker rejeitou o arquivo, ficou inativo e o cache ficou sem registros |
| `Page.getInstallabilityErrors` via CDP | Chromium local, lista vazia de erros após ativação do Service Worker |
| `npm audit --audit-level=moderate --json` | Registry npm, zero vulnerabilidades informadas |
| `python -m pytest -n 0 -q`, grupo de réplica em modo compartilhado | MongoDB local, 420 passaram e 2 ficaram como skip. Os grupos transacional, standalone, restauração e HTTP legado são executados separadamente no CI |
| `python -m pytest -n 0 -q tests/test_partial_payment_integration.py` | Réplica local, 8 passaram. Inclui divisão de pagamentos, recomposição, concorrência, rollback transacional e proteção de saldo |
| `playwright test --config=p47.config.ts p43-operational-ui.spec.ts -g 'table items recover'` | Chromium em Linux com HTTPS descartável e MongoDB em réplica, aprovado no SHA de código final. A matriz local Chromium completa passou 5/5 |
| `python tools/p45-load.py` | Cópia local com porta de loopback ajustada. 10, 30 e 50 sessões por 30 s cada, sem erro HTTP. Onda de 50 requisições financeiras, 25 vendas, saldo 90 → 65 e diferença de R$ 0,00 |
| `python tools/p41-persistence.py` | Cópia local com portas e contêiner descartáveis, aprovada. 200 leituras concorrentes, reinício, hashes e rollback de processo |
| `python tools/p45-two-cashiers.py` e `python tools/p45-ledger-restore.py` | Cópias de execução ajustadas para o listener local alternativo e diretório local de evidências, aprovadas |
| [Integridade e comparação pública](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902953) | Aprovada. Builds repetidos, hashes e ensaios negativos de integridade no [artefato](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902953/artifacts/14759982205) |
| [Aceitação Web/PWA](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902570), [regressões](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902526) e [segurança/build](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902507) | As três execuções passaram. Etapas, logs, screenshots e traces da aceitação ampliada no [artefato](https://github.com/paulobhzt-tech/Apollo/actions/runs/45036902570/artifacts/14760104253) |

O grupo de réplica local exclui `test_partial_payment_integration.py`, `test_catalog_standalone.py`, `test_restore_disposable_integration.py`, `test_tscheck_autoteste.py`, `test_tscheck_delivery_simulate.py` e `test_tscheck_nfce_invoice.py`. O primeiro disparo local, com modo operador aplicado a toda a suíte e sem separar o alvo dos testes HTTP, não constituiu uma execução válida da suíte agrupada.

## VPS e critérios pendentes

**VPS NÃO VALIDADA.** O GET público em `/login` devolveu 200 com TLS aceito pelo cliente. O `/sw.js` público continua anunciando `apollo-public-v2`, com SHA-256 `d992d9a3743a9504338d874da69b112935c693ce1029757bb4029bd94b097737`, diferente do build P53. O manifesto Web público coincidiu com o build local, e os arquivos JS e CSS referenciados pelo login público divergiram. `/build-integrity.json` devolveu HTTP 200 com HTML, sem manifesto de integridade verificável. Sem acesso administrativo, permanecem pendentes a verificação do commit instalado, Apache, processos, serviços, configuração, logs, MongoDB, credenciais, volumes, filas, isolamento de produção e rollback da VPS.

- O cold start offline da interface foi exercitado, mas a operação autenticada após reinício sem rede segue pendente. A interface exige validação de sessão. Criação offline de novas mesas e comandas, autorização local com validade e revogação, e operação completa offline continuam como bloqueios. A fila de itens de mesa usa IndexedDB e a fila de vendas de balcão no navegador ainda usa localStorage.
- As falhas em Firefox e WebKit na emulação de rede impedem 30/30. O comportamento em uma interrupção real do servidor foi ensaiado à parte.
- Os cinco testes de impressão em simulador passaram, incluindo duas vias, formato 80 mm, separação por estação e tratamento de falhas. Impressão térmica física de 80 mm, cozinha e bar com equipamento real, Windows 10/11, instalação física do PWA, iPhone e Android reais continuam pendentes.
- Os resultados de estoque e caixa demonstram consistência nos cenários executados com dados fictícios. A aceitação integral de estoque, impressão e operação em dispositivos reais permanece pendente.

## Arquivos alterados

- `.github/workflows/p48-browsers.yml`
- `.github/workflows/p48-integrity.yml`
- `.github/workflows/p48-web-audit.yml`
- `backend/tests/test_pwa_static.py`
- `frontend/public/sw.js`
- `frontend/scripts/build-integrity.mjs`
- `frontend/src/main.tsx`
- `frontend/src/pages/Mesas.tsx`
- `tests/e2e/p43-operational-ui.spec.ts`
- `tests/e2e/p44-pwa.spec.ts`
- `tests/e2e/p47-browser.spec.ts`
- `tests/e2e/p48-offline-interruption.spec.ts`
- `tests/p47.config.ts`
- `docs/homologacao/P53-APOLLO-3.0.1.md`
