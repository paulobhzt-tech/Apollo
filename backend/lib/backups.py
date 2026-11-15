"""Versioned, complete logical backups; credentials and ephemeral state excluded."""
import copy
import hashlib
import json
from datetime import datetime, timezone
from bson import json_util
from fastapi import HTTPException
from lib.transactions import run_transaction, RetrySnapshot

BACKUP_COLLS = [
    'employees','suppliers','categories','products','ingredients','stock_moves','tables','orders',
    'kitchen_tickets','invoices','cash_sessions','expenses','fiado_customers','customer_moves',
    'printers','settings','environments','counters','financial_operations','purchases','lot_consumptions',
    'bills','account_categories','payment_methods','inventory_counts','production_batches',
    'employee_time_entries','cron_runs',
]
EXCLUDED = {'sessions':'credentials/sessions','login_attempts':'transient security counters',
            'server_backups':'recursive archives','status_checks':'transient diagnostics'}
SECRET_SETTINGS = ['drive','selftest_last']


def digest(data):
    return hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()


def validate_references(data):
    """Reject incomplete confirmed operations; legacy uncertainty is audited separately."""
    orders={o.get('id'):o for o in data['orders']}
    markers={m.get('order_id'):m for m in data['financial_operations'] if m.get('kind')=='pdv_sale'}
    purchases={p.get('id') for p in data['purchases']}
    for marker in data['financial_operations']:
        if marker.get('order_id') and marker['order_id'] not in orders:
            raise HTTPException(422,'Marcador aponta para pedido ausente')
    for order in orders.values():
        if order.get('atomic_version')==1 and order.get('source')=='pdv' and order.get('id') not in markers:
            raise HTTPException(422,'Pedido transacional sem marcador; exige conciliação')
    for consumed in data['lot_consumptions']:
        if consumed.get('purchase_id') not in purchases:
            raise HTTPException(422,'Consumo de lote sem compra de origem')


async def export_backup(source):
    async def snapshot(session):
        raw={}
        for name in BACKUP_COLLS:
            projection={'pin_hash':0,'password_hash':0} if name=='employees' else None
            query={'_id':{'$nin':SECRET_SETTINGS}} if name=='settings' else {}
            raw[name]=await source[name].find(query,projection,session=session).to_list(None)
        try:
            validate_references(raw)
        except HTTPException as exc:
            # Fresh namespaces can require a newer catalog snapshot; bounded by unit runner.
            if 'marcador' in exc.detail.lower():
                raise RetrySnapshot() from exc
            raise
        data=json.loads(json_util.dumps(raw,json_options=json_util.RELAXED_JSON_OPTIONS))
        stamp=datetime.now(timezone.utc).isoformat()
        return stamp,{'app':'Apollo PDV','format_version':2,'created_at':stamp,'data':data,
            'manifest':{'collections':list(BACKUP_COLLS),'counts':{k:len(v) for k,v in data.items()},
                        'sha256':digest(data),'excluded':EXCLUDED,'codec':'bson-extended-json'}}
    return await run_transaction(snapshot,client=source.client)


def decode_backup(data,manifest,version):
    if version!=2 or not isinstance(manifest,dict):
        raise HTTPException(422,'Backup antigo ou parcial: use exportação integral versão 2')
    if set(data)!=set(BACKUP_COLLS) or set(manifest.get('collections',[]))!=set(BACKUP_COLLS):
        raise HTTPException(422,'Conjunto de coleções incompleto ou desconhecido')
    if manifest.get('sha256')!=digest(data) or manifest.get('counts')!={k:len(v) for k,v in data.items()}:
        raise HTTPException(422,'Manifesto, contagens ou checksum inválidos')
    if manifest.get('codec')!='bson-extended-json':
        raise HTTPException(422,'Codec de backup desconhecido')
    try:
        decoded=json_util.loads(json.dumps(data),json_options=json_util.JSONOptions(tz_aware=True))
    except (ValueError,TypeError) as exc:
        raise HTTPException(422,'BSON inválido') from exc
    for employee in decoded['employees']:
        if any(k in employee for k in ('pin_hash','password_hash','token','token_hash')):
            raise HTTPException(422,'Arquivo contém credenciais importadas')
    if any(d.get('_id') in SECRET_SETTINGS for d in decoded['settings']):
        raise HTTPException(422,'Arquivo contém configurações privadas de integração')
    validate_references(decoded)
    return decoded


def restore_employee(employee,local=None):
    document=copy.deepcopy(employee)
    for key in ('pin_hash','password_hash','token','token_hash'):
        document.pop(key,None)
    if local:
        # Security identity remains local, including permissions and login name.
        for key in ('pin_hash','password_hash','username','role','active','can_cancel','must_change_password'):
            document.pop(key,None)
            if key in local:
                document[key]=local[key]
    else:
        document['active']=False
    return document


async def restore_empty(target,data,manifest,version,me=None):
    decoded=decode_backup(data,manifest,version)
    async def restore(session):
        # Insert-only recovery; never delete or replace existing business data.
        for name in BACKUP_COLLS:
            query=({'id':{'$ne':me['id']}} if name=='employees' and me else
                   {'_id':{'$nin':SECRET_SETTINGS}} if name=='settings' else {})
            if await target[name].find_one(query,session=session):
                raise HTTPException(409,'Destino contém dados; restaure em banco novo e isolado')
        local=(await target.employees.find_one({'id':me['id']},session=session)) if me else None
        counts={}
        for name,documents in decoded.items():
            documents=copy.deepcopy(documents)
            if name=='employees':
                for document in documents:
                    same=local if local and document.get('id')==local.get('id') else None
                    restored=restore_employee(document,same)
                    if same:
                        restored['_id']=same['_id']
                        await target.employees.replace_one({'_id':same['_id']},restored,session=session)
                    else:
                        await target.employees.insert_one(restored,session=session)
            elif documents:
                await target[name].insert_many(documents,session=session)
            counts[name]=len(documents)
        return counts
    return await run_transaction(restore,client=target.client)
