#!/usr/bin/env python3
"""Read-only HTTPS comparison of a public installation with an audited build."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


PUBLIC_MIME = {
    ".html": {"text/html"},
    ".js": {"text/javascript", "application/javascript"},
    ".css": {"text/css"},
    ".webmanifest": {"application/manifest+json", "application/json"},
}


def check_build(origin, expected, fetch):
    results = []
    problems = []

    def fetch_checked(path):
        try:
            mime, body = fetch(origin + path)
        except HTTPError as error:
            with error:
                results.append({"path": path, "http_status": error.code, "mime": error.headers.get_content_type()})
            problems.append(f"HTTP {error.code} em {path}.")
            return "", b""
        except (URLError, OSError, ValueError) as error:
            results.append({"path": path, "error": type(error).__name__})
            problems.append(f"Falha de leitura em {path}.")
            return "", b""
        results.append({"path": path, "http_status": 200, "mime": mime, "sha256": hashlib.sha256(body).hexdigest()})
        return mime, body

    mime, body = fetch_checked("/build-integrity.json")
    remote = None
    if mime == "application/json":
        try:
            remote = json.loads(body)
        except (ValueError, UnicodeError):
            pass
    if not isinstance(remote, dict):
        problems.append("Manifesto público ausente ou inválido.")
        remote = {}
    matches = all(remote.get(key) == expected[key] for key in ("schema", "application", "commit", "files"))
    if not matches:
        problems.append("Identidade do manifesto público diverge do build esperado.")

    def verify_asset(path, filename):
        mime, body = fetch_checked(path)
        if results[-1].get("sha256") != expected["files"][filename]:
            problems.append(f"Hash divergente em {path}.")
        allowed = PUBLIC_MIME.get(Path(filename).suffix)
        if mime and allowed and mime not in allowed:
            problems.append(f"Tipo de conteúdo incompatível em {path}.")
        if filename == "sw.js" and path == "/sw.js":
            match = re.search(rb"""(?:'|")(?P<cache>apollo-public-v[0-9]+(?:-[a-f0-9]{64})?)(?:'|")""", body)
            results[-1]["worker_cache"] = match["cache"].decode("ascii") if match else None

    essential = {"/login": "index.html", "/sw.js": "sw.js", "/manifest.webmanifest": "manifest.webmanifest"}
    for path, filename in essential.items():
        verify_asset(path, filename)

    manifest_result, login_result = results[0], results[1]
    manifest_served_login = (
        manifest_result.get("mime") == login_result.get("mime") == "text/html"
        and manifest_result.get("sha256") is not None
        and manifest_result["sha256"] == login_result.get("sha256")
    )
    if manifest_served_login:
        problems.append("O corpo HTML do manifesto público é idêntico ao de /login.")

    if matches:
        for filename in sorted(expected["files"]):
            path = "/" + filename
            if path not in essential:
                verify_asset(path, filename)

    return {
        "origin": origin,
        "expected_commit": expected["commit"],
        "public_claimed_commit": remote.get("commit"),
        "public_build_matches": not problems,
        "manifest_served_login_html": manifest_served_login,
        "administrative_isolation_verified": False,
        "problems": problems,
        "requests": results,
    }


def valid_manifest(manifest):
    return (
        isinstance(manifest, dict)
        and manifest.get("schema") == 1
        and manifest.get("application") == "Apollo PDV 3.0.1"
        and isinstance(manifest.get("commit"), str)
        and re.fullmatch(r"[a-f0-9]{40}", manifest["commit"])
        and isinstance(manifest.get("files"), dict)
        and {"index.html", "sw.js", "manifest.webmanifest"} <= manifest["files"].keys()
        and all(
            re.fullmatch(r"[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*", name)
            and not any(part in (".", "..") for part in name.split("/"))
            and isinstance(value, str)
            and re.fullmatch(r"[a-f0-9]{64}", value)
            for name, value in manifest["files"].items()
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--origin", default="https://homologacao.apollo-pdv.com")
    args = parser.parse_args()
    origin = urlsplit(args.origin)
    if origin.scheme != "https" or not origin.hostname or origin.username is not None or origin.path not in ("", "/") or origin.query or origin.fragment:
        parser.error("Use uma origem HTTPS sem credenciais, caminho, consulta ou fragmento.")
    expected = json.loads(args.manifest.read_text(encoding="utf-8"))
    if not valid_manifest(expected):
        parser.error("O manifesto local não é um manifesto válido do Apollo PDV.")
    opener = build_opener(NoRedirect())

    def fetch(url):
        request = Request(url, headers={"Cache-Control": "no-cache", "Accept-Encoding": "identity", "User-Agent": "Apollo-P59-public-verification"})
        with opener.open(request, timeout=8) as response:
            limit = 10 * 1024 * 1024
            body = response.read(limit + 1)
            if len(body) > limit or response.status != 200:
                raise ValueError("Resposta inválida.")
            return response.headers.get_content_type(), body

    report = check_build(f"{origin.scheme}://{origin.netloc}", expected, fetch)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["public_build_matches"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
