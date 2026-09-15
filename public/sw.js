/**
 * OurGpsCam Progressive Web App (PWA) Service Worker
 * Provides offline caching, app shell pre-caching, and background sync support.
 * Hardened to prevent undefined respondWith() and ERR_FAILED network issues.
 */

const CACHE_VERSION = 'ourgpscam-v1.0.1';
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

  // Skip non-GET requests and non-http(s) schemes
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Cross-origin check:
  // Whitelist external map tiles only. Let all other third-party API / auth requests
  // (such as Supabase at *.supabase.co) bypass the Service Worker completely so the
  // browser handles them natively with normal fetch error propagation.
  const isMapTile =
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('static-maps.yandex.ru');

  if (url.origin !== self.location.origin && !isMapTile) {
    return;
  }

  // 1. Navigation requests: Network-first with instant cached /index.html shell fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        } catch (networkErr) {
          const cached = (await caches.match('/index.html')) || (await caches.match('/'));
          if (cached) return cached;
          return new Response(
            '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>OurGpsCam Offline</title></head><body style="background:#000;color:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;margin:0;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:20px;"><div style="font-size:40px;margin-bottom:16px;">📍</div><h2 style="margin:0 0 8px 0;font-size:20px;">Connection Issue</h2><p style="color:#94a3b8;font-size:14px;max-width:320px;line-height:1.5;">Could not reach OurGpsCam. Please check your internet connection and reload.</p><button onclick="window.location.reload()" style="margin-top:16px;background:#FFD400;color:#000;border:none;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;">Retry</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
          );
        }
      })()
    );
    return;
  }

  // 2. Static Expo/App bundles, scripts, stylesheets, fonts, and images (Same-Origin)
  const isStaticBundle =
    url.pathname.startsWith('/_expo/static/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image';

  if (isStaticBundle && url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          // Stale-while-revalidate in background
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const clone = networkResponse.clone();
                caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        } catch (err) {
          return new Response('Asset unavailable offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      })()
    );
    return;
  }

  // 3. Third-party map tiles and external preview assets
  if (isMapTile) {
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        } catch (err) {
          return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
        }
      })()
    );
    return;
  }

  // 4. Default same-origin requests: Network-first with cache fallback
  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const clone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('Network unavailable and resource not cached', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })()
  );
});
