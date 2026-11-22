# P57 — Apollo PDV 3.0.1

**BLOQUEADA PARA LIBERAÇÃO OPERACIONAL.** A configuração candidata passou no laboratório Apache. A verificação da implantação pública falhou, e o acesso administrativo necessário para comprovar isolamento e rollback da VPS não estava disponível.

## Identificação

| Item | Valor |
| --- | --- |
| Repositório | `paulobhzt-tech/Apollo` |
| Origem confirmada | `audit/p56-validacao-vps-offline-operacional` — `801d972fe130b232f8cfad9c81925979eed39575` |
| Código de referência da P56 | `4a4a68e5cd874a820632ec3a827e3152ab700533` |
| Branch P57 | `audit/p57-correcao-vps-offline-liberacao` |
| SHA de código testado | `0b8945cb3c9d6f78be48f5d2f32664d446eda959` |
| Revisão da entrega | Commit documental que contém este relatório |

[Branch P57](https://github.com/paulobhzt-tech/Apollo/tree/audit/p57-correcao-vps-offline-liberacao) · [Alterações a partir da P56](https://github.com/paulobhzt-tech/Apollo/compare/801d972fe130b232f8cfad9c81925979eed39575...audit/p57-correcao-vps-offline-liberacao)

## Correções

- `7ffdfa4` configurou o Apache para servir o manifesto com MIME JSON, manter a API no proxy e limitar o fallback do SPA à navegação. Recursos ausentes continuam devolvendo erro HTTP. Adicionou laboratório em container, verificação do worker em Chromium e CI Windows virtual.
- `7ffdfa4` também tornou explícito o requisito de conexão para mutações em Mesas e Caixa. Transferência, cancelamento, recebimento de mesa e fechamento de caixa ficam bloqueados quando a perda de conexão é conhecida. A queda durante um envio pode deixar o resultado indeterminado. Nessa situação, a interface pede conferência no servidor antes de repetir a ação e não faz reenvio implícito.
- `94aeb12` cobriu um recebimento interrompido com o formulário já preenchido e a resposta Apache quando o manifesto está ausente. Ajustou o tratamento da perda de conexão durante cancelamento em grupo. Foram preservados a fila de pedidos elegíveis e o cofre persistente da P56.
- `f4aa80e` passou ao Playwright o controle do servidor de preview no Windows e usou o mesmo endereço IPv4 para iniciar, verificar e abrir o servidor. A primeira rodada falhou durante a inicialização no Windows virtual. O reteste completou os quatro cenários.

- `0b8945c` corrigiu a confirmação visual de pedido enviado para preparo. No Android emulado, o toast interceptava a opção de transferência da mesa. A mensagem permanece visível e permite toque nos controles abaixo. A aceitação GitHub em P57 mantém resultados de commits diferentes separados.

### Arquivos de código e CI

- `.github/workflows/p48-browsers.yml`
- `.github/workflows/p48-integrity.yml`
- `.github/workflows/p48-web-audit.yml`
- `.github/workflows/p57-windows-ui.yml`
- `deploy/vps/README.md`
- `deploy/vps/apache-web.conf`
- `deploy/vps/test-apache-web.py`
- `deploy/vps/test-apache-web.sh`
- `frontend/src/components/PaymentDialog.tsx`
- `frontend/src/lib/offline.test.ts`
- `frontend/src/lib/offline.ts`
- `frontend/src/pages/Caixa.tsx`
- `frontend/src/pages/Mesas.tsx`
- `tests/apache-worker.mjs`
- `tests/e2e/p43-operational-ui.spec.ts`
- `tests/p57-windows.config.ts`

## Build, segurança e implantação

| Verificação executada | Resultado |
| --- | --- |
| Linux local — `npm run lint --prefix frontend` e `npm run typecheck --prefix frontend` | Ambos passaram. Lint com 8 avisos e zero erros. |
| Linux local — `cd frontend && ./node_modules/.bin/vitest run` | 64 aprovados em 10 arquivos. |
| Linux local — `npm run build --prefix frontend` duas vezes | Mesmo SHA e mesmos 37 hashes nos dois manifestos. O CI repetiu a comparação e rejeitou arquivo alterado, extra, ausente e SHA incorreto. |
| CI Linux — `bash deploy/vps/test-apache-web.sh` e Chromium | 37 arquivos íntegros, JSON e MIME corretos, login e rotas SPA, autenticação no proxy de teste, tratamento de recursos ausentes e worker candidato ativo. Ao remover o manifesto da cópia descartável, o Apache respondeu HTTP 404. API nesta prova Apache é um servidor de teste. |
| `python deploy/vps/test_verify_public_build.py` | 5 aprovados no CI. |
| `python deploy/vps/verify-public-build.py frontend/dist/build-integrity.json` | Reprovado em CI e no terminal. O manifesto público devolveu HTTP 200 com `text/html` com o mesmo hash de `/login`. `/login` e `/sw.js` divergiram do build. O worker público ainda anuncia `apollo-public-v2`. |
| Bateria de testes CI | 253 testes de backend aprovados, 1 pulado e 3 subtestes aprovados. Também passaram 12 de backup/restauração, 12 de pagamentos/concorrência e 38 testes Vitest selecionados. |
| CI de segurança e compilação | Aprovado. Inclui 18 testes de autenticação/CSRF, 3 subtestes e 8 de pagamentos integrados. |

A consulta pública produziu os seguintes prefixos SHA-256. O artefato de integridade contém os valores completos.

| Rota | Resposta pública | Build candidato |
| --- | --- | --- |
| `/build-integrity.json` | `adbe9ff7a298`, HTML | Manifesto JSON |
| `/login` | `adbe9ff7a298` | `673f50437bc5` |
| `/sw.js` | `d992d9a3743a` | `bdacb30b04be` |
| `/manifest.webmanifest` | `391043a2a24c` | `391043a2a24c` |

Identidade pública do commit desconhecida. A configuração pública responsável pelo HTML ainda precisa ser inspecionada. A reprodução controlada comprova que a configuração versionada serve o manifesto ou retorna 404 quando ele falta. A VPS segue **NÃO VALIDADA**. Sem acesso administrativo autorizado, ficaram pendentes configuração e serviços pelo lado do servidor, TLS administrativo, MongoDB, dados, credenciais, volumes, isolamento e rollback. O trabalho público consistiu em HTTP de leitura sobre homologação. Os ensaios operacionais usam dados fictícios em executores descartáveis.

[Integridade CI e gate público](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848410) · [Artefato de build, logs e comparação pública](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848410/artifacts/14774259322) · [Bateria](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848482) · [Segurança e compilação](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848489)

## Windows e dispositivos físicos

A rodada Windows Server 2022 virtual aprovou **4/4** no Chromium com respostas de API simuladas. Cobriu login, recuperação, troca de perfil, bloqueio offline após recarregar, zoom e tamanhos de tela. O executor físico Windows 10/11, Android, iPhone, PWA instalado em dispositivo real e impressora térmica 80 mm seguem pendentes. As provas de Android e iPhone da matriz usam perfis emulados em Linux. Os testes de impressão em CI exercitam fila e contratos de software.

[Windows virtual](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848524) · [Traces, screenshots e resultados](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848524/artifacts/14774652037)

## Matriz de navegadores e offline

Execução em Linux descartável, Playwright, backend FastAPI sobre HTTPS local, MongoDB e operadores fictícios. A matriz de 30 inclui três cenários operacionais, uma navegação com rede emulada e um desligamento real do listener HTTPS em cada perfil. A coluna do cofre fica fora desses 30.

| Perfil | Mesas, caixa e fila de pedidos | Navegação com rede emulada | HTTPS desligado e navegador reaberto | Cofre real em 3 perfis de operador |
| --- | --- | --- | --- | --- |
| Chromium | 3/3 | Passou | Passou | 3/3 |
| Google Chrome | 3/3 | Passou | Passou | 3/3 |
| Microsoft Edge | 3/3 | Passou | Passou | 3/3 |
| Firefox | 3/3 | Falhou. Cabeçalho de fallback ausente. | Passou | 3/3 |
| Android emulado | 3/3 | Passou | Passou | 3/3 |
| WebKit com perfil iPhone | 3/3 | Falhou. Erro interno em `page.goto`. | Passou | 3/3 |

**28/30 na matriz e 18/18 no cofre.** Nas duas falhas, a divergência ocorreu ao desligar a rede com `BrowserContext.setOffline(true)`. No teste que parou o servidor HTTPS, recriou o processo com o mesmo perfil e navegou para `/pdv`, os seis perfis entregaram o fallback. Isso delimita as condições em que as falhas ocorrem. A causa interna nos motores de navegador continua sem comprovação. Os testes de emulação mantiveram suas asserções. Em uma rodada anterior da P57, um cenário Android não obteve controle inicial do worker e, em outra, o aviso de cozinha interceptou o toque na transferência. A rodada do código final passou em ambos.

No cofre foram exercitados a senha local inválida, a expiração, a preparação prévia, o armazenamento persistente, a reabertura do navegador, o reenvio automático e a idempotência após retorno do HTTPS. Administrador e caixa criaram rascunhos para mesa e comanda. O garçom trabalhou na mesa autorizada. Os testes também conferiram isolamento de operador, referências expiradas ou obsoletas, conflito preservado após reabrir, reenvio manual e limpeza do cofre. Nos testes de Mesas e Caixa, a emulação de queda bloqueou transferência, cancelamento, divisão, movimentação de caixa e fechamento. O pagamento de mesa já preenchido exigiu confirmação após a reconexão.

Comandos do CI em `tests/`

- `npx playwright test --config=p47.config.ts p43-operational-ui.spec.ts p47-browser.spec.ts`
- `npx playwright test --config=p47.config.ts p55-offline-tables.spec.ts --output=test-results/p55-vault --reporter=list`
- `npx playwright test --config=p47.config.ts p48-offline-interruption.spec.ts --output=test-results/p48-interruption --reporter=list`

[Matriz e logs](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848523) · [Chromium](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848523/artifacts/14774608528) · [Chrome](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848523/artifacts/14775340084) · [Edge](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848523/artifacts/14774743263) · [Firefox](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848523/artifacts/14774399311) · [Android emulado](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848523/artifacts/14774936784) · [WebKit](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848523/artifacts/14775230650)

## Aceitação operacional em ambiente descartável

A execução integrada Linux do SHA de código passou com FastAPI, MongoDB em replica set, HTTPS local e dados fictícios. As suítes abaixo podem se sobrepor à bateria de testes.

| Prova | Resultado |
| --- | --- |
| `python tools/p41-backend-groups.py` e fronteira estática | 422 testes na regressão principal e 3 subtestes. Grupos adicionais de 8, 5, 5 e 3 testes, todos aprovados. |
| Testes HTTP legados com backend em execução | 4 aprovados. |
| `pip-audit` e `npm audit --audit-level=moderate` | Os dois auditores registraram zero vulnerabilidades encontradas na execução. |
| Playwright Chromium com API simulada | 32 aprovados. |
| Playwright com backend real | 6 de API, fila e telas, 6 de turno e entrada offline, 4 de fronteira do Service Worker e 9 combinações de largura e zoom. Todos aprovados. |
| `python tools/p45-two-cashiers.py` | 10 vendas únicas, 10 repetições, 1 pedido de garçom e baixa de 11 unidades. Caixa A esperado R$ 140,00 e caixa B esperado R$ 90,00. Diferença de R$ 0,00 em ambos. Cobriu dinheiro com troco, PIX, cartão, pagamentos mistos, fiado, sangria, suprimento, restrições por operador e estornos. |
| `python tools/p45-ledger-restore.py` e bateria de restauração | Backup restaurado em MongoDB separado, com os mesmos IDs e valores dos ajustes financeiros. A bateria executou 12 testes de backup/restauração. |
| `python tools/p45-recovery.py` e `python tools/p41-persistence.py` | Processo interrompido durante transação recuperou uma venda e uma baixa, com diferença de caixa de R$ 0,00. Reinício controlado e leituras concorrentes passaram. |
| `python tools/p45-load.py` | 50 requisições financeiras produzindo 25 vendas únicas. Estoque de 73 para 48, caixa esperado R$ 125,00, diferença R$ 0,00 e zero erros financeiros. P95 financeiro de 507 ms. |
| `python tools/p46-benchmark.py` | Três pares em bases novas. P95 financeiro do candidato entre 515 e 523 ms, com 25 vendas únicas e diferença de caixa de R$ 0,00 em cada amostra candidata. |

Na carga de leitura, cada etapa durou 30 segundos.

| Sessões | Requisições | P95 | Erros |
| ---: | ---: | ---: | ---: |
| 10 | 2.751 | 17 ms | 0 |
| 30 | 6.918 | 61 ms | 0 |
| 50 | 8.758 | 124 ms | 0 |

A prova de 25 vendas e a prova dos dois caixas com garçom foram ensaios separados. A operação do garçom offline com reconexão está no ensaio do cofre. Ainda falta uma execução única com 25 vendas concorrentes, dois caixas e um garçom desconectado durante a mesma janela. Fila de cozinha e bar e recuperação de software foram exercitadas nas suítes. Permanecem abertas a produção física de duas vias e a recuperação no equipamento da loja.

[Aceitação integrada do SHA de código](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848533) · [Logs, relatórios, traces, telas e checksums](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074848533/artifacts/14775261344) · [Rodada anterior da própria P57](https://github.com/paulobhzt-tech/Apollo/actions/runs/45074376160)

## Requisitos que ainda bloqueiam a operação

- Acesso administrativo de leitura à homologação para identificar o VirtualHost ativo, a origem dos arquivos legados, o SHA instalado e o isolamento de MongoDB, credenciais, processos e armazenamento. A restauração descartável serve como evidência técnica do projeto. A reversão administrativa da VPS requer uma prova própria.
- Resolução das duas falhas de emulação registradas na matriz e reteste com as mesmas asserções.
- Validação física na Espeteria Churras Burguer com dispositivos e impressora do fluxo previsto. Inclui instalação real, desligamento do aparelho sem rede, duas vias e recuperação de impressão.
- Autorização específica para implantar em homologação depois de comprovar isolamento e rollback. O responsável precisa aprovar explicitamente o uso operacional depois da homologação.

A P57 foi desenvolvida e publicada apenas na branch de auditoria. As verificações de software usaram dados fictícios. A inspeção externa limitou-se às rotas públicas de homologação em leitura.
