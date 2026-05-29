/* ============================================================
   Autoglass AS — Service Worker (offline asset caching)
   ============================================================ */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `ag-static-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/tokens.css',
  '/css/base.css',
  '/css/components.css',
  '/js/utils.js',
  '/js/main.js',
  '/js/i18n.js',
  '/js/auth.js',
  '/js/search-glass.js',
  '/images/logo.png',
  '/images/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('ag-static-') && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network first, no cache
  if (url.pathname.startsWith('/api/') || url.hostname.includes('workers.dev')) {
    return;
  }

  // Static assets: cache first, fallback to network
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            return response;
          })
          .catch(() => cached);
      })
    );
  }
});
