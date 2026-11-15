# Arquivos e commits P1

- `.github/workflows/quality-checks.yml`
- `.github/workflows/validacao-pdv.yml`
- `.gitignore`
- `backend/benchmarks/soak_real.py`
- `backend/lib/backups.py`
- `backend/lib/health.py`
- `backend/lib/operation_keys.py`
- `backend/lib/orders.py`
- `backend/lib/reconciliation.py`
- `backend/lib/transactions.py`
- `backend/models/schemas.py`
- `backend/routers/config.py`
- `backend/routers/fiado.py`
- `backend/routers/operations.py`
- `backend/routers/public.py`
- `backend/routers/serverbackup.py`
- `backend/routers/tables.py`
- `backend/server.py`
- `backend/tests/test_backup_credentials.py`
- `backend/tests/test_p1_integrity_integration.py`
- `backend/tests/test_reconciliation.py`
- `backend/tests/test_role_permissions.py`
- `backend/tools/reconcile_backup.py`
- `backend/tools/recover_backup.py`
- `backend/tools/run_replica_tests.py`
- `backend/tools/test_replica_failover.py`
- `deploy/homologation/README.md`
- `deploy/homologation/compose.yaml`
- `deploy/homologation/start-mongo.sh`
- `docs/audit/p1-2026-11-15/COLLECTIONS.md`
- `docs/audit/p1-2026-11-15/FILES.md`
- `docs/audit/p1-2026-11-15/MATRIX.md`
- `docs/audit/p1-2026-11-15/OPERATIONS.md`
- `docs/audit/p1-2026-11-15/PERFORMANCE.md`
- `docs/audit/p1-2026-11-15/PUBLICATION.md`
- `docs/audit/p1-2026-11-15/REPORT.md`
- `docs/audit/p1-2026-11-15/evidence/additional-before.txt`
- `docs/audit/p1-2026-11-15/evidence/before.txt`
- `docs/audit/p1-2026-11-15/evidence/core-after.txt`
- `docs/audit/p1-2026-11-15/evidence/dependencies-after.json`
- `docs/audit/p1-2026-11-15/evidence/dependencies-before.json`
- `docs/audit/p1-2026-11-15/evidence/expanded.txt`
- `docs/audit/p1-2026-11-15/evidence/expanded2.txt`
- `docs/audit/p1-2026-11-15/evidence/failover-final.txt`
- `docs/audit/p1-2026-11-15/evidence/failover.json`
- `docs/audit/p1-2026-11-15/evidence/failover.txt`
- `docs/audit/p1-2026-11-15/evidence/failover2.txt`
- `docs/audit/p1-2026-11-15/evidence/frontend-final.txt`
- `docs/audit/p1-2026-11-15/evidence/frontend-install-final.txt`
- `docs/audit/p1-2026-11-15/evidence/frontend-lint-final.txt`
- `docs/audit/p1-2026-11-15/evidence/full-suite-344.txt`
- `docs/audit/p1-2026-11-15/evidence/full-suite-final.txt`
- `docs/audit/p1-2026-11-15/evidence/full-suite.txt`
- `docs/audit/p1-2026-11-15/evidence/offline-after.txt`
- `docs/audit/p1-2026-11-15/evidence/offline-before.txt`
- `docs/audit/p1-2026-11-15/evidence/p1-final.txt`
- `docs/audit/p1-2026-11-15/evidence/soak.json`
- `docs/audit/p1-2026-11-15/evidence/soak.txt`
- `frontend/package.json`
- `frontend/src/components/AppShell.tsx`
- `frontend/src/components/SyncPanel.tsx`
- `frontend/src/lib/offline.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/pages/Config.tsx`
- `frontend/src/pages/Fiado.tsx`
- `frontend/tests/offline-queue.test.mjs`

## Mensagens dos commits locais

```text
1fab275 test(p1): reproduce incomplete backups and non-atomic business flows
216f0e5 fix(recovery): export complete snapshots and restore only into empty targets
f59bddc fix(integrity): transact table QR delivery and credit receipt operations
229b87a feat(audit): classify legacy inconsistencies without modifying records
a1c4bd9 fix(frontend): retain recovery manifest and credit receipt identity
5d52946 test(recovery): validate authenticated failover and financial concurrency
5ff6a83 fix(ci): supply failover report path and environment loader
36b0479 fix(offline): preserve rejected sales and block corrupt queue replacement
266bc23 fix(security): update Vite and Vitest advisory patches
6024f04 test(performance): measure real persistent HTTP sales and cancellations
```

O commit final documental reúne esta lista, matriz, relatórios e evidências. Mapeamento para SHAs remotos em PUBLICATION.md.

## Correção adicional de CI

`backend/tools/test_replica_failover.py`: descobrir primário sem supor que seja o seed. Novas evidências `evidence/ci-bootstrap-before.txt`, `evidence/failover-secondary-seed.json` e `evidence/failover-secondary-seed.txt` e a preparação rejeitada `evidence/failover-secondary-init-before.txt`. REPORT.md e PUBLICATION.md registram a falha anterior e a correção. Commit adicional: fix(ci): discover elected primary from a secondary bootstrap seed.
