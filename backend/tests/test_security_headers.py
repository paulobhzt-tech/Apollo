"""Verify security headers on HTTP and HTTPS requests."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from lib.security_headers import SecurityHeadersMiddleware


@pytest.mark.asyncio
@pytest.mark.parametrize("base_url,secure", [
    ("http://localhost", False),
    ("https://example.com", True),
])
async def test_security_headers(base_url, secure):
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/health")
    async def health():
        return {"ok": True}

    async with AsyncClient(transport=ASGITransport(app=app), base_url=base_url) as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cross-origin-resource-policy"] == "same-origin"
    assert ("strict-transport-security" in response.headers) is secure
