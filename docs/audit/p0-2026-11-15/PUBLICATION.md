# Publicação da missão P0

PR #16 em rascunho: https://github.com/paulobhzt-tech/Apollo/pull/16

Base preservada: PR #15 / 15a075f75c9d141e7e7243f9ec14b424fefc49d8. Branch fix/p0-financial-stock-atomicity. Sem merge/deploy. Árvores locais/remotas comparadas e idênticas em cada commit; SHAs diferem por metadados da publicação via API.

| Local | GitHub | Alteração |
|---|---|---|
| a29cc56b272b4c50eb8565f1877df80b4d5813df | e15c8d350fef3c4e649bdb810178db499b18315c | test(p0): reproduce payment and cancellation defects on real replica set |
| 101882ac37ce1e8b5ed4c7eda081c2e521ecd5a4 | dc2160811170c41e06e1667a340a4f9ea3d81efb | fix(transactions): propagate sessions and safely retry commits with snapshot and majority |
| d59891044bf0185f703290511136f64ee73fd308 | d9c4bb31598d2e1dcafc99d28adbef5c5c826d4c | fix(p0): commit sales and unique cancellations with stock and cash effects |
| df4df294afce254ab93b609c60b2edc501adfea3 | e92973865c7f9f17ecb4d9fcaa885a78a7112e21 | fix(refunds): allocate mixed reversals to actual remaining tenders |
| 04fbcc8ef2d0b0f0c12a527a74020e07aff89bbe | 58b2d69ef10d4195687c4f8e045511cd3c00abe2 | test(p0): cover rollback, commit uncertainty, process crashes and HTTP regressions |
| f770d86 | 58b02953638306edf570407392ab9a786c203861 | fix(idempotency): recheck committed marker before rejecting concurrent replay |
| dee8828 | e936d0cb79f5656d58d875a6f1e032960ffeb541 | docs(p0): record real MongoDB evidence, recovery guarantees and rollout limits |
| 32da156 | eb5467ecf442d3694e2db0dadce0e413de571480 | fix(transactions): restart stale namespace snapshots without trusting paid status |

HEAD funcional validado: **eb5467ecf442d3694e2db0dadce0e413de571480**.

Os três workflows desse HEAD concluíram com sucesso:

- https://github.com/paulobhzt-tech/Apollo/actions/runs/43736754280: success
- https://github.com/paulobhzt-tech/Apollo/actions/runs/43736746723: success
- https://github.com/paulobhzt-tech/Apollo/actions/runs/43736746675: success

Cada um dos três jobs transacionais independentes aprovou 40 integrações reais (38 novas + 2 existentes):

- Run 43736754280, job 132880945837: success
- Run 43736746723, job 132880925107: success
- Run 43736746675, job 132880925058: success

Trecho de log:

```text
2026-11-15T16:41:18.1630744Z ##[group]Run python -m pytest -q -n 0 tests/test_partial_payment_integration.py tests/test_p0_atomicity_integration.py
2026-11-15T16:41:57.3332876Z 40 passed in 38.59s
```

Local: **319 testes + 3 subtestes** na suíte completa sem exclusões/skips, incluindo os quatro HTTP antes pendentes. Composição: 275 isolados, 38 integrações novas, 2 parciais existentes, 4 HTTP. Gestão: 21 testes + 8 subtestes; offline: 3 testes. Typecheck/build/lint passaram com avisos existentes.

Dois resultados intermediários de CI tiveram uma falha de replay; foram investigados e corrigidos, sem desabilitar testes (ci-race-before.txt e ci-snapshot-before.txt). Sucessos parciais não foram tratados como encerramento. O commit documental final posterior ao HEAD funcional não altera código executável.
