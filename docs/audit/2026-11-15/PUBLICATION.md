# Publicação e CI

PR em rascunho: https://github.com/paulobhzt-tech/Apollo/pull/15

Base: security/role-permissions-hardening (#14); inclui #13 por cherry-pick. Sem merge/deploy. Git CLI não tinha credencial de escrita; publicação realizada via conexão GitHub. As árvores de cada commit publicado foram comparadas e correspondem exatamente às árvores locais testadas. Os SHAs diferem por metadados de criação dos commits.

| Local | GitHub |
|---|---|
| ca1218c | f2a54426e0dcc57804125256fb415da1c4e381ea |
| be1bc8adc71da67793a469751d785b9fc00a0d5b | 55325e895cb6009fcc59c7342d8af70961ca7496 |
| 1a088fe93f72b04ce1c612de40cba51e1046c8ef | 0bc0bfcac728eab4bf5d6c4c8992ec7514aec538 |
| 9870b8aaa7f1e0117178fb294c202aa2da1ce319 | abbf80ecb3238b1313dd31b4a6f3ded8eb02837a |
| 77c8d31a70829171472cc6b91c300d1f1c4acc77 | d3638260b840b4ffb9056f2d88646f9d8e84ab5e |

CI validado para HEAD d3638260b840b4ffb9056f2d88646f9d8e84ab5e:

- 43731995689 (pull_request): sucesso; frontend, backend, desktop e pagamentos.
- 43731949575 (push): sucesso.
- 43731949558 (push): sucesso.
- Backend direcionado: 230 testes e 3 subtestes passaram.
- MongoDB replica set real no CI: dois testes existentes de pagamento parcial passaram, incluindo replay/conciliação e concorrência. Não cobre os P0 de quick_sale/cancel_order.
- Os quatro testes HTTP test_tscheck_* continuam não executados nesta auditoria.

Trechos de logs:

```text
2026-11-15T15:50:28.3832978Z ##[group]Run python -m pytest -q -n 0 tests/test_partial_payment_integration.py
2026-11-15T15:50:28.3833319Z [36;1mpython -m pytest -q -n 0 tests/test_partial_payment_integration.py[0m
2026-11-15T15:50:29.9493500Z 2 passed in 0.56s
2026-11-15T15:50:00.6769806Z ##[group]Run python -m pytest -q -n 0 tests/test_auth_security.py tests/test_csrf_origin.py tests/test_demo_guard.py tests/test_role_permissions.py tests/test_frontend_paths.py tests/test_auth_nonblocking.py tests/test_backup_credentials.py
2026-11-15T15:50:21.6462430Z 230 passed, 3 subtests passed in 20.27s
```

Este registro e a análise estática complementar são alterações documentais posteriores ao HEAD validado acima, sem alterações funcionais.
