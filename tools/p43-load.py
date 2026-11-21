"""P43: 50 authenticated HTTP sessions, 30s sustained reads and 50 concurrent financial requests.
Only the fixed fictitious CI database and loopback TLS server are allowed.
"""
import concurrent.futures as futures
import json, os, ssl, time
from pathlib import Path
import httpx
from pymongo import MongoClient

assert os.environ["DB_NAME"] == "apollo_p40_browser_fictitious"
assert os.environ["MONGO_URL"].startswith("mongodb://127.0.0.1:")
base="https://127.0.0.1:8001"
db=MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
template=db.employees.find_one({"id":"p40admin"})
assert template and template["username"]=="p40admin"
for i in range(50):
    user={k:v for k,v in template.items() if k!="_id"}
    user.update(id=f"p43load{i}",username=f"p43load{i}",name=f"Fictitious load {i}")
    db.employees.insert_one(user)
tls=ssl.create_default_context(cafile="/tmp/apollo-p41-tls/apollo-local-ca.crt")
def connect(i):
    client=httpx.Client(base_url=base,verify=tls,headers={"Origin":base},timeout=30)
    r=client.post("/api/auth/login",json={"username":f"p43load{i}","password":"P40-Fictitious-Password!"})
    r.raise_for_status()
    return client
def post(c,path,data):
    r=c.post("/api"+path,json=data)
    r.raise_for_status()
    return r.json()
clients=[]
try:
    with futures.ThreadPoolExecutor(max_workers=10) as pool:
        clients=list(pool.map(connect,range(50)))
    cash=post(clients[0],"/cash/open",{"opening_amount":0,"note":"P43 50-session fictitious load"})
    deadline=time.monotonic()+30
    def reader(i):
        durations=[]
        failures=[]
        while time.monotonic()<deadline:
            start=time.monotonic()
            try:
                r=clients[i].get("/api/tables" if len(durations)%2 else "/api/products")
                r.raise_for_status()
            except Exception as exc:
                failures.append(str(exc))
            durations.append(time.monotonic()-start)
            time.sleep(.1)
        return durations,failures
    with futures.ThreadPoolExecutor(max_workers=50) as pool:
        results=list(pool.map(reader,range(50)))
    durations=sorted(x for times,_ in results for x in times)
    errors=[x for _,errors in results for x in errors]
    read={"sessions":50,"duration_seconds":30,"requests":len(durations),
          "p95_seconds":durations[int(.95*(len(durations)-1))],"max_seconds":max(durations),"errors":errors}
    Path("evidence/p43-sustained-load.json").write_text(json.dumps(read,indent=2))
    print(json.dumps(read),flush=True)
    assert not errors and read["p95_seconds"]<=2,read
    stock=db.ingredients.find_one({"id":"p40ing"})["stock"]
    def sale(i):
        payload={"client_ref":f"p43-financial-{i//2}","items":[{"product_id":"p40product","qty":1}],
                 "payments":[{"method":"dinheiro","amount":5},{"method":"pix","amount":5}],
                 "emit_invoice":False,"send_to_kitchen":False}
        return post(clients[0],"/pdv/sale",payload)["order"]["id"]
    # Distinct connections with the SAME authenticated operator: duplicate pairs must
    # return the same sale. A shared Client is thread safe and its pool has 100 slots.
    with futures.ThreadPoolExecutor(max_workers=50) as pool:
        orders=list(pool.map(sale,range(50)))
    assert len(set(orders))==25,orders
    for i in range(25):
        assert orders[2*i]==orders[2*i+1]
        assert db.orders.count_documents({"client_ref":f"p43-financial-{i}"})==1
    after=db.ingredients.find_one({"id":"p40ing"})["stock"]
    assert after==stock-25,(stock,after)
    summary=clients[0].get("/api/cash/current").json()
    assert summary["expected_cash"]==125,summary
    closed=post(clients[0],"/cash/close",{"expected_session_id":cash["id"],"counted_amount":125,"note":"P43 financial reconciliation"})
    assert closed["difference"]==0,closed
    result={"concurrent_requests":50,"unique_sales":25,"stock_before":stock,"stock_after":after,
            "cash_expected":125,"cash_difference":closed["difference"],"order_ids":orders}
    Path("evidence/p43-financial-load.json").write_text(json.dumps(result,indent=2))
    print(json.dumps(result),flush=True)
finally:
    for client in clients: client.close()
