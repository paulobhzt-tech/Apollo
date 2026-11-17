# Apollo P10.2 — homologação operacional Web em ambiente isolado

**PRODUÇÃO BLOQUEADA.** Este relatório distingue os ensaios automatizados, a preparação para HTTPS e o aceite operacional humano. Nenhuma aprovação neste documento autoriza merge, deploy, DNS ou acesso à HostGator.

## Versões e dependências

- Retomada do PR existente [#25](https://github.com/paulobhzt-tech/Apollo/pull/25), branch `homolog/p10-operational-web`, HEAD inicial `9cf8b0dcb69101f933c042c2efa71ea7ae200967`.
- Base P9: PR #24, `310948f9c77e62e12593ed502c3c152568686c8c`. Ancestralidade P5/P7/P8/P9 confirmada; PRs #20, #22, #23, #24 e #25 recuperados abertos, em rascunho e sem merge. A P10 permanece empilhada sobre a P9; nenhuma mudança foi enviada ao PR #24.
- HEAD de aplicação da validação final: `526dd72b78d57b7799fc995af42e0fe925c04379`. O commit posterior de entrega contém somente documentação/evidências; seu SHA é registrado no PR para evitar referência circular ao próprio commit.
- Commits desta retomada: `3c9eb963c47a4a4d2c15a565fc8f20530d2defbd` (segurança, isolamento, ensaios e configuração), `27d28b884899327aa1fbc20b90ffb5cb3c65b602` (correções do harness Docker/failover e runbook), `52a01d035a89e41674c1fddfc13323e08a67d563` (empacotamento Electron de teste), `526dd72b78d57b7799fc995af42e0fe925c04379` (semântica acessível da barra Web e teste mais estrito).
- Os workflows solicitados inicialmente, [43996044055](https://github.com/paulobhzt-tech/Apollo/actions/runs/43996044055) e [43996044059](https://github.com/paulobhzt-tech/Apollo/actions/runs/43996044059), estavam aprovados. Não foram tratados como prova das correções posteriores.

## Escopo e critérios

Os critérios do CI isolado estão em [ACCEPTANCE.json](ACCEPTANCE.json), publicados antes da execução de validação em `27d28b8`. O teste de acessibilidade foi depois **fortalecido** para exigir também zero resultados incompletos. Não houve redução de exigência financeira, alteração dos limites P8/P9 ou remoção de teste.

Ambiente: runners descartáveis GitHub Actions, Python 3.12, Node 24, MongoDB **7.0.16** real. P10 usa replica set de um membro, dados fictícios recriados entre casos, FastAPI real servindo **dist-web/index.html**, HTTPS loopback e Chromium em quatro viewports. P6 também usa backend/Mongo reais; P5 preserva sua suíte existente de navegação com simulações e não substitui P10. Docker exercita Mongo autenticado, usuário restrito, imagem não root, rede privada e proxy Nginx TLS. O failover separado usa três membros autenticados no mesmo runner.

O preflight verifica a cadeia do certificado de teste; o browser aceita esse certificado autoassinado apenas no harness. Isso não certifica TLS público de `homolog.apollo-pdv.com`. A revisão de evidências inclui hashes SHA-256/CRC dos ZIPs, resultados individuais, anexos JSON, snapshots, logs e screenshots. [REVIEW.json](evidence/REVIEW.json) preserva os resultados e snapshots extraídos; os ZIPs originais têm links, hashes e expiração no mesmo arquivo.

## Falhas comprovadas e correções

| Achado | Correção | Regressão/evidência |
|---|---|---|
| Provisionamento inicial previsível | Removido admin/admin; segredo privado montado, comparação constante, peer loopback, senha forte e PIN não previsível; marcador único e funcionário na mesma transação; sem sessão automática | Bootstrap concorrente cria exatamente um administrador; Docker provisiona e autentica sem credencial padrão |
| Tentativas concorrentes podiam ultrapassar o orçamento de login | Reserva atômica no Mongo antes da verificação; sucesso desconta só a própria reserva | 20 reservas simultâneas: 5 admitidas e 15 negadas; falhas concorrentes não são apagadas |
| Truncamento bcrypt acima de 72 bytes | Validação do limite em bytes de senha | Entradas longas rejeitadas; senhas legadas acima do limite exigem redefinição segura, sem migração de dados reais |
| Erro de validação poderia repetir entrada sensível | Resposta 422 sem `input`/`ctx` | Senha/PIN artificiais não aparecem na resposta |
| DTO público de delivery expunha campos internos | Resposta explícita sem custo/receita/estoque e campos internos de cliente | Backend e P10-05; diretório de funcionários não enumerável em homologação |
| Banner DEMO não impedia conexão/integração indevida | Modo fail-closed, allowlist de URI/host/banco/réplica/roles, marker sintético, bloqueio de segredos externos, rotas e TCP; rede Docker interna | Casos negativos de startup e egress; smoke autenticado |
| Restauração não deve substituir identidade e isolamento locais | Backup exclui marcadores de bootstrap/isolamento; restore preserva identidade local; HTTP restore bloqueado no modo P10 | Backup/restore real em outro banco descartável, verificando venda/estoque/identidade/markers |
| Barra Web tinha `aria-label` em div sem papel válido | Região nomeada explícita | Axe em login/PDV/caixa nas quatro resoluções, incluindo verificação de `incomplete` |

Sessões continuam server-side com cookie HttpOnly/Secure/SameSite, expiração e logout; refresh e troca de operador entre abas são exercitados. CSRF/origens hostis, CORS, Host, perfis e autorização financeira são verificados no backend; restrições visuais não são a barreira de segurança. Não foram modificados a FIFO, atomicidade financeira, numeração, retries, snapshots de estoque ou regras de venda/cancelamento P6–P9.

## Isolamento efetivamente ensaiado

`APOLLO_ENV=homologation` exige DEMO, confirmação de dados sintéticos, integrações externas desabilitadas, cookie Secure e origem HTTPS permitida. Só aceita bancos dedicados P10 e replica set `p10`; URI SRV, endpoints arbitrários, parâmetros de proxy e roles amplos são rejeitados. Exceção sem autenticação existe apenas para Mongo descartável em loopback:27030 e banco com prefixo de teste; o Docker usa autenticação obrigatória. O marker sintético só é inicializado em banco vazio.

A Web não alcança adquirentes, SEFAZ, Drive, webhooks ou serviços externos: não recebe segredos desses provedores, tem guard TCP e rede interna. PIX/cartão e emissão fiscal dos testes são registros/simulações locais. Vendas offline do browser permanecem indisponíveis. O banner **HOMOLOGAÇÃO — DADOS FICTÍCIOS** foi confirmado, mas não é a proteção principal. Gerador cria segredos novos e recusa sobrescrever diretório existente; nenhum verificador consegue inferir a procedência de uma senha arbitrariamente reaproveitada pelo operador, portanto a publicação futura deve usar a geração dedicada documentada.

## Resultados finais

Campanha principal: [44005034180](https://github.com/paulobhzt-tech/Apollo/actions/runs/44005034180). Empacotamento Electron de teste: [44005034151](https://github.com/paulobhzt-tech/Apollo/actions/runs/44005034151). Ambos devem ser conferidos contra o HEAD acima, não apenas pelo nome/ícone do workflow.

| Verificação | Resultado medido | Evidência |
|---|---|---|
| Backend/financeiro/segurança, Mongo real | **402 testes + 3 subtestes aprovados**, 69,20 s | backend.txt no artefato de regressão; CI.json |
| P10 real: desktop/notebook/tablet/mobile | **15/15 por projeto, 60/60** | Quatro results.json, anexos de snapshots e screenshots |
| P6 financeiro real nas quatro resoluções | **11/11 por projeto, 44/44** | Quatro results.json e 44 snapshots |
| P5 de navegação preservado | **12/12** | results.json de regressão; 13,9 s |
| Node (offline, recuperação, impressão) | **14/14**, zero falhas/skip | Log do job regression |
| Typecheck/lint | Passaram; lint **0 erros/9 avisos herdados** | Step Types lint… |
| Build Web e frontend desktop/sintaxe Electron | Passaram | Steps dos jobs regression/container |
| Instalador Electron Windows/NSIS | **PASS**, canal test, 82.448.076 bytes; frontend embarcado; não executado | Artefato 14293413959; SHA-256 EXE `46b9dd98e02d3113beb952e12e07a9178b4a07dfced0bda7449fb39492931db3` |
| Acessibilidade automatizada | **12 relatórios: 0 violações e 0 verificações incompletas** | Login/PDV/caixa × quatro projetos, axe 4.14.0 |
| Falhas inesperadas/flaky/skips Playwright | **0 / 0 / 0** | Revisão individual de 116 resultados, uma tentativa por teste |
| Integridade nos cenários sintéticos | **0 referências duplicadas, 0 números duplicados, 0 divergências verificadas, 0 movimentações inconsistentes** | 104 snapshots e asserções de cenário; REVIEW.json |
| Reinício backend/Mongo e resposta perdida | Passaram nas quatro resoluções, mesma venda sem novo débito | P10-09/10/12 e P6 |
| Failover autenticado de três membros | **11,516 s**, 2 tentativas transacionais, saldo esperado **90**, **1** movimento; reinício preservou dados | failover.json, credenciais temporárias; não é métrica p95 |
| Docker, TLS e isolamento | **PASS** em todos os controles; index servido coincide com dist-web | Container 14294645456; image ID `48e4289d885e9a1a9d168ea0ddfc722a3cbd1d3f83e6bd8301028238487d92c9` |

Os seis jobs principais e o job adicional de empacotamento terminaram com sucesso no mesmo HEAD. [CI.json](evidence/CI.json) registra estados/steps e trechos numéricos do log. Esses estados foram confrontados com os arquivos de resultado, não usados isoladamente como aprovação.

A matriz [SCENARIOS.md](SCENARIOS.md) relaciona resultado esperado, observado, modo UI/API e evidência de cada fluxo. Os 104 snapshots P6/P10 são preservados em REVIEW.json, além das asserções individuais no runner. P10 revisa também estoque = lote = 1.000 + soma dos movimentos, referências/números únicos, contagem final esperada e diferença de caixa zero. Isso é uma auditoria do conjunto sintético testado, não de todo histórico ou de dados de produção.

HTTP 400/401/403/429 e o 503 de falha pré-commit são respostas **intencionalmente exigidas** nos testes negativos. Não são ocultadas nem contadas como tráfego aprovado de desempenho. Zero falhas inesperadas não significa zero respostas HTTP negativas. Não foram medidos novos p95/p99 P10 nem repetida a campanha P9: a base mantém sua homologação de desempenho no escopo anterior (HTTP p95 646,38 ms, par p95 1.176,65 ms no prolongado P9); esses números são históricos da P9, não medições desta versão Web.

## Tentativas anteriores preservadas

- Execução [44001661407](https://github.com/paulobhzt-tech/Apollo/actions/runs/44001661407), HEAD `3c9eb96`: P6/P10 passaram; regressão parou por argumento de saída ausente na ferramenta de failover; Mongo Docker rejeitou keyFile com caracteres URL-safe. Corrigidos a invocação e o gerador para base64 compatível, sem desabilitar teste. O segredo inválido era efêmero; containers/volumes foram destruídos. O smoke passou a redigir e falhar se qualquer segredo gerado aparecer nos logs; nenhum valor é republicado neste relatório.
- Execução [44003157186](https://github.com/paulobhzt-tech/Apollo/actions/runs/44003157186), HEAD `27d28b8`: seis jobs passaram, 402 backend + 3 subtestes, 60 P10/44 P6/12 P5 e Docker. A inspeção dos anexos revelou uma verificação axe incompleta (`aria-prohibited-attr`) em cada página principal, apesar de zero violações automáticas. Foi corrigida e a suíte repetida após mudar o frontend. O workflow verde sozinho não encerrou o diagnóstico.
- Build Electron incluído separadamente para não confundir frontend compilado/sintaxe JS com empacotamento real. O instalador é apenas de **teste**, sem publicação/execução no computador do usuário.
- Executor local: backend e builds disponíveis; Chromium bloqueado por `socket() Operation not permitted` antes de abrir página. As tentativas locais são registradas em [local-preflight.json](evidence/local-preflight.json), sem serem contabilizadas como testes de aplicação aprovados. O browser real foi executado no Actions.

## Preparação HTTPS e execução futura

Arquivos em `deploy/p10/`: Dockerfile exclusivo (npm ci e dist-web), Compose isolado autenticado, gerador de segredos, init de réplica, proxy Nginx TLS, exemplo de vhost Apache e env sem segredos. [RUNBOOK.md](../../../deploy/p10/RUNBOOK.md) descreve health checks, logs, monitoramento, limites CPU/memória, backup/restore e rollback, preparação Virtualmin/AlmaLinux 9 e alternativa em host separado.

Nenhum desses arquivos foi aplicado à HostGator. O exemplo Apache, SELinux/firewalld e capacidade da VPS precisam ser validados após autorização específica; o ensaio Nginx Docker não prova o Apache real. Planejamento de recursos não é medição de capacidade livre. A alternativa recomendada se a VPS compartilhada não tiver folga comprovada é outra VM isolada, com banco/volumes/segredos próprios.

Para reproduzir sem VPS, executar os workflows P10 desta branch no Actions; eles criam e removem somente recursos descartáveis do runner. Os comandos de publicação do runbook são **futuros**, não autorização de execução. Imagem deve ser reutilizada por digest ou novamente validada após rebuild. Artefatos têm retenção de 90 dias; preservar ZIPs antes da expiração se forem necessários à auditoria posterior.

## Limitações e riscos remanescentes

- Cobertura completa **dos casos automatizados definidos**, não aceite humano completo de todas as telas/módulos. UI real cobre login, PDV, abertura de caixa, navegação/listagem, KDS e recuperação; mesas/comandas, delivery, receitas, contas e boa parte de estornos/relatórios usam API real autenticada a partir do browser. Uma API aprovada não certifica toda a ergonomia da tela correspondente.
- Chromium em quatro viewports não representa Safari/Firefox nem todos os aparelhos. Axe cobre três páginas e regras selecionadas; não substitui leitor de tela, inspeção visual e acessibilidade manual. Tabelas móveis podem exigir rolagem interna; não houve certificação de usabilidade humana.
- Build do instalador não comprova instalação, assinatura/certificado comercial, auto-update, impressão térmica, gaveta, leitor, balança, touchscreen ou equipamentos físicos. O pacote desktop mantém a versão herdada 3.0.0; não foi realizado versionamento/publicação comercial 3.0.1. Teste do diálogo de impressão não confirma entrega em papel.
- Não há endpoint público, DNS/TLS público, WAN, capacidade multi-host/multiworker, restauração em infraestrutura remota, operação durante indisponibilidade prolongada nem aceitação de operadores reais. Os limites de login e mutações públicas usam reservas atômicas no Mongo, mas o orçamento por IP requer avaliação operacional em NAT com muitos operadores; capacidade/distribuição com múltiplos workers não foi certificada.
- Lint preserva nove avisos existentes (zero erros); builds registram avisos CSS/chunk/depreciações. Dependências de testes e tags Docker não são um snapshot imutável de toda a cadeia; registrar/reutilizar a imagem validada e revalidar em rebuild. Não houve auditoria completa de supply chain/pentest externo nesta missão.
- Manter o ambiente com dados fictícios e acesso de perímetro restrito; qualquer publicação futura depende de autorização, backup/restauração, revisão de segredos, capacidade e smoke público no destino.

## Veredito

**P10 APROVADA NO ESCOPO TESTADO — homologação técnica/operacional automatizada em CI isolado, com MongoDB real, Web compilada HTTPS de teste e empacotamento Electron no canal test.** Todos os critérios definidos para esse escopo foram satisfeitos nas execuções finais e na revisão dos artefatos.

**Homologação operacional humana completa e publicação HTTPS pública continuam pendentes.** O aplicativo está preparado para a próxima etapa autorizada de homologação isolada; não há liberação de produção, certificação dos equipamentos nem prova de funcionamento na VPS. As limitações acima permanecem bloqueios das respectivas etapas.

**Produção continua bloqueada. Sem merge, deploy, alterações no PR #24, DNS ou acesso/modificações na VPS.**

## P10.3 — preparação final para testes humanos HTTPS

Retomada em `1ea6d5a9377bf0b7a287e1be92478a2e7411add7`, com as correções/versões aprovadas preservadas. [Diagnóstico e recomendação P10.3](P10.3-PREPARATION.md), [manifesto de versões/hashes](P10.3-APPROVED-VERSIONS.json), [inventário somente leitura](P10.3-INFRASTRUCTURE-CHECKLIST.md), [implantação/backup/restore/rollback futuros](P10.3-DEPLOYMENT-PLAN.md), [roteiro humano](P10.3-HUMAN-TESTS.md) e [autorizações](P10.3-AUTHORIZATION.md) preparados.

Confirmados 18 arquivos por Git blob remoto e SHA-256, sete ZIPs por tamanho/SHA-256 e metadados atuais do GitHub; não foram repetidos os ensaios P10.2. Os limites configurados somam 1.152 MiB sem proxy de ensaio ou 1.280 MiB com ele; isso não demonstra folga numa VPS compartilhada de 1 vCPU/2 GB. Recomenda-se host temporário isolado, inicialmente orçado em 2 vCPU/4 GiB, com dimensionamento/custo ainda sujeitos à validação e autorização. Não há preço cotado nem capacidade certificada.

Pendência adicional de distribuição: o ensaio registrou identificador local da imagem Web, sem registry/arquivo OCI recuperável. A imagem final distribuível, seus digests e o procedimento operacional de restauração precisam ser preparados/revalidados em ambiente isolado antes da implantação. O restore HTTP permanece bloqueado; não há CLI pronta de restauração no entrypoint.

**P10.3: PREPARAÇÃO DOCUMENTAL CONCLUÍDA; homologação humana/publicação PENDENTES.** Todos os casos humanos e checkboxes de autorização estão não executados/não concedidos. Nenhuma VPS/painel/SSH foi acessada, nenhum comando remoto executado, DNS/certificado/serviço alterado ou aplicação publicada. A aprovação P10.2 continua restrita ao escopo automatizado; produção bloqueada. HEAD documental desta entrega registrado no PR #25.
