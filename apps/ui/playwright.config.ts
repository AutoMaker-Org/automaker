import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const port = process.env.TEST_PORT || 3107;

// PATH that includes common git locations so the E2E server can run git (worktree list, etc.)
const pathSeparator = process.platform === 'win32' ? ';' : ':';
const extraPath =
  process.platform === 'win32'
    ? [
        process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`,
        process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Git\\cmd`,
      ].filter(Boolean)
    : [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/home/linuxbrew/.linuxbrew/bin',
        process.env.HOME && `${process.env.HOME}/.local/bin`,
      ].filter(Boolean);
const e2eServerPath = [process.env.PATH, ...extraPath].filter(Boolean).join(pathSeparator);
const serverPort = process.env.TEST_SERVER_PORT || 3108;
// When true, no webServer is started; you must run UI (port 3107) and server (3108) yourself.
const reuseServer = process.env.TEST_REUSE_SERVER === 'true';
// Only skip backend startup when explicitly requested for E2E runs.
// VITE_SERVER_URL may be set in user shells for local dev and should not affect tests.
const useExternalBackend = process.env.TEST_USE_EXTERNAL_BACKEND === 'true';
// Always use mock agent for tests (disables rate limiting, uses mock Claude responses)
const mockAgent = true;

// Auth state file written by global setup, reused by all tests to skip per-test login
const AUTH_STATE_PATH = path.join(__dirname, 'tests/.auth/storage-state.json');

export default defineConfig({
  testDir: './tests',
  // Keep Playwright scoped to E2E specs so Vitest unit files are not executed here.
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/unit/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Use multiple workers for parallelism. CI gets 2 workers (constrained resources),
  // local runs use 8 workers for faster test execution.
  workers: process.env.CI ? 2 : 8,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    // Reuse auth state from global setup - avoids per-test login overhead
    storageState: AUTH_STATE_PATH,
  },
  // Global setup - authenticate once and save state for all workers
  globalSetup: require.resolve('./tests/global-setup.ts'),
  globalTeardown: require.resolve('./tests/global-teardown.ts'),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(reuseServer
    ? {}
    : {
        webServer: [
          // Backend server - runs with mock agent enabled in CI
          // Uses dev:test (no file watching) to avoid port conflicts from server restarts
          ...(useExternalBackend
            ? []
            : [
                {
                  command: `cd ../server && npm run dev:test`,
                  url: `http://127.0.0.1:${serverPort}/api/health`,
                  // Don't reuse existing server to ensure we use the test API key
                  reuseExistingServer: false,
                  timeout: 60000,
                  env: {
                    ...process.env,
                    PORT: String(serverPort),
                    // Ensure server can find git in CI/minimal env (worktree list, etc.)
                    PATH: e2eServerPath,
                    // Enable mock agent in CI to avoid real API calls
                    AUTOMAKER_MOCK_AGENT: mockAgent ? 'true' : 'false',
                    // Set a test API key for web mode authentication
                    AUTOMAKER_API_KEY:
                      process.env.AUTOMAKER_API_KEY || 'test-api-key-for-e2e-tests',
                    // Hide the API key banner to reduce log noise
                    AUTOMAKER_HIDE_API_KEY: 'true',
                    // Explicitly unset ALLOWED_ROOT_DIRECTORY to allow all paths for testing
                    // (prevents inheriting /projects from Docker or other environments)
                    ALLOWED_ROOT_DIRECTORY: '',
                    // Simulate containerized environment to skip sandbox confirmation dialogs
                    IS_CONTAINERIZED: 'true',
                    // Increase Node.js memory limit to prevent OOM during tests
                    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096']
                      .filter(Boolean)
                      .join(' '),
                  },
                },
              ]),
          // Frontend Vite dev server
          {
            command: `npm run dev`,
            url: `http://127.0.0.1:${port}`,
            reuseExistingServer: false,
            timeout: 120000,
            env: {
              ...process.env,
              // Must set AUTOMAKER_WEB_PORT to match the port Playwright waits for
              AUTOMAKER_WEB_PORT: String(port),
              // Must set AUTOMAKER_SERVER_PORT so Vite proxy forwards to the correct backend port
              AUTOMAKER_SERVER_PORT: String(serverPort),
              VITE_SKIP_SETUP: 'true',
              // Always skip electron plugin during tests - prevents duplicate server spawning
              VITE_SKIP_ELECTRON: 'true',
              // Clear VITE_SERVER_URL to force the frontend to use the Vite proxy (/api)
              // instead of calling the backend directly. Direct calls bypass the proxy and
              // cause cookie domain mismatches (cookies are bound to 127.0.0.1 but
              // VITE_SERVER_URL typically uses localhost).
              VITE_SERVER_URL: '',
            },
          },
        ],
      }),
});
