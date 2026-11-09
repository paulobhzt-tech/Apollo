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
