"""Read-only review indicators over a bounded operational audit snapshot.

Indicators do not prove fraud, authorize a payment, or enforce any action. Repeated
operations refer only to the supplied snapshot, never to an assumed time window.
"""
import hashlib
import json
from decimal import Decimal, InvalidOperation
from itertools import islice

MAX_AUDIT_ROWS = 1500
CASH_DIFFERENCE_THRESHOLD = 20
DISCOUNT_RATIO_THRESHOLD = 0.20
REPEATED_ACTIONS_THRESHOLD = 3
WITHDRAWAL_THRESHOLD = 500
CANCELLATION_ACTIONS = {"order_cancelled", "item_cancelled", "item_refunded"}


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def _text(value):
    return value if isinstance(value, str) else ""


def _reference(row, event):
    reference = {"event_id": _text(event.get("id")), "record_id": _text(row.get("record_id")),
                 "source": _text(row.get("source"))}
    if not reference["event_id"]:
        # Legacy events may lack an ID. Do not copy the event/customer payload.
        identity = [reference["source"], reference["record_id"], _text(event.get("action")),
                    _text(event.get("at")), _text(event.get("actor_id"))]
        reference["event_id"] = "legacy-" + hashlib.sha256(json.dumps(identity).encode()).hexdigest()[:20]
    return reference


def summarize_audit_alerts(rows, *, cash_difference_threshold=CASH_DIFFERENCE_THRESHOLD,
                           discount_ratio_threshold=DISCOUNT_RATIO_THRESHOLD,
                           repeated_actions_threshold=REPEATED_ACTIONS_THRESHOLD,
                           withdrawal_threshold=WITHDRAWAL_THRESHOLD):
    """Return deterministic alerts; inputs and database state are never changed.

    Only the first MAX_AUDIT_ROWS entries are considered. Callers should supply
    their already bounded, date-ordered snapshot and disclose its scope in the UI.
    """
    difference_limit = _number(cash_difference_threshold)
    discount_limit = _number(discount_ratio_threshold)
    withdrawal_limit = _number(withdrawal_threshold)
    if (difference_limit is None or difference_limit <= 0 or discount_limit is None or
            not 0 < discount_limit <= 1 or withdrawal_limit is None or withdrawal_limit <= 0 or
            isinstance(repeated_actions_threshold, bool) or not isinstance(repeated_actions_threshold, int) or
            repeated_actions_threshold < 2):
        raise ValueError("Audit review thresholds must be positive; repeated actions require an integer >= 2")
    alerts = []
    repeated = {}
    seen = set()

    def add(rule, severity, reason, actor, references):
        references = sorted(references, key=lambda ref: (ref["source"], ref["record_id"], ref["event_id"]))
        identity = json.dumps([rule, actor["id"], references], sort_keys=True, separators=(",", ":"))
        alerts.append({"id": hashlib.sha256(identity.encode()).hexdigest()[:24], "rule": rule,
                       "severity": severity, "reason": reason, "actor": dict(actor),
                       "count": len(references), "references": references})

    for row in islice(rows, MAX_AUDIT_ROWS):
        if not isinstance(row, dict) or not isinstance(row.get("event"), dict):
            continue
        event = row["event"]
        reference = _reference(row, event)
        identity = (reference["source"], reference["record_id"], reference["event_id"])
        if identity in seen:
            continue
        seen.add(identity)
        actor = {"id": _text(event.get("actor_id")), "name": _text(event.get("actor_name"))}
        values = event.get("values") if isinstance(event.get("values"), dict) else {}
        action = _text(event.get("action"))
        if row.get("integrity") == "invalid":
            add("invalid_hmac", "critical", "Assinatura inválida: revisar integridade do evento.", actor, [reference])
        if action == "cash_closed":
            difference = _number(values.get("difference"))
            if difference is not None and abs(difference) >= difference_limit:
                add("cash_difference", "high", "Diferença de caixa atingiu o limite de revisão.", actor, [reference])
        if action == "payment_recorded":
            total, discount, service = _number(values.get("total")), _number(values.get("discount")), _number(values.get("service_fee", 0))
            if all(number is not None and number >= 0 for number in (total, discount, service)):
                subtotal = total + discount - service
                if subtotal > 0 and discount > subtotal * discount_limit:
                    add("high_discount", "medium", "Desconto acima do percentual de revisão sobre o subtotal.", actor, [reference])
        if action == "cash_sangria":
            amount = _number(values.get("amount"))
            if amount is not None and amount >= withdrawal_limit:
                add("large_withdrawal", "medium", "Sangria atingiu o limite de revisão.", actor, [reference])
        if action in CANCELLATION_ACTIONS and actor["id"]:
            group = repeated.setdefault(actor["id"], {"actor": actor, "references": []})
            # Stable actor display even if the provided snapshot is reordered.
            if actor["name"] < group["actor"]["name"]:
                group["actor"] = actor
            group["references"].append(reference)
    for group in repeated.values():
        if len(group["references"]) >= repeated_actions_threshold:
            add("repeated_cancellations", "high", "Cancelamentos ou estornos repetidos pelo mesmo operador na amostra consultada.",
                group["actor"], group["references"])
    return sorted(alerts, key=lambda alert: (alert["rule"], alert["actor"]["id"], alert["id"]))
