// ─── Service Worker — HealthScan PWA ─────────────────────────────────────────
// Strategy: Network-first with cache fallback.
// The app shell (HTML, JS, CSS, icons) is cached on first install so the app
// loads instantly even offline. On every subsequent request we try the network
// first; if it fails we serve from cache.
// Bump CACHE_NAME to invalidate the cache on a new deploy.

const CACHE_NAME = "healthscan-v1";
const BASE_URL = self.registration.scope;

// Files to pre-cache on install (the Vite build output names will differ;
// this list covers the static assets that exist before build.  After running
// `npm run build`, the hashed filenames in dist/ are cached on first visit via
// the fetch handler below).
const PRECACHE_FILES = ["", "manifest.json", "icon-192.svg", "icon-512.svg"].map((path) =>
  new URL(path, BASE_URL).toString()
);

// ── INSTALL — cache the app shell ──────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Pre-caching app shell…");
      return cache.addAll(PRECACHE_FILES);
    })
  );
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
});

// ── ACTIVATE — delete old caches ───────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    )
  );
  // Claim all tabs immediately
  clients.claim();
});

// ── FETCH — network first, cache fallback ─────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests; leave POST etc. alone
  if (request.method !== "GET") return;

  // Don't intercept cross-origin requests (e.g. analytics, external APIs)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone the response — we consume it twice (return + cache)
        const clone = response.clone();

        // Cache successful responses (200) with cacheable status codes
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }

        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Nothing in cache either — return a simple offline page
          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
              <title>HealthScan – Offline</title>
              <style>
                body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
                       background:#0f172a; color:#94a3b8; font-family:system-ui,sans-serif; text-align:center; padding:24px; }
                h1 { color:#f1f5f9; font-size:1.5rem; margin-bottom:8px; }
                p  { font-size:0.9rem; max-width:320px; line-height:1.5; }
              </style>
            </head>
            <body>
              <div>
                <h1>You are offline</h1>
                <p>HealthScan requires an internet connection for the first load. Once installed, it works fully offline. Please check your connection and try again.</p>
              </div>
            </body>
            </html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        });
      })
  );
});
