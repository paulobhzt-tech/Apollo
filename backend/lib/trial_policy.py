"""Seven-day maximum trial policy, for future signed license issuance.

No client-provided duration or local machine clock may extend the trial.
Actual activation must be performed by a trusted licensing service.
"""
from datetime import datetime, timedelta, timezone

TRIAL_DAYS = 7
TRIAL_DURATION = timedelta(days=TRIAL_DAYS)


def trial_deadline(started_at: datetime, requested_days: int = TRIAL_DAYS) -> datetime:
    if started_at.tzinfo is None:
        raise ValueError("Início do teste deve conter fuso horário")
    if isinstance(requested_days, bool) or not isinstance(requested_days, int) or not 1 <= requested_days <= TRIAL_DAYS:
        raise ValueError("Teste permitido de 1 a 7 dias")
    return started_at.astimezone(timezone.utc) + timedelta(days=requested_days)


def trial_status(started_at: datetime, now: datetime, requested_days: int = TRIAL_DAYS) -> dict:
    if now.tzinfo is None:
        raise ValueError("Relógio deve conter fuso horário")
    start = started_at.astimezone(timezone.utc)
    current = now.astimezone(timezone.utc)
    end = trial_deadline(start, requested_days)
    active = start <= current < end
    return {"status": "active" if active else ("pending" if current < start else "expired"),
            "started_at": start, "expires_at": end,
            "remaining_seconds": max(0, int((end - current).total_seconds())) if active else 0,
            "max_days": TRIAL_DAYS}
