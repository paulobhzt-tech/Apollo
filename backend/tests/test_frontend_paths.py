"""Exercise the real SPA route without MongoDB or application router dependencies."""

import importlib.util
import sys
import types
from pathlib import Path

import httpx
import pytest
from fastapi import APIRouter


@pytest.fixture
def frontend(tmp_path, monkeypatch):
    root = tmp_path / "build"
    root.mkdir()
    (root / "index.html").write_text("SPA index", encoding="utf-8")
    (root / "assets").mkdir()
    (root / "assets" / "app.js").write_text("safe asset", encoding="utf-8")
    sibling = tmp_path / "build-private"
    sibling.mkdir()
    (sibling / "secret.txt").write_text("outside secret", encoding="utf-8")
    monkeypatch.setenv("SERVE_FRONTEND_DIR", str(root))

    # Import server.py itself, replacing only unrelated database/router imports.
    database = types.ModuleType("lib.db")
    database.client = database.db = database.ensure_indexes = None
    monkeypatch.setitem(sys.modules, "lib.db", database)
    routers = types.ModuleType("routers")
    for name in (
        "auth", "catalog", "config", "drive", "fiado", "finance", "operations",
        "production", "public", "reports", "serverbackup", "system", "tables",
    ):
        setattr(routers, name, types.SimpleNamespace(router=APIRouter()))
    monkeypatch.setitem(sys.modules, "routers", routers)
    spec = importlib.util.spec_from_file_location(
        "frontend_server_under_test", Path(__file__).parents[1] / "server.py"
    )
    server = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(server)
    return root, sibling, server


async def request(server, path):
    # ASGITransport avoids startup/database work; encoded dots survive URL normalization.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        return await client.get(path)


@pytest.mark.parametrize("path,content", [
    ("/", "SPA index"),
    ("/assets/app.js", "safe asset"),
    ("/orders/42", "SPA index"),
    ("/assets/missing.js", "SPA index"),
])
async def test_normal_frontend_requests(frontend, path, content):
    _, _, server = frontend
    response = await request(server, path)
    assert response.status_code == 200
    assert response.text == content


@pytest.mark.parametrize("path", [
    "/%2e%2e/build-private/secret.txt",
    "/%2e%2e%2fbuild-private%2fsecret.txt",
    "/%2e%2e/outside.txt",
])
async def test_traversal_is_rejected(frontend, path):
    root, _, server = frontend
    (root.parent / "outside.txt").write_text("outside secret", encoding="utf-8")
    response = await request(server, path)
    assert response.status_code == 404
    assert "outside secret" not in response.text


async def test_absolute_path_is_rejected(frontend):
    _, sibling, server = frontend
    response = await request(server, "/%2F" + str(sibling / "secret.txt").lstrip("/"))
    assert response.status_code == 404


@pytest.mark.parametrize("directory", [False, True])
async def test_external_symlink_is_rejected(frontend, directory):
    root, sibling, server = frontend
    target = sibling if directory else sibling / "secret.txt"
    (root / "escape").symlink_to(target, target_is_directory=directory)
    path = "/escape/secret.txt" if directory else "/escape"
    response = await request(server, path)
    assert response.status_code == 404
    assert "outside secret" not in response.text


async def test_internal_symlink_is_served(frontend):
    root, _, server = frontend
    (root / "alias.js").symlink_to(root / "assets" / "app.js")
    response = await request(server, "/alias.js")
    assert response.status_code == 200
    assert response.text == "safe asset"


@pytest.mark.parametrize("path", ["/", "/orders/42", "/index.html"])
async def test_external_index_symlink_is_rejected(frontend, path):
    root, sibling, server = frontend
    (root / "index.html").unlink()
    (root / "index.html").symlink_to(sibling / "secret.txt")
    response = await request(server, path)
    assert response.status_code == 404
    assert "outside secret" not in response.text


async def test_missing_index_returns_404(frontend):
    root, _, server = frontend
    (root / "index.html").unlink()
    assert (await request(server, "/orders/42")).status_code == 404


async def test_symlink_loop_returns_404(frontend):
    root, _, server = frontend
    (root / "loop").symlink_to(root / "loop")
    assert (await request(server, "/loop")).status_code == 404


async def test_invalid_path_returns_404(frontend):
    _, _, server = frontend
    assert (await request(server, "/bad%00path")).status_code == 404


async def test_api_route_still_takes_precedence(frontend):
    _, _, server = frontend
    response = await request(server, "/api/")
    assert response.status_code == 200
    assert response.json() == {"message": "Apollo PDV API"}
