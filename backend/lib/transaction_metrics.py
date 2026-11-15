"""Opt-in, payload-free diagnostics. No logging changes unless explicitly enabled."""
import json
import os
import threading
import time
from collections import Counter
from pymongo import monitoring

PATH = os.environ.get('APOLLO_TX_DIAGNOSTICS_FILE')
_lock = threading.Lock()
_pending = {}
_counts = Counter()
_last = 0.0
_checked_out = 0
_local = threading.local()
COLLECTIONS = {'orders','counters','financial_operations','cash_sessions','ingredients','products',
               'categories','purchases','lot_consumptions','stock_moves','kitchen_tickets',
               'invoices','sessions','employees','login_attempts','customer_moves','fiado_customers'}
LABELS = ('TransientTransactionError','UnknownTransactionCommitResult','RetryableWriteError')


def error_info(exc):
    return {'code':getattr(exc,'code',None), 'category':type(exc).__name__,
            'labels':[label for label in LABELS if hasattr(exc,'has_error_label') and exc.has_error_label(label)]}


def emit(event):
    if not PATH:return
    try:
        line=json.dumps(event,separators=(',',':'))+'\n'
        with _lock:
            with open(PATH,'a',encoding='utf-8') as output:output.write(line)
    except OSError:
        # Diagnostic storage failure must not change financial outcome.
        pass


class DriverMetrics(monitoring.CommandListener, monitoring.ConnectionPoolListener):
    def started(self,event):
        value=event.command.get(event.command_name)
        collection=value if isinstance(value,str) and value in COLLECTIONS else 'other'
        with _lock:_pending[event.request_id]=(event.command_name,collection)

    def _finish(self,event,failed):
        global _last
        with _lock:
            command,collection=_pending.pop(event.request_id,(event.command_name,'other'))
            prefix=command+':'+collection
            _counts[prefix+':count']+=1
            _counts[prefix+':us']+=event.duration_micros
            if failed:
                failure=event.failure
                code=failure.get('code','network') if isinstance(failure,dict) else 'network'
                _counts[prefix+':error:'+str(code)]+=1
            now=time.monotonic()
            if now-_last<1:return
            _last=now
            snapshot=dict(_counts)
        emit({'kind':'driver','at':time.time(),'counters':snapshot})

    def succeeded(self,event):self._finish(event,False)
    def failed(self,event):self._finish(event,True)
    def connection_check_out_started(self,event):_local.checkout=time.monotonic()
    def connection_checked_out(self,event):
        global _checked_out
        with _lock:
            _checked_out+=1
            _counts['pool_checkout_count']+=1
            _counts['pool_wait_us']+=int((time.monotonic()-getattr(_local,'checkout',time.monotonic()))*1e6)
            _counts['pool_max_checked_out']=max(_counts['pool_max_checked_out'],_checked_out)
    def connection_checked_in(self,event):
        global _checked_out
        with _lock:_checked_out=max(0,_checked_out-1)
    def connection_check_out_failed(self,event):
        with _lock:_counts['pool_checkout_failed']+=1
    def pool_created(self,event):pass
    def pool_ready(self,event):pass
    def pool_cleared(self,event):
        with _lock:_counts['pool_cleared']+=1
    def pool_closed(self,event):pass
    def connection_created(self,event):pass
    def connection_ready(self,event):pass
    def connection_closed(self,event):pass


def listeners():return [DriverMetrics()] if PATH else []
