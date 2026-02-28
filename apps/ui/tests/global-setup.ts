/**
 * Global setup for all e2e tests
 * This runs once before all tests start.
 * It authenticates with the backend and saves the session state so that
 * all workers/tests can reuse it (avoiding per-test login overhead).
 */

import { chromium, FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  cleanupLeftoverFixtureWorkerDirs,
  cleanupLeftoverTestDirs,
} from './utils/cleanup-test-dirs';

const TEST_PORT = process.env.TEST_PORT || '3107';
const TEST_SERVER_PORT = process.env.TEST_SERVER_PORT || '3108';
const reuseServer = process.env.TEST_REUSE_SERVER === 'true';
const API_BASE_URL = `http://127.0.0.1:${TEST_SERVER_PORT}`;
const WEB_BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const AUTH_DIR = path.join(__dirname, '.auth');
const AUTH_STATE_PATH = path.join(AUTH_DIR, 'storage-state.json');

async function globalSetup(config: FullConfig) {
  // Clean up leftover test dirs and fixture worker copies from previous runs (aborted, crashed, etc.)
  cleanupLeftoverTestDirs();
  cleanupLeftoverFixtureWorkerDirs();

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

  // Authenticate once and save state for all workers
  await authenticateAndSaveState(config);

  console.log('[GlobalSetup] Setup complete');
}

/**
 * Authenticate with the backend and save browser storage state.
 * All test workers will load this state to skip per-test authentication.
 */
async function authenticateAndSaveState(_config: FullConfig) {
  // Ensure auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const apiKey = process.env.AUTOMAKER_API_KEY || 'test-api-key-for-e2e-tests';

  // Wait for backend to be ready (exponential backoff: 250ms → 500ms → 1s → 2s)
  const start = Date.now();
  let backoff = 250;
  let healthy = false;
  while (Date.now() - start < 30000) {
    try {
      const health = await fetch(`${API_BASE_URL}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (health.ok) {
        healthy = true;
        break;
      }
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 2000);
  }
  if (!healthy) {
    throw new Error(`Backend health check timed out after 30s for ${API_BASE_URL}`);
  }

  // Launch a browser to get a proper context for login
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the app first (needed for cookies to bind to the correct domain)
    await page.goto(WEB_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Login via API
    const loginResponse = await page.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { apiKey },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    const response = (await loginResponse.json().catch(() => null)) as {
      success?: boolean;
      token?: string;
    } | null;

    if (!response?.success || !response.token) {
      throw new Error(
        '[GlobalSetup] Login failed - cannot proceed without authentication. ' +
          'Check that the backend is running and AUTOMAKER_API_KEY is set correctly.'
      );
    }

    // Set the session cookie
    await context.addCookies([
      {
        name: 'automaker_session',
        value: response.token,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    // Verify auth works
    const statusRes = await page.request.get(`${API_BASE_URL}/api/auth/status`, {
      timeout: 5000,
    });
    const statusJson = (await statusRes.json().catch(() => null)) as {
      authenticated?: boolean;
    } | null;

    if (!statusJson?.authenticated) {
      throw new Error(
        '[GlobalSetup] Auth verification failed - session cookie was set but status check returned unauthenticated.'
      );
    }

    // Save storage state for all workers to reuse
    await context.storageState({ path: AUTH_STATE_PATH });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
