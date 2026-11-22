import hashlib
import json
import unittest
from pathlib import Path
from runpy import run_path
from urllib.error import URLError

check_build = run_path(str(Path(__file__).with_name("verify-public-build.py")))["check_build"]
ORIGIN = "https://homologacao.example"


class PublicBuildTests(unittest.TestCase):
    def setUp(self):
        self.files = {"index.html": b"<html>Apollo</html>", "sw.js": b"// worker", "manifest.webmanifest": b"{}", "assets/main.js": b"// app"}
        self.expected = {
            "schema": 1,
            "application": "Apollo PDV 3.0.1",
            "commit": "a" * 40,
            "files": {key: hashlib.sha256(value).hexdigest() for key, value in self.files.items()},
        }
        self.remote = {**self.expected}
        self.missing = set()
        self.mime = "application/json"

    def fetch(self, url):
        path = url.removeprefix(ORIGIN).lstrip("/")
        if path in self.missing:
            raise URLError("fixture missing")
        if path == "build-integrity.json":
            return self.mime, json.dumps(self.remote).encode()
        if path == "login":
            path = "index.html"
        return "application/octet-stream", self.files[path]

    def test_matching_public_assets_do_not_attest_isolation(self):
        report = check_build(ORIGIN, self.expected, self.fetch)
        self.assertTrue(report["public_build_matches"])
        self.assertFalse(report["administrative_isolation_verified"])

    def test_html_instead_of_manifest_blocks_even_with_matching_static_files(self):
        self.mime = "text/html"
        self.assertFalse(check_build(ORIGIN, self.expected, self.fetch)["public_build_matches"])

    def test_wrong_commit_blocks_even_with_matching_static_files(self):
        self.remote["commit"] = "b" * 40
        self.assertFalse(check_build(ORIGIN, self.expected, self.fetch)["public_build_matches"])

    def test_manifest_alone_cannot_hide_changed_or_missing_files(self):
        self.files["assets/main.js"] = b"// changed"
        self.missing.add("sw.js")
        report = check_build(ORIGIN, self.expected, self.fetch)
        self.assertFalse(report["public_build_matches"])
        self.assertIn("Hash divergente em /assets/main.js.", report["problems"])


if __name__ == "__main__":
    unittest.main()
