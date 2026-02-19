import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import { isMobileDevice, isPwaStandalone } from './lib/mobile-detect';

// Apply PWA standalone class early, before CSS renders, so the #app container
// can use a tighter bottom safe-area inset (the home indicator needs only minimal
// clearance when there's no browser chrome beneath it).
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

        // Prefetch likely-needed route chunks during idle time.
        // On mobile, this means subsequent navigations are instant from cache
        // instead of requiring network round-trips over slow cellular connections.
        prefetchRouteChunks(registration);
      })
      .catch(() => {
        // Service worker registration failed; app still works without it
      });
  });
}

/**
 * Prefetch route JS chunks that the user is likely to navigate to.
 * Uses requestIdleCallback to avoid competing with the initial render,
 * and sends URLs to the service worker for background caching.
 * This is especially impactful on mobile where network latency is high.
 */
function prefetchRouteChunks(registration: ServiceWorkerRegistration): void {
  const idleCallback =
    typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 2000);

  // On mobile, wait a bit longer before prefetching to let the critical path complete.
  // Mobile connections are often slower and we don't want to compete with initial data fetches.
  const prefetchDelay = isMobileDevice ? 4000 : 0;

  const doPrefetch = () => {
    // Find all modulepreload links already in the document (Vite injects these)
    // and any route chunks that might be linked
    const existingPreloads = new Set(
      Array.from(document.querySelectorAll('link[rel="modulepreload"]')).map(
        (link) => (link as HTMLLinkElement).href
      )
    );

    // Also collect prefetch links (Vite mobile optimization converts some to prefetch)
    Array.from(document.querySelectorAll('link[rel="prefetch"]')).forEach((link) => {
      const href = (link as HTMLLinkElement).href;
      if (href) existingPreloads.add(href);
    });

    // Discover route chunk URLs from the document's script tags
    // These are the code-split route bundles that TanStack Router will lazy-load
    const routeChunkUrls: string[] = [];
    document.querySelectorAll('script[src*="/assets/"]').forEach((script) => {
      const src = (script as HTMLScriptElement).src;
      if (src && !existingPreloads.has(src)) {
        routeChunkUrls.push(src);
      }
    });

    // Send URLs to service worker for background caching
    if (routeChunkUrls.length > 0 && registration.active) {
      registration.active.postMessage({
        type: 'PRECACHE_ASSETS',
        urls: routeChunkUrls,
      });
    }
  };

  // Wait for idle time after the app is interactive
  if (prefetchDelay > 0) {
    setTimeout(() => idleCallback(doPrefetch), prefetchDelay);
  } else {
    idleCallback(doPrefetch);
  }
}

// Render the app - prioritize First Contentful Paint
createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
