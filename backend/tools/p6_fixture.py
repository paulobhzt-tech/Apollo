"""Local disposable fixture/snapshot commands. Never exposed as HTTP routes."""
import os, sys, json, hashlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from datetime import datetime, timezone, timedelta
import bcrypt
from pymongo import MongoClient
from lib.db import INDEXES
from models.schemas import Employee, Category, Product, Ingredient, FiadoCustomer
url = os.environ['MONGO_URL']
name = os.environ.get('P6_DB_NAME', 'apollo_p6_web')
assert url.startswith('mongodb://127.0.0.1:') and name.startswith('apollo_p6_'), 'Disposable loopback only'
client=MongoClient(url, tz_aware=True)
db=client[name]
mode=sys.argv[1]
if mode == 'reset':
    for collection in db.list_collection_names(): db[collection].delete_many({})
    for collection, models in INDEXES.items(): db[collection].create_indexes(models)
    password=bcrypt.hashpw(b'Synthetic-P6-Test-Only!',bcrypt.gensalt(rounds=4)).decode()
    for role in ('admin','caixa','garcom','cozinha'):
        emp=Employee(id='p6-'+role,name='Fictício '+role,role=role,can_cancel=role=='admin').model_dump()
        db.employees.insert_one({**emp,'username':'p6-'+role,'password_hash':password})
    db.categories.insert_one(Category(id='p6-cat',name='Categoria fictícia').model_dump())
    db.ingredients.insert_one(Ingredient(id='p6-ing',name='Insumo fictício',unit='un',stock=1000,cost_per_unit=2).model_dump())
    db.products.insert_one(Product(id='p6-product',code='P6',name='Produto fictício P6',category_id='p6-cat',price=10,recipe=[{'ingredient_id':'p6-ing','qty':1}]).model_dump())
    db.fiado_customers.insert_one(FiadoCustomer(id='p6-customer',name='Cliente fictício P6',credit_limit=100).model_dump())
    import asyncio
    from routers.finance import ensure_finance_defaults
    from routers.production import ensure_environments
    async def defaults():
        await ensure_finance_defaults()
        await ensure_environments()
    asyncio.run(defaults())
    db.purchases.insert_one({'id':'p6-lot','ingredient_id':'p6-ing','remaining_qty':1000,'expiry_date':'2099-12-31','lot_number':'P6','created_at':datetime.now(timezone.utc)})
elif mode == 'printer':
    from models.schemas import Printer
    db.printers.insert_one(Printer(id='p6-printer',name='Impressora fictícia',purpose='cozinha').model_dump())
elif mode == 'snapshot':
    orders=list(db.orders.find({}, {'_id':0,'id':1,'client_ref':1,'status':1,'total':1,'discount':1,'payments':1,'waiter_id':1}))
    print(json.dumps({'orders':orders,'stock':db.ingredients.find_one({'id':'p6-ing'})['stock'],
       'lot':db.purchases.find_one({'id':'p6-lot'})['remaining_qty'],
       'markers':db.financial_operations.count_documents({'kind':'pdv_sale'}),
       'stock_sales':db.stock_moves.count_documents({'type':'venda'}),
       'tickets':db.kitchen_tickets.count_documents({}),
       'ticket_printed':[t.get('printed',[]) for t in db.kitchen_tickets.find({})],
       'fiado_balance':db.fiado_customers.find_one({'id':'p6-customer'})['balance'],
       'customer_moves':db.customer_moves.count_documents({}),
       'cash':list(db.cash_sessions.find({}, {'_id':0}))},default=str))
elif mode == 'expire': db.sessions.update_many({}, {'$set':{'expires_at':datetime.now(timezone.utc)-timedelta(hours=1)}})
elif mode == 'fail-insert': client.admin.command({'configureFailPoint':'failCommand','mode':{'times':1},'data':{'failCommands':['insert'],'errorCode':121}})
elif mode == 'unknown-commit': client.admin.command({'configureFailPoint':'failCommand','mode':{'times':1},'data':{'failCommands':['commitTransaction'],'errorCode':64,'errorLabels':['UnknownTransactionCommitResult']}})
elif mode == 'clear-failpoint': client.admin.command({'configureFailPoint':'failCommand','mode':'off'})
else: raise ValueError(mode)
client.close()
