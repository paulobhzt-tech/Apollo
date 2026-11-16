# P8 FINAL — integridade preservada no escopo ensaiado

**Desempenho REPROVADO; PRODUÇÃO BLOQUEADA.** O resultado financeiro não substitui o limite de latência.

Auditoria somente leitura após drenagem verifica cada nova ordem: marcador por hash da referência e order_id, committed_at, estado atômico cancelado, caixa esperado, total/pagamento PIX de R$10 e exatamente um débito/retorno de ingrediente por nota. Verifica também marcadores órfãos, movimentos inesperados e duplicatas. Não é nova lógica financeira.

Histórico de 60.000 documentos é seed fictício de cardinalidade, não 60.000 vendas homologadas; auditoria incide apenas nas novas vendas HTTP.

## h1

```json
{
  "historical_fixture_orders": 60000,
  "duplicate_numbers": 0,
  "number_range": [
    {
      "_id": null,
      "minimum": 1,
      "maximum": 60450
    }
  ],
  "counter": 60450,
  "stock": 1000.0,
  "paid_orders": 0,
  "duplicate_refs": 0,
  "orders": 60450,
  "markers": 450,
  "stock_moves": 900,
  "cash_version": 900,
  "order_audit": {
    "checked_new_orders": 450,
    "historical_fixture_orders": 60000,
    "partial_confirmations": 0,
    "financial_divergences": 0,
    "orphan_markers": 0,
    "unexpected_stock_moves": 0,
    "duplicate_marker_orders": 0
  },
  "audit_started_at": 1794864490.245322,
  "post_load_audit_s": 0.061759233474731445
}
```

## h2

```json
{
  "historical_fixture_orders": 60000,
  "duplicate_numbers": 0,
  "number_range": [
    {
      "_id": null,
      "minimum": 1,
      "maximum": 60871
    }
  ],
  "counter": 60871,
  "stock": 1000.0,
  "paid_orders": 0,
  "duplicate_refs": 0,
  "orders": 60871,
  "markers": 871,
  "stock_moves": 1742,
  "cash_version": 1742,
  "order_audit": {
    "checked_new_orders": 871,
    "historical_fixture_orders": 60000,
    "partial_confirmations": 0,
    "financial_divergences": 0,
    "orphan_markers": 0,
    "unexpected_stock_moves": 0,
    "duplicate_marker_orders": 0
  },
  "audit_started_at": 1794864533.38451,
  "post_load_audit_s": 0.025201082229614258
}
```

## a1

```json
{
  "historical_fixture_orders": 0,
  "duplicate_numbers": 0,
  "number_range": [
    {
      "_id": null,
      "minimum": 1,
      "maximum": 2241
    }
  ],
  "counter": 2241,
  "stock": 1000.0,
  "paid_orders": 0,
  "duplicate_refs": 0,
  "orders": 2241,
  "markers": 2241,
  "stock_moves": 4482,
  "cash_version": 4482,
  "order_audit": {
    "checked_new_orders": 2241,
    "historical_fixture_orders": 0,
    "partial_confirmations": 0,
    "financial_divergences": 0,
    "orphan_markers": 0,
    "unexpected_stock_moves": 0,
    "duplicate_marker_orders": 0
  },
  "audit_started_at": 1794864623.7425895,
  "post_load_audit_s": 0.14586424827575684
}
```

## b1

```json
{
  "historical_fixture_orders": 0,
  "duplicate_numbers": 0,
  "number_range": [
    {
      "_id": null,
      "minimum": 1,
      "maximum": 2245
    }
  ],
  "counter": 2245,
  "stock": 1000.0,
  "paid_orders": 0,
  "duplicate_refs": 0,
  "orders": 2245,
  "markers": 2245,
  "stock_moves": 4490,
  "cash_version": 4490,
  "order_audit": {
    "checked_new_orders": 2245,
    "historical_fixture_orders": 0,
    "partial_confirmations": 0,
    "financial_divergences": 0,
    "orphan_markers": 0,
    "unexpected_stock_moves": 0,
    "duplicate_marker_orders": 0
  },
  "audit_started_at": 1794864713.855458,
  "post_load_audit_s": 0.15974044799804688
}
```

## b2

```json
{
  "historical_fixture_orders": 0,
  "duplicate_numbers": 0,
  "number_range": [
    {
      "_id": null,
      "minimum": 1,
      "maximum": 2218
    }
  ],
  "counter": 2218,
  "stock": 1000.0,
  "paid_orders": 0,
  "duplicate_refs": 0,
  "orders": 2218,
  "markers": 2218,
  "stock_moves": 4436,
  "cash_version": 4436,
  "order_audit": {
    "checked_new_orders": 2218,
    "historical_fixture_orders": 0,
    "partial_confirmations": 0,
    "financial_divergences": 0,
    "orphan_markers": 0,
    "unexpected_stock_moves": 0,
    "duplicate_marker_orders": 0
  },
  "audit_started_at": 1794864805.02025,
  "post_load_audit_s": 0.16526579856872559
}
```

## a2

```json
{
  "historical_fixture_orders": 0,
  "duplicate_numbers": 0,
  "number_range": [
    {
      "_id": null,
      "minimum": 1,
      "maximum": 2213
    }
  ],
  "counter": 2213,
  "stock": 1000.0,
  "paid_orders": 0,
  "duplicate_refs": 0,
  "orders": 2213,
  "markers": 2213,
  "stock_moves": 4426,
  "cash_version": 4426,
  "order_audit": {
    "checked_new_orders": 2213,
    "historical_fixture_orders": 0,
    "partial_confirmations": 0,
    "financial_divergences": 0,
    "orphan_markers": 0,
    "unexpected_stock_moves": 0,
    "duplicate_marker_orders": 0
  },
  "audit_started_at": 1794864895.9283576,
  "post_load_audit_s": 0.16155552864074707
}
```

## p7long

```json
{
  "historical_fixture_orders": 0,
  "duplicate_numbers": 0,
  "number_range": [
    {
      "_id": null,
      "minimum": 1,
      "maximum": 40800
    }
  ],
  "counter": 40800,
  "stock": 1000.0,
  "paid_orders": 0,
  "duplicate_refs": 0,
  "orders": 40800,
  "markers": 40800,
  "stock_moves": 81600,
  "cash_version": 81600,
  "order_audit": {
    "checked_new_orders": 40800,
    "historical_fixture_orders": 0,
    "partial_confirmations": 0,
    "financial_divergences": 0,
    "orphan_markers": 0,
    "unexpected_stock_moves": 0,
    "duplicate_marker_orders": 0
  },
  "audit_started_at": 1794866706.6298459,
  "post_load_audit_s": 1.208707332611084
}
```

## acceptance

```json
{
  "historical_fixture_orders": 0,
  "duplicate_numbers": 0,
  "number_range": [
    {
      "_id": null,
      "minimum": 1,
      "maximum": 54415
    }
  ],
  "counter": 54415,
  "stock": 1000.0,
  "paid_orders": 0,
  "duplicate_refs": 0,
  "orders": 54415,
  "markers": 54415,
  "stock_moves": 108830,
  "cash_version": 108830,
  "order_audit": {
    "checked_new_orders": 54415,
    "historical_fixture_orders": 0,
    "partial_confirmations": 0,
    "financial_divergences": 0,
    "orphan_markers": 0,
    "unexpected_stock_moves": 0,
    "duplicate_marker_orders": 0
  },
  "audit_started_at": 1794868517.3182054,
  "post_load_audit_s": 1.9884207248687744
}
```

Regressões reais existentes cobrem falhas pré/pós-commit, resultado desconhecido, processo morto, replays, estoque/lotes, caixa e backup concorrentes. Aprovação do CI não substitui a aceitação prolongada. Venda offline continua bloqueada; nada foi alterado na fila ou transações.

## Consolidação e limites

| Rodada | Novas ordens / marcadores | Movimentos / versão caixa | Estoque final | Duplicatas refs / números | Divergências / parciais |
|---|---|---|---|---|---|
| h1 | 450 / 450 | 900 / 900 | 1000 | 0 / 0 | 0 / 0 |
| h2 | 871 / 871 | 1742 / 1742 | 1000 | 0 / 0 | 0 / 0 |
| a1 | 2241 / 2241 | 4482 / 4482 | 1000 | 0 / 0 | 0 / 0 |
| b1 | 2245 / 2245 | 4490 / 4490 | 1000 | 0 / 0 | 0 / 0 |
| b2 | 2218 / 2218 | 4436 / 4436 | 1000 | 0 / 0 | 0 / 0 |
| a2 | 2213 / 2213 | 4426 / 4426 | 1000 | 0 / 0 | 0 / 0 |
| p7long | 40800 / 40800 | 81600 / 81600 | 1000 | 0 / 0 | 0 / 0 |
| acceptance | 54415 / 54415 | 108830 / 108830 | 1000 | 0 / 0 | 0 / 0 |

Total de 105453 novas ordens pagas e canceladas nas oito rodadas independentes, cada uma verificada após drenagem. No prolongado P8: 54.415 ordens/marcadores, 108.830 movimentos e versão de caixa, estoque restituído a 1.000, numeração contínua 1..54.415 e contador 54.415. Zero marcadores órfãos/movimentos inesperados/duplicatas de marcador. O caixa sintético não é conciliação com adquirente ou extrato bancário externo.

A carga usa referências novas; replay, commit desconhecido e recuperação de processo são cobertos pelos cenários específicos da suíte real, sem alegar que cada falha foi injetada nos 54.415 pares. A autorização e estoque continuam no backend. Não houve mutação na auditoria nem processamento financeiro fora da transação. Uma réplica de um membro e um worker não homologam múltiplos processos/hosts. Offline browser continua bloqueado.
