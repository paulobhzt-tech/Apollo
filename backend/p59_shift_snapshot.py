"""Read a deterministic post-acceptance snapshot from the disposable shift only."""
import json
import os

from pymongo import MongoClient

name = os.environ["DB_NAME"]
uri = os.environ["MONGO_URL"]
if name != "apollo_p40_browser_p58_integrated" or uri != "mongodb://127.0.0.1:27017/?replicaSet=rs0":
    raise SystemExit("P59 snapshot requires the disposable loopback shift database")

with MongoClient(uri, serverSelectionTimeoutMS=3000) as client:
    db = client[name]
    snapshot = {
        "paid_sales": db.orders.count_documents({"client_ref": {"$regex": "^p58-"}, "status": "pago"}),
        "cancelled_lot_sale": db.orders.count_documents({"client_ref": {"$regex": "-lot-20$"}, "status": "cancelado"}),
        "closed_sessions": db.cash_sessions.count_documents({"status": "fechado", "difference": 0}),
        "stock": {
            row["id"]: row["stock"]
            for row in db.ingredients.find({"id": {"$in": ["p40ing", "p41ingdrink"]}}, {"_id": 0, "id": 1, "stock": 1})
        },
        "lot": db.purchases.find_one({"id": "p40lot"}, {"remaining_qty": 1})["remaining_qty"],
    }

expected = {
    "paid_sales": 25,
    "cancelled_lot_sale": 1,
    "closed_sessions": 3,
    "stock": {"p40ing": 74, "p41ingdrink": 99},
    "lot": 74,
}
if snapshot != expected:
    raise SystemExit(f"Unexpected disposable reconciliation: {snapshot!r}")
print(json.dumps(snapshot, sort_keys=True))
