/**
 * Desktop Memory View E2E Tests
 *
 * Tests for desktop behavior in the memory view:
 * - File list and editor visible side-by-side
 * - Back button is NOT visible on desktop
 * - Toolbar buttons show both icon and text
 * - Delete button is visible in toolbar (not hidden like on mobile)
 */

import { test, expect } from '@playwright/test';
import {
  resetMemoryDirectory,
  setupProjectWithFixture,
  getFixturePath,
  navigateToMemory,
  waitForMemoryFile,
  selectMemoryFile,
  waitForMemoryContentToLoad,
  clickElement,
  fillInput,
  waitForNetworkIdle,
  authenticateForTests,
  waitForElementHidden,
} from '../utils';

// Use desktop viewport for desktop tests
test.use({ viewport: { width: 1280, height: 720 } });

test.describe('Desktop Memory View', () => {
  test.beforeEach(async () => {
    resetMemoryDirectory();
  });

  test.afterEach(async () => {
    resetMemoryDirectory();
  });

  test('should show file list and editor side-by-side on desktop', async ({ page }) => {
    const fileName = 'desktop-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // Create a test file
    await clickElement(page, 'create-memory-button');
    await page.waitForSelector('[data-testid="create-memory-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(
      page,
      'new-memory-content',
      '# Desktop Test\n\nThis tests desktop view behavior'
    );

    await clickElement(page, 'confirm-create-memory');

    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForMemoryFile(page, fileName);

    // Select the file
    await selectMemoryFile(page, fileName);
    await waitForMemoryContentToLoad(page);

    // On desktop, file list should be visible after selection
    const fileList = page.locator('[data-testid="memory-file-list"]');
    await expect(fileList).toBeVisible();

    // Editor panel should also be visible (either editor or preview)
    const editor = page.locator('[data-testid="memory-editor"], [data-testid="markdown-preview"]');
    await expect(editor).toBeVisible();
  });

  test('should NOT show back button in editor toolbar on desktop', async ({ page }) => {
    const fileName = 'no-back-button-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // Create a test file
    await clickElement(page, 'create-memory-button');
    await page.waitForSelector('[data-testid="create-memory-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(page, 'new-memory-content', '# No Back Button Test');

    await clickElement(page, 'confirm-create-memory');

    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForMemoryFile(page, fileName);

    // Select the file
    await selectMemoryFile(page, fileName);
    await waitForMemoryContentToLoad(page);

    // Back button should NOT be visible on desktop
    const backButton = page.locator('button[aria-label="Back"]');
    await expect(backButton).not.toBeVisible();
  });

  test('should show buttons with text labels on desktop', async ({ page }) => {
    const fileName = 'text-labels-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // Create a test file
    await clickElement(page, 'create-memory-button');
    await page.waitForSelector('[data-testid="create-memory-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(
      page,
      'new-memory-content',
      '# Text Labels Test\n\nTesting button text labels on desktop'
    );

    await clickElement(page, 'confirm-create-memory');

    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForMemoryFile(page, fileName);

    // Select the file
    await selectMemoryFile(page, fileName);
    await waitForMemoryContentToLoad(page);

    // Get the toggle preview mode button
    const toggleButton = page.locator('[data-testid="toggle-preview-mode"]');
    await expect(toggleButton).toBeVisible();

    // Button should have text label on desktop
    const buttonText = await toggleButton.textContent();
    // On desktop, button should have visible text (Edit or Preview)
    expect(buttonText?.trim()).not.toBe('');
    expect(buttonText?.toLowerCase()).toMatch(/(edit|preview)/);
  });

  test('should show delete button in toolbar on desktop', async ({ page }) => {
    const fileName = 'delete-button-desktop-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // Create a test file
    await clickElement(page, 'create-memory-button');
    await page.waitForSelector('[data-testid="create-memory-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(page, 'new-memory-content', '# Delete Button Desktop Test');

    await clickElement(page, 'confirm-create-memory');

    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForMemoryFile(page, fileName);

    // Select the file
    await selectMemoryFile(page, fileName);
    await waitForMemoryContentToLoad(page);

    // Delete button in toolbar should be visible on desktop
    const deleteButton = page.locator('[data-testid="delete-memory-file"]');
    await expect(deleteButton).toBeVisible();
  });

  test('should show file list at fixed width on desktop when file is selected', async ({
    page,
  }) => {
    const fileName = 'fixed-width-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // Create a test file
    await clickElement(page, 'create-memory-button');
    await page.waitForSelector('[data-testid="create-memory-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(page, 'new-memory-content', '# Fixed Width Test');

    await clickElement(page, 'confirm-create-memory');

    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForMemoryFile(page, fileName);

    // Select the file
    await selectMemoryFile(page, fileName);
    await waitForMemoryContentToLoad(page);

    // File list should be visible
    const fileList = page.locator('[data-testid="memory-file-list"]');
    await expect(fileList).toBeVisible();

    // On desktop with file selected, the file list should be at fixed width (w-64 = 256px)
    const fileListBox = await fileList.boundingBox();
    expect(fileListBox).not.toBeNull();

    if (fileListBox) {
      // Desktop file list is w-64 = 256px, allow some tolerance for borders
      expect(fileListBox.width).toBeLessThanOrEqual(300);
      expect(fileListBox.width).toBeGreaterThanOrEqual(200);
    }
  });

  test('should show action buttons inline in header on desktop', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToMemory(page);

    // On desktop, inline buttons should be visible
    const createButton = page.locator('[data-testid="create-memory-button"]');
    await expect(createButton).toBeVisible();

    const refreshButton = page.locator('[data-testid="refresh-memory-button"]');
    await expect(refreshButton).toBeVisible();
  });
});
