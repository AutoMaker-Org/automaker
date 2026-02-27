/**
 * Mobile Memory View Operations E2E Tests
 *
 * Core flow: create file via mobile panel, preview content, delete via dropdown.
 */

import { test, expect, devices } from '@playwright/test';
import {
  resetMemoryDirectory,
  setupProjectWithFixture,
  getFixturePath,
  navigateToMemory,
  waitForMemoryFile,
  selectMemoryFile,
  clickElement,
  fillInput,
  memoryFileExistsOnDisk,
  waitForElementHidden,
} from '../utils';

test.use({ ...devices['Pixel 5'] });

test.describe('Mobile Memory View Operations', () => {
  test.beforeEach(() => {
    resetMemoryDirectory();
  });

  test('creates file via mobile panel, previews, and deletes via dropdown', async ({ page }) => {
    const fileName = 'mobile-ops.md';

    await setupProjectWithFixture(page, getFixturePath());
    await navigateToMemory(page);

    // Actions panel: create
    await clickElement(page, 'header-actions-panel-trigger');
    await expect(page.locator('[data-testid="refresh-memory-button-mobile"]')).toBeVisible();
    await clickElement(page, 'create-memory-button-mobile');
    await page
      .locator('[data-testid="create-memory-dialog"]')
      .waitFor({ state: 'visible', timeout: 3000 });
    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(page, 'new-memory-content', '# Mobile Ops\n\n**Bold** and *italic*');
    await clickElement(page, 'confirm-create-memory');
    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 3000 });
    await waitForMemoryFile(page, fileName);

    await expect(page.locator(`[data-testid="memory-file-${fileName}"]`)).toBeVisible();
    expect(memoryFileExistsOnDisk(fileName)).toBe(true);

    // Open file and check preview (selectMemoryFile clicks and waits for content with retries)
    await selectMemoryFile(page, fileName, 5000);
    const preview = page.locator('[data-testid="markdown-preview"]');
    await expect(preview).toBeVisible();
    await expect(preview.locator('h1')).toHaveText('Mobile Ops');

    // Delete via file list dropdown (back to list first so file row is visible on mobile)
    const backButton = page.locator('button[aria-label="Back"]');
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click();
      await page
        .locator('[data-testid="memory-file-list"]')
        .waitFor({ state: 'visible', timeout: 2000 });
    }
    const fileRow = page.locator(`[data-testid="memory-file-${fileName}"]`);
    await fileRow.hover();
    await page.locator(`[data-testid="memory-file-menu-${fileName}"]`).click({ force: true });
    const deleteMenuItem = page.locator(`[data-testid="delete-memory-file-${fileName}"]`);
    await deleteMenuItem.waitFor({ state: 'visible', timeout: 2000 });
    await deleteMenuItem.click();
    await waitForElementHidden(page, `memory-file-${fileName}`, { timeout: 5000 });

    expect(memoryFileExistsOnDisk(fileName)).toBe(false);
  });
});
