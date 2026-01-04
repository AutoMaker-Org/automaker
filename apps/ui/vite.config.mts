import * as path from 'path';
import * as fs from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version;

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
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: parseInt(process.env.TEST_PORT || '3007', 10),
    },
    build: {
      outDir: 'dist',
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
      },
    },
    optimizeDeps: {
      exclude: ['@automaker/platform'],
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
  };
});
