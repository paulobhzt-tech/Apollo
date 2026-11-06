"""Employee time-clock interval calculations."""
from datetime import datetime, timedelta, timezone
import pytest
from routers.auth import worked_minutes


def test_worked_minutes_full_and_partial_minutes():
    start = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)
    assert worked_minutes(start, start + timedelta(hours=8, minutes=15, seconds=59)) == 495


def test_worked_minutes_zero_duration():
    start = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)
    assert worked_minutes(start, start) == 0


def test_worked_minutes_rejects_reverse_interval():
    start = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)
    with pytest.raises(ValueError):
        worked_minutes(start, start - timedelta(minutes=1))


def test_worked_minutes_rejects_naive_timestamps():
    with pytest.raises(ValueError):
        worked_minutes(datetime(2026, 11, 6, 12), datetime(2026, 11, 6, 13))
