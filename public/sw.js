/**
 * OurGpsCam Progressive Web App (PWA) Service Worker
 * Provides offline caching, app shell pre-caching, and background sync support.
 */

const CACHE_VERSION = 'ourgpscam-v1.0.0';
const CACHE_NAME = `ourgpscam-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `ourgpscam-runtime-${CACHE_VERSION}`;

// Core assets required for offline app shell
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install Event: Pre-cache core app shell individually and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Use Promise.allSettled so a single missing/failed asset doesn't break precaching for the rest
        const results = await Promise.allSettled(
          PRECACHE_ASSETS.map((asset) => cache.add(asset))
        );
        results.forEach((res, idx) => {
          if (res.status === 'rejected') {
            console.warn(`[OurGpsCam SW] Pre-cache failed for ${PRECACHE_ASSETS[idx]}:`, res.reason);
          }
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up outdated caches and claim active clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[OurGpsCam SW] Deleting obsolete cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event: Strategy routing
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1. Navigation requests: Stale-While-Revalidate with instant /index.html shell
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      caches.match('/index.html').then((cachedShell) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedShell);

        return cachedShell || fetchPromise;
      })
    );
    return;
  }

  // 2. Static Expo/App bundles, scripts, stylesheets, fonts, and images
  const isStaticBundle =
    url.pathname.startsWith('/_expo/static/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image';

  if (isStaticBundle && url.origin === self.location.origin) {
    // Stale-While-Revalidate: return cache instantly, update in background
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Third-party map tiles and external assets (OSM / Google static maps)
  if (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('openstreetmap.org')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => {
            // Fail gracefully on map tiles when offline
            return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
          });
      })
    );
    return;
  }

  // 4. Default: Network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const clone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});
