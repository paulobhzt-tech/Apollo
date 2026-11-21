"""P45 real HTTP acceptance: fixed loopback server and fictitious CI database only."""
import concurrent.futures as futures
import json, os, ssl, time, uuid
from pathlib import Path
import httpx
from pymongo import MongoClient
assert os.environ["DB_NAME"] == "apollo_p40_browser_fictitious"
assert os.environ["MONGO_URL"].startswith("mongodb://127.0.0.1:")
db=MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
base="https://127.0.0.1:8001"
tls=ssl.create_default_context(cafile="/tmp/apollo-p41-tls/apollo-local-ca.crt")
clients=[]
def connect(name):
    c=httpx.Client(base_url=base,verify=tls,headers={"Origin":base},timeout=60)
    c.post("/api/auth/login",json={"username":name,"password":"P40-Fictitious-Password!"}).raise_for_status()
    clients.append(c)
    return c
def call(c,path,payload=None):
    r=c.get("/api"+path) if payload is None else c.post("/api"+path,json=payload)
    assert r.is_success,(r.status_code,r.text)
    return r.json()
prefix="p45-"+uuid.uuid4().hex
try:
    a,b,w=connect("p40caixa1"),connect("p40caixa2"),connect("p40garcom")
    with futures.ThreadPoolExecutor(2) as pool:
        ca,cb=list(pool.map(lambda row:call(*row),[(a,"/cash/open",{"opening_amount":100}),(b,"/cash/open",{"opening_amount":50})]))
    assert ca["id"]!=cb["id"]
    assert ca["opened_by_id"]=="p40caixa1" and cb["opened_by_id"]=="p40caixa2"
    before=db.ingredients.find_one({"id":"p40ing"})["stock"]
    def sale(i):
        c=a if i%2==0 else b
        payload={"client_ref":prefix+"-sale-"+str(i//2)+"-"+str(i%2),
            "items":[{"product_id":"p40product","qty":1}],
            "payments":[{"method":"dinheiro","amount":8},{"method":"pix","amount":4}],
            "emit_invoice":False,"send_to_kitchen":False}
        result=call(c,"/pdv/sale",payload)
        assert result["order"]["change"]==2
        assert result["order"]["cash_session_id"]==(ca if i%2==0 else cb)["id"]
        replay=call(c,"/pdv/sale",payload)
        assert replay["order"]["id"]==result["order"]["id"]
        return result["order"]["id"]
    table=call(a,"/tables",{"number":9750})
    table=call(w,"/tables/"+table["id"]+"/open",{"people":2,"customer_name":"P45 ficticio"})
    def waiter():
        return call(w,"/tables/"+table["id"]+"/items",{"order_id":table["order_id"],
            "client_ref":prefix+"-waiter","items":[{"product_id":"p40product","qty":1}]})
    with futures.ThreadPoolExecutor(11) as pool:
        jobs=[pool.submit(sale,i) for i in range(10)]
        waiter_job=pool.submit(waiter)
        ids=[job.result() for job in jobs]
        waiter_job.result()
    assert len(set(ids))==10
    # Reconnection replay uses the same reference and cannot deduct stock twice.
    assert db.orders.count_documents({"client_ref":{"$regex":"^"+prefix+"-sale-"}})==10
    call(b,"/tables/"+table["id"]+"/pay",{"payments":[{"method":"credito","brand":"visa","amount":10}],"emit_invoice":False})
    for c,cash,supply,withdraw in [(a,ca,20,10),(b,cb,15,5)]:
        call(c,"/cash/movement",{"type":"suprimento","amount":supply,"note":"P45 ficticio","expected_session_id":cash["id"],"client_ref":prefix+"-"+cash["id"]+"-supply"})
        call(c,"/cash/movement",{"type":"sangria","amount":withdraw,"note":"P45 ficticio","expected_session_id":cash["id"],"client_ref":prefix+"-"+cash["id"]+"-withdraw"})
    cross=a.post("/api/cash/movement",json={"type":"suprimento","amount":1,"note":"P45 must reject","expected_session_id":cb["id"],"client_ref":prefix+"-cross"})
    assert cross.status_code==409,cross.text
    sa,sb=call(a,"/cash/current"),call(b,"/cash/current")
    assert sa["expected_cash"]==140 and sb["expected_cash"]==90,(sa,sb)
    assert sa["totals_by_method"]=={"dinheiro":30,"pix":20},sa
    assert sb["totals_by_method"]=={"dinheiro":30,"pix":20,"credito:visa":10},sb
    assert db.ingredients.find_one({"id":"p40ing"})["stock"]==before-11
    assert len(sa["movements"])==len(sb["movements"])==2
    closed_a=call(a,"/cash/close",{"counted_amount":140,"expected_session_id":ca["id"]})
    assert call(b,"/cash/current")["id"]==cb["id"]
    closed_b=call(b,"/cash/close",{"counted_amount":90,"expected_session_id":cb["id"]})
    assert closed_a["difference"]==closed_b["difference"]==0
    ha,hb=call(a,"/cash/history"),call(b,"/cash/history")
    assert all(x["opened_by_id"]=="p40caixa1" for x in ha)
    assert all(x["opened_by_id"]=="p40caixa2" for x in hb)
    result={"unique_sales":10,"sale_replays":10,"waiter_orders":1,"stock_delta":11,
        "cash_a":{"id":ca["id"],"expected":140,"difference":closed_a["difference"]},
        "cash_b":{"id":cb["id"],"expected":90,"difference":closed_b["difference"]},
        "cross_register_movement_status":cross.status_code,"mode":"operator","physical_devices":False}
    Path("evidence/p45-two-cashiers.json").write_text(json.dumps(result,indent=2))
    print(json.dumps(result),flush=True)
finally:
    for c in clients:
        c.close()
