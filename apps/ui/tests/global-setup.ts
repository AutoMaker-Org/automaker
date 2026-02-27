/**
 * Global setup for all e2e tests
 * This runs once before all tests start
 */

const TEST_PORT = process.env.TEST_PORT || '3107';
const reuseServer = process.env.TEST_REUSE_SERVER === 'true';

async function globalSetup() {
  // Note: Server killing is handled by the pretest script in package.json
  // GlobalSetup runs AFTER webServer starts, so we can't kill the server here

  if (reuseServer) {
    const baseURL = `http://127.0.0.1:${TEST_PORT}`;
    try {
      const res = await fetch(baseURL, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      throw new Error(
        `TEST_REUSE_SERVER is set but nothing is listening at ${baseURL}. ` +
          'Start the UI and server first (e.g. from apps/ui: TEST_PORT=3107 TEST_SERVER_PORT=3108 pnpm dev; from apps/server: PORT=3108 pnpm run dev:test) or run tests without TEST_REUSE_SERVER.'
      );
    }
  }

  console.log('[GlobalSetup] Setup complete');
}

export default globalSetup;
