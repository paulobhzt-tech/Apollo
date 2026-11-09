/* Apollo PWA: cache only the public manifest.
 * NEVER cache private HTML, API, orders or financial data.
 * Offline sales use the separately controlled POS queue.
 */
const CACHE = 'apollo-public-v2';
const PUBLIC_ASSETS = ['/manifest.webmanifest'];
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
  // Navigation, authentication, all API and business data remain network-only.
});
