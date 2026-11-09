"""One-time trial issuance regression tests."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import pytest
from pymongo.errors import DuplicateKeyError
from lib.trial_issuance import TrialConflict, issue_trial, evaluate_trial

START = datetime(2026, 11, 7, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_first_trial_has_seven_day_deadline():
    collection = AsyncMock()
    result = await issue_trial(collection, verified_customer_id="customer-1", installation_id="pc-1", now=START)
    assert result["created"] is True
    assert result["expires_at"] == START + timedelta(days=7)
    collection.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_repeat_trial_keeps_original_deadline():
    collection = AsyncMock()
    collection.insert_one.side_effect = DuplicateKeyError("duplicate")
    collection.find_one.return_value = {"_id": "customer-1", "installation_id": "pc-1",
                                        "kind": "trial", "started_at": START,
                                        "expires_at": START + timedelta(days=7)}
    result = await issue_trial(collection, verified_customer_id="customer-1", installation_id="pc-1",
                               now=START + timedelta(days=6))
    assert result["created"] is False
    assert result["expires_at"] == START + timedelta(days=7)


@pytest.mark.asyncio
async def test_other_device_does_not_restart_trial():
    collection = AsyncMock()
    collection.insert_one.side_effect = DuplicateKeyError("duplicate")
    collection.find_one.return_value = {"_id": "customer-1", "installation_id": "pc-1"}
    with pytest.raises(TrialConflict):
        await issue_trial(collection, verified_customer_id="customer-1", installation_id="pc-2", now=START)


def test_expired_trial_preserves_data_and_expires():
    record = {"kind": "trial", "started_at": START, "expires_at": START + timedelta(days=7)}
    assert evaluate_trial(record, START + timedelta(days=7))["status"] == "expired"


def test_tampered_longer_trial_rejected():
    record = {"kind": "trial", "started_at": START, "expires_at": START + timedelta(days=8)}
    with pytest.raises(ValueError, match="sete dias"):
        evaluate_trial(record, START)


@pytest.mark.asyncio
async def test_unverified_identity_rejected():
    with pytest.raises(ValueError):
        await issue_trial(AsyncMock(), verified_customer_id="", installation_id="pc-1", now=START)
