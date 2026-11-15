"""Readiness is stronger than an HTTP process being alive; no secret details."""
async def inspect_ready(db,client):
    try:
        hello=await client.admin.command('hello')
        if not hello.get('setName') or not hello.get('isWritablePrimary'):
            return False
        required={'orders':('id','client_ref'),'cash_sessions':('single_open_cash',)}
        for collection,names in required.items():
            indexes=await db[collection].index_information()
            if any(not indexes.get(name,{}).get('unique') for name in names):return False
        return True
    except Exception:
        return False
