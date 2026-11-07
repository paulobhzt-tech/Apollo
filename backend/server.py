import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes  # noqa: E402
from lib.csrf import CsrfOriginMiddleware  # noqa: E402
from routers import assistant, assistant_openai, auth, catalog, config, drive, fiado, finance, operations, production, public, reports, serverbackup, system, tables  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())
    await production.ensure_environments()
    await finance.ensure_finance_defaults()
    yield
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()


app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")


@api_router.get("/demo-status")
async def demo_status():
    return {"demo": os.environ.get("APOLLO_DEMO_MODE") == "true"}


@api_router.get("/")
async def root():
    return {"message": "Apollo PDV API"}


for r in (assistant, assistant_openai, auth, catalog, tables, operations, reports, public, fiado, config, production, drive, system, finance, serverbackup):
    api_router.include_router(r.router)

app.add_middleware(CsrfOriginMiddleware)

# Do not use wildcard origins with credentialed CORS.
_allowed_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip() and o.strip() != '*']
app.add_middleware(
    CORSMiddleware,
    allow_credentials=bool(_allowed_origins),
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
_ = db

# Include the router in the main app — must stay last
app.include_router(api_router)

# Local store server (Windows, IP fixo): optionally serve the built screens from the same address.
# Unset in the cloud/preview, where the frontend is served separately.
_web = os.environ.get("SERVE_FRONTEND_DIR")
if _web and os.path.isdir(_web):
    from fastapi.responses import FileResponse

    @app.get("/{path:path}", include_in_schema=False)
    async def _spa(path: str):
        f = os.path.realpath(os.path.join(_web, path))
        if f.startswith(os.path.realpath(_web)) and os.path.isfile(f):
            return FileResponse(f)
        return FileResponse(os.path.join(_web, "index.html"))
