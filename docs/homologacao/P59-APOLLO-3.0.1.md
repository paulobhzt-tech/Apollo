# P59 — Apollo PDV 3.0.1

**BLOQUEADA PARA LIBERAÇÃO OPERACIONAL na Espeteria Churras Burguer.**

## Rastreabilidade

| Item | Referência |
| --- | --- |
| Repositório | `paulobhzt-tech/Apollo` |
| Origem | `audit/p58-correcao-definitiva-vps-pwa-homologacao` |
| SHA inicial conferido após fetch | `43bcdf33d7f5cc33eafb221db481299c637b4401` |
| Código testado da P58 | `65ca1e25b73536770db45d0d88e724ffda8284bc` |
| Branch P59 | `audit/p59-desbloqueio-vps-build-pwa-homologacao` |
| SHA de código e testes P59 | `c33c1d23b1fb5f56dee02c70af26e2df1851e9e0` |
| SHA final | Commit documental que contém este relatório |

O trabalho partiu de um clone descartável em memória porque o sandbox original estava sem espaço e tinha alterações locais de outra branch. O checkout original foi preservado.

## Correções e commits

- `6aac420` registrou o status HTTP de cada consulta, distinguiu o manifesto ausente do manifesto servido como HTML de login e acrescentou o identificador público de cache do worker. A identidade do pacote continua vinculada aos hashes. O verificador público passou em sete testes locais.
- `02b2275` acrescentou a prova descartável de seleção e reversão de dois builds pelo Apache.
- `6738e2c` criou uma reprodução HTTPS mínima da emulação offline sem Apollo ou CacheStorage. As asserções originais da matriz permaneceram ativas.
- `2f24b33` acrescentou reconciliação do turno antes e depois do reinício do FastAPI local.
- `c33c1d2` restringiu a conferência de dados ao URI exato da réplica descartável no CI e incluiu a execução Windows para alterações no backend.

### Arquivos de código e testes

- `.github/workflows/p48-browsers.yml`
- `.github/workflows/p48-integrity.yml`
- `.github/workflows/p48-web-audit.yml`
- `.github/workflows/p57-windows-ui.yml`
- `backend/p59_shift_snapshot.py`
- `deploy/vps/test-apache-web.sh`
- `deploy/vps/test_verify_public_build.py`
- `deploy/vps/verify-public-build.py`
- `tests/e2e/p59-emulation-probe.spec.ts`

## Build público e auditoria administrativa

Consultas públicas de leitura feitas em 23 de novembro de 2026 confirmaram:

| Recurso | Esperado | Observado | Classificação |
| --- | --- | --- | --- |
| `/build-integrity.json` | HTTP 200, JSON, SHA e hashes do pacote candidato | HTTP 200, `text/html`, SHA-256 `adbe9ff7a298ff6e0f469c6b675b8f7d6a8897ebbdf520ee7be190cb12b1bf4b`, igual ao de `/login` | Divergente |
| `/login` | HTML do pacote auditado | HTTP 200, SHA-256 `adbe9ff7a298ff6e0f469c6b675b8f7d6a8897ebbdf520ee7be190cb12b1bf4b` | Divergente |
| `/sw.js` | Worker do pacote auditado com cache identificado pelo build | HTTP 200, `application/javascript`, cache `apollo-public-v2`, SHA-256 `d992d9a3743a9504338d874da69b112935c693ce1029757bb4029bd94b097737` | Divergente |
| SHA implantado | SHA exato da release autorizada | Desconhecido | Não verificado |

A igualdade dos corpos demonstra a resposta indevida. O VirtualHost e a regra ativa responsáveis por ela ainda precisam de inspeção. A configuração candidata versionada preserva a API, aplica fallback às rotas SPA e devolve 404 para manifesto ausente. Nenhum acesso administrativo autorizado estava disponível.

### Matriz de isolamento da VPS

| Recurso | Configuração esperada | Observação e evidência | Resultado e pendência |
| --- | --- | --- | --- |
| MongoDB, banco e coleções | Banco de homologação, sem ligação com dados reais | Sem acesso à configuração efetiva | Não verificado. Conferir instância, URI com segredos ocultos e escopo do usuário |
| Credenciais, variáveis, usuários e permissões | Identidades e permissões exclusivas de homologação | Sem acesso a metadados administrativos | Não verificado. Comparar identidades, referências e permissões sem revelar valores |
| Processos, serviços, portas e FastAPI | Instância isolada com proxy apontando para o backend correto | Endpoints públicos disponíveis, processo e destino internos desconhecidos | Não verificado. Conferir processos, portas, unidade e origem do proxy |
| Apache, VirtualHost, DocumentRoot e TLS | Host dedicado à homologação e release verificada | HTTP público diverge do candidato. Configuração ativa desconhecida | Não verificado administrativamente. Conferir VirtualHost carregado, caminhos, certificados e logs relevantes |
| Diretórios e volumes | Árvore do build e volumes dedicados | Sem acesso aos caminhos efetivos | Não verificado. Conferir apontamentos, propriedade, montagem e permissões |
| Filas offline e impressão | Identificadores de ambiente e filas exclusivas | Apenas contratos com dados fictícios no laboratório | Não verificado. Conferir origem, identificador de ambiente, destino e permissões |
| Backups e rollback | Cópia íntegra, verificável e restaurável em janela autorizada | Provas no executor descartável. Sem acesso às cópias e à configuração da VPS | Não verificado. Conferir inventário, retenção e executar prova autorizada de reversão |

O verificador do SHA P59 retornou `public_build_matches=false`, `public_claimed_commit=null` e `manifest_served_login_html=true`. Os hashes de referência eram `86346c97f7ab7933eb1fcc0a8ad750a4e80b6cc70655b01922c25a01cfdf21b7` para `/login` e `4d14f65c02ad748de87bd220313fd21f6966795ce11b4628e1d9ec854f741141` para `/sw.js`.

[Workflow de integridade, gate público e rollback em laboratório](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436130) · [Manifestos, hashes e logs de Apache](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436130/artifacts/14822087332)

## Build e recuperação em laboratório

Duas compilações P59 com diretórios de saída separados produziram o mesmo manifesto de 37 arquivos. O verificador rejeitou arquivo adulterado, extra, ausente, SHA incorreto e manifesto recalculado para encobrir alteração. Sete testes unitários do verificador passaram, incluindo MIME incorreto e diferenciação entre HTTP 404 e HTML de login. No Apache descartável, login, SPA, proxy, cache do worker e HTTP 404 de arquivos ausentes passaram.

O CI recompilou o código P58 `65ca1e2` em outra árvore, conferiu os dois pacotes com manifestos de referência separados e trocou atomicamente o apontamento dentro do contêiner. O candidato adulterado foi rejeitado antes da troca. Com a candidata íntegra ativa, a remoção simulada do manifesto provocou HTTP 404. O retorno à árvore anterior restabeleceu o manifesto JSON e os 37 hashes e preservou as rotas de login e proxy. O log registra o operador do executor e o horário de cada transição. Esse ensaio e a restauração descartável do banco são provas distintas. O rollback administrativo da VPS continua pendente de janela específica e acesso autorizado.

## Caixa, estoque, offline e reinício

O Playwright executou o cenário P58 `p58-integrated-shift.spec.ts` novamente em Linux no SHA P59. Dois caixas usaram sessões independentes. O garçom usou um perfil móvel emulado. FastAPI HTTPS e MongoDB replica set ficaram no executor descartável, com dados fictícios.

| Conferência | Resultado P59 |
| --- | --- |
| Concorrência e auditoria | 50 requisições, 25 vendas únicas. Sessão, operador, horário e pagamentos conferidos |
| Caixa A | 13 vendas e R$ 78,00 em dinheiro. Diferença R$ 0,00 |
| Caixa B | 12 vendas e R$ 72,00 em dinheiro. Diferença R$ 0,00 |
| Atualização offline | Dois pedidos preservados no cofre após a troca do worker e de cache. Um sincronizou após a perda da primeira resposta, e o conflito 409 permaneceu após reabrir offline |
| Consumo e filas | Espetinhos de 100 para 74, bebidas de 100 para 99, com o pedido nas filas de cozinha e bar |
| Lote e estorno | 20 espetinhos, CMV de R$ 80,00. Lote de 74 para 54 e de volta a 74 após estorno. Turno de conferência com diferença R$ 0,00 |
| Reinício do backend | Os dois snapshots do MongoDB descartável eram idênticos após o FastAPI parar e voltar. 25 vendas pagas, um estorno, três caixas fechados sem diferença, lote 74 e estoques 74 e 99 |
| Recebimento de mesa com resposta incerta | O fluxo de regressão exigiu consulta ao servidor e a API rejeitou o recebimento com ID de comanda obsoleto |

A prova da atualização é de laboratório, com dados fictícios, troca do código do worker e de cache. As rotas de impressão exercitaram o contrato das filas. Impressão em 80 mm, duas vias, reinstalação, reinício físico e recuperação no equipamento real seguem pendentes.

[Job Chromium](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436162/job/137719359247) · [Snapshots, logs e traces do ensaio](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436162/artifacts/14822177690)

## Matriz Web/PWA, diagnóstico e dispositivos

| Perfil | Fluxos operacionais | Navegação offline emulada | Desligamento real e reabertura | Cofre |
| --- | ---: | --- | --- | ---: |
| Chromium | 3/3 | Passou | Passou | 3/3 |
| Google Chrome | 3/3 | Passou | Passou | 3/3 |
| Microsoft Edge | 3/3 | Passou | Passou | 3/3 |
| Firefox | 3/3 | Falhou | Passou | 3/3 |
| Android emulado | 3/3 | Passou | Passou | 3/3 |
| WebKit com perfil iPhone | 3/3 | Falhou | Passou | 3/3 |

A matriz original teve 28 aprovados, 2 reprovados e nenhum ignorado. Dos 30, os 6 cenários com desligamento real passaram. Houve 18 aprovações adicionais do cofre. A reprodução mínima teve três execuções aprovadas para as asserções exercitadas com o listener realmente desligado. Os resultados de emulação foram registrados como diagnóstico separado.

| Ambiente da reprodução mínima | Observação durante `setOffline(true)` |
| --- | --- |
| Chromium 151.0.7922.34 | Página sem acesso direto, servidor sem requisição de navegação, fallback do worker entregue |
| Firefox 153.0 | Página sem acesso direto, requisição de navegação feita pelo worker chegou ao HTTPS, HTTP 200 sem fallback |
| WebKit 26.5 | Página sem acesso direto, servidor sem requisição de navegação, `page.goto` retornou erro interno |

O HTTPS da fixture roda em Ubuntu 24.04 com Playwright 1.62.0. Os mesmos sintomas ocorreram sem código do Apollo ou CacheStorage. A reprodução separa o comportamento da emulação da indisponibilidade real, mas a causa interna dos motores e a aceitação formal da exceção ainda estão pendentes. Os testes e asserções da matriz foram mantidos.

Windows Server 2022 virtual aprovou quatro cenários Chromium com API simulada. Os perfis Android e iPhone foram emulados. Windows 10/11, Android e iPhone físicos, instalação, reinício e impressão no equipamento da loja seguem pendentes.

[Matriz e logs](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436162) · [Firefox](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436162/artifacts/14822622638) · [WebKit](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436162/artifacts/14823925229) · [Android emulado](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436162/artifacts/14821629366) · [Windows virtual](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436151/artifacts/14821882351)

## Segurança, regressão, backup e desempenho

| Suíte | Resultado no SHA P59 |
| --- | --- |
| Backend com replica set | 422 testes principais e 3 subtestes aprovados. Grupos adicionais com 8, 5, 5 e 3 aprovações |
| HTTP legado com FastAPI | 4 aprovados |
| Bateria complementar | 253 testes de backend e 3 subtestes aprovados, 1 ignorado. Há sobreposição entre suítes |
| Frontend | 64 testes Vitest, lint, typecheck e build aprovados. A bateria complementar executou 38 testes de fila e reconciliação |
| Playwright Linux | 32 casos com API simulada, 6 com backend real, 6 de operação e offline, 4 de fronteira do worker e 9 de largura e zoom |
| Segurança | Workflows de autenticação, CSRF, permissões e pagamentos aprovados. `pip-audit` e `npm audit` concluíram a auditoria |
| Backup e recuperação | Backup financeiro restaurado em banco descartável separado. Transação interrompida reverteu e recuperou uma venda idempotente, uma baixa e diferença de R$ 0,00 |
| Carga financeira adicional | 50 requisições, 25 vendas, estoque de 73 para 48, diferença de caixa R$ 0,00 e P95 de 521 ms na P59 ante 586 ms na P58 |

| Sessões de leitura | P58 requisições / P95 | P59 requisições / P95 | Erros P59 |
| ---: | ---: | ---: | ---: |
| 10 | 2.774 / 17 ms | 2.742 / 19 ms | 0 |
| 30 | 6.295 / 82 ms | 6.879 / 61 ms | 0 |
| 50 | 7.822 / 140 ms | 8.659 / 128 ms | 0 |

Cada faixa usou 30 segundos. As medições de P58 servem para comparação histórica, com executores diferentes. O consumo de recursos não foi medido nessas tabelas.

[Aceitação isolada](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436171) · [Artefato de regressão, backup e carga](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436171/artifacts/14823291264) · [Bateria](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436192) · [Segurança](https://github.com/paulobhzt-tech/Apollo/actions/runs/45182436206)

## Gates de homologação

| Gate | Decisão e condição para encerramento |
| --- | --- |
| A. Integridade pública | **Reprovado.** Identificar VirtualHost e release ativa, obter autorização de implantação e obter correspondência pública do manifesto, SHA, worker e hashes |
| B. Isolamento da VPS | **Não verificado.** Acesso administrativo de leitura e comprovação das separações da matriz de isolamento |
| C. Rollback | **Laboratório aprovado. VPS pendente.** Levantar a release vigente, verificar backups e provar recuperação em janela autorizada |
| D. Navegadores | **Pendente.** A matriz mantém duas falhas. Corrigir a emulação ou obter decisão explícita de aceitação com base nas reproduções e no teste real |
| E. Operação financeira | **Aprovado em laboratório** nos cenários executados com dados fictícios |
| F. Estoque | **Aprovado em laboratório** nos cenários concorrentes, lote e estorno executados |
| G. Offline | **Aprovado em laboratório** nos cenários executados de cofre, perda de resposta, atualização do worker e reinício |
| H. Impressão e dispositivos | **Pendente.** Realizar instalação, reinício, impressão 80 mm e recuperação nos equipamentos físicos autorizados |
| I. Segurança | **Suítes executadas aprovadas.** A auditoria da infraestrutura real permanece no gate B |
| J. Aprovação humana | **Pendente.** A utilização operacional exige autorização explícita da pessoa responsável após os gates obrigatórios |

**Decisão final P59: bloqueada para liberação operacional.** A publicação ficou restrita à branch experimental. Produção e dados reais permaneceram intocados.
