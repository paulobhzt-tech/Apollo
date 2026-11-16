"""Disposable benchmark ASGI entrypoint, identical instrumentation for P7/P8.

Never records cookies, auth tokens, payloads, IDs or query values. Driver timings
include network/driver work. Local start_transaction is not snapshot acquisition;
the first transaction command includes real snapshot establishment and DB work.
"""
import contextvars,os,threading,time
from collections import defaultdict
from pymongo import monitoring

TRACE=contextvars.ContextVar('p8_trace',default=None)
LOCK=threading.Lock()
PENDING={}
READS={'find','getMore','aggregate','count','distinct'}
WRITES={'insert','update','delete','findAndModify'}

def add(trace,key,value):
 if trace is not None:
  with LOCK:trace['seconds'][key]+=value

class Timing(monitoring.CommandListener):
 def started(self,event):
  trace=TRACE.get()
  if trace is None:return
  cmd=event.command;value=cmd.get(event.command_name)
  collection=value if isinstance(value,str) and value in {'orders','counters','cash_sessions','financial_operations','ingredients','products','categories','purchases','lot_consumptions','stock_moves','kitchen_tickets','invoices','sessions','employees','payment_methods'} else 'other'
  # Shape is only field names; never values or arbitrary source text.
  shape=','.join(sorted(k for k in cmd.get('filter',{}) if k in {'id','client_ref','atomic_version','status','cash_session_id','channel','created_at'})) if collection=='orders' else ''
  with LOCK:PENDING[event.request_id]=(trace,event.command_name,collection,cmd.get('autocommit') is False,bool(cmd.get('startTransaction')),shape)
 def finish(self,event,failed):
  with LOCK:row=PENDING.pop(event.request_id,None)
  if row is None:return
  trace,command,collection,tx,first,shape=row;seconds=event.duration_micros/1e6
  if tx:
   add(trace,'db_read' if command in READS else 'db_write' if command in WRITES else 'db_commit' if command=='commitTransaction' else 'db_other',seconds)
   if first:add(trace,'snapshot_first_command',seconds)
  else:add(trace,'db_outside_transaction',seconds)
  with LOCK:
   key=command+':'+collection+(':'+shape if shape else '')
   trace['commands'][key]['seconds']+=seconds;trace['commands'][key]['count']+=1
   if failed:trace['commands'][key]['errors']+=1
 def succeeded(self,event):self.finish(event,False)
 def failed(self,event):self.finish(event,True)

monitoring.register(Timing())
from server import app as backend_app
from motor.motor_asyncio import AsyncIOMotorClient,AsyncIOMotorClientSession
from lib.transaction_observability import TransactionProbe
from lib.transaction_metrics import emit

_start_session=AsyncIOMotorClient.start_session
async def start_session(self,*args,**kwargs):
 start=time.perf_counter()
 try:return await _start_session(self,*args,**kwargs)
 finally:add(TRACE.get(),'session_create',time.perf_counter()-start)
AsyncIOMotorClient.start_session=start_session
_start_transaction=AsyncIOMotorClientSession.start_transaction
def start_transaction(self,*args,**kwargs):
 start=time.perf_counter()
 try:return _start_transaction(self,*args,**kwargs)
 finally:add(TRACE.get(),'transaction_start_local',time.perf_counter()-start)
AsyncIOMotorClientSession.start_transaction=start_transaction
_duration=TransactionProbe.duration
def duration(self,stage,started):
 add(TRACE.get(),stage,time.monotonic()-started)
 return _duration(self,stage,started)
TransactionProbe.duration=duration
_emit=TransactionProbe.emit
def probe_emit(self):
 trace=TRACE.get()
 if trace is not None:
  trace['attempts']+=self.attempts;trace['commit_calls']+=self.commit_calls
 return _emit(self)
TransactionProbe.emit=probe_emit

async def app(scope,receive,send):
 if scope['type']!='http':return await backend_app(scope,receive,send)
 path=scope['path'];operation='sale' if path=='/api/pdv/sale' else 'cancel' if path.startswith('/api/orders/') and path.endswith('/cancel') else 'reconcile' if path.startswith('/api/pdv/operations/') else 'other'
 if operation=='other':return await backend_app(scope,receive,send)
 headers=dict(scope.get('headers',[]));stage=headers.get(b'x-apollo-benchmark-stage',b'').decode('ascii',errors='ignore')
 trace={'kind':'p8_request','operation':operation,'operators':int(stage) if stage in {'5','10','20','30','50'} else None,'seconds':defaultdict(float),'commands':defaultdict(lambda:defaultdict(float)),'attempts':0,'commit_calls':0,'status':None}
 token=TRACE.set(trace);start=time.perf_counter()
 async def measured_send(message):
  if message['type']=='http.response.start':trace['status']=message['status'];trace['seconds']['before_response_start']=time.perf_counter()-start
  tick=time.perf_counter()
  try:await send(message)
  finally:add(trace,'response_send',time.perf_counter()-tick)
 try:return await backend_app(scope,receive,measured_send)
 finally:
  trace['seconds']['http_app_total']=time.perf_counter()-start
  TRACE.reset(token);emit(trace)
