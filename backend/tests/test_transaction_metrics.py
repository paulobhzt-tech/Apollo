"""Diagnostics must never serialize documents, queries, credentials or exception text."""
import json
from types import SimpleNamespace
from pymongo.errors import OperationFailure
from lib import transaction_metrics as metrics


def test_metrics_do_not_export_payloads_or_exception_messages(tmp_path,monkeypatch):
    path=tmp_path/'metrics.ndjson'
    monkeypatch.setattr(metrics,'PATH',str(path))
    monkeypatch.setattr(metrics,'_last',0.)
    exc=OperationFailure('sensitive-password-and-customer',112,{'errorLabels':['TransientTransactionError']})
    info=metrics.error_info(exc)
    metrics.emit({'kind':'transaction','last_error':info})
    driver=metrics.DriverMetrics()
    driver.started(SimpleNamespace(request_id=123,command_name='update',command={'update':'cash_sessions','updates':[{'q':{'password':'sensitive-password-and-customer'}}]}))
    driver.failed(SimpleNamespace(request_id=123,command_name='update',duration_micros=10,failure={'code':112,'errmsg':'sensitive-password-and-customer'}))
    raw=path.read_text()
    assert 'sensitive-password-and-customer' not in raw
    assert 'updates' not in raw and 'errmsg' not in raw
    assert info['labels']==['TransientTransactionError']
    assert json.loads(raw.splitlines()[-1])['counters']['update:cash_sessions:error:112']>=1


def test_unavailable_diagnostic_storage_cannot_fail_financial_work(tmp_path,monkeypatch):
    monkeypatch.setattr(metrics,'PATH',str(tmp_path/'absent'/'file'))
    metrics.emit({'kind':'transaction'})
