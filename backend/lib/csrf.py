"""Origin verification for cookie-authenticated state-changing API requests."""
from urllib.parse import urlsplit

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def origin_allowed(origin: str | None, host: str, fetch_site: str | None) -> bool:
    """Do not trust same-site sibling hosts; only same-origin is acceptable."""
    if origin:
        if origin == "null":
            return False
        try:
            parsed = urlsplit(origin)
            return (
                parsed.scheme in ("http", "https")
                and parsed.netloc.lower() == host.lower()
                and not parsed.username
                and not parsed.password
                and parsed.path in ("", "/")
                and not parsed.query
                and not parsed.fragment
            )
        except ValueError:
            return False
    # Older clients without Origin may use Fetch Metadata; fail closed for
    # browser cookie requests without either signal.
    return fetch_site in ("same-origin", "none")


class CsrfOriginMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method in MUTATING and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            site = request.headers.get("sec-fetch-site")
            host = request.headers.get("host", "")
            has_session = bool(request.cookies.get("pdv_session"))
            # Login endpoints also reject explicitly hostile Origins.
            if (has_session or origin is not None) and not origin_allowed(origin, host, site):
                return JSONResponse(
                    {"detail": "Origem não autorizada para esta operação"},
                    status_code=403,
                )
        return await call_next(request)
