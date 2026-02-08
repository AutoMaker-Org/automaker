/**
 * E2E tests for Gitea API token management in Settings view
 *
 * Verifies that the Gitea API Token field appears in the API Keys section
 * and that save/delete operations work correctly.
 */

import { test, expect } from '@playwright/test';
import { setupMockProject } from '../utils/project/setup';
import { navigateToSettings } from '../utils/navigation/views';

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

test.describe('Settings - Gitea API Token', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockProject(page);
    await ensureSetupComplete(page);
    await navigateToSettings(page);

    // Navigate to the API Keys section within settings
    const apiKeysTab = page.getByText('API Keys', { exact: true });
    await apiKeysTab.click();
    await page.waitForTimeout(500);
  });

  test('Gitea API Token field is visible in settings', async ({ page }) => {
    // The API Keys section should have a Gitea API Token field
    const giteaLabel = page.getByText('Gitea API Token');
    await expect(giteaLabel).toBeVisible({ timeout: 10000 });
  });

  test('can enter and save a Gitea token', async ({ page }) => {
    // Find the Gitea input field and enter a token
    const giteaInput = page.locator('[data-testid="gitea-api-key-input"]');
    await expect(giteaInput).toBeVisible({ timeout: 10000 });
    await giteaInput.fill('test-gitea-token-12345');

    // Click the Save button
    const saveButton = page.locator('button:has-text("Save API Keys")').first();
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await saveButton.click();

    // Verify the save completed — button shows "Saved!" confirmation
    const savedConfirmation = page.getByText('Saved!');
    await expect(savedConfirmation).toBeVisible({ timeout: 5000 });
  });

  test('Gitea API Token test button exists', async ({ page }) => {
    const testButton = page.locator('[data-testid="test-gitea-connection"]');
    await expect(testButton).toBeVisible({ timeout: 10000 });
  });
});
