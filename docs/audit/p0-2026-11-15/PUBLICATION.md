# Publicação da missão P0

PR #16, em rascunho: https://github.com/paulobhzt-tech/Apollo/pull/16

Base preservada: PR #15 / 15a075f75c9d141e7e7243f9ec14b424fefc49d8. Branch fix/p0-financial-stock-atomicity. Sem merge/deploy. Árvores locais e remotas de cada commit verificadas e idênticas; SHAs diferem por metadados da publicação via API.

| Local | GitHub | Alteração |
|---|---|---|
| a29cc56b272b4c50eb8565f1877df80b4d5813df | e15c8d350fef3c4e649bdb810178db499b18315c | test(p0): reproduce payment and cancellation defects on real replica set |
| 101882ac37ce1e8b5ed4c7eda081c2e521ecd5a4 | dc2160811170c41e06e1667a340a4f9ea3d81efb | fix(transactions): propagate sessions and safely retry commits with snapshot and majority |
| d59891044bf0185f703290511136f64ee73fd308 | d9c4bb31598d2e1dcafc99d28adbef5c5c826d4c | fix(p0): commit sales and unique cancellations with stock and cash effects |
| df4df294afce254ab93b609c60b2edc501adfea3 | e92973865c7f9f17ecb4d9fcaa885a78a7112e21 | fix(refunds): allocate mixed reversals to actual remaining tenders |
| 04fbcc8ef2d0b0f0c12a527a74020e07aff89bbe | 58b2d69ef10d4195687c4f8e045511cd3c00abe2 | test(p0): cover rollback, commit uncertainty, process crashes and HTTP regressions |
| f770d86 | 58b02953638306edf570407392ab9a786c203861 | fix(idempotency): recheck committed marker before rejecting concurrent replay |

HEAD funcional validado: 58b02953638306edf570407392ab9a786c203861.

CI observado:

- Run 43736208835: jobs backend, frontend, desktop e pagamentos concluídos com sucesso.
- Run 43736208932: jobs segurança, 39 integrações reais, frontend, PowerShell/certificado Windows, configuração Linux e gestão comercial concluídos com sucesso. Não é homologação do aplicativo Windows.
- Run 43736213019 (PR): consultar estado final no GitHub; seus jobs de build/backend já haviam passado durante a coleta.
- O run intermediário 43735532262 falhou em uma corrida de replay e foi corrigido; não foi desabilitado nem omitido.

Trechos dos dois jobs transacionais aprovados:

```text
2026-11-15T16:35:08.4331692Z ##[group]Run python -m pytest -q -n 0 tests/test_partial_payment_integration.py tests/test_p0_atomicity_integration.py
2026-11-15T16:35:38.7538166Z 39 passed in 29.80s
2026-11-15T16:34:17.8130309Z ##[group]Run python -m pip install pytest pytest-xdist pytest-asyncio httpx fastapi motor pymongo python-dotenv pydantic bcrypt
2026-11-15T16:34:41.8982217Z ##[group]Run pytest -q -n 0 tests/test_partial_payment_integration.py tests/test_p0_atomicity_integration.py
2026-11-15T16:35:20.9842670Z 39 passed in 38.64s
```

Execução local completa: 318 testes e 3 subtestes passaram, incluindo quatro HTTP reais. Composição: 275 isolados, 37 integrações novas, 2 parciais existentes e 4 HTTP. Gestão: 21 testes e 8 subtestes; offline: 3 testes. Typecheck/build/lint passaram, com avisos existentes. As alterações documentais posteriores não modificam código executável.
