"""Server-side trial issuance; call only after trusted identity verification.

The caller must supply a verified customer ID from the billing/identity service,
not arbitrary client input. This module does not expose a public activation route.
"""
from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError
from lib.trial_policy import trial_deadline, trial_status


class TrialConflict(ValueError):
    pass


async def issue_trial(collection, *, verified_customer_id: str, installation_id: str,
                      now: datetime | None = None) -> dict:
    if not isinstance(verified_customer_id, str) or not verified_customer_id.strip():
        raise ValueError("Cliente verificado obrigatório")
    if not isinstance(installation_id, str) or not installation_id.strip():
        raise ValueError("Identificação da instalação obrigatória")
    timestamp = now or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        raise ValueError("Horário deve conter fuso")
    customer = verified_customer_id.strip()
    device = installation_id.strip()
    record = {"_id": customer, "installation_id": device,
              "started_at": timestamp, "expires_at": trial_deadline(timestamp),
              "kind": "trial", "status": "issued"}
    try:
        # _id is uniquely indexed by MongoDB. Repeated calls cannot extend a trial.
        await collection.insert_one(dict(record))
        return {**record, "created": True}
    except DuplicateKeyError:
        existing = await collection.find_one({"_id": customer})
        if existing is None:
            raise TrialConflict("Conflito na emissão do teste")
        if existing.get("installation_id") != device:
            raise TrialConflict("Teste já utilizado por este cliente em outra instalação")
        return {**existing, "created": False}


def evaluate_trial(record: dict, now: datetime | None = None) -> dict:
    if not record or record.get("kind") != "trial":
        raise ValueError("Teste não encontrado")
    # Use stored, immutable dates rather than a new duration supplied by the client.
    current = now or datetime.now(timezone.utc)
    started = record["started_at"]
    expires = record["expires_at"]
    if started.tzinfo is None or expires.tzinfo is None or current.tzinfo is None:
        raise ValueError("Datas do teste sem fuso")
    if expires > trial_deadline(started):
        raise ValueError("Teste excede sete dias")
    active = started <= current < expires
    return {"status": "active" if active else ("pending" if current < started else "expired"),
            "expires_at": expires, "remaining_seconds": max(0, int((expires - current).total_seconds())) if active else 0}
