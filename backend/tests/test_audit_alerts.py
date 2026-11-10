"""Pure review heuristics: boundaries, scope, data minimization and deterministic output."""
from copy import deepcopy

import pytest

from lib.audit_alerts import MAX_AUDIT_ROWS, summarize_audit_alerts


def row(action, values=None, *, id="event-1", actor="operator-1", integrity="valid"):
    return {"source": "orders", "record_id": "record-1", "integrity": integrity,
            "event": {"id": id, "action": action, "actor_id": actor, "actor_name": "Operador",
                      "at": "2026-11-10T20:00:00Z", "values": values or {}}}


def rules(rows, **thresholds):
    return [alert["rule"] for alert in summarize_audit_alerts(rows, **thresholds)]


def test_only_invalid_hmac_is_an_integrity_alert():
    assert rules([row("created", integrity="invalid")]) == ["invalid_hmac"]
    for state in ("valid", "unsigned", "key_unavailable", None):
        assert rules([row("created", integrity=state)]) == []


@pytest.mark.parametrize("difference,expected", [(19.99, False), (20, True), (-20, True), (-19.99, False)])
def test_cash_difference_uses_absolute_inclusive_threshold(difference, expected):
    assert ("cash_difference" in rules([row("cash_closed", {"difference": difference})])) is expected


def test_discount_uses_subtotal_excluding_service_and_strict_percentage():
    # 80 total + 30 discount - 10 service = 100 subtotal, hence 30%.
    assert rules([row("payment_recorded", {"total": 80, "discount": 30, "service_fee": 10})]) == ["high_discount"]
    assert rules([row("payment_recorded", {"total": 90, "discount": 20, "service_fee": 10})]) == []
    assert rules([row("payment_recorded", {"total": 100, "discount": 0})]) == []
    assert rules([row("counter_sale_created", {"total": 10, "discount": 90})]) == []


@pytest.mark.parametrize("values", [{"total": float("nan"), "discount": 30}, {"total": 0, "discount": 0},
                                    {"total": 10, "discount": -20}, {"discount": 30}, {"total": 10, "discount": 5, "service_fee": "invalid"}])
def test_malformed_payment_values_do_not_generate_false_discount_alerts(values):
    assert rules([row("payment_recorded", values)]) == []


def test_repeated_actions_group_by_actor_and_deduplicate_event_references():
    events = [row(action, id=str(index)) for index, action in enumerate(("order_cancelled", "item_refunded", "item_cancelled"))]
    assert rules(events[:2]) == []
    assert rules(events[:2] + [events[0]]) == []
    assert rules(events + [row("item_refunded", id="other", actor="operator-2")]) == ["repeated_cancellations"]
    alert = summarize_audit_alerts(events)[0]
    assert alert["count"] == 3
    assert alert["actor"]["id"] == "operator-1"
    assert rules([row("order_cancelled", id=str(i), actor="") for i in range(3)]) == []


def test_large_withdrawal_boundary_and_configurable_thresholds():
    assert rules([row("cash_sangria", {"amount": 499.99})]) == []
    assert rules([row("cash_sangria", {"amount": 500})]) == ["large_withdrawal"]
    assert rules([row("cash_sangria", {"amount": 500})], withdrawal_threshold=1000) == []
    assert rules([row("cash_closed", {"difference": 10})], cash_difference_threshold=10) == ["cash_difference"]
    assert rules([row("payment_recorded", {"total": 70, "discount": 30})], discount_ratio_threshold=.4) == []


def test_output_is_deterministic_minimal_and_does_not_mutate_inputs():
    events = [row("item_refunded", id=str(i)) for i in range(3)]
    events[0]["event"].update(customer={"cpf": "PRIVATE"}, reason="PRIVATE", pin_hash="PRIVATE")
    before = deepcopy(events)
    assert summarize_audit_alerts(events) == summarize_audit_alerts(list(reversed(events)))
    assert events == before
    assert "PRIVATE" not in str(summarize_audit_alerts(events))
    assert set(summarize_audit_alerts(events)[0]) == {"id", "rule", "severity", "reason", "actor", "count", "references"}


def test_empty_malformed_rows_and_bounded_scope():
    assert summarize_audit_alerts([None, {}, {"event": []}]) == []
    assert summarize_audit_alerts([]) == []
    assert rules([row("created", id=str(i)) for i in range(MAX_AUDIT_ROWS)] + [row("created", integrity="invalid")]) == []


@pytest.mark.parametrize("thresholds", [{"cash_difference_threshold": 0}, {"withdrawal_threshold": -1},
                                       {"discount_ratio_threshold": 2}, {"repeated_actions_threshold": 1},
                                       {"repeated_actions_threshold": True}, {"cash_difference_threshold": float("inf")}])
def test_invalid_thresholds_are_rejected(thresholds):
    with pytest.raises(ValueError):
        summarize_audit_alerts([], **thresholds)
