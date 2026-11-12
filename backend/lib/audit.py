"""Minimal operational trail; events are appended with the business update.

HMAC sealing is optional and explicitly reported. Keep the signing key outside the
DB/backups. This cannot detect deletion of whole records or replace DB access control.
"""
import hashlib
import hmac
import json
import math
import os
import uuid
from datetime import datetime, timezone

VALUE_FIELDS = {"amount", "total", "discount", "service_fee", "change", "difference", "counted_amount",
                "order_number", "purchase_id", "opening_amount", "expected_cash", "from", "to", "item_id", "qty", "method", "brand"}


def _canonical(event):
    return json.dumps({k: v for k, v in event.items() if k != "seal"}, sort_keys=True,
                      ensure_ascii=False, separators=(",", ":")).encode()


def audit_event(action, actor, *, reason="", correlation="", authorized_by="", values=None):
    clean = {}
    for key, value in (values or {}).items():
        if key in VALUE_FIELDS and (value is None or isinstance(value, (str, int, float, bool))):
            if isinstance(value, float) and not math.isfinite(value):
                continue
            clean[key] = value
    event = {"id": uuid.uuid4().hex, "action": action, "at": datetime.now(timezone.utc).isoformat(),
             "actor_id": actor.get("id", ""), "actor_name": actor.get("name", ""),
             "actor_role": actor.get("role", ""), "reason": reason,
             "correlation": correlation, "authorized_by": authorized_by, "values": clean,
             "version": 1}
    key = os.environ.get("AUDIT_SIGNING_KEY", "")
    if len(key) >= 32:
        event["seal"] = hmac.new(key.encode(), _canonical(event), hashlib.sha256).hexdigest()
    return event


def verify_event(event):
    key = os.environ.get("AUDIT_SIGNING_KEY", "")
    if not event.get("seal"):
        return "unsigned"
    if len(key) < 32:
        return "key_unavailable"
    if not isinstance(event["seal"], str):
        return "invalid"
    expected = hmac.new(key.encode(), _canonical(event), hashlib.sha256).hexdigest()
    return "valid" if hmac.compare_digest(expected, event["seal"]) else "invalid"
