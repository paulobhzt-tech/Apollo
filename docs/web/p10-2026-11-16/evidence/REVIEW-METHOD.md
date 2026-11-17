# Método de revisão P10.2

Fonte: sete artefatos das execuções finais 44005034180 e 44005034151, vinculados ao commit `526dd72b78d57b7799fc995af42e0fe925c04379`. Todos foram baixados integralmente; tamanho e SHA-256 confrontados com a API GitHub e CRC de cada membro ZIP verificado. O executável NSIS também teve seu SHA-256 calculado desde os bytes e comparado ao result.json do runner. Nenhum executável foi iniciado.

[REVIEW.json](REVIEW.json) contém nomes/IDs, links, expiração, SHA de cada arquivo extraído, resultados individuais, snapshots, resumo axe, resultado container, failover e instalador. Logs e screenshots completos permanecem nos ZIPs; a retenção do Actions não é permanente. [CI.json](CI.json) preserva os estados dos jobs/steps e os resultados numéricos do log de regressão.

Procedimento realizado:

1. Percorrer recursivamente suites/specs/tests de todos os nove results.json (quatro P10, quatro P6, um P5). Exigir test.status=expected, uma única tentativa e result.status=passed; somar stats e exigir unexpected/skipped/flaky zero. Totais: 60 P10, 44 P6, 12 P5.
2. Decodificar os anexos JSON em base64 dos relatórios Playwright. Revisar 104 snapshots P6/P10. Conferir igualdade estoque/lote, referências únicas e diferença de caixa zero. No P10 conferir também números únicos, duplicações zero, estoque = 1.000 + soma das quantidades de movimentos, dívida final zero e número de ordens/estoque esperado por caso.
3. Conferir finais P10: casos 01/02/09/11/13/14 sem ordens e estoque 1.000; 03/10/12 com uma ordem e 999; 04 com três e 997; 05/06/07 com uma e 1.000; 08 com duas e 999. P10-12 roda duas vezes (backend/Mongo). Os valores transitórios e autorizações são verificados nas asserções do próprio teste, não inferidos somente do snapshot final.
4. Decodificar 12 anexos axe de login/PDV/caixa; exigir listas violations e incomplete vazias. Inspecionar screenshots representativos desktop/mobile e preservar os demais como evidência, sem alegar uma revisão visual manual completa de todas as telas.
5. Ler resultados backend, failover e container. Conferir 402 testes + 3 subtestes; failover autenticado com saldo 90/um movimento, restart preservado e production_touched=false; todos os controles container positivos, production_deployment=false. Confrontar Node 14, lint 0 erros/9 avisos e steps de builds com os logs.
6. Conferir Electron channel=test, frontend embarcado, production_published=false, installer_executed=false e hash do EXE. O build usa o empacotador real; não certifica instalação, assinatura ou dispositivos.

Um HTTP 503 provocado pelo failpoint pré-commit, 401/403 de segurança, 429 de limitação e 400 de repetição inválida são resultados esperados e permanecem explícitos. Não são apagados para alegar zero erros de carga. Esta revisão não mede novos percentis HTTP/par nem altera a aprovação de desempenho anterior da P9.
