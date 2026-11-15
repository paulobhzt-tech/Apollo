"""Unit checks for safe opt-in transaction diagnostics; no MongoDB required."""
import json
import logging

from lib.transaction_observability import TransactionProbe


def test_probe_disabled_by_default(monkeypatch, caplog):
    monkeypatch.delenv("APOLLO_TX_METRICS", raising=False)
    probe = TransactionProbe()
    probe.attempt()
    probe.emit()
    assert probe.trace_id is None
    assert not caplog.records


def test_probe_emits_only_safe_classification(monkeypatch, caplog):
    monkeypatch.setenv("APOLLO_TX_METRICS", "1")
    probe = TransactionProbe()
    class SecretFailure(Exception):
        code = 112
        def has_error_label(self, label):
            return label == "TransientTransactionError"
    probe.attempt()
    probe.retry("transient_callback")
    probe.duration("callback", probe.started)
    probe.error("callback", SecretFailure("sensitive payload secret"))
    probe.status = "committed"
    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        probe.emit()
    assert len(caplog.records) == 1
    record = json.loads(caplog.records[0].message)
    assert record["attempts"] == 1
    assert record["outcome"] == "committed"
    assert record["retries"] == {"transient_callback": 1}
    assert record["errors"][0] == {
        "stage": "callback", "exception_type": "SecretFailure",
        "mongo_code": 112, "mongo_labels": ["TransientTransactionError"],
    }
    assert "sensitive payload secret" not in caplog.records[0].message
    assert "trace_id" in record
