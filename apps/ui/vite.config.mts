import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import electron from 'vite-plugin-electron/simple';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version;

// Generate a build hash for cache busting.
// Uses git commit hash when available (deterministic across CI builds),
// falls back to version + timestamp for non-git environments.
// This ensures users get fresh SW caches after each deployment.
function getBuildHash(): string {
  // Try git commit hash first (deterministic, same across CI workers)
  try {
    const { execSync } = require('child_process');
    const gitHash = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf-8' }).trim();
    if (gitHash) return gitHash;
  } catch {
    // Not a git repo or git not available — fall back
  }
  // Fallback: version + timestamp (unique per build)
  return crypto.createHash('md5').update(`${appVersion}-${Date.now()}`).digest('hex').slice(0, 8);
}

const buildHash = getBuildHash();

/**
 * Vite plugin to inject the build hash into sw.js for cache busting.
 *
 * Problem: CACHE_NAME is hardcoded in the service worker.
 * After a deployment, users may continue getting stale HTML from the SW cache
 * if someone forgets to manually bump the version.
 *
 * Solution: Replace the hardcoded version with a build-time hash so the
 * SW cache is automatically invalidated on each deployment.
 */
function swCacheBuster(): Plugin {
  // Single constant for the cache name prefix — bump this when changing the SW cache version.
  const CACHE_NAME_BASE = 'automaker-v5';
  const CACHE_NAME_PATTERN = new RegExp(`const CACHE_NAME = '${CACHE_NAME_BASE}';`);
  const CRITICAL_ASSETS_PATTERN = /const CRITICAL_ASSETS = \[\];/;
  return {
    name: 'sw-cache-buster',
    // In build mode: copy sw.js to output with hash injected
    // In dev mode: no transformation needed (sw.js is served from public/)
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist', 'sw.js');
      if (!fs.existsSync(swPath)) {
        console.warn('[sw-cache-buster] sw.js not found in dist/ — skipping cache bust');
        return;
      }
      let swContent = fs.readFileSync(swPath, 'utf-8');
      if (!CACHE_NAME_PATTERN.test(swContent)) {
        console.error(
          '[sw-cache-buster] Could not find CACHE_NAME declaration in sw.js. ' +
            'The service worker cache will NOT be busted on this deploy! ' +
            `Check that public/sw.js still contains: const CACHE_NAME = '${CACHE_NAME_BASE}';`
        );
        return;
      }
      swContent = swContent.replace(
        CACHE_NAME_PATTERN,
        `const CACHE_NAME = '${CACHE_NAME_BASE}-${buildHash}';`
      );
      console.log(`[sw-cache-buster] Injected build hash: ${CACHE_NAME_BASE}-${buildHash}`);

      // Extract critical asset URLs from the built index.html and inject them
      // into the SW so it can precache them on install (not just after the main
      // thread sends PRECACHE_ASSETS). This ensures the very first visit populates
      // the immutable cache, so PWA cold starts after memory eviction serve from cache.
      const indexHtmlPath = path.resolve(__dirname, 'dist', 'index.html');
      if (fs.existsSync(indexHtmlPath)) {
        if (!CRITICAL_ASSETS_PATTERN.test(swContent)) {
          console.warn(
            '[sw-cache-buster] CRITICAL_ASSETS placeholder not found in sw.js — ' +
              'precaching of critical assets was not injected. ' +
              'Check that public/sw.js still contains: const CRITICAL_ASSETS = [];'
          );
        } else {
          const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
          // Use a Set to deduplicate — assetRegex may match the same path in both href and src.
          const criticalAssetsSet = new Set<string>();

          // Extract hashed asset URLs from all link and script tags.
          // These are the JS/CSS bundles Vite produces with content hashes.
          // Match: href="./assets/..." or src="./assets/..."
          const assetRegex = /(?:href|src)="(\.\/(assets\/[^"]+))"/g;
          let match;
          while ((match = assetRegex.exec(indexHtml)) !== null) {
            const assetPath = '/' + match[2]; // Convert ./assets/... to /assets/...
            // Only include JS and CSS — skip images, fonts, etc. to keep cache small
            if (assetPath.endsWith('.js') || assetPath.endsWith('.css')) {
              criticalAssetsSet.add(assetPath);
            }
          }

          const criticalAssets = Array.from(criticalAssetsSet);
          if (criticalAssets.length > 0) {
            swContent = swContent.replace(
              CRITICAL_ASSETS_PATTERN,
              `const CRITICAL_ASSETS = ${JSON.stringify(criticalAssets)};`
            );
            console.log(
              `[sw-cache-buster] Injected ${criticalAssets.length} critical assets for install-time precaching`
            );
          }
        }
      }

      fs.writeFileSync(swPath, swContent, 'utf-8');
    },
  };
}

/**
 * Vite plugin to optimize the HTML output for mobile PWA loading speed.
 *
 * Problem: Vite adds modulepreload links for ALL vendor chunks in index.html,
 * including heavy route-specific libraries like ReactFlow (172KB), xterm (676KB),
 * and CodeMirror (436KB). On mobile, these modulepreloads compete with critical
 * resources for bandwidth, delaying First Contentful Paint by 500ms+.
 *
 * Solution: Convert modulepreload to prefetch for route-specific vendor chunks.
 * - modulepreload: Browser parses + compiles immediately (blocks FCP)
 * - prefetch: Browser downloads at lowest priority during idle (no FCP impact)
 *
 * This means these chunks are still cached for when the user navigates to their
 * respective routes, but they don't block the initial page load.
 */
function mobilePreloadOptimizer(): Plugin {
  // Vendor chunks that are route-specific and should NOT block initial load.
  // These libraries are only needed on specific routes:
  // - vendor-reactflow: /graph route only
  // - vendor-xterm: /terminal route only
  // - vendor-codemirror: spec/XML editor routes only
  // - vendor-markdown: agent view, wiki, and other markdown-rendering routes
  // - vendor-icons: lucide-react icons (587 KB) — not needed before React mounts.
  //   The !authChecked loading state uses a pure CSS spinner instead of a Lucide icon,
  //   so icons are not required until the authenticated UI renders (by which time this
  //   prefetch has usually completed on typical connections).
  const deferredChunks = [
    'vendor-reactflow',
    'vendor-xterm',
    'vendor-codemirror',
    'vendor-markdown',
    'vendor-icons',
  ];

  return {
    name: 'mobile-preload-optimizer',
    enforce: 'post',
    transformIndexHtml(html) {
      // Convert modulepreload to prefetch for deferred chunks
      // This preserves the caching benefit while eliminating the FCP penalty
      for (const chunk of deferredChunks) {
        // Match modulepreload links for this chunk
        const modulePreloadRegex = new RegExp(
          `<link rel="modulepreload" crossorigin href="(\\./assets/${chunk}-[^"]+\\.js)">`,
          'g'
        );
        html = html.replace(modulePreloadRegex, (_match, href) => {
          return `<link rel="prefetch" href="${href}" as="script">`;
        });

        // Also convert eagerly-loaded CSS for these chunks to lower priority
        const cssRegex = new RegExp(
          `<link rel="stylesheet" crossorigin href="(\\./assets/${chunk}-[^"]+\\.css)">`,
          'g'
        );
        html = html.replace(cssRegex, (_match, href) => {
          return `<link rel="prefetch" href="${href}" as="style">`;
        });
      }

      return html;
    },
  };
}

export default defineConfig(({ command }) => {
  // Only skip electron plugin during dev server in CI (no display available for Electron)
  // Always include it during build - we need dist-electron/main.js for electron-builder
  const skipElectron =
    command === 'serve' && (process.env.CI === 'true' || process.env.VITE_SKIP_ELECTRON === 'true');

  return {
    plugins: [
      // Only include electron plugin when not in CI/headless dev mode
      ...(skipElectron
        ? []
        : [
            electron({
              main: {
                entry: 'src/main.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
              preload: {
                input: 'src/preload.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
            }),
          ]),
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
      tailwindcss(),
      react(),
      // Mobile PWA optimization: demote route-specific vendor chunks from
      // modulepreload (blocks FCP) to prefetch (background download)
      mobilePreloadOptimizer(),
      // Inject build hash into sw.js CACHE_NAME for automatic cache busting
      swCacheBuster(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: process.env.HOST || '0.0.0.0',
      port: parseInt(process.env.TEST_PORT || process.env.AUTOMAKER_WEB_PORT || '3007', 10),
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://localhost:' + (process.env.AUTOMAKER_SERVER_PORT ?? '5008'),
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      // Target modern browsers for smaller output (no legacy polyfills)
      target: 'esnext',
      // Enable CSS code splitting for smaller initial CSS payload
      cssCodeSplit: true,
      // Increase chunk size warning to avoid over-splitting (which hurts HTTP/2 multiplexing)
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        external: [
          'child_process',
          'fs',
          'path',
          'crypto',
          'http',
          'net',
          'os',
          'util',
          'stream',
          'events',
          'readline',
        ],
        output: {
          // Manual chunks for optimal caching and loading on mobile
          manualChunks(id) {
            // Vendor: React core (rarely changes, cache long-term)
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            // Vendor: TanStack Router + Query (used on every page)
            if (id.includes('@tanstack/react-router') || id.includes('@tanstack/react-query')) {
              return 'vendor-tanstack';
            }
            // Vendor: UI library - split Radix UI (critical) from Lucide icons (deferrable)
            // Radix UI primitives are used on almost every page for dialogs, tooltips, etc.
            if (id.includes('@radix-ui/')) {
              return 'vendor-radix';
            }
            // Lucide icons: Split from Radix so tree-shaken icons don't bloat the critical path
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // Fonts: Each font family gets its own chunk (loaded on demand)
            if (id.includes('@fontsource/')) {
              const match = id.match(/@fontsource\/([^/]+)/);
              if (match) return `font-${match[1]}`;
            }
            // CodeMirror: Heavy editor - only loaded when needed
            if (id.includes('@codemirror/') || id.includes('@lezer/')) {
              return 'vendor-codemirror';
            }
            // Xterm: Terminal - only loaded when needed
            if (id.includes('xterm') || id.includes('@xterm/')) {
              return 'vendor-xterm';
            }
            // React Flow: Graph visualization - only loaded on dependency graph view
            if (id.includes('@xyflow/') || id.includes('reactflow')) {
              return 'vendor-reactflow';
            }
            // Zustand + Zod: State management and validation
            if (id.includes('zustand') || id.includes('zod')) {
              return 'vendor-state';
            }
            // React Markdown: Only needed on routes with markdown rendering
            if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-')) {
              return 'vendor-markdown';
            }
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ['@automaker/platform'],
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      // Build hash injected for IDB cache busting — matches what swCacheBuster injects
      // into the SW CACHE_NAME. When the build changes, both caches are invalidated together.
      __APP_BUILD_HASH__: JSON.stringify(buildHash),
    },
  };
});
