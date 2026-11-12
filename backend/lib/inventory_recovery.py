"""Evidence and optimistic concurrency for administrative inventory recovery."""
import hashlib
import json
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP


def recovery_token(evidence: dict) -> str:
    serialized = json.dumps(evidence, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


def counter_stock_evidence(order: dict, moves: list[dict]) -> dict:
    expected = defaultdict(Decimal)
    observed = defaultdict(Decimal)
    scale = Decimal("0.0001")
    complete_snapshot = bool(order.get("items"))
    for item in order.get("items", []):
        if item.get("cancelled"):
            continue
        if item.get("stock_recipe") is None:
            complete_snapshot = False
            continue
        for recipe in item["stock_recipe"]:
            key = (recipe["ingredient_id"], item.get("stock_ref"))
            expected[key] += Decimal(str(item["qty"])) * Decimal(str(recipe["qty"]))
    for move in moves:
        observed[move["ingredient_id"]] -= Decimal(str(move["qty"]))
    rounded_by_ingredient = defaultdict(Decimal)
    for (ingredient_id, _), amount in expected.items():
        rounded_by_ingredient[ingredient_id] += amount.quantize(scale, rounding=ROUND_HALF_UP)
    expected_qty = {key: float(amount) for key, amount in rounded_by_ingredient.items() if amount}
    observed_qty = {key: float(amount.quantize(scale)) for key, amount in observed.items()}
    return {"expected": expected_qty, "observed": observed_qty,
            "matches": complete_snapshot and expected_qty == observed_qty}
