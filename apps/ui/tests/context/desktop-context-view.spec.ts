/**
 * Desktop Context View E2E Tests
 *
 * Tests for desktop behavior in the context view:
 * - File list and editor visible side-by-side
 * - Back button is NOT visible on desktop
 * - Toolbar buttons show both icon and text
 * - Delete button is visible in toolbar (not hidden like on mobile)
 */

import { test, expect } from '@playwright/test';
import {
  resetContextDirectory,
  setupProjectWithFixture,
  getFixturePath,
  navigateToContext,
  waitForContextFile,
  selectContextFile,
  waitForFileContentToLoad,
  clickElement,
  fillInput,
  waitForNetworkIdle,
  authenticateForTests,
  waitForElementHidden,
} from '../utils';

// Use desktop viewport for desktop tests
test.use({ viewport: { width: 1280, height: 720 } });

test.describe('Desktop Context View', () => {
  test.beforeEach(() => {
    resetContextDirectory();
  });

  test('should show file list and editor side-by-side on desktop', async ({ page }) => {
    const fileName = 'desktop-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(
      page,
      'new-markdown-content',
      '# Desktop Test\n\nThis tests desktop view behavior'
    );

    await expect(page.locator('[data-testid="confirm-create-markdown"]')).toBeEnabled();
    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog');

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

    // On desktop, file list should be visible after selection
    const fileList = page.locator('[data-testid="context-file-list"]');
    await expect(fileList).toBeVisible();

    // Editor panel should also be visible
    const editor = page.locator('[data-testid="context-editor"], [data-testid="markdown-preview"]');
    await expect(editor).toBeVisible();
  });

  test('should NOT show back button in editor toolbar on desktop', async ({ page }) => {
    const fileName = 'no-back-button-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(page, 'new-markdown-content', '# No Back Button Test');

    // Wait for confirm button to be enabled (React state after fill) before clicking
    const confirmBtn = page.locator('[data-testid="confirm-create-markdown"]');
    await expect(confirmBtn).toBeEnabled();

    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog');

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

    // Back button should NOT be visible on desktop
    const backButton = page.locator('button[aria-label="Back"]');
    await expect(backButton).not.toBeVisible();
  });

  test('should show buttons with text labels on desktop', async ({ page }) => {
    const fileName = 'text-labels-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(
      page,
      'new-markdown-content',
      '# Text Labels Test\n\nTesting button text labels on desktop'
    );

    await expect(page.locator('[data-testid="confirm-create-markdown"]')).toBeEnabled();
    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog');

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

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

    await navigateToContext(page);

    // Create a test file
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(page, 'new-markdown-content', '# Delete Button Desktop Test');

    await expect(page.locator('[data-testid="confirm-create-markdown"]')).toBeEnabled();
    await clickElement(page, 'confirm-create-markdown');

    // Wait for create to complete: file appears in list (dialog may close after)
    await page
      .locator(`[data-testid="context-file-${fileName}"]`)
      .waitFor({ state: 'attached', timeout: 20000 });
    // Then ensure dialog is closed (auto-close or fallback Cancel if still open)
    await waitForElementHidden(page, 'create-markdown-dialog', { timeout: 5000 }).catch(
      async () => {
        const cancelBtn = page.getByRole('button', { name: /cancel/i });
        if (await cancelBtn.isVisible()) await cancelBtn.click();
        await waitForElementHidden(page, 'create-markdown-dialog', { timeout: 3000 });
      }
    );

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

    // Delete button in toolbar should be visible on desktop
    const deleteButton = page.locator('[data-testid="delete-context-file"]');
    await expect(deleteButton).toBeVisible();
  });

  test('should show file list at fixed width on desktop when file is selected', async ({
    page,
  }) => {
    const fileName = 'fixed-width-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(page, 'new-markdown-content', '# Fixed Width Test');

    // Wait for form state to update so the Create button becomes enabled
    await expect(page.locator('[data-testid="confirm-create-markdown"]')).toBeEnabled();
    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog');

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

    // File list should be visible
    const fileList = page.locator('[data-testid="context-file-list"]');
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

    await navigateToContext(page);

    // On desktop, inline buttons should be visible
    const createButton = page.locator('[data-testid="create-markdown-button"]');
    await expect(createButton).toBeVisible();

    const importButton = page.locator('[data-testid="import-file-button"]');
    await expect(importButton).toBeVisible();
  });
});
