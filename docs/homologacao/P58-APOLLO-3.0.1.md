# P58 — Apollo PDV 3.0.1

**BLOQUEADA PARA LIBERAÇÃO OPERACIONAL.** A consulta pública continua encontrando divergência de implantação. A auditoria administrativa da VPS e os testes físicos ainda são necessários.

## Identificação

| Item | Valor |
| --- | --- |
| Repositório | `paulobhzt-tech/Apollo` |
| Branch de origem | `audit/p57-correcao-vps-offline-liberacao` |
| SHA inicial | `5501b6720f69452b3dfc35eedf6641b9820d0485` |
| SHA de código de referência da P57 | `0b8945cb3c9d6f78be48f5d2f32664d446eda959` |
| Branch P58 | `audit/p58-vps-validacao-operacional-final` |
| SHA de código e testes P58 | `8767b28177b88684b0d49d1593f962d019bde811` |
| SHA de entrega | Commit documental deste relatório |

A origem foi conferida com `git ls-remote`, `git merge-base --is-ancestor`, o histórico da branch e o relatório P57. As evidências abaixo são de execuções da branch P58.

[Branch P58](https://github.com/paulobhzt-tech/Apollo/tree/audit/p58-vps-validacao-operacional-final) · [Comparação de commits e arquivos](https://github.com/paulobhzt-tech/Apollo/compare/5501b6720f69452b3dfc35eedf6641b9820d0485...audit/p58-vps-validacao-operacional-final)

## Código publicado

- `29b2883` acrescentou o ensaio dos dois caixas e do garçom desconectado, selecionou os workflows da P58 e endureceu a configuração Apache contra `FallbackResource` e `ErrorDocument 404` herdados. O laboratório injeta essas diretivas no nível superior e verifica que o manifesto ausente recebe 404 com corpo diferente do SPA.
- `22b39c6` bloqueou nova confirmação de recebimento após erro de transporte ou retorno de gateway que deixe o resultado incerto. Mesas consulta a comanda no servidor. Caixa consulta o turno e o histórico. O recebimento integral do Web envia o ID esperado da comanda, que o backend verifica dentro da transação. O recebimento parcial mantém o identificador original de reenvio.
- `d11f746` acrescentou evidências de navegação pelo worker à matriz e uma regressão que tenta receber com o ID de uma comanda obsoleta.

- `11d9e5f` isolou o ensaio em um banco fictício exclusivo. A primeira rodada detectou uma colisão com uma mesa criada por outra suíte.
- `8767b28` verificou o conflito após uma segunda reabertura do navegador com HTTPS desligado. Na rodada anterior, uma reabertura com HTTPS disponível recebeu HTTP 401 na consulta ao perfil. O cofre continuou exigindo autenticação conforme a política vigente.

### Arquivos de implementação e testes

- `.github/workflows/p48-browsers.yml`
- `.github/workflows/p48-integrity.yml`
- `.github/workflows/p48-web-audit.yml`
- `.github/workflows/p57-windows-ui.yml`
- `backend/models/schemas.py`
- `backend/routers/tables.py`
- `deploy/vps/apache-web.conf`
- `deploy/vps/test-apache-web.sh`
- `frontend/src/components/PaymentDialog.tsx`
- `frontend/src/lib/offline.ts`
- `frontend/src/pages/Caixa.tsx`
- `frontend/src/pages/Mesas.tsx`
- `tests/e2e/p43-operational-ui.spec.ts`
- `tests/e2e/p47-browser.spec.ts`
- `tests/e2e/p58-integrated-shift.spec.ts`

## VPS e integridade

Em consulta de leitura, o manifesto público respondeu HTTP 200 com `text/html`, com o mesmo SHA-256 de `/login`. Os hashes de `/login` e `/sw.js` divergem do pacote candidato. O worker anunciado continua `apollo-public-v2`. O SHA instalado é desconhecido.

No laboratório Apache 2.4, o build passou na verificação dos 37 arquivos, MIME JSON para o manifesto, proxy da API, rotas de login, cache do worker ativo e 404 de arquivo ausente. A API usada nessa prova Apache é uma fixture. O teste de aceitação separado usa FastAPI e MongoDB descartáveis. O verificador público foi executado por `python deploy/vps/verify-public-build.py frontend/dist/build-integrity.json`.

**VPS NÃO VALIDADA.** O acesso administrativo autorizado não estava disponível. VirtualHost, DocumentRoot efetivo, regras ativas, SHA instalado, segregação de credenciais, banco e volumes, backup e rollback administrativos dependem dessa auditoria. A causa da configuração efetiva da hospedagem continua em aberto. A P58 fez somente requisições públicas de leitura à homologação. Produção, bancos reais e vendas reais permaneceram intocados.

[Integridade do pacote e gate público](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092173) · [Artefato com manifesto, hashes e logs](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092173/artifacts/14775908268)

## Ensaio integrado em banco exclusivo

O Chromium executou `p58-integrated-shift.spec.ts` com FastAPI HTTPS, MongoDB replica set, dois clientes de caixa autenticados separadamente e um perfil persistente para o garçom. O listener HTTPS do garçom estava desligado durante as vendas. Um proxy descartável descartou a primeira resposta HTTP 200 após o backend processar o pedido. O cliente reconectou e recuperou o recibo pela mesma referência.

| Conferência | Resultado |
| --- | --- |
| Vendas de caixa | 50 requisições, 25 vendas únicas e 25 reenvios conciliados, com operador, turno, horário e auditoria conferidos |
| Caixa 1 | 13 vendas. R$ 78,00 em dinheiro e R$ 52,00 em PIX. Diferença R$ 0,00 |
| Caixa 2 | 12 vendas. R$ 72,00 em dinheiro e R$ 48,00 em PIX. Diferença R$ 0,00 |
| Garçom | Dois pedidos no cofre após reinício offline. Um sincronizado automaticamente apesar da resposta perdida e um preservado como conflito 409 após nova reabertura offline |
| Estoque compartilhado | De 100 para 75 após as vendas e para 74 após o pedido elegível do garçom |
| Pagamentos de mesa do garçom | Zero no pedido sincronizado. A venda de caixa continua contabilizada separadamente |

O teste Chromium também interrompeu a resposta no diálogo de pagamento. A confirmação permaneceu desativada até a consulta ao servidor. Um POST com ID de comanda obsoleto recebeu HTTP 409. A interface conseguiu concluir um novo recebimento após a conferência.

[Job Chromium e resultado do ensaio integrado](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092077/job/137379764187) · [Artefato Chromium, incluindo os logs do cenário](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092077/artifacts/14776431226)

## Web/PWA e navegadores

| Perfil | Fluxos operacionais | Navegação em emulação de rede | HTTPS desligado e navegador reaberto | Cofre |
| --- | ---: | --- | --- | ---: |
| Chromium | 3/3 | Passou | Passou | 3/3 |
| Chrome | 3/3 | Passou | Passou | 3/3 |
| Edge | 3/3 | Passou | Passou | 3/3 |
| Firefox | 3/3 | Falhou | Passou | 3/3 |
| Android emulado | 3/3 | Passou | Passou | 3/3 |
| WebKit com perfil iPhone | 3/3 | Falhou | Passou | 3/3 |

**28/30 na matriz**, dos quais 6/6 no desligamento real do servidor. O cofre aprovou 18/18 testes adicionais. O Firefox emulado registrou `navigator.onLine=false`, falha na chamada direta à API e navegação HTTP 200 tratada pelo worker sem o cabeçalho de fallback. Os logs do backend confirmaram navegações chegando ao HTTPS local ainda ativo. No WebKit emulado, a chamada direta à API falhou e `page.goto` devolveu erro interno. Os dois motores recuperaram a rota em um processo novo com o listener efetivamente desligado. A causa interna da emulação do WebKit permanece aberta e as asserções da matriz foram mantidas.

[Matriz e logs](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092077) · [Firefox](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092077/artifacts/14776750043) · [WebKit](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092077/artifacts/14776027003) · [Android emulado](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092077/artifacts/14776610465)

## Windows, dispositivos e impressão

O CI executou quatro cenários Chromium em Windows Server 2022 virtual, com API simulada. Linux usou perfis de desktop e móveis. Os testes de software cobriram filas de cozinha/bar e recuperação. A impressão física em 80 mm, duas vias, reimpressão em equipamento real, PWA instalado, Windows 10/11, Android e iPhone físicos seguem pendentes. O Docker local não iniciou o segundo replica set devido à falta de espaço. O cenário integrado aprovado acima foi executado no GitHub Actions.

[Windows virtual](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092125) · [Artefato Windows](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092125/artifacts/14775549699)

## Regressão, segurança, backup e desempenho

A aceitação integrada Linux concluiu com sucesso no SHA de código da P58. Usou MongoDB descartável, operadores fictícios e FastAPI em HTTPS local.

| Comando ou suíte | Resultado P58 |
| --- | --- |
| `python tools/p41-backend-groups.py` e fronteira estática | 422 testes na regressão principal, 3 subtestes e quatro grupos adicionais de 8, 5, 5 e 3 testes aprovados |
| HTTP legado com backend real | 4 aprovados |
| `vitest run`, lint, TypeScript e build | 64 testes aprovados em 10 arquivos. Lint e typecheck concluídos. CI produziu dois manifestos idênticos de 37 arquivos |
| Bateria e segurança | Jobs aprovados. Bateria com 253 testes de backend aprovados, 1 pulado e 3 subtestes. Também passaram os jobs de autenticação, CSRF e pagamentos parciais |
| `pip-audit` e `npm audit` | Os dois auditores concluíram com zero vulnerabilidades identificadas na execução |
| Playwright Linux | 32 testes de interface com API simulada. API real, fila e telas 6/6. Fluxos de operação e offline 6/6. Fronteira do worker 4/4. Larguras e zoom 9/9 |
| `python tools/p45-ledger-restore.py` | Backup restaurado em banco separado. Dois ajustes de estorno preservaram identificadores e valores |
| `python tools/p45-recovery.py` e `python tools/p41-persistence.py` | Interrupção durante transação, rollback, retorno, venda idempotente e reinício controlado aprovados em ambiente descartável |
| `python tools/p45-load.py` | Carga financeira separada do ensaio P58. 50 requisições, 25 vendas, estoque de 73 para 48, diferença de caixa de R$ 0,00, P95 de 528 ms |
| `python tools/p46-benchmark.py` | Três pares em bases novas. P95 do candidato de 518 a 551 ms, 25 vendas únicas por amostra e diferença de caixa de R$ 0,00 |

Carga de leitura, 30 segundos em cada faixa.

| Sessões | Requisições | P95 | Erros |
| ---: | ---: | ---: | ---: |
| 10 | 2.725 | 19 ms | 0 |
| 30 | 6.807 | 74 ms | 0 |
| 50 | 8.734 | 129 ms | 0 |

[Aceitação integrada](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092109) · [Artefato operacional, dados de carga e logs](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092109/artifacts/14776960302) · [Bateria](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092136) · [Segurança](https://github.com/paulobhzt-tech/Apollo/actions/runs/45078092121)

## Pendências para liberação

- Auditar a VPS em leitura administrativa, comprovar o isolamento e validar backup e rollback da homologação. Obter autorização específica de implantação e, depois de publicar em homologação, repetir a comparação de manifesto, hashes, SHA e Service Worker ativo.
- Resolver as duas falhas de emulação remanescentes e reexecutar a matriz. A desconexão real do laboratório está aprovada.
- Realizar as provas físicas com impressora e dispositivos da loja, incluindo recuperação de impressão e reinício de PWA instalada.
- Obter autorização explícita do responsável pela loja após a comprovação dos requisitos críticos. A P58 segue bloqueada.
