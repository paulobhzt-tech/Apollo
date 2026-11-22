/* Only the static, public build is cached. API and session data stay out of CacheStorage. */
const CACHE = /* BUILD_CACHE */ null;
const ASSETS = /* BUILD_ASSETS */ null;
const SHELL_ROUTES = new Set(['/', '/login', '/pdv', '/mesas', '/comanda-mobile']);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (!CACHE || !ASSETS) throw new Error('Apollo: missing build asset list');
    const cache = await caches.open(CACHE);
    await cache.addAll(Object.entries(ASSETS).map(([url, integrity]) => new Request(url, {
      cache: 'reload',
      credentials: 'omit',
      redirect: 'error',
      integrity,
    })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('apollo-public-') && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function navigate(request, pathname) {
  let networkResponse;
  try {
    networkResponse = await fetch(request, { cache: 'no-store' });
    if (![502, 503, 504].includes(networkResponse.status)) return networkResponse;
  } catch {
    // Transport failure takes the same path as a gateway outage.
  }

  const cache = await caches.open(CACHE);
  const path = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const shell = SHELL_ROUTES.has(path);
  const cached = (shell && await cache.match('/index.html')) || await cache.match('/offline.html');
  if (!cached) return networkResponse || Response.error();

  // A synthetic response keeps the navigation's original URL in the document,
  // including in engines that propagate the URL of a cached fetch response.
  const headers = new Headers(cached.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.set('x-apollo-offline-fallback', shell ? 'shell' : 'notice');
  return new Response(cached.body, { headers });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const { origin, pathname } = new URL(request.url);
  if (!ASSETS || request.method !== 'GET' || origin !== self.location.origin ||
      pathname === '/api' || pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request, pathname));
  } else if (Object.hasOwn(ASSETS, pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(pathname)).then(response => response || fetch(request)));
  }
});
