// ═══════════════════════════════════════════════════════════════════════════
// SONOTRAD — Service Worker v1.0
// Stratégie : Cache-first pour les assets statiques,
//             Network-first pour les appels API AppScript
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME  = 'sonotrad-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  'https://cdn.tailwindcss.com',
];

// ── Install : mise en cache des assets statiques ────────────────────────────
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── Activate : nettoyage des anciens caches ─────────────────────────────────
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch : stratégie hybride ───────────────────────────────────────────────
self.addEventListener('fetch', evt => {
  const { request } = evt;
  const url = new URL(request.url);

  // Appels API AppScript → Network-first (jamais mis en cache)
  if (url.hostname === 'script.google.com') {
    evt.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ status: 'error', error: 'Hors ligne' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Assets statiques → Cache-first, fallback réseau
  if (request.method === 'GET') {
    evt.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
        return cached || networkFetch;
      })
    );
  }
});
