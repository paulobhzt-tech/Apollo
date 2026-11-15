"""Low-overhead, opt-in telemetry for financial MongoDB transactions.

Set APOLLO_TX_METRICS=1 in an isolated test environment to emit one structured
log per transaction. No request bodies, operation references or exception messages
are logged. This is diagnostic instrumentation, not a throughput fix.
"""
import json
import logging
import os
import time
import uuid

LOGGER = logging.getLogger("apollo.transactions")
LABELS = ("TransientTransactionError", "UnknownTransactionCommitResult")


class TransactionProbe:
    def __init__(self):
        self.enabled = os.environ.get("APOLLO_TX_METRICS") == "1"
        self.started = time.monotonic()
        self.status = "failed"
        self.attempts = 0
        self.commit_calls = 0
        self.aborts = 0
        self.retries = {}
        self.timings = {"callback": 0.0, "commit": 0.0, "abort": 0.0, "retry_wait": 0.0}
        self.errors = []
        self.errors_omitted = 0
        self.trace_id = uuid.uuid4().hex[:12] if self.enabled else None

    def attempt(self):
        self.attempts += 1

    def retry(self, reason):
        self.retries[reason] = self.retries.get(reason, 0) + 1

    def duration(self, stage, started):
        self.timings[stage] += time.monotonic() - started

    def error(self, stage, exc):
        if not self.enabled:
            return
        if len(self.errors) == 16:
            self.errors_omitted += 1
            return
        labels = [label for label in LABELS if callable(getattr(exc, "has_error_label", None))
                  and exc.has_error_label(label)]
        code = getattr(exc, "code", None)
        self.errors.append({
            "stage": stage,
            "exception_type": type(exc).__name__,
            "mongo_code": code if isinstance(code, int) else None,
            "mongo_labels": labels,
        })

    def emit(self):
        if not self.enabled:
            return
        data = {
            "event": "apollo_transaction",
            "trace_id": self.trace_id,
            "outcome": self.status,
            "elapsed_ms": round((time.monotonic() - self.started) * 1000, 3),
            "attempts": self.attempts,
            "commit_calls": self.commit_calls,
            "aborts": self.aborts,
            "retries": self.retries,
            "timings_ms": {key: round(value * 1000, 3) for key, value in self.timings.items()},
            "errors": self.errors,
            "errors_omitted": self.errors_omitted,
        }
        LOGGER.info(json.dumps(data, separators=(",", ":"), sort_keys=True))
