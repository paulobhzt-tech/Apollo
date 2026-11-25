"""Pre-scaffolded pytest fixtures for the FastAPI backend.

Tests hit the live uvicorn process managed by supervisor (not an in-process ASGI app), so
the app under test is the same one the frontend and Playwright see. Do NOT re-create this
file — add app-specific fixtures below the marker at the bottom.
"""

import os
import ssl
from urllib.parse import urlsplit

import httpx
import pytest
import pytest_asyncio

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API_URL = f"{BACKEND_URL}/api"


def api_url(path: str = "") -> str:
    """Absolute URL for an /api route: api_url("/status") -> http://localhost:8001/api/status."""
    return f"{API_URL}{path}"


@pytest.fixture(scope="session")
def backend_url() -> str:
    return BACKEND_URL


@pytest.fixture
def client():
    """Sync httpx client rooted at /api — the default for endpoint tests.

    Example:
        def test_status(client):
            assert client.get("/status").status_code == 200
    """
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def aclient():
    """Async variant, for tests that also await motor/backend helpers directly."""
    async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as c:
        yield c


# --- app-specific fixtures below this line ---

def seeded_operator_client(username: str) -> httpx.Client:
    url = urlsplit(BACKEND_URL)
    assert url.hostname in ("127.0.0.1", "localhost", "::1")
    assert os.environ.get("DB_NAME", "").startswith("apollo_p40_browser_")
    ca = os.environ.get("APOLLO_TEST_CA_PATH")
    verify = ssl.create_default_context(cafile=ca) if ca else True
    client = httpx.Client(base_url=API_URL, verify=verify, timeout=30,
                          headers={"Origin": f"{url.scheme}://{url.netloc}"})
    try:
        response = client.post("/auth/login", json={"username": username, "password": "P40-Fictitious-Password!"})
        assert response.status_code == 200, response.text
        return client
    except BaseException:
        client.close()
        raise
