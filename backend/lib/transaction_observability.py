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
from collections import Counter
from lib.transaction_metrics import emit as emit_file, PATH

LOGGER = logging.getLogger("uvicorn.error")
LABELS = ("TransientTransactionError", "UnknownTransactionCommitResult")


class TransactionProbe:
    def __init__(self):
        self.log_enabled = os.environ.get("APOLLO_TX_METRICS") == "1"
        self.enabled = self.log_enabled or bool(PATH)
        self.error_counts = Counter()
        self.operation = "transaction"
        self.budget_deadline = float("inf")
        self.started = time.monotonic()
        self.status = "failed"
        self.attempts = 0
        self.commit_calls = 0
        self.aborts = 0
        self.retries = {}
        self.timings = {"callback": 0.0, "commit": 0.0, "abort": 0.0, "retry_wait": 0.0, "admission_wait": 0.0}
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
        self.error_counts[stage+":"+str(getattr(exc,"code",None))]+=1
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
        if self.log_enabled:
            LOGGER.info(json.dumps(data, separators=(",", ":"), sort_keys=True))
        if PATH:
            emit_file({'kind':'transaction','operation':self.operation,'outcome':'committed' if self.status=='committed' else 'error',
                'phase':self.errors[-1]['stage'] if self.errors else 'commit','attempts':self.attempts,'commits':self.commit_calls,
                'elapsed_s':(time.monotonic()-self.started),'callback_s':self.timings['callback'],
                'admission_s':self.timings['admission_wait'],'commit_s':self.timings['commit'],'abort_s':self.timings['abort'],'wait_s':self.timings['retry_wait'],
                'budget_exhausted':time.monotonic()>=self.budget_deadline,'errors':dict(self.error_counts),
                'last_error':({'code':self.errors[-1]['mongo_code'],'labels':self.errors[-1]['mongo_labels'],
                    'category':self.errors[-1]['exception_type']} if self.errors else None)})
