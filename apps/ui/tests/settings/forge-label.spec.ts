/**
 * E2E tests for dynamic forge label in sidebar
 *
 * Verifies that the sidebar shows the correct forge section label
 * (GitHub, Gitea, or hidden) based on the detected forge type.
 */

import { test, expect } from '@playwright/test';
import { authenticateForTests, handleLoginScreenIfPresent } from '../utils';
import { setupMockProject } from '../utils/project/setup';
import { waitForSplashScreenToDisappear } from '../utils/core/waiting';

/**
 * Intercept settings API to ensure setupComplete is true.
 * The server may have setupComplete=false which causes a redirect to /setup.
 */
async function ensureSetupComplete(page: import('@playwright/test').Page) {
  await page.route('**/api/settings/global', async (route) => {
    if (route.request().method() === 'GET') {
      const response = await route.fetch();
      const body = await response.json();
      if (body.settings) {
        body.settings.setupComplete = true;
        body.settings.isFirstRun = false;
      }
      await route.fulfill({
        response,
        body: JSON.stringify(body),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe('Sidebar - Dynamic Forge Label', () => {
  test('shows "GitHub" section label for github forge', async ({ page }) => {
    await setupMockProject(page);
    await ensureSetupComplete(page);

    // Mock the check-remote API to return github forge type
    await page.route('**/api/github/check-remote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          hasGitHubRemote: true,
          hasRemote: true,
          forgeType: 'github',
          remoteUrl: 'https://github.com/owner/repo.git',
          owner: 'owner',
          repo: 'repo',
          baseUrl: 'https://github.com',
        }),
      });
    });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await waitForSplashScreenToDisappear(page, 3000);
    await handleLoginScreenIfPresent(page);

    // Wait for the board view
    await page
      .locator(
        '[data-testid="welcome-view"], [data-testid="dashboard-view"], [data-testid="board-view"]'
      )
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });

    // The sidebar should show "GitHub" as a section label
    const githubSection = page.getByText('GitHub', { exact: true }).first();
    await expect(githubSection).toBeVisible({ timeout: 10000 });
  });

  test('shows "Gitea" section label for gitea forge', async ({ page }) => {
    await setupMockProject(page);
    await ensureSetupComplete(page);

    // Mock the check-remote API to return gitea forge type
    await page.route('**/api/github/check-remote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          hasGitHubRemote: false,
          hasRemote: true,
          forgeType: 'gitea',
          remoteUrl: 'https://gitea.example.com/owner/repo.git',
          owner: 'owner',
          repo: 'repo',
          baseUrl: 'https://gitea.example.com',
        }),
      });
    });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await waitForSplashScreenToDisappear(page, 3000);
    await handleLoginScreenIfPresent(page);

    // Wait for main app view
    await page
      .locator(
        '[data-testid="welcome-view"], [data-testid="dashboard-view"], [data-testid="board-view"]'
      )
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });

    // The sidebar should show "Gitea" as a section label
    const giteaSection = page.getByText('Gitea', { exact: true }).first();
    await expect(giteaSection).toBeVisible({ timeout: 10000 });
  });

  test('hides forge section for unknown forge type', async ({ page }) => {
    await setupMockProject(page);
    await ensureSetupComplete(page);

    // Mock the check-remote API to return unknown forge type
    await page.route('**/api/github/check-remote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          hasGitHubRemote: false,
          hasRemote: false,
          forgeType: 'unknown',
          remoteUrl: null,
          owner: null,
          repo: null,
          baseUrl: null,
        }),
      });
    });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await waitForSplashScreenToDisappear(page, 3000);
    await handleLoginScreenIfPresent(page);

    // Wait for main app view
    await page
      .locator(
        '[data-testid="welcome-view"], [data-testid="dashboard-view"], [data-testid="board-view"]'
      )
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });

    // Wait for the sidebar to stabilize
    await page.waitForTimeout(2000);

    // Neither "GitHub" nor "Gitea" section labels should be visible in sidebar
    const issuesLink = page.locator('nav').getByText('Issues');
    await expect(issuesLink).not.toBeVisible();
  });
});
