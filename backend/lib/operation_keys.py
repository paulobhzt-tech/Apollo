"""Optional request identities for compatible clients; MongoDB, never memory locks."""
import hashlib
import json
from fastapi import HTTPException
from lib.transactions import run_transaction

async def execute(db,kind,reference,payload,callback):
    request_hash=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':'),default=str).encode()).hexdigest()
    key=kind+':'+hashlib.sha256(reference.encode()).hexdigest() if reference else None
    async def apply(session):
        if key:
            previous=await db.financial_operations.find_one({'_id':key},session=session)
            if previous:
                if previous.get('request_hash')!=request_hash:
                    raise HTTPException(409,'Referência reutilizada com conteúdo diferente')
                return previous['response']
            await db.financial_operations.insert_one({'_id':key,'kind':kind,'request_hash':request_hash},session=session)
        result=await callback(session)
        if key:
            await db.financial_operations.update_one({'_id':key},{'$set':{'response':result}},session=session)
        return result
    try:
        return await run_transaction(apply,client=db.client)
    except HTTPException as exc:
        if exc.status_code!=503 or not key:
            raise
        async def confirmed(session):
            previous=await db.financial_operations.find_one({'_id':key},session=session)
            if previous and previous.get('request_hash')==request_hash and 'response' in previous:
                return previous['response']
        result=await run_transaction(confirmed,client=db.client)
        if result is not None:
            return result
        raise exc
