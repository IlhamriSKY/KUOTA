/**
 * Service Worker for KUOTA PWA
 * - Cache-first strategy for static assets
 * - Network-first strategy for API calls
 * - Offline fallback page
 */

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `kuota-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `kuota-dynamic-${CACHE_VERSION}`;
const API_CACHE = `kuota-api-${CACHE_VERSION}`;

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/css/styles.css',
  '/js/htmx.min.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Cache size limits
const CACHE_LIMITS = {
  [DYNAMIC_CACHE]: 50,
  [API_CACHE]: 30,
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Failed to cache static assets:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('kuota-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== API_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // API requests - Network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
    return;
  }

  // Static assets - Cache first, network fallback
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // HTML pages - Network first, cache fallback
  event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE));
});

// Cache-first strategy
async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first fetch failed:', error);
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Network-first strategy
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
      trimCache(cacheName);
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Network-first fetch failed, trying cache:', error);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline page for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
      return new Response(getOfflinePage(), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Trim cache to limit size
async function trimCache(cacheName) {
  const limit = CACHE_LIMITS[cacheName];
  if (!limit) return;

  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > limit) {
    await cache.delete(keys[0]);
    await trimCache(cacheName);
  }
}

// Offline fallback page
function getOfflinePage() {
  return `
    <!DOCTYPE html>
    <html lang="en" class="dark">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Offline - KUOTA</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background: #0a0a0a;
          color: #e5e5e5;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 1rem;
        }
        .container {
          text-align: center;
          max-width: 400px;
        }
        h1 {
          font-size: 3rem;
          color: #6d9eff;
          margin-bottom: 1rem;
        }
        p {
          font-size: 1.125rem;
          color: #a3a3a3;
          margin-bottom: 2rem;
        }
        button {
          background: #6d9eff;
          color: #0a0a0a;
          border: none;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          font-weight: 600;
          border-radius: 0.375rem;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        button:hover {
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📡</h1>
        <p>You're offline. Please check your internet connection and try again.</p>
        <button onclick="window.location.reload()">Retry</button>
      </div>
    </body>
    </html>
  `;
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
