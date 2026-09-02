/**
 * Service Worker — PDF Editor Pro (Offline PWA)
 * Estrategia: Cache-first para assets estáticos, Network-first para documentos.
 */

const CACHE_NAME = 'pdf-editor-pro-v1';

// Assets críticos a pre-cachear durante la instalación
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Instalación: pre-cacheamos los assets fundamentales
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching shell assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Activar inmediatamente sin esperar a que las pestañas anteriores cierren
  self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    )
  );
  // Tomar control de todas las pestañas abiertas inmediatamente
  self.clients.claim();
});

// Fetch: Stale-While-Revalidate para assets del bundle, Network-first para el resto
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar peticiones chrome-extension u otras no HTTP
  if (!request.url.startsWith('http')) return;

  // Ignorar peticiones POST (formularios, APIs) — no se cachean
  if (request.method !== 'GET') return;

  // Ignorar peticiones a APIs externas (backend Django, si quedara alguna)
  if (url.pathname.startsWith('/test/') || url.pathname.startsWith('/api/')) {
    return;
  }

  // Estrategia: Stale-While-Revalidate
  // → Devuelve desde cache inmediatamente (si existe) y actualiza en background
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);

      const networkFetch = fetch(request)
        .then((networkResponse) => {
          // Solo cachear respuestas válidas de origen propio o archivos estáticos CDN
          if (
            networkResponse.ok &&
            (url.origin === self.location.origin ||
              request.destination === 'script' ||
              request.destination === 'style' ||
              request.destination === 'font' ||
              request.destination === 'image')
          ) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => {
          // Sin red y sin cache → devolver página offline básica para navegación
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });

      // Si hay cache, la devolvemos de inmediato y actualizamos en background
      return cached || networkFetch;
    })
  );
});
