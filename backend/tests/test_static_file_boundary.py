"""Regression tests for SPA static-file containment."""
import os
from pathlib import Path


def test_commonpath_blocks_sibling_directory_prefix(tmp_path):
    root = tmp_path / "web"
    sibling = tmp_path / "web-private"
    root.mkdir()
    sibling.mkdir()
    (root / "index.html").write_text("ok")
    (sibling / "secret.txt").write_text("private")
    safe = os.path.realpath(root)
    secret = os.path.realpath(sibling / "secret.txt")
    assert secret.startswith(safe)  # Old check was vulnerable to this prefix.
    assert os.path.commonpath([safe, secret]) != safe


def test_commonpath_allows_real_file_under_web_root(tmp_path):
    root = tmp_path / "web"
    root.mkdir()
    page = root / "index.html"
    page.write_text("ok")
    safe = os.path.realpath(root)
    assert os.path.commonpath([safe, os.path.realpath(page)]) == safe


def test_spa_serves_build_identity_and_fails_closed_for_missing_resources(tmp_path):
    import pytest
    from fastapi import HTTPException
    from lib.web_assets import web_response

    (tmp_path / "index.html").write_text("app")
    manifest = tmp_path / "build-integrity.json"
    manifest.write_text("{}")
    response = web_response(tmp_path, manifest.name)
    assert response.path == manifest
    assert response.media_type == "application/json"
    assert response.headers["cache-control"] == "no-cache"
    assert web_response(tmp_path, "mesas").path == tmp_path / "index.html"

    manifest.unlink()
    for path in ("build-integrity.json", "api", "api/missing", "assets/missing", "sw.js"):
        with pytest.raises(HTTPException) as failure:
            web_response(tmp_path, path)
        assert failure.value.status_code == 404
