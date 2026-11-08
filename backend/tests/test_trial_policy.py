"""Regression tests for seven-day maximum trial duration."""
from datetime import datetime, timedelta, timezone
import pytest
from lib.trial_policy import TRIAL_DAYS, trial_deadline, trial_status
from routers.commercial import commercial_catalog


START = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)


def test_seven_days_is_maximum():
    assert TRIAL_DAYS == 7
    assert trial_deadline(START) == START + timedelta(days=7)


@pytest.mark.parametrize("days", [0, 8, 30, -1, True, 7.5])
def test_cannot_request_longer_or_invalid_trial(days):
    with pytest.raises(ValueError):
        trial_deadline(START, days)


def test_expires_exactly_at_seven_days():
    assert trial_status(START, START + timedelta(days=7) - timedelta(seconds=1))["status"] == "active"
    assert trial_status(START, START + timedelta(days=7))["status"] == "expired"
    assert trial_status(START, START + timedelta(days=8))["remaining_seconds"] == 0


def test_future_trial_is_not_active():
    assert trial_status(START, START - timedelta(seconds=1))["status"] == "pending"


def test_timezone_naive_dates_rejected():
    with pytest.raises(ValueError):
        trial_deadline(datetime(2026, 11, 7))
    with pytest.raises(ValueError):
        trial_status(START, datetime(2026, 11, 7))


@pytest.mark.asyncio
async def test_catalog_shows_maximum_without_claiming_activation():
    catalog = await commercial_catalog()
    assert catalog["trial"]["max_days"] == 7
    assert catalog["trial"]["enabled"] is False
