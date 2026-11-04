"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url, tz_aware=True)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)


def _id_idx() -> IndexModel:
    return IndexModel([("id", ASCENDING)], name="id", unique=True)


# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "employees": [_id_idx(), IndexModel([("pin_hash", ASCENDING)], name="pin_hash")],
    "sessions": [IndexModel([("token", ASCENDING)], name="token", unique=True),
                 IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0)],
    "categories": [_id_idx()],
    "products": [_id_idx(), IndexModel([("category_id", ASCENDING)], name="category")],
    "ingredients": [_id_idx()],
    "stock_moves": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "tables": [_id_idx(), IndexModel([("kind", ASCENDING), ("number", ASCENDING)], name="kind_number", unique=True)],
    "orders": [_id_idx(), IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
               IndexModel([("paid_at", DESCENDING)], name="paid_at"),
               IndexModel([("channel", ASCENDING), ("created_at", DESCENDING)], name="channel_created"),
               IndexModel([("cash_session_id", ASCENDING)], name="cash_session"),
               IndexModel([("client_ref", ASCENDING)], name="client_ref", unique=True,
                          partialFilterExpression={"client_ref": {"$type": "string"}})],
    "kitchen_tickets": [_id_idx(), IndexModel([("status", ASCENDING), ("created_at", ASCENDING)], name="status_created")],
    "invoices": [_id_idx(), IndexModel([("emitted_at", DESCENDING)], name="emitted_desc")],
    "cash_sessions": [_id_idx(), IndexModel([("status", ASCENDING)], name="status")],
    "fiado_customers": [_id_idx()],
    "customer_moves": [IndexModel([("customer_id", ASCENDING), ("at", DESCENDING)], name="customer_at"),
                       IndexModel([("cash_session_id", ASCENDING)], name="cash_session")],
    "expenses": [_id_idx(), IndexModel([("date", DESCENDING)], name="date_desc")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
