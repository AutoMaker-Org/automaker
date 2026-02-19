import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import { isMobileDevice, isPwaStandalone } from './lib/mobile-detect';

// Defensive fallback: index.html's inline script already applies 'pwa-standalone'
// before first paint. This re-applies it in case the inline script failed (e.g.
// CSP restrictions or unexpected errors). The classList.add is a no-op if the
// class is already present.
if (isPwaStandalone) {
  document.documentElement.classList.add('pwa-standalone');
}

// Register service worker for PWA support (web mode only)
// Uses optimized registration strategy for faster mobile loading:
// - Registers after load event to avoid competing with critical resources
// - Defers SW activation to prevent reload flash when switching back to the app
// - Triggers cache cleanup on activation
// - Prefetches likely-needed route chunks during idle time
// - Enables mobile-specific API caching when on a mobile device
if ('serviceWorker' in navigator && !window.location.protocol.startsWith('file')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', {
        // Check for updates on every page load for PWA freshness
        updateViaCache: 'none',
      })
      .then((registration) => {
        // Check for service worker updates periodically
        // Mobile: every 60 minutes (saves battery/bandwidth)
        // Desktop: every 30 minutes
        const updateInterval = isMobileDevice ? 60 * 60 * 1000 : 30 * 60 * 1000;
        setInterval(() => {
          registration.update().catch(() => {
            // Update check failed silently - will try again next interval
          });
        }, updateInterval);

        // When a new service worker is found, DON'T activate it immediately.
        // Instead, wait until the user navigates away or refreshes. This prevents
        // the brief reload/flash that occurs when skipWaiting() + clients.claim()
        // swaps the SW under a live page (especially noticeable when switching back
        // to the PWA on mobile).
        //
        // The new SW will naturally activate when all tabs using the old SW are closed.
        // For urgent updates, we send SKIP_WAITING on fresh page loads (see below).
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // A new SW is waiting — it will activate on next page load.
                // No need to skipWaiting here; the cache-first HTML strategy means
                // the user gets the new version on their next fresh visit.
                console.debug('[SW] New service worker installed and waiting to activate');
              }
              if (newWorker.state === 'activated') {
                // New service worker is active - clean up old immutable cache entries
                newWorker.postMessage({ type: 'CACHE_CLEANUP' });
              }
            });
          }
        });

        // On fresh page loads (not tab-switch-back), if there's a waiting SW,
        // tell it to activate now. This is safe because the page is freshly loaded
        // and won't flash. This ensures updates are picked up within one page visit.
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Notify the service worker about mobile mode.
        // This enables stale-while-revalidate caching for API responses,
        // preventing blank screens caused by failed/slow API fetches on mobile.
        if (isMobileDevice && registration.active) {
          registration.active.postMessage({
            type: 'SET_MOBILE_MODE',
            enabled: true,
          });
        }

        // Also listen for the SW becoming active (in case it wasn't ready above)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (isMobileDevice && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'SET_MOBILE_MODE',
              enabled: true,
            });
          }
        });

        // Warm the SW's immutable cache with all page assets during idle time.
        // This ensures that when the PWA is evicted from memory and reopened,
        // all JS/CSS can be served instantly from SW cache instead of re-downloading.
        warmAssetCache(registration);

        // Request persistent storage to protect caches from OS eviction.
        // Without this, iOS Safari can purge Cache Storage under memory pressure
        // or after 7 days of inactivity, forcing a full network reload on next visit.
        // This is a best-effort request — the browser may deny it, but it's a no-op
        // on browsers that don't support it (no error thrown).
        if (navigator.storage?.persist) {
          navigator.storage
            .persist()
            .then((granted) => {
              if (granted) {
                console.debug('[SW] Persistent storage granted — caches protected from eviction');
              }
            })
            .catch(() => {
              // Silently ignore — persistent storage is a nice-to-have
            });
        }
      })
      .catch(() => {
        // Service worker registration failed; app still works without it
      });
  });
}

/**
 * Warm the service worker's immutable cache with all critical page assets.
 * Collects URLs from modulepreload, prefetch, stylesheet, and script tags
 * and sends them to the SW via PRECACHE_ASSETS for background caching.
 *
 * This is critical for PWA cold-start performance: when iOS/Android evicts
 * the PWA from memory, reopening it needs assets from SW cache. The SW's
 * fetch handler caches assets on first access, but on the very first visit
 * the SW isn't active yet when assets load. This function bridges that gap
 * by explicitly telling the SW "cache these URLs" after registration.
 */
function warmAssetCache(registration: ServiceWorkerRegistration): void {
  const idleCallback =
    typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 2000);

  // On mobile, wait a bit longer to let the critical render path complete.
  // Mobile connections are often slower and we don't want to compete with initial data fetches.
  const delay = isMobileDevice ? 4000 : 0;

  const doWarm = () => {
    const assetUrls: string[] = [];

    // Collect ALL asset URLs from the page that should be in the SW cache:
    // 1. modulepreload links (critical vendor chunks: react, tanstack, radix, state)
    // 2. prefetch links (deferred chunks: icons, reactflow, xterm, codemirror, markdown)
    // 3. stylesheet links (main CSS bundle)
    // 4. script tags with asset paths (entry point JS)
    document.querySelectorAll('link[rel="modulepreload"], link[rel="prefetch"]').forEach((link) => {
      const href = (link as HTMLLinkElement).href;
      if (href && href.includes('/assets/')) assetUrls.push(href);
    });

    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = (link as HTMLLinkElement).href;
      if (href && href.includes('/assets/')) assetUrls.push(href);
    });

    document.querySelectorAll('script[src*="/assets/"]').forEach((script) => {
      const src = (script as HTMLScriptElement).src;
      if (src) assetUrls.push(src);
    });

    // Send all discovered URLs to the SW for background caching.
    // The SW's PRECACHE_ASSETS handler checks cache.match() first, so URLs
    // already in the immutable cache won't be re-fetched.
    if (assetUrls.length > 0 && registration.active) {
      registration.active.postMessage({
        type: 'PRECACHE_ASSETS',
        urls: assetUrls,
      });
    }
  };

  if (delay > 0) {
    setTimeout(() => idleCallback(doWarm), delay);
  } else {
    idleCallback(doWarm);
  }
}

// Render the app - prioritize First Contentful Paint
createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
