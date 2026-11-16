"""Read-only post-drain audit of the synthetic load dataset, not business logic."""
import hashlib
from collections import Counter,defaultdict
def audit(db,history):
 orders=list(db.orders.find({'client_ref':{'$regex':'^soak-'}},{'_id':0,'id':1,'number':1,'client_ref':1,'atomic_version':1,'status':1,'cash_session_id':1,'total':1,'payments':1,'stock_note':1}))
 markers=list(db.financial_operations.find({'kind':'pdv_sale'},{'_id':1,'order_id':1,'committed_at':1,'request_hash':1}))
 by_id={m['_id']:m for m in markers};by_order=Counter(m.get('order_id') for m in markers)
 moves=defaultdict(list)
 for m in db.stock_moves.find({},{'_id':0,'note':1,'type':1,'qty':1,'ingredient_id':1}):moves[(m.get('note'),m.get('type'))].append(m)
 tickets=defaultdict(list)
 for ticket in db.kitchen_tickets.find({},{'_id':0,'order_id':1,'status':1}):tickets[ticket.get('order_id')].append(ticket)
 partial=0;divergences=0;expected=set()
 for o in orders:
  key='pdv:'+hashlib.sha256(o['client_ref'].encode()).hexdigest();m=by_id.get(key)
  sale_note=o.get('stock_note');cancel_note='Cancelamento #'+str(o['number'])
  expected.update([(sale_note,'venda'),(cancel_note,'estorno')])
  debit=moves.get((sale_note,'venda'),[]);credit=moves.get((cancel_note,'estorno'),[])
  committed=(m is not None and m.get('order_id')==o['id'] and m.get('committed_at') is not None and len(m.get('request_hash',''))==64 and by_order[o['id']]==1)
  stock=(len(debit)==len(credit)==1 and debit[0]['qty']==-1 and credit[0]['qty']==1 and debit[0]['ingredient_id']==credit[0]['ingredient_id']=='http-ing')
  payment=(o.get('total')==10 and len(o.get('payments',[]))==1 and o['payments'][0].get('method')=='pix' and o['payments'][0].get('amount')==10)
  ticket_ok=(len(tickets.get(o['id'],[]))==1 and tickets[o['id']][0].get('status')=='entregue')
  state=(ticket_ok and o.get('atomic_version')==1 and o.get('status')=='cancelado' and o.get('cash_session_id')=='http-cash')
  if not(committed and stock and state):partial+=1
  if not(payment and state and committed and stock):divergences+=1
 ids={o['id'] for o in orders}
 orphan_markers=sum(m.get('order_id') not in ids for m in markers)
 unexpected_moves=sum(len(v) for k,v in moves.items() if k not in expected)
 divergences+=orphan_markers+unexpected_moves
 return {'checked_new_orders':len(orders),'historical_fixture_orders':history,'partial_confirmations':partial,'financial_divergences':divergences,'orphan_markers':orphan_markers,'unexpected_stock_moves':unexpected_moves,'duplicate_marker_orders':sum(max(0,n-1) for n in by_order.values())}
