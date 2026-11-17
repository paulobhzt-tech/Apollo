import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from lib.homologation import validate, install_egress_guard, verify_database, HomologationMiddleware
_p10_settings = validate()
if _p10_settings:
    install_egress_guard(_p10_settings)

# MongoDB connection
from lib.db import client, db, ensure_indexes  # noqa: E402
from lib.csrf import CsrfOriginMiddleware  # noqa: E402
from routers import auth, catalog, config, drive, fiado, finance, operations, production, public, reports, serverbackup, system, tables  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    await verify_database(db, client)
    app.state.index_task = asyncio.create_task(ensure_indexes())
    await production.ensure_environments()
    await finance.ensure_finance_defaults()
    yield
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()


app = FastAPI(lifespan=lifespan)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_error(_request, exc):
    # FastAPI's default 422 includes the rejected input (password/PIN included).
    return JSONResponse({'detail': [{'loc': list(error['loc']), 'msg': error['msg'],
        'type': error['type']} for error in exc.errors()]}, status_code=422)

api_router = APIRouter(prefix="/api")


@api_router.get("/demo-status")
async def demo_status():
    return {"demo": os.environ.get("APOLLO_DEMO_MODE") == "true", "homologation": bool(_p10_settings)}


@api_router.get("/")
async def root():
    return {"message": "Apollo PDV API"}


@api_router.get("/health/ready")
async def readiness():
    from fastapi.responses import JSONResponse
    from lib.health import inspect_ready
    ready = await inspect_ready(db, client)
    return JSONResponse({"ready": ready}, status_code=200 if ready else 503)


for r in (auth, catalog, tables, operations, reports, public, fiado, config, production, drive, system, finance, serverbackup):
    api_router.include_router(r.router)

app.add_middleware(CsrfOriginMiddleware)
app.add_middleware(HomologationMiddleware)

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

    _frontend_root = Path(_web).resolve()

    def _frontend_file(path: str) -> Path:
        # Resolve symlinks before checking ancestry; string prefixes also match
        # siblings such as "build-private" and must not be used for containment.
        try:
            # Hidden build artifacts must never be served or receive SPA fallback.
            # Check both the request and resolved target to cover symlink aliases.
            if any(part.startswith(".") for part in Path(path).parts):
                raise ValueError("Hidden path")
            candidate = (_frontend_root / path).resolve()
            relative = candidate.relative_to(_frontend_root)
            if any(part.startswith(".") for part in relative.parts):
                raise ValueError("Hidden target")
        except (ValueError, OSError, RuntimeError):
            raise HTTPException(status_code=404, detail="Not found") from None
        return candidate

    @app.get("/{path:path}", include_in_schema=False)
    async def _spa(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        f = _frontend_file(path)
        if f.is_file():
            return FileResponse(f)
        index = _frontend_file("index.html")
        if not index.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(index)
