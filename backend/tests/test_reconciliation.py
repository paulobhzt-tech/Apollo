import copy
from lib.reconciliation import audit

def test_reconciliation_is_read_only_and_does_not_certify_legacy_paid_order():
    data={'orders':[{'id':'legacy','status':'pago','total':10,'payments':[{'amount':10}]}],
          'fiado_customers':[{'id':'customer','balance':25}],
          'lot_consumptions':[{'id':'lot-move','purchase_id':'missing','qty':1,'restored_qty':2}],
          'financial_operations':[{'_id':'orphan','order_id':'missing'}]}
    before=copy.deepcopy(data)
    result=audit(data)
    assert data==before
    assert result['read_only'] and not result['automatic_repairs'] and not result['production_approved']
    rules={f['rule'] for f in result['findings']}
    assert {'legacy_unverified','balance_unreconciled','excess_lot_return','orphan_marker','orphan_lot'}<=rules
    assert all(f['evidence_sha256'] for f in result['findings'])

def test_duplicates_and_payment_mismatch_are_separate_evidence():
    result=audit({'orders':[{'id':'paid','status':'pago','total':10,'payments':[]}],
        'customer_moves':[{'id':'dup','customer_id':'absent','amount':10,'type':'pagamento'},
                          {'id':'dup','customer_id':'absent','amount':10,'type':'pagamento'}]})
    rules={f['rule'] for f in result['findings']}
    assert {'duplicate_id','orphan_customer_move','payment_mismatch'}<=rules
