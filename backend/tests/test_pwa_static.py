"""Static PWA security regression checks; browser E2E still required."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SW = ROOT / "frontend" / "public" / "sw.js"
MAIN = ROOT / "frontend" / "src" / "main.tsx"
MANIFEST = ROOT / "frontend" / "public" / "manifest.webmanifest"
OFFLINE = ROOT / "frontend" / "src" / "lib" / "offline.ts"
PDV = ROOT / "frontend" / "src" / "pages" / "Pdv.tsx"


def test_pwa_files_and_registration_exist():
    assert SW.is_file() and MANIFEST.is_file()
    main = MAIN.read_text()
    assert "navigator.serviceWorker.register('/sw.js')" in main
    assert "import.meta.env.PROD" in main
    assert "window.isSecureContext" in main


def test_service_worker_never_caches_private_pages_or_api():
    sw = SW.read_text()
    assert "PUBLIC_ASSETS = ['/manifest.webmanifest']" in sw
    assert "url.pathname === '/manifest.webmanifest'" in sw
    assert "req.method !== 'GET'" in sw
    assert "url.origin !== self.location.origin" in sw
    assert "caches.match('/')" not in sw
    assert "cache.put(" not in sw


def test_offline_sale_requires_persistence_before_acknowledgement():
    offline = OFFLINE.read_text()
    pdv = PDV.read_text()
    assert 'if (kv.get(KEY) !== next) throw new Error(' in offline
    assert "Armazenamento local indisponível" in pdv
    assert "Mantenha o carrinho aberto" in pdv
    assert "Documento fiscal ainda não emitido" in pdv


def test_retry_rejected_sale_persists_before_removal():
    offline = OFFLINE.read_text()
    start = offline.index("export function retryRejected(")
    end = offline.index("export function dismissRejected(", start)
    retry = offline[start:end]
    assert retry.index("enqueue(sale)") < retry.index("kv.set(REJ_KEY, next)")
    assert 'if (kv.get(REJ_KEY) !== next) throw new Error(' in retry


def test_offline_reference_prefers_cryptographic_uuid():
    offline = OFFLINE.read_text()
    assert "crypto.randomUUID()" in offline
