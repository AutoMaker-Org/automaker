import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import { isMobileDevice, isPwaStandalone } from './lib/mobile-detect';

// Defensive fallback: index.html's inline script already applies data-pwa="standalone"
// before first paint. This re-applies it in case the inline script failed (e.g.
// CSP restrictions or unexpected errors). setAttribute is a no-op if already set.
if (isPwaStandalone) {
  document.documentElement.setAttribute('data-pwa', 'standalone');
}

// Register service worker for PWA support (web mode only)
// Registers immediately (not deferred to load event) so the SW can intercept
// and cache JS/CSS bundle requests during the current page load. When the SW is
// registered inside a 'load' listener, all assets have already downloaded before
// the SW installs, so they can't be cached until warmAssetCache runs later.
// Registering early allows the SW to serve bundles from cache on the NEXT visit.
//
// Note: The SW itself does NOT call skipWaiting() on install, so a newly
// registered SW won't disrupt a live page — it waits for SKIP_WAITING from the
// main thread or for all old-SW tabs to close before activating.
if ('serviceWorker' in navigator && !window.location.protocol.startsWith('file')) {
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
              // A new SW is waiting — show an update banner so long-lived
              // sessions can immediately pick up new deployments.
              console.debug('[SW] New service worker installed and waiting to activate');
              showUpdateNotification(registration);
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
}

/**
 * Show a user-visible notification when a new service worker version is detected.
 * The notification offers a "Reload" action that sends SKIP_WAITING to the waiting
 * SW and reloads the page once the new SW activates. This ensures long-lived
 * sessions can immediately pick up new deployments.
 */
function showUpdateNotification(registration: ServiceWorkerRegistration): void {
  // Create a simple DOM-based notification (avoids depending on React rendering)
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');

  // Read theme-aware colors from CSS custom properties with sensible fallbacks
  // so the banner matches the current dark/light theme.
  const rootStyle = getComputedStyle(document.documentElement);
  const bgColor = rootStyle.getPropertyValue('--background').trim() || '#1a1a2e';
  const fgColor = rootStyle.getPropertyValue('--foreground').trim() || '#e0e0e0';
  const accentColor = rootStyle.getPropertyValue('--primary').trim() || '#6366f1';
  const mutedColor = rootStyle.getPropertyValue('--muted-foreground').trim() || '#888';

  banner.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;' +
    `background:hsl(${bgColor});color:hsl(${fgColor});padding:12px 20px;border-radius:10px;` +
    'display:flex;align-items:center;gap:12px;font-size:14px;' +
    'box-shadow:0 4px 24px rgba(0,0,0,0.3);font-family:system-ui,sans-serif;';
  banner.innerHTML =
    '<span>A new version is available.</span>' +
    `<button id="sw-update-btn" style="background:hsl(${accentColor});color:hsl(${bgColor});border:none;` +
    'padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;">Reload</button>' +
    `<button id="sw-dismiss-btn" style="background:transparent;color:hsl(${mutedColor});border:none;` +
    'padding:4px 8px;cursor:pointer;font-size:18px;line-height:1;" aria-label="Dismiss">&times;</button>';
  document.body.appendChild(banner);

  // Listen for controllerchange to reload after the new SW activates.
  // Named handler so it can be cleaned up when the banner is dismissed or after reload.
  let reloading = false;
  const onControllerChange = () => {
    if (!reloading) {
      reloading = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.location.reload();
    }
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  banner.querySelector('#sw-update-btn')?.addEventListener('click', () => {
    // Send SKIP_WAITING to the waiting SW — it will call skipWaiting() and
    // the controllerchange listener above will reload the page.
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    const btn = banner.querySelector('#sw-update-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.textContent = 'Updating…';
      btn.disabled = true;
    }
  });

  banner.querySelector('#sw-dismiss-btn')?.addEventListener('click', () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    banner.remove();
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

  // CRITICAL_ASSETS are precached at SW install time (see sw.js install handler).
  // This function is a complementary backup: it collects asset URLs from the live
  // DOM (which includes any assets the browser already fetched on this visit) and
  // sends them to the SW for caching via PRECACHE_ASSETS. This covers:
  // - Assets that were fetched before the SW was active on the first visit
  // - Any assets the install-time precaching missed due to transient failures
  //
  // No delay needed — warmAssetCache is called after the SW registers (which is
  // already deferred until renderer.tsx module evaluation, post-parse). Asset URLs
  // are already in the DOM at that point and the SW processes PRECACHE_ASSETS
  // asynchronously without blocking the render path.
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
    //
    // Target the active SW if available; otherwise fall back to the installing/waiting
    // SW. On first visit, the SW may still be in 'installing' state when this runs,
    // but it can still receive messages and process them once it activates.
    const target = registration.active || registration.waiting || registration.installing;
    if (assetUrls.length > 0 && target) {
      target.postMessage({
        type: 'PRECACHE_ASSETS',
        urls: assetUrls,
      });
    }
  };

  idleCallback(doWarm);
}

// Render the app - prioritize First Contentful Paint
createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
