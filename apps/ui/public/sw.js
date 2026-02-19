// Automaker Service Worker - Optimized for mobile PWA loading performance
// NOTE: CACHE_NAME is injected with a build hash at build time by the swCacheBuster
// Vite plugin (see vite.config.mts). In development it stays as-is; in production
// builds it becomes e.g. 'automaker-v3-a1b2c3d4' for automatic cache invalidation.
const CACHE_NAME = 'automaker-v3'; // replaced at build time → 'automaker-v3-<hash>'

// Separate cache for immutable hashed assets (long-lived)
const IMMUTABLE_CACHE = 'automaker-immutable-v2';

// Separate cache for API responses (short-lived, stale-while-revalidate on mobile)
const API_CACHE = 'automaker-api-v1';

// Assets to cache on install (app shell for instant loading)
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.png',
  '/logo_larger.png',
  '/automaker.svg',
  '/favicon.ico',
];

// Critical JS/CSS assets extracted from index.html at build time by the swCacheBuster
// Vite plugin. Populated during production builds; empty in dev mode.
// These are precached on SW install so that PWA cold starts after memory eviction
// serve instantly from cache instead of requiring a full network download.
const CRITICAL_ASSETS = [];

// Whether mobile caching is enabled (set via message from main thread).
// Persisted to Cache Storage so it survives aggressive SW termination on mobile.
let mobileMode = false;
const MOBILE_MODE_CACHE_KEY = 'automaker-sw-config';
const MOBILE_MODE_URL = '/sw-config/mobile-mode';

/**
 * Persist mobileMode to Cache Storage so it survives SW restarts.
 * Service workers on mobile get killed aggressively — without persistence,
 * mobileMode resets to false and API caching silently stops working.
 */
async function persistMobileMode(enabled) {
  try {
    const cache = await caches.open(MOBILE_MODE_CACHE_KEY);
    const response = new Response(JSON.stringify({ mobileMode: enabled }), {
      headers: { 'Content-Type': 'application/json' },
    });
    await cache.put(MOBILE_MODE_URL, response);
  } catch (_e) {
    // Best-effort persistence — SW still works without it
  }
}

/**
 * Restore mobileMode from Cache Storage on SW startup.
 */
async function restoreMobileMode() {
  try {
    const cache = await caches.open(MOBILE_MODE_CACHE_KEY);
    const response = await cache.match(MOBILE_MODE_URL);
    if (response) {
      const data = await response.json();
      mobileMode = !!data.mobileMode;
    }
  } catch (_e) {
    // Best-effort restore — defaults to false
  }
}

// Restore mobileMode immediately on SW startup
restoreMobileMode();

// API endpoints that are safe to serve from stale cache on mobile.
// These are GET-only, read-heavy endpoints where showing slightly stale data
// is far better than a blank screen or reload on flaky mobile connections.
const CACHEABLE_API_PATTERNS = [
  '/api/features',
  '/api/settings',
  '/api/models',
  '/api/usage',
  '/api/worktrees',
  '/api/github',
  '/api/cli',
  '/api/sessions',
  '/api/running-agents',
  '/api/pipeline',
  '/api/workspace',
  '/api/spec',
];

// Max age for API cache entries (5 minutes).
// After this, even mobile will require a network fetch.
const API_CACHE_MAX_AGE = 5 * 60 * 1000;

// Maximum entries in API cache to prevent unbounded growth
const API_CACHE_MAX_ENTRIES = 100;

/**
 * Check if an API request is safe to cache (read-only data endpoints)
 */
function isCacheableApiRequest(url) {
  const path = url.pathname;
  if (!path.startsWith('/api/')) return false;
  return CACHEABLE_API_PATTERNS.some((pattern) => path.startsWith(pattern));
}

/**
 * Check if a cached API response is still fresh enough to use
 */
function isApiCacheFresh(response) {
  const cachedAt = response.headers.get('x-sw-cached-at');
  if (!cachedAt) return false;
  return Date.now() - parseInt(cachedAt, 10) < API_CACHE_MAX_AGE;
}

/**
 * Clone a response and add a timestamp header for cache freshness tracking.
 * Uses arrayBuffer() instead of blob() to avoid doubling memory for large responses.
 */
async function addCacheTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sw-cached-at', String(Date.now()));
  const body = await response.clone().arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', (event) => {
  // Cache the app shell AND critical JS/CSS assets so the PWA loads instantly.
  // SHELL_ASSETS go into CACHE_NAME (general cache), CRITICAL_ASSETS go into
  // IMMUTABLE_CACHE (long-lived, content-hashed assets). This ensures that even
  // the very first visit populates the immutable cache — previously, assets were
  // only cached on fetch interception, but the SW isn't active during the first
  // page load so nothing got cached until the second visit.
  //
  // self.skipWaiting() is NOT called here — activation is deferred until the main
  // thread sends a SKIP_WAITING message to avoid disrupting a live page.
  event.waitUntil(
    Promise.all([
      // Cache app shell (HTML, icons, manifest)
      caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
      // Cache critical JS/CSS bundles (injected at build time by swCacheBuster).
      // Uses individual fetch+put instead of cache.addAll() so a single asset
      // failure doesn't prevent the rest from being cached.
      //
      // IMPORTANT: We fetch with { mode: 'cors' } because Vite's output HTML uses
      // <script type="module" crossorigin> and <link rel="modulepreload" crossorigin>
      // for these assets. The Cache API keys entries by URL + request mode, so a
      // no-cors cached response won't match a cors-mode browser request. Fetching
      // with cors mode here ensures the cached entries match what the browser requests.
      CRITICAL_ASSETS.length > 0
        ? caches.open(IMMUTABLE_CACHE).then((cache) =>
            Promise.all(
              CRITICAL_ASSETS.map((url) =>
                fetch(url, { mode: 'cors' })
                  .then((response) => {
                    if (response.ok) return cache.put(url, response);
                  })
                  .catch(() => {
                    // Individual asset fetch failure is non-fatal
                  })
              )
            )
          )
        : Promise.resolve(),
    ])
  );
});

self.addEventListener('activate', (event) => {
  // Remove old caches (both regular and immutable)
  const validCaches = new Set([CACHE_NAME, IMMUTABLE_CACHE, API_CACHE, MOBILE_MODE_CACHE_KEY]);
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.filter((name) => !validCaches.has(name)).map((name) => caches.delete(name))
        );
      }),
      // Enable Navigation Preload for faster navigation responses on mobile.
      // When enabled, the browser fires the navigation fetch in parallel with
      // service worker boot, eliminating the SW startup delay (~50-200ms on mobile).
      self.registration.navigationPreload && self.registration.navigationPreload.enable(),
    ])
  );
  // Claim clients so this SW immediately controls all open pages.
  //
  // This is safe in all activation scenarios:
  // 1. First install: No old SW exists — claiming is a no-op with no side effects.
  //    Critically, this lets the fetch handler intercept requests during the same
  //    visit that registered the SW, populating the immutable cache.
  // 2. SKIP_WAITING from main thread: The page is freshly loaded, so claiming
  //    won't cause a visible flash (the SW was explicitly asked to take over).
  // 3. Natural activation (all old-SW tabs closed): The new SW activates when
  //    no pages are using the old SW, so claiming controls only new navigations.
  //
  // Without clients.claim(), the SW's fetch handler would not intercept any
  // requests until the next full navigation — meaning the first visit after
  // install would not benefit from the cache-first asset strategy.
  self.clients.claim();
});

/**
 * Determine if a URL points to an immutable hashed asset.
 * Vite produces filenames like /assets/index-D3f1k2.js or /assets/style-Ab12Cd.css
 * These contain content hashes and are safe to cache permanently.
 */
function isImmutableAsset(url) {
  const path = url.pathname;
  // Match Vite's hashed asset pattern: /assets/<name>-<hash>.<ext>
  // This covers JS bundles, CSS, and font files that Vite outputs to /assets/
  // with content hashes (e.g., /assets/font-inter-WC6UYoCP.js).
  // Note: We intentionally do NOT cache all font files globally — only those
  // under /assets/ (which are Vite-processed, content-hashed, and actively used).
  // There are 639+ font files (~20MB total) across all font families; caching them
  // all would push iOS toward its ~50MB PWA quota and trigger eviction of everything.
  if (path.startsWith('/assets/') && /-[A-Za-z0-9_-]{6,}\.\w+$/.test(path)) {
    return true;
  }
  return false;
}

/**
 * Determine if a URL points to a static asset that benefits from stale-while-revalidate
 */
function isStaticAsset(url) {
  const path = url.pathname;
  return /\.(png|jpg|jpeg|gif|svg|ico|webp|mp3|wav)$/.test(path);
}

/**
 * Determine if a request is for a navigation (HTML page)
 */
function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
  );
}

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Strategy 5 (mobile only): Stale-while-revalidate for cacheable API requests.
  // On mobile, flaky connections cause blank screens and reloads. By serving
  // cached API responses immediately and refreshing in the background, we ensure
  // the UI always has data to render, even on slow or interrupted connections.
  // The main thread's React Query layer handles the eventual fresh data via its
  // own refetching mechanism, so the user sees updates within seconds.
  if (url.pathname.startsWith('/api/')) {
    if (mobileMode && isCacheableApiRequest(url)) {
      event.respondWith(
        (async () => {
          const cache = await caches.open(API_CACHE);
          const cachedResponse = await cache.match(event.request);

          // Helper: start a network fetch that updates the cache on success.
          // Lazily invoked so we don't fire a network request when the cache
          // is already fresh — saves bandwidth and battery on mobile.
          const startNetworkFetch = () =>
            fetch(event.request)
              .then(async (networkResponse) => {
                if (networkResponse.ok) {
                  // Store with timestamp for freshness checking
                  const timestampedResponse = await addCacheTimestamp(networkResponse);
                  cache.put(event.request, timestampedResponse);
                }
                return networkResponse;
              })
              .catch((err) => {
                // Network failed - if we have cache, that's fine (returned below)
                // If no cache, propagate the error
                if (cachedResponse) return null;
                throw err;
              });

          // If we have a fresh-enough cached response, return it immediately
          // without firing a background fetch — React Query's own refetching
          // will request fresh data when its stale time expires.
          if (cachedResponse && isApiCacheFresh(cachedResponse)) {
            return cachedResponse;
          }

          // From here the cache is either stale or missing — start the network fetch.
          const fetchPromise = startNetworkFetch();

          // If we have a stale cached response but network is slow, race them:
          // Return whichever resolves first (cached immediately vs network)
          if (cachedResponse) {
            // Give network a brief window (2s) to respond, otherwise use stale cache
            const networkResult = await Promise.race([
              fetchPromise,
              new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
            ]);
            if (!networkResult) {
              // Timeout won — keep the background fetch alive so the cache update
              // can complete even after we return the stale cached response.
              event.waitUntil(fetchPromise.catch(() => {}));
            }
            return networkResult || cachedResponse;
          }

          // No cache at all - must wait for network
          return fetchPromise;
        })()
      );
      return;
    }
    // Non-mobile or non-cacheable API: skip SW, let browser handle normally
    return;
  }

  // Strategy 1: Cache-first for immutable hashed assets (JS/CSS bundles, fonts)
  // These files contain content hashes in their names - they never change.
  //
  // Uses { ignoreVary: true } for cache matching because the same asset URL
  // can be requested with different modes: <link rel="prefetch"> uses no-cors,
  // <script type="module" crossorigin> and <link rel="modulepreload" crossorigin>
  // use cors. Without ignoreVary, a cors-mode browser request won't match a
  // no-cors cached entry (or vice versa), causing unnecessary network fetches
  // even when the asset is already in the cache.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(IMMUTABLE_CACHE).then((cache) => {
        return cache.match(event.request, { ignoreVary: true }).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Strategy 2: Stale-while-revalidate for static assets (images, audio)
  // Serve cached version immediately, update cache in background.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.ok && networkResponse.type === 'basic') {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          // Return cached version immediately, or wait for network
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Strategy 3: Cache-first with background revalidation for navigation requests (HTML)
  //
  // The app shell (index.html) is a thin SPA entry point — its content rarely changes
  // meaningfully between deploys because all JS/CSS bundles are content-hashed. Serving
  // it from cache first eliminates the visible "reload flash" that occurs when the user
  // switches back to the PWA and the old network-first strategy went to the network.
  //
  // The background revalidation ensures the cache stays fresh for the NEXT navigation,
  // so new deployments are picked up within one page visit. Navigation Preload is used
  // for the background fetch when available (no extra latency cost).
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = (await cache.match(event.request)) || (await cache.match('/'));

        // Start a background fetch to update the cache for next time.
        // Uses Navigation Preload if available (already in-flight, no extra cost).
        const updateCache = async () => {
          try {
            const preloadResponse = event.preloadResponse && (await event.preloadResponse);
            const freshResponse = preloadResponse || (await fetch(event.request));
            if (freshResponse.ok && freshResponse.type === 'basic') {
              await cache.put(event.request, freshResponse.clone());
            }
          } catch (_e) {
            // Network failed — cache stays as-is, still fine for next visit
          }
        };

        if (cachedResponse) {
          // Serve from cache immediately — no network delay, no reload flash.
          // Update cache in background for the next visit.
          event.waitUntil(updateCache());
          return cachedResponse;
        }

        // No cache yet (first visit) — must go to network
        try {
          const preloadResponse = event.preloadResponse && (await event.preloadResponse);
          const response = preloadResponse || (await fetch(event.request));
          if (response.ok && response.type === 'basic') {
            // Use event.waitUntil to ensure the cache write completes before
            // the service worker is terminated (mirrors the cached-path pattern).
            event.waitUntil(cache.put(event.request, response.clone()));
          }
          return response;
        } catch (_e) {
          return new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Strategy 4: Network-first for everything else
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Periodic cleanup of the immutable cache to prevent unbounded growth
// Remove entries older than 30 days when cache exceeds 200 entries
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_CLEANUP') {
    const MAX_ENTRIES = 200;
    caches.open(IMMUTABLE_CACHE).then((cache) => {
      cache.keys().then((keys) => {
        if (keys.length > MAX_ENTRIES) {
          // Delete oldest entries (first in, first out)
          const deleteCount = keys.length - MAX_ENTRIES;
          keys.slice(0, deleteCount).forEach((key) => cache.delete(key));
        }
      });
    });

    // Also clean up API cache
    caches.open(API_CACHE).then((cache) => {
      cache.keys().then((keys) => {
        if (keys.length > API_CACHE_MAX_ENTRIES) {
          const deleteCount = keys.length - API_CACHE_MAX_ENTRIES;
          keys.slice(0, deleteCount).forEach((key) => cache.delete(key));
        }
      });
    });
  }

  // Allow the main thread to explicitly activate a waiting service worker.
  // This is used when the user acknowledges an "Update available" prompt,
  // or during fresh page loads where it's safe to swap the SW.
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Enable/disable mobile caching mode.
  // Sent from main thread after detecting the device is mobile.
  // This allows the SW to apply mobile-specific caching strategies.
  // Persisted to Cache Storage so it survives SW restarts on mobile.
  if (event.data?.type === 'SET_MOBILE_MODE') {
    mobileMode = !!event.data.enabled;
    persistMobileMode(mobileMode);
  }

  // Warm the immutable cache with critical assets the app will need.
  // Called from the main thread after the initial render is complete,
  // so we don't compete with critical resource loading on mobile.
  if (event.data?.type === 'PRECACHE_ASSETS' && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches.open(IMMUTABLE_CACHE).then((cache) => {
        return Promise.all(
          event.data.urls.map((url) => {
            // Use ignoreVary so we find assets regardless of the request mode
            // they were originally cached with (cors vs no-cors).
            return cache.match(url, { ignoreVary: true }).then((existing) => {
              if (!existing) {
                // Fetch with cors mode to match how <script crossorigin> and
                // <link rel="modulepreload" crossorigin> request these assets.
                return fetch(url, { mode: 'cors', priority: 'low' })
                  .then((response) => {
                    if (response.ok) {
                      return cache.put(url, response);
                    }
                  })
                  .catch(() => {
                    // Silently ignore precache failures
                  });
              }
            });
          })
        );
      })
    );
  }
});
