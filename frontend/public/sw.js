/* Apollo PWA: cache only the public manifest and a public offline notice.
 * NEVER cache private HTML, API, orders or financial data.
 * Offline sales use the separately controlled POS queue.
 */
const CACHE = 'apollo-public-v4';
const PUBLIC_ASSETS = ['/manifest.webmanifest', '/offline.html'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('apollo-') && k !== CACHE).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/manifest.webmanifest') {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
  }
  if (req.mode === 'navigate' && url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      let response;
      try {
        response = await fetch(req);
        if (![502, 503, 504].includes(response.status)) return response;
      } catch {
        // A failed transport has the same recovery path as an unavailable upstream.
      }
      const cache = await caches.open(CACHE);
      return (await cache.match('/offline.html')) || response || Response.error();
    })());
  }
  // No authenticated pages, credentials, API responses or business data enter CacheStorage.
});
