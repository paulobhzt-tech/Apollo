# P39 — execução alternativa comprovada
Data: 21/11/2026. Sem aprovação para uso na loja.

## Evidência executada
Branch: audit/p39-recuperacao-executor-web.
Commit testado: bbaa10a191b6f3414d9acd0d9d8a729d8060b24c, baseado em 28ea95ce50863c7c3ce8368b91e8d98a6a5b99ec.
Run: https://github.com/paulobhzt-tech/Apollo/actions/runs/44871445773
Job 136746650596 aprovado em Ubuntu 24.04 com Git, Python 3.11, Node 22, MongoDB 7 replica set descartável e Chromium real.
Backend: 23 passed, 3 skipped, 3 subtests passed; os ignorados não contam como cobertura aprovada.
Frontend: 51 passed. Build TypeScript/Vite aprovado.
Playwright: 32 passed, 16 desktop e 16 mobile; a API é simulada em operator-session.spec.ts.
Não equivale à homologação integrada solicitada.

## Artefato
https://github.com/paulobhzt-tech/Apollo/actions/runs/44871445773/artifacts/14693348597
Apollo-P39-executor-baseline, 4.281.228 bytes.
SHA256 do ZIP: cf8f0a47cf6339429fcbc0ff0604f5894b3f2299eb988b0c8540781cf6d19298
Contém frontend/dist, evidências, logs, resultados e manifestos SHA256.
Expiração informada: 05/12/2026. Download exige acesso GitHub.

## Recuperação e divergência
Bundle P32 localizado com 2.301.923 bytes. Hash dos bytes e ancestralidade recuperada NÃO verificados.
Relatório e patch P32 atuais lidos: alteração somente em teste de recuperação, sem correção do backend comprovada.
homolog/p10-operational-web versus 28ea95ce: diverged, 110 ahead, 444 behind.
Ancestral comum: b94730282029248b7e1e6153f30381621dfebb51.
A API de comparação retornou 300 arquivos; lista potencialmente limitada. Alterações em auth, orders, transactions, operations, fiado, tables exigem revisão antes de aproveitamento.
Nenhuma mudança dessas branches foi incorporada.

## Ação externa concreta para recuperar o bundle
O executor interno falhou no provisionamento. Actions funciona, mas esta conexão não transfere os bytes binários do bundle diretamente para o runner.
Criar um Codespace na branch P39; enviar o bundle para /tmp/Apollo-P32-Base-Recuperada.bundle sem commit; executar:
```bash
bash tools/p39-verify-bundle.sh /tmp/Apollo-P32-Base-Recuperada.bundle
```
Script preparado, ainda não executado. Gera SHA256, verifica bundle/fsck e compara história em clone temporário. Não faz push ou incorporação.
Não enviar o bundle completo ao repositório público.
Workflow opcional p39-recover-p32.yml também preparado, ainda não executado.

## Pendências de homologação
Recuperação integral P32–P38; análise de conflitos; esclarecer testes ignorados; navegador com API/backend reais, mesas compartilhadas, todos pagamentos, compras/lotes/validade, KDS/impressão simulada, dois caixas e garçom, offline e sincronização, reinício/recuperação/rollback e reconciliação financeira.
Nenhum merge, implantação, alteração de produção ou banco real.
