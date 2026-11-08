"""PWA static safety checks until browser E2E is available."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SW = ROOT / "frontend" / "public" / "sw.js"
MAIN = ROOT / "frontend" / "src" / "main.tsx"
MANIFEST = ROOT / "frontend" / "public" / "manifest.webmanifest"


def test_pwa_files_and_registration_exist():
    assert SW.is_file()
    assert MANIFEST.is_file()
    main = MAIN.read_text()
    assert "navigator.serviceWorker.register('/sw.js')" in main
    assert "import.meta.env.PROD" in main
    assert "window.isSecureContext" in main


def test_service_worker_does_not_cache_api_responses():
    sw = SW.read_text()
    assert "req.method !== 'GET'" in sw
    assert "url.origin !== self.location.origin" in sw
    assert "url.pathname.startsWith('/api/')" in sw
    assert "url.pathname.startsWith('/auth/')" in sw
    assert "caches.open(CACHE)" in sw
    assert "cache.put(" not in sw
    assert "fetch(req).catch(() => caches.match('/'))" in sw
