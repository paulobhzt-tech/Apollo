# Apollo PDV 3.0.1 — P10.4

**P10.4: pacote e regressão automatizada aprovados no escopo isolado, com intermitência preservada. Produção bloqueada. HostGator não acessada, capacidade não comprovada.**

## Recuperação e arquitetura

PR #25 aberto/em rascunho/sem merge, empilhado sobre `perf/p9-financial-latency` (`310948f9c77e62e12593ed502c3c152568686c8c`). Branch de entrega `homolog/p10-operational-web`. Referência solicitada `c0a61d128c0c84b158a57bbe9af00e257c108ecd`; HEAD remoto encontrado `2fa9e5f6904cf6b255b2fe22e426c73f5cb8bf52`. Sete commits posteriores preservados: c02a94f, c73598c, bfa38db, ca8ed82, c26c198, e9325e9, 2fa9e5f. Nenhum AGENTS.md encontrado no checkout.

Relatórios P8/P9/P10 e RUNBOOK lidos. P8 histórica reprovou HTTP p95; P9 posterior aprovou desempenho no cenário ensaiado, sem autorização de produção. P10.2 aprovou o escopo automatizado anterior. Isso não aprova automaticamente os commits posteriores: no HEAD recuperado, P10 e P104 tinham falhas. [Evidências anteriores](evidence/previous-failures.json) preservam ZIP/hash/CRC e limitações.

Arquitetura efetiva: frontend React/TypeScript/Vite, entrada Web separada e Electron preservado; FastAPI/Uvicorn, sessões server-side/cookies, guard de perfis no backend e gate visual; Mongo replica set com transações, admissão FIFO e idempotência financeira. Web compilada é servida pela aplicação, origem única atrás de proxy HTTPS. Mongo privado/autenticado, modo sintético fail-closed, integrações e saída externa bloqueadas. Não há certificação multiempresa/comercial; fase inicial continua exclusiva do proprietário.

Código financeiro P6–P9, retries, numeração, FIFO e regras de estoque/venda/cancelamento preservados; diff dos diretórios backend/lib, routers e models vazio contra P10.3. [Hashes do núcleo preservado](evidence/preserved-core.json). Não se implementou funcionalidade especulativa para “avançar” sem defeito comprovado. Cadastro/estoque/caixa/financeiro/relatórios/sessões/permissões/recuperação são cobertos pelas suítes existentes; API e UI não são equivalentes em abrangência. Aceite de telas/equipamentos e impressão física ainda depende de humanos.

## Correções desta retomada

Commit de aplicação enviado: `e7b11c065d984144a21532989a33477cfeb73eed`.

- Ensaio de restore: staging de plaintext agora usa `install -m 600 -o 10001 -g 10001` e verifica modo/dono/grupo antes de importar. O reader continua rejeitando arquivo público. A tentativa anterior capturava stderr sem preservá-lo; seu log comprova interrupção no restore, mas não expõe a mensagem específica. A reprodução local comprova recusa de 0644 e aceitação dos mesmos bytes em 0600; o novo ensaio real concluiu restore/guardas/reconciliação com PASS no mesmo HEAD corrigido.
- Barra Web: contexto de empilhamento explícito (`position:relative`, z-index 40, isolation) protege seu texto do efeito visual absoluto da tela de login. Evidência anterior: axe incomplete `color-contrast/bgOverlap`, span da barra em notebook. O teste agora também exige hit-test do texto visível; zero violações e zero incomplete continuam obrigatórios.
- Testes de regressão: asserção de permissões no próprio ensaio P104 e hit-test no P10-11; suítes financeiras e negativas mantidas.

## Validação local executada

[Resultado estruturado](evidence/local-validation.json) e [log backend](evidence/local-backend.txt).

| Ensaio | Resultado |
|---|---|
| Suíte completa com Mongo 7.0.16 real, replica set descartável e HTTP backend | 413 testes + 3 subtestes aprovados, 55,09 s; 1 aviso de dependência |
| Subconjunto segurança/perfis/caminhos/backup/isolamento/recuperação | 262 aprovados, 11,40 s; 3 avisos |
| Typecheck | PASS |
| Lint | PASS: zero erros, nove avisos herdados |
| Build Web | PASS: dois avisos CSS herdados |
| compileall da ferramenta alterada e diff --check | PASS |
| Leitor de backup estrito + staging local com install | 0644 recusado; 0600 aceito, bytes preservados |

Dependências locais não são a imagem locked do CI: resultados locais não certificam identidade do pacote. Não houve Docker local, carga P9 nova ou teste da VPS. Nenhum dado financeiro real foi usado. As suítes existentes incluem concorrência/transações, autenticação/perfis, cadastro/estoque, caixa/cancelamento, financeiro/backup e recuperação; o log é a contagem efetivamente executada, não uma extrapolação de cobertura integral.

## Pacote offline e ensaio P10.4 verificados

[Workflow 44075810608](https://github.com/paulobhzt-tech/Apollo/actions/runs/44075810608), [artefato 14324732733](https://github.com/paulobhzt-tech/Apollo/actions/runs/44075810608/artifacts/14324732733), source_head `e7b11c065d984144a21532989a33477cfeb73eed`. ZIP recuperado integralmente: 410.140.098 bytes, SHA-256 `300a81c65b192475a5a8d97587b8bbdcc05fc6ec92f3bea15e3d91e36bf07e82`, CRC aprovado. Tar de 513.894.400 bytes, SHA-256 `ddc3152583dc0486caf6e7f3ebfb96887ba132bbf7a94c9e17c655b1874e2254`; os 18 arquivos do manifesto foram conferidos por tamanho/hash. Expiração informada pelo GitHub: 15/02/2027; não equivale a armazenamento permanente de distribuição.

Builds independentes sem cache: metadados dos dois builds com mesmo digest OCI `sha256:96956cbba4f505fe36784a0fe17a494a17de04d22f9e900f5db6eac6b750e31b`. Image ID `sha256:4a681f6c007e7d662b2d284fa5b3be51bb00617f6434c7b796ee5713b740b399`. Não se afirma tar byte a byte reproduzível. [Revisão estruturada](evidence/package-review.json), [manifesto](evidence/manifest.json), [identidades](evidence/images.lock.json), [resultado](evidence/result.json).

Ensaios efetivamente aprovados: imagem carregada do arquivo retido, Mongo autenticado e privado, Web sem porta publicada/bootstrap montado, HTTPS de laboratório, Apache 2.4.62 em container AlmaLinux 9 com sintaxe/allow/deny/Host desconhecido, login/reload/produtos/PDV/logout no Chromium da imagem exportada, dez replays concorrentes de venda/cancelamento, estorno parcial/restante, caixa reconciliado, backup criptografado/descriptografado, restauração autenticada em destino separado, recusa de hash/target errados e destino usado, reinício backend/Mongo e readiness 503 durante indisponibilidade. Snapshot: dois pedidos cancelados, dois marcadores, estoque=lotes=100, diferença de caixa zero, sem duplicação/divergência observada. Retirada e recuperação do volume original concluídas; rollback entre versões anteriores não foi ensaiado.

Uma amostra pós-ensaio no runner: Web 56,14 MiB, Mongo 82,29 MiB e proxy 3,262 MiB. Não são picos, orçamento de produção nem capacidade HostGator. Não subdimensionar a VPS a partir dessa captura. Apache container não certifica Virtualmin/SELinux enforcing/HostGator; TLS público e aceite humano continuam não testados.

## Regressão Web do HEAD corrigido

Workflow [44075810541](https://github.com/paulobhzt-tech/Apollo/actions/runs/44075810541): regressão backend real 413 +3 subtestes, failover autenticado de três membros (10,250 s, saldo 90, um movimento e reinício preservado), P5 12/12, types/lint/builds/Node aprovados. Desktop/tablet/mobile: cada um P6 11/11 e P10 15/15, nove relatórios axe com zero violações/incomplete. ZIPs recuperados por tamanho/SHA-256/CRC; [revisão de resultados/snapshots](evidence/web-review.json).

Primeira tentativa de notebook falhou em P6: após clicar em abrir caixa, POST ainda pendente no trace quando terminou a espera de 5 s; runtime registra resposta 200. Um caso passou, um falhou e nove não rodaram; P10 nem iniciou nesse job. Não há causa funcional comprovada nem autorização para afrouxar timeout. A falha é preservada em previous-failures.json; repetição somente do job reprovado no mesmo HEAD passou: P6 11/11 e P10 15/15, sem mudar código/timeouts/retries. Artefato 14326355242 recuperado e conferido por tamanho/hash/CRC. Assim, os resultados finais são P6 44/44 e P10 60/60, 12 relatórios axe sem violações/incomplete e 104 snapshots financeiros revisados. A campanha teve uma falha inicial; não se alega ausência de intermitência. Causa do timeout inicial continua não estabelecida. [Estados finais do CI](evidence/CI-final.json).

## HostGator e implantação

[Plano com comandos, gates, backup/restore/rollback e operação](HOSTGATOR.md). Inventário SSH **NÃO EXECUTADO**: sem autorização de acesso. CPU livre, RAM/swap, disco, processos, serviços, consumo do outro site, Virtualmin, portas, logs e capacidade Mongo estão **NÃO MEDIDOS**. Características 1 vCPU/2 GB/AlmaLinux 9/Virtualmin são informação do proprietário, não descoberta técnica do host.

Consulta local de `homolog.apollo-pdv.com` retornou gaierror. Não se conclui NXDOMAIN autoritativo; DNS/HTTPS públicos não foram validados. Não houve emissão TLS, DNS, SSH/painel, instalação, alteração de serviços, banco remoto, migração, publicação ou carga na VPS. Nenhum merge realizado.

## Pendências e próxima missão

Pacote completo retido e ensaiado com PASS no CI isolado, hashes conferidos. Continuar a revisão da regressão Web e preservar qualquer intermitência; arquivo parcial de execução anterior não serve. Diagnóstico HostGator depende de autorização de SSH/leitura e acesso seguro ao servidor identificado; não é autorização de instalar. Depois, coletar pico/reserva do site e apresentar parecer de capacidade e configuração concreta para aprovação separada.

Permanecem: backup/restore do site existente, destino/SELinux/Virtualmin reais, DNS/TLS público, unidade de inicialização, monitoramento/backups operacionais, homologação humana e hardware. Próxima missão: **P10.5 — inventário HostGator somente leitura e decisão de capacidade**, após autorização explícita. Produção continua bloqueada até implantação/testes/aceite formal.

## Veredito de entrega

**Preparação técnica P10.4 concluída no ambiente isolado.** Dois defeitos tratados e ensaios automatizados finais aprovados; falha inicial P6 notebook preservada como limitação de repetibilidade, sem regra financeira alterada. Pacote distribuível recuperado/conferido e plano HostGator documentado. **Avaliação real da VPS e homologação humana pendentes; produção bloqueada.** Commit documental final registrado no PR #25, separado do HEAD de aplicação ensaiado.
