"""Read-only evidence classification. Never reconstruct identities or repair money."""
from collections import Counter,defaultdict
import hashlib
from bson import json_util


def audit(data):
    findings=[]
    def report(rule,severity,collection,record,detail,review=False):
        findings.append({'rule':rule,'severity':severity,'collection':collection,
            'record_id':str(record.get('id',record.get('_id','unknown'))),
            'evidence_sha256':hashlib.sha256(json_util.dumps(record,sort_keys=True).encode()).hexdigest(),
            'detail':detail,'classification':'REVISÃO' if review else 'INCONSISTÊNCIA',
            'proposed_action':'Revisão humana com documentos de origem; nenhuma reparação automática'})
    orders={o.get('id'):o for o in data.get('orders',[])}
    customers={c.get('id'):c for c in data.get('fiado_customers',[])}
    purchases={p.get('id'):p for p in data.get('purchases',[])}
    markers={m.get('order_id'):m for m in data.get('financial_operations',[]) if m.get('kind')=='pdv_sale'}
    for name,rows in data.items():
        counts=Counter(str(r['id']) for r in rows if r.get('id'))
        for row in rows:
            if row.get('id') and counts[str(row['id'])]>1:
                report('duplicate_id','P1',name,row,'Identificador de aplicação repetido')
    for marker in data.get('financial_operations',[]):
        if marker.get('order_id') and marker['order_id'] not in orders:
            report('orphan_marker','P0','financial_operations',marker,'Marcador sem pedido correspondente')
    for invoice in data.get('invoices',[]):
        if invoice.get('order_id') not in orders:
            report('orphan_invoice','P1','invoices',invoice,'Documento sem pedido correspondente')
    for order in orders.values():
        if order.get('atomic_version')==1 and order.get('source')=='pdv' and order.get('id') not in markers:
            report('missing_marker','P0','orders',order,'Flag transacional sem marcador confirmado')
        if order.get('status')=='pago':
            net=round(sum(p.get('amount',0) for p in order.get('payments',[]))-order.get('change',0)
                      -sum(r.get('amount',0) for r in order.get('refunds',[])),2)
            if abs(net-order.get('total',0))>.009:
                report('payment_mismatch','P1','orders',order,{'net_recorded':net,'total':order.get('total')})
            if not order.get('atomic_version'):
                report('legacy_unverified','P1','orders',order,'Pago não comprova conclusão financeira/estoque',True)
            requires_stock=any(i.get('stock_recipe') for i in order.get('items',[]) if not i.get('cancelled'))
            note=order.get('stock_note')
            if requires_stock and not any(m.get('order_id')==order.get('id') or (note and m.get('note')==note)
                                         for m in data.get('stock_moves',[]) if m.get('type')=='venda'):
                report('stock_unproven','P1','orders',order,'Baixa vinculada não comprovada; não inferir pela ficha atual',True)
    balances=defaultdict(float)
    for move in data.get('customer_moves',[]):
        if move.get('customer_id') not in customers:
            report('orphan_customer_move','P1','customer_moves',move,'Histórico sem cadastro correspondente')
        sign=1 if move.get('type')=='compra' else -1 if move.get('type') in ('pagamento','estorno') else 0
        balances[move.get('customer_id')]+=sign*move.get('amount',0)
    for customer in customers.values():
        computed=round(balances[customer.get('id')],2)
        if abs(computed-customer.get('balance',0))>.009:
            report('balance_unreconciled','P1','fiado_customers',customer,
                {'moves_balance':computed,'stored_balance':customer.get('balance'),'opening_balance':'não comprovado'},True)
    for consumed in data.get('lot_consumptions',[]):
        if consumed.get('purchase_id') not in purchases:
            report('orphan_lot','P1','lot_consumptions',consumed,'Consumo sem compra de origem')
        if consumed.get('restored_qty',0)>consumed.get('qty',0)+.00001:
            report('excess_lot_return','P0','lot_consumptions',consumed,'Devolução registrada excede consumo')
    for cash in data.get('cash_sessions',[]):
        if cash.get('status')!='fechado':continue
        paid=[o for o in orders.values() if o.get('cash_session_id')==cash.get('id') and o.get('status')=='pago']
        total=round(sum(o.get('total',0) for o in paid),2)
        if cash.get('sales_total') is not None and abs(total-cash['sales_total'])>.009:
            report('cash_sales_mismatch','P1','cash_sessions',cash,{'current_sales':total,'stored_sales':cash['sales_total']})
    return {'read_only':True,'automatic_repairs':False,'production_approved':False,
            'findings':findings,'counts':dict(Counter(f['severity'] for f in findings)),
            'limitations':['Ausência de alerta não comprova integridade histórica',
                           'Não cria marcadores nem infere movimentação por semelhança de valores']}
