/* Apollo PWA shell cache: NEVER cache API, authenticated pages or sales data.
 * Offline transaction processing requires a separately audited durable queue.
 */
const CACHE = 'apollo-shell-v1';
const SHELL = ['/', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('apollo-shell-') && k !== CACHE).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never intercept API or authentication; no cached private or mutable responses.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/commercial/') || url.pathname.startsWith('/ws')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname === '/manifest.webmanifest') {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
  }
});
