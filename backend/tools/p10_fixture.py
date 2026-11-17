"""Fictional P10 test fixture. Loopback replica and p10 test prefix only."""
import os, sys, json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from datetime import datetime, timezone, timedelta
import bcrypt
from pymongo import MongoClient
from lib.db import INDEXES
from models.schemas import Employee, Category, Ingredient, Product, FiadoCustomer
url=os.environ['MONGO_URL']; name=os.environ['DB_NAME']
assert url.startswith('mongodb://127.0.0.1:27030/') and name.startswith('apollo_p10_test_')
client=MongoClient(url,tz_aware=True); db=client[name]
mode=sys.argv[1]
if mode=='reset':
    for collection in db.list_collection_names():
        db[collection].delete_many({'_id':{'$ne':'p10-isolation'}} if collection=='settings' else {})
    for collection,indexes in INDEXES.items():db[collection].create_indexes(indexes)
    password=bcrypt.hashpw(b'Synthetic-P10-Test-Only!',bcrypt.gensalt(rounds=12)).decode()
    for role,pin in [('admin','739251'),('caixa','739252'),('garcom','739253'),('cozinha','739254')]:
        employee=Employee(id='p10-'+role,name='Fictício '+role,role=role,can_cancel=role=='admin').model_dump()
        db.employees.insert_one({**employee,'username':'p10-'+role,'password_hash':password,
                                  'pin_hash':bcrypt.hashpw(pin.encode(),bcrypt.gensalt(rounds=12)).decode()})
    db.categories.insert_one(Category(id='p10-cat',name='Categoria fictícia P10').model_dump())
    db.ingredients.insert_one(Ingredient(id='p10-ing',name='Insumo fictício P10',unit='un',stock=1000,cost_per_unit=2).model_dump())
    db.products.insert_one(Product(id='p10-product',code='P10',name='Produto fictício P10',category_id='p10-cat',price=10,
        recipe=[{'ingredient_id':'p10-ing','qty':1}]).model_dump())
    db.fiado_customers.insert_one(FiadoCustomer(id='p10-customer',name='Cliente fictício P10',credit_limit=100).model_dump())
    db.purchases.insert_one({'id':'p10-lot','ingredient_id':'p10-ing','remaining_qty':1000,'expiry_date':'2099-12-31',
        'lot_number':'P10','created_at':datetime.now(timezone.utc)})
    import asyncio
    from routers.finance import ensure_finance_defaults
    from routers.production import ensure_environments
    async def defaults():
        await ensure_finance_defaults();await ensure_environments()
    asyncio.run(defaults())
elif mode=='snapshot':
    fields={'_id':0,'id':1,'number':1,'client_ref':1,'status':1,'total':1,'payments':1,'refunds':1,'cash_session_id':1}
    print(json.dumps({'orders':list(db.orders.find({},fields)),
        'stock':db.ingredients.find_one({'id':'p10-ing'})['stock'],
        'lot':db.purchases.find_one({'id':'p10-lot'})['remaining_qty'],
        'markers':db.financial_operations.count_documents({'kind':'pdv_sale'}),
        'duplicate_refs':len(list(db.orders.aggregate([{'$match':{'client_ref':{'$type':'string'}}},{'$group':{'_id':'$client_ref','n':{'$sum':1}}},{'$match':{'n':{'$gt':1}}}]))),
        'duplicate_numbers':len(list(db.orders.aggregate([{'$group':{'_id':'$number','n':{'$sum':1}}},{'$match':{'n':{'$gt':1}}}]))),
        'stock_moves':list(db.stock_moves.find({},{'_id':0})),
        'tickets':db.kitchen_tickets.count_documents({}),
        'fiado_balance':db.fiado_customers.find_one({'id':'p10-customer'})['balance'],
        'cash':list(db.cash_sessions.find({},{'_id':0}))},default=str))
elif mode=='expire':db.sessions.update_many({},{'$set':{'expires_at':datetime.now(timezone.utc)-timedelta(seconds=1)}})
elif mode=='unknown-commit':client.admin.command({'configureFailPoint':'failCommand','mode':{'times':1},'data':{'failCommands':['commitTransaction'],'errorCode':64,'errorLabels':['UnknownTransactionCommitResult']}})
elif mode=='fail-insert':client.admin.command({'configureFailPoint':'failCommand','mode':{'times':1},'data':{'failCommands':['insert'],'errorCode':121}})
elif mode=='clear-failpoint':client.admin.command({'configureFailPoint':'failCommand','mode':'off'})
else:raise ValueError('Unknown fixture mode')
client.close()
