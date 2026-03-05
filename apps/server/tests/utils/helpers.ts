/**
 * Test helper functions
 */
import express, { type Router } from 'express';
import http from 'node:http';

export type TestHttpServer = {
  url: string;
  close: () => Promise<void>;
};

/**
 * Static port assignments for automation test HTTP servers.
 *
 * Each test file that starts its own HTTP server is assigned a dedicated port
 * so that parallel Vitest workers never collide. Ports are in the 19871-19899
 * range — intentionally outside:
 *   - Production ports (3007 UI, 3008 server)
 *   - Ephemeral/dynamic port range (32768-65535 on Linux, 49152+ on macOS)
 *
 * IMPORTANT: Do NOT use port 0 (OS-assigned). Port 0 requires reading the
 * address back at runtime and can silently interact with a running Automaker
 * server in development environments.
 *
 * ADDING A NEW TEST FILE THAT NEEDS AN HTTP SERVER:
 *   1. Pick the next available port after 19877.
 *   2. Add an entry to this object with a descriptive ALL_CAPS key.
 *   3. Add a JSDoc comment mapping the key to the test file path.
 *   4. Use TEST_HTTP_PORTS.YOUR_KEY when calling createTestHttpServer().
 *   5. Do NOT share a port between two files that can run in parallel.
 */
export const TEST_HTTP_PORTS = {
  /** apps/server/tests/unit/routes/automation-routes.test.ts */
  AUTOMATION_ROUTES: 19871,
  /** apps/server/tests/unit/routes/automation-manage-route.test.ts */
  AUTOMATION_MANAGE_ROUTE: 19872,
  /** apps/server/tests/unit/routes/automation-variables-route.test.ts */
  AUTOMATION_VARIABLES_ROUTE: 19873,
  /** apps/server/tests/unit/services/automation-builtins-extended.test.ts */
  AUTOMATION_BUILTINS_EXTENDED: 19874,
  /** apps/server/tests/integration/routes/automation/manage.integration.test.ts */
  AUTOMATION_MANAGE_INTEGRATION: 19875,
  /** apps/server/tests/integration/services/automation-runtime-builtins.integration.test.ts */
  AUTOMATION_RUNTIME_BUILTINS_INTEGRATION: 19876,
  /** apps/server/tests/integration/services/automation-scheduler-triggers.integration.test.ts */
  AUTOMATION_SCHEDULER_TRIGGERS_INTEGRATION: 19877,
} as const;

/**
 * Create a minimal Express test server bound to the given static port.
 *
 * Enables JSON body-parsing and mounts `router` at `mountPath` (default `/`).
 * The caller must invoke `close()` in afterEach/afterAll to release the port
 * before the next test in the same file binds to it (tests within a Vitest
 * file run sequentially, so sequential create/close is safe).
 *
 * @param router   Express Router to mount.
 * @param port     Static port from TEST_HTTP_PORTS.
 * @param options  Optional configuration.
 * @param options.mountPath  Path prefix for the router (default `"/"`).
 */
export async function createTestHttpServer(
  router: Router,
  port: number,
  options?: { mountPath?: string }
): Promise<TestHttpServer> {
  const app = express();
  app.use(express.json());
  // Disable keep-alive so connections are not pooled between tests.
  // Without this, Node's undici HTTP client pools connections and reuses them
  // for the next test's server on the same port, causing ECONNRESET on the
  // second test when the server restarts.
  app.use((_req, res, next) => {
    res.setHeader('Connection', 'close');
    next();
  });
  app.use(options?.mountPath ?? '/', router);
  return startExpressServer(app, port);
}

/**
 * Create a raw Node.js HTTP test server bound to the given static port.
 * Use this when you need full control over the request/response cycle
 * without Express (e.g. to capture raw request data in builtin tests).
 */
export async function createRawTestHttpServer(
  handler: http.RequestListener,
  port: number
): Promise<TestHttpServer> {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            server.closeAllConnections();
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.once('error', reject);
  });
}

function startExpressServer(app: express.Application, port: number): Promise<TestHttpServer> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            // Force-close keep-alive connections so the port is released immediately.
            // Without this, Node's undici HTTP client pools connections and reuses them
            // for the next test's server on the same port, causing ECONNRESET.
            server.closeAllConnections();
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.once('error', reject);
  });
}

/**
 * Collect all values from an async generator
 */
export async function collectAsyncGenerator<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 1000,
  interval = 10
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Create a temporary directory for tests
 */
export function createTempDir(): string {
  return `/tmp/test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
