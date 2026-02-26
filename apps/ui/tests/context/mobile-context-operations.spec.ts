/**
 * Mobile Context View Operations E2E Tests
 *
 * Tests for file operations on mobile in the context view:
 * - Deleting files via dropdown menu on mobile
 * - Creating files via mobile actions panel
 */

import { test, expect, devices } from '@playwright/test';
import {
  resetContextDirectory,
  setupProjectWithFixture,
  getFixturePath,
  navigateToContext,
  waitForContextFile,
  clickElement,
  fillInput,
  waitForNetworkIdle,
  authenticateForTests,
  contextFileExistsOnDisk,
  waitForElementHidden,
} from '../utils';

// Use mobile viewport for mobile tests in Chromium CI
test.use({ ...devices['Pixel 5'] });

test.describe('Mobile Context View Operations', () => {
  test.beforeEach(async () => {
    resetContextDirectory();
  });

  test.afterEach(async () => {
    resetContextDirectory();
  });

  test('should create a file via mobile actions panel', async ({ page }) => {
    const fileName = 'mobile-created.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file via mobile actions panel
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-markdown-button-mobile');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(page, 'new-markdown-content', '# Created on Mobile');

    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Verify file appears in list
    const fileButton = page.locator(`[data-testid="context-file-${fileName}"]`);
    await expect(fileButton).toBeVisible();

    // Verify file exists on disk
    expect(contextFileExistsOnDisk(fileName)).toBe(true);
  });

  test('should delete a file via dropdown menu on mobile', async ({ page }) => {
    const fileName = 'delete-via-menu-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-markdown-button-mobile');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(page, 'new-markdown-content', '# File to Delete');

    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Verify file exists
    expect(contextFileExistsOnDisk(fileName)).toBe(true);

    // Close actions panel if still open
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Click on the file menu dropdown - hover first to make it visible
    const fileRow = page.locator(`[data-testid="context-file-${fileName}"]`);
    await fileRow.hover();

    const fileMenuButton = page.locator(`[data-testid="context-file-menu-${fileName}"]`);
    await fileMenuButton.click({ force: true });

    // Wait for dropdown
    await page.waitForTimeout(300);

    // Click delete in dropdown
    const deleteMenuItem = page.locator(`[data-testid="delete-context-file-${fileName}"]`);
    await deleteMenuItem.click();

    // Wait for file to be removed from list
    await waitForElementHidden(page, `context-file-${fileName}`, { timeout: 5000 });

    // Verify file no longer exists on disk
    expect(contextFileExistsOnDisk(fileName)).toBe(false);
  });

  test('should import file button be available in actions panel', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Open actions panel
    await clickElement(page, 'header-actions-panel-trigger');

    // Verify import button is visible in actions panel
    const importButton = page.locator('[data-testid="import-file-button-mobile"]');
    await expect(importButton).toBeVisible();
  });
});
