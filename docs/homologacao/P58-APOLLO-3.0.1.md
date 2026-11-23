# P58 — Apollo PDV 3.0.1

**BLOQUEADA PARA LIBERAÇÃO OPERACIONAL.** O laboratório validou a configuração candidata. A implantação pública de homologação continua divergente e a auditoria administrativa está pendente.

## Rastreabilidade

| Item | Identidade |
| --- | --- |
| Repositório | `paulobhzt-tech/Apollo` |
| Branch de origem | `audit/p57-correcao-vps-offline-liberacao` |
| SHA inicial confirmado após fetch | `5501b6720f69452b3dfc35eedf6641b9820d0485` |
| Branch P58 desta execução | `audit/p58-correcao-definitiva-vps-pwa-homologacao` |
| SHA de código | `65ca1e25b73536770db45d0d88e724ffda8284bc` |
| SHA da entrega | Commit que contém este relatório |

O checkout descartável em memória partiu do SHA obrigatório. O sandbox local original estava sem espaço e continha alterações locais em outra branch. A cópia preservou esse checkout. Os commits reaproveitados da outra P58 têm novas execuções nesta branch.

## Correções e commits

- `4b99964` protegeu o Apache de regras de fallback e documento de erro herdadas e introduziu o ensaio de concorrência com o garçom offline.
- `9fcb262` exigiu consulta ao servidor após recebimento indeterminado. O backend passou a rejeitar recebimento do Web destinado a uma comanda obsoleta.
- `4508e5a` registrou a atuação do worker na emulação e cobriu o recebimento com comanda obsoleta.
- `1833b4b` isolou os dados fictícios do ensaio integrado. `be44963` acrescentou nova reabertura offline após um conflito.
- `c3a7f15` ligou os workflows à branch solicitada.
- `26f0bdb` comparou o pacote de implantação com uma cópia confiável do manifesto do CI. Acrescentou teste negativo com arquivo alterado e hash recalculado.
- `03a3db8` adicionou atualização do worker com fila pendente, reconciliação de 20 espetinhos e estorno por lote. `65ca1e2` ampliou a prova para perfil móvel e filas de cozinha e bar.

### Arquivos de código e testes

- `.github/workflows/p48-browsers.yml`
- `.github/workflows/p48-integrity.yml`
- `.github/workflows/p48-web-audit.yml`
- `.github/workflows/p57-windows-ui.yml`
- `backend/models/schemas.py`
- `backend/routers/tables.py`
- `deploy/vps/README.md`
- `deploy/vps/apache-web.conf`
- `deploy/vps/test-apache-web.sh`
- `frontend/scripts/verify-build.mjs`
- `frontend/src/components/PaymentDialog.tsx`
- `frontend/src/lib/offline.ts`
- `frontend/src/pages/Caixa.tsx`
- `frontend/src/pages/Mesas.tsx`
- `tests/e2e/p43-operational-ui.spec.ts`
- `tests/e2e/p47-browser.spec.ts`
- `tests/e2e/p58-integrated-shift.spec.ts`

## VPS e integridade pública

A consulta pública em 23 de novembro de 2026 devolveu HTTP 200 com `text/html; charset=utf-8` para `/build-integrity.json`. Seu SHA-256, `adbe9ff7a298ff6e0f469c6b675b8f7d6a8897ebbdf520ee7be190cb12b1bf4b`, foi igual ao de `/login`. O worker público ainda anuncia `apollo-public-v2`. A publicação candidata exige manifesto JSON, SHA esperado e correspondência dos hashes. A configuração Apache candidata preserva a rota de API, restringe o fallback e devolve HTTP 404 para manifesto ausente.

O teste local de rollback trocou um apontamento atômico entre dois pacotes fictícios e voltou ao primeiro. A verificação com manifesto externo aprovou cada identidade correta e rejeitou o pacote errado após a reversão. O procedimento correspondente está em `deploy/vps/README.md`. O teste local exercitou a troca do diretório. A prova Apache no CI testou a entrega HTTP separadamente.

**VPS NÃO VALIDADA.** O acesso administrativo autorizado não estava disponível. VirtualHost e DocumentRoot ativos, SHA instalado, serviços, bancos, usuários, credenciais, volumes, filas, backups e o rollback efetivo dependem da inspeção administrativa e da prova em homologação. Nenhuma alteração foi feita na VPS.

[Integridade e comparação pública](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974203) · [Manifestos, hashes e logs Apache](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974203/artifacts/14818410543)

Duas execuções de `npm run build` em árvores de saída separadas produziram o mesmo manifesto de 37 arquivos. A verificação de pacote rejeitou arquivos adulterados, extras e ausentes, SHA divergente e manifesto recalculado para um arquivo alterado. O verificador público teve 5 testes unitários aprovados, incluindo MIME incorreto. O job de integridade concluiu com falha na comparação somente leitura com a VPS. Os passos locais e Apache desse mesmo job passaram.

## Ensaio integrado com caixa, garçom, estoque e impressão

O Playwright rodou em Linux com dois clientes autenticados independentemente, perfil Chromium móvel Pixel 5 emulado para o garçom, FastAPI HTTPS e MongoDB replica set com dados fictícios exclusivos deste ensaio.

| Prova | Resultado |
| --- | --- |
| Vendas concorrentes | 50 requisições para 25 referências, exatamente 25 vendas. Conferidos sessão, operador, horário, auditoria e pagamentos |
| Caixa A | 13 vendas. R$ 78,00 em dinheiro e R$ 52,00 em PIX. Diferença R$ 0,00 |
| Caixa B | 12 vendas. R$ 72,00 em dinheiro e R$ 48,00 em PIX. Diferença R$ 0,00 |
| PWA offline | Dois rascunhos persistiram após reinício. A atualização controlada trocou a versão do worker e removeu o cache antigo mantendo o cofre. A fixture manteve os arquivos estáticos da mesma compilação e exercitou a troca de código do worker e de cache |
| Reconexão | Um pedido sincronizado após descarte da primeira resposta HTTP 200. O outro ficou em revisão HTTP 409 e persistiu após nova reabertura offline |
| Estoque | Espetinho de 100 para 74, sendo 25 baixas das vendas e uma do garçom. Bebida de 100 para 99 |
| Cozinha e bar | O pedido reapareceu nas duas filas, com um item de cada setor conferido |
| Lote e estorno | Num turno adicional, 20 espetinhos consumiram 20 unidades do insumo e do lote, com CMV de R$ 80,00. O estorno recompôs o lote de 54 para 74 e o turno fechou com R$ 0,00 de diferença |
| Resposta incerta no pagamento da mesa | A perda de conexão foi injetada no navegador. O botão permaneceu bloqueado até consultar o servidor. A API devolveu 409 para um ID de comanda obsoleto |

O teste de impressão foi de contrato da fila. Impressora térmica real de 80 mm, duas vias e recuperação física permanecem **pendentes**. O ensaio reiniciou o navegador do garçom. A interrupção de processo e a recuperação do backend são verificações separadas da aceitação integrada.

[Job Chromium com o ensaio integrado](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974113/job/137686925930) · [Logs, traces e capturas do Chromium](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974113/artifacts/14816889742)

## Qualidade, segurança e desempenho

| Suíte | Resultado |
| --- | --- |
| Backend com replica set descartável | 422 testes e 3 subtestes aprovados na regressão principal. Grupos complementares de 8, 5, 5 e 3 testes, todos aprovados |
| HTTP legado com FastAPI em execução | 4 aprovados |
| Bateria complementar | 253 testes e 3 subtestes aprovados, 1 ignorado. Contagens de suítes podem se sobrepor |
| Frontend | 64 testes Vitest em 10 arquivos. Lint, typecheck e build passaram |
| Segurança | Workflow aprovado com autenticação, CSRF e pagamentos parciais. `pip-audit` e `npm audit` passaram na execução |
| Interface Linux | 32 com API simulada, 6 com API real e 6 de fluxo offline operacional. Também passaram 4 de fronteira do worker e 9 combinações de largura e zoom |
| Backup e rollback em laboratório | Restauração isolada do consolidado financeiro, recuperação após encerramento do processo durante transação, venda idempotente e reinício controlado |
| Carga financeira separada | 50 requisições, 25 vendas únicas, estoque de 73 para 48, diferença de R$ 0,00 e P95 de 586 ms |

| Sessões de leitura | Requisições em 30 s | P95 | Erros |
| ---: | ---: | ---: | ---: |
| 10 | 2.774 | 17 ms | 0 |
| 30 | 6.295 | 82 ms | 0 |
| 50 | 7.822 | 140 ms | 0 |

[Aceitação em ambiente descartável](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974557) · [Artefato de regressão, carga, backup e restauração](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974557/artifacts/14818960013) · [Bateria](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172973951) · [Segurança](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172973963)

## Matriz Web/PWA e dispositivos

| Perfil | Fluxos operacionais | Navegação offline emulada | Desligamento real do HTTPS e reabertura | Cofre |
| --- | ---: | --- | --- | ---: |
| Chromium | 3/3 | Passou | Passou | 3/3 |
| Google Chrome | 3/3 | Passou | Passou | 3/3 |
| Microsoft Edge | 3/3 | Passou | Passou | 3/3 |
| Firefox | 3/3 | Falhou | Passou | 3/3 |
| Android emulado | 3/3 | Passou | Passou | 3/3 |
| WebKit com perfil iPhone | 3/3 | Falhou | Passou | 3/3 |

A matriz encerrou com 28 aprovados, 2 reprovados e zero ignorados. O desligamento real passou em 6/6 dentro da matriz. O cofre passou em 18/18 testes adicionais. Sob `BrowserContext.setOffline(true)`, o Firefox bloqueou a consulta direta à API, porém registrou uma navegação HTTP 200 tratada pelo Service Worker sem o cabeçalho `x-apollo-offline-fallback`. No WebKit, a API direta também ficou inacessível e `page.goto` retornou erro interno. O listener HTTPS efetivamente desligado produziu o fallback exigido nos dois. A causa interna dos mecanismos de emulação continua aberta. As asserções originais permanecem ativas.

Windows Server 2022 virtual executou quatro cenários Chromium com API simulada. Os perfis Linux, Android e iPhone são ensaios no executor. A operação em Windows 10/11, Android e iPhone reais, o reinício do dispositivo, a instalação física e a troca de uma versão efetivamente publicada ainda precisam de prova. A recuperação do navegador e o cofre em ambiente descartável estão registrados acima.

[Matriz](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974113) · [Firefox](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974113/artifacts/14817839177) · [WebKit](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974113/artifacts/14818229190) · [Android emulado](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172974113/artifacts/14817702972) · [Windows virtual](https://github.com/paulobhzt-tech/Apollo/actions/runs/45172976126/artifacts/14818690194)

## Bloqueios restantes

| Bloqueio | Impacto e condição de encerramento |
| --- | --- |
| Manifesto público e worker legado | A resposta pública não identifica um build auditado. Auditar VirtualHost, DocumentRoot e serviço ativo em leitura. A implantação exige autorização específica e nova comparação pública |
| Isolamento, backup e rollback administrativos | A separação de dados e serviços em relação à produção e a capacidade de retornar à versão anterior precisam de evidência no ambiente real |
| Firefox e WebKit na emulação | Duas falhas abertas, com logs e traces. Resolver ou aceitar formalmente com evidência, mantendo o teste de queda real |
| Impressora e dispositivos físicos | A operação de 80 mm, duas vias, recuperação da impressora, PWA instalada, atualização e reinício em aparelhos da loja ainda precisam de validação |
| Autorização operacional | A utilização exige aprovação explícita da pessoa responsável pela loja após resolver os requisitos críticos |

A publicação ficou restrita à branch experimental desta execução. Produção e dados reais permaneceram intocados.
