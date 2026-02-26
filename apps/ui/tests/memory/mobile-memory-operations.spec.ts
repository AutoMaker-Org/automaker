/**
 * Mobile Memory View Operations E2E Tests
 *
 * Tests for file operations on mobile in the memory view:
 * - Deleting files via dropdown menu on mobile
 * - Creating files via mobile actions panel
 */

import { test, expect, devices } from '@playwright/test';
import {
  resetMemoryDirectory,
  setupProjectWithFixture,
  getFixturePath,
  navigateToMemory,
  waitForMemoryFile,
  clickElement,
  fillInput,
  waitForNetworkIdle,
  authenticateForTests,
  memoryFileExistsOnDisk,
  waitForElementHidden,
} from '../utils';

// Use mobile viewport for mobile tests in Chromium CI
test.use({ ...devices['Pixel 5'] });

test.describe('Mobile Memory View Operations', () => {
  test.beforeEach(async () => {
    resetMemoryDirectory();
  });

  test.afterEach(async () => {
    resetMemoryDirectory();
  });

  test('should create a file via mobile actions panel', async ({ page }) => {
    const fileName = 'mobile-created.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // Create a test file via mobile actions panel
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-memory-button-mobile');
    await page.waitForSelector('[data-testid="create-memory-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(page, 'new-memory-content', '# Created on Mobile');

    await clickElement(page, 'confirm-create-memory');

    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForMemoryFile(page, fileName);

    // Verify file appears in list
    const fileButton = page.locator(`[data-testid="memory-file-${fileName}"]`);
    await expect(fileButton).toBeVisible();

    // Verify file exists on disk
    expect(memoryFileExistsOnDisk(fileName)).toBe(true);
  });

  test('should delete a file via dropdown menu on mobile', async ({ page }) => {
    const fileName = 'delete-via-menu-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // Create a test file
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-memory-button-mobile');
    await page.waitForSelector('[data-testid="create-memory-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(page, 'new-memory-content', '# File to Delete');

    await clickElement(page, 'confirm-create-memory');

    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForMemoryFile(page, fileName);

    // Verify file exists
    expect(memoryFileExistsOnDisk(fileName)).toBe(true);

    // Close actions panel if still open
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Click on the file menu dropdown - hover first to make it visible
    const fileRow = page.locator(`[data-testid="memory-file-${fileName}"]`);
    await fileRow.hover();

    const fileMenuButton = page.locator(`[data-testid="memory-file-menu-${fileName}"]`);
    await fileMenuButton.click({ force: true });

    // Wait for dropdown
    await page.waitForTimeout(300);

    // Click delete in dropdown
    const deleteMenuItem = page.locator(`[data-testid="delete-memory-file-${fileName}"]`);
    await deleteMenuItem.click();

    // Wait for file to be removed from list
    await waitForElementHidden(page, `memory-file-${fileName}`, { timeout: 5000 });

    // Verify file no longer exists on disk
    expect(memoryFileExistsOnDisk(fileName)).toBe(false);
  });

  test('should refresh button be available in actions panel', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // Open actions panel
    await clickElement(page, 'header-actions-panel-trigger');

    // Verify refresh button is visible in actions panel
    const refreshButton = page.locator('[data-testid="refresh-memory-button-mobile"]');
    await expect(refreshButton).toBeVisible();
  });

  test('should preview markdown content on mobile', async ({ page }) => {
    const fileName = 'preview-test.md';
    const markdownContent =
      '# Preview Test\n\n**Bold text** and *italic text*\n\n- List item 1\n- List item 2';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // Create a test file
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-memory-button-mobile');
    await page.waitForSelector('[data-testid="create-memory-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(page, 'new-memory-content', markdownContent);

    await clickElement(page, 'confirm-create-memory');

    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForMemoryFile(page, fileName);

    // Select the file by clicking on it
    const fileButton = page.locator(`[data-testid="memory-file-${fileName}"]`);
    await fileButton.click();

    // Wait for content to load (preview or editor)
    await page.waitForSelector('[data-testid="markdown-preview"], [data-testid="memory-editor"]', {
      timeout: 5000,
    });

    // Memory files open in preview mode by default
    const markdownPreview = page.locator('[data-testid="markdown-preview"]');
    await expect(markdownPreview).toBeVisible();

    // Verify the preview rendered the markdown (check for h1)
    const h1 = markdownPreview.locator('h1');
    await expect(h1).toHaveText('Preview Test');
  });
});
