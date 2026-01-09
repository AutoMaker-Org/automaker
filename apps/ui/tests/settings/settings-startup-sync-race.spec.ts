/**
 * Settings Startup Race Regression Test
 *
 * Repro (historical bug):
 * - UI verifies session successfully
 * - Initial GET /api/settings/global fails transiently (backend still starting)
 * - UI unblocks settings sync anyway and can push default empty state to server
 * - Server persists projects: [] (and other defaults), wiping settings.json
 *
 * This test forces the first few /api/settings/global requests to fail and asserts that
 * the server-side settings.json is NOT overwritten while the UI is waiting to hydrate.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateForTests, handleLoginScreenIfPresent } from '../utils';

const SETTINGS_PATH = path.resolve(process.cwd(), '../server/data/settings.json');
const WORKSPACE_ROOT = path.resolve(process.cwd(), '../..');
const FIXTURE_PROJECT_PATH = path.join(WORKSPACE_ROOT, 'test/fixtures/projectA');

test.describe('Settings startup sync race', () => {
  let originalSettingsJson: string;

  test.beforeAll(() => {
    originalSettingsJson = fs.readFileSync(SETTINGS_PATH, 'utf-8');

    const settings = JSON.parse(originalSettingsJson) as Record<string, unknown>;
    settings.projects = [
      {
        id: `e2e-project-${Date.now()}`,
        name: 'E2E Project (settings race)',
        path: FIXTURE_PROJECT_PATH,
        lastOpened: new Date().toISOString(),
        theme: 'dark',
      },
    ];

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  });

  test.afterAll(() => {
    // Restore original settings.json to avoid polluting other tests/dev state
    fs.writeFileSync(SETTINGS_PATH, originalSettingsJson);
  });

  test('does not overwrite projects when /api/settings/global is temporarily unavailable', async ({
    page,
  }) => {
    // Gate the real settings request so we can assert file contents before allowing hydration.
    let requestCount = 0;
    let allowSettingsRequestResolve: (() => void) | null = null;
    const allowSettingsRequest = new Promise<void>((resolve) => {
      allowSettingsRequestResolve = resolve;
    });

    let sawThreeFailuresResolve: (() => void) | null = null;
    const sawThreeFailures = new Promise<void>((resolve) => {
      sawThreeFailuresResolve = resolve;
    });

    await page.route('**/api/settings/global', async (route) => {
      requestCount++;
      if (requestCount <= 3) {
        if (requestCount === 3) {
          sawThreeFailuresResolve?.();
        }
        await route.abort('failed');
        return;
      }
      // Keep the 4th+ request pending until the test explicitly allows it.
      await allowSettingsRequest;
      await route.continue();
    });

    // Ensure we are authenticated (session cookie) before loading the app.
    await authenticateForTests(page);
    await page.goto('/');

    // Wait until we have forced a few failures.
    await sawThreeFailures;

    // At this point, the UI should NOT have written defaults back to the server.
    const settingsAfterFailures = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as {
      projects?: Array<{ path?: string }>;
    };
    expect(settingsAfterFailures.projects?.length).toBeGreaterThan(0);
    expect(settingsAfterFailures.projects?.[0]?.path).toBe(FIXTURE_PROJECT_PATH);

    // Allow the settings request to succeed so the app can hydrate and proceed.
    allowSettingsRequestResolve?.();

    // App should eventually render a main view after settings hydration.
    await page
      .locator('[data-testid="welcome-view"], [data-testid="board-view"]')
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });

    // Verify settings.json still contains the project after hydration completes.
    const settingsAfterHydration = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as {
      projects?: Array<{ path?: string }>;
    };
    expect(settingsAfterHydration.projects?.length).toBeGreaterThan(0);
    expect(settingsAfterHydration.projects?.[0]?.path).toBe(FIXTURE_PROJECT_PATH);
  });

  test('does not wipe projects during logout transition', async ({ page }) => {
    // Ensure authenticated and app is loaded at least to welcome/board.
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await page
      .locator('[data-testid="welcome-view"], [data-testid="board-view"]')
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });

    // Confirm settings.json currently has projects (precondition).
    const beforeLogout = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as {
      projects?: Array<unknown>;
    };
    expect(beforeLogout.projects?.length).toBeGreaterThan(0);

    // Navigate to settings, then to Account section (logout button is only visible there)
    await page.goto('/settings');
    // Wait for settings view to load, then click on Account section
    await page.locator('button:has-text("Account")').first().click();
    // Wait for account section to be visible before clicking logout
    await page
      .locator('[data-testid="logout-button"]')
      .waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="logout-button"]').click();

    // Ensure we landed on logged-out or login (either is acceptable).
    // Note: The page uses curly apostrophe (') so we match the heading role instead
    await page
      .getByRole('heading', { name: /logged out/i })
      .or(page.locator('text=Authentication Required'))
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });

    // The server settings file should still have projects after logout.
    const afterLogout = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as {
      projects?: Array<unknown>;
    };
    expect(afterLogout.projects?.length).toBeGreaterThan(0);
  });
});
