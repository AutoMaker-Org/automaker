/**
 * Mobile Context View E2E Tests
 *
 * Tests for mobile-friendly behavior in the context view:
 * - File list hides when file is selected on mobile
 * - Back button appears on mobile to return to file list
 * - Toolbar buttons are icon-only on mobile
 * - Delete button is hidden on mobile (use dropdown menu instead)
 */

import { test, expect, devices } from '@playwright/test';
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

// Use mobile viewport for mobile tests in Chromium CI
test.use({ ...devices['Pixel 5'] });

test.describe('Mobile Context View', () => {
  test.beforeEach(async () => {
    resetContextDirectory();
  });

  test.afterEach(async () => {
    resetContextDirectory();
  });

  test('should hide file list when a file is selected on mobile', async ({ page }) => {
    const fileName = 'mobile-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file - on mobile, open the actions panel first
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-markdown-button-mobile');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(
      page,
      'new-markdown-content',
      '# Mobile Test\n\nThis tests mobile view behavior'
    );

    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // File list should be visible before selection
    const fileListBefore = page.locator('[data-testid="context-file-list"]');
    await expect(fileListBefore).toBeVisible();

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

    // On mobile, file list should be hidden after selection (full-screen editor)
    const fileListAfter = page.locator('[data-testid="context-file-list"]');
    await expect(fileListAfter).toBeHidden();
  });

  test('should show back button in editor toolbar on mobile', async ({ page }) => {
    const fileName = 'back-button-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file - on mobile, open the actions panel first
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-markdown-button-mobile');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(
      page,
      'new-markdown-content',
      '# Back Button Test\n\nTesting back button on mobile'
    );

    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

    // Back button should be visible on mobile
    const backButton = page.locator('button[aria-label="Back"]');
    await expect(backButton).toBeVisible();

    // Back button should have ArrowLeft icon
    const arrowIcon = backButton.locator('svg.lucide-arrow-left');
    await expect(arrowIcon).toBeVisible();
  });

  test('should return to file list when back button is clicked on mobile', async ({ page }) => {
    const fileName = 'back-navigation-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file - on mobile, open the actions panel first
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-markdown-button-mobile');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(page, 'new-markdown-content', '# Back Navigation Test');

    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

    // File list should be hidden after selection
    const fileListHidden = page.locator('[data-testid="context-file-list"]');
    await expect(fileListHidden).toBeHidden();

    // Click back button
    const backButton = page.locator('button[aria-label="Back"]');
    await backButton.click();

    // File list should be visible again
    const fileListVisible = page.locator('[data-testid="context-file-list"]');
    await expect(fileListVisible).toBeVisible();

    // Editor should no longer be visible
    const editor = page.locator('[data-testid="context-editor"]');
    await expect(editor).not.toBeVisible();
  });

  test('should show icon-only buttons in toolbar on mobile', async ({ page }) => {
    const fileName = 'icon-buttons-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file - on mobile, open the actions panel first
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-markdown-button-mobile');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(
      page,
      'new-markdown-content',
      '# Icon Buttons Test\n\nTesting icon-only buttons on mobile'
    );

    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

    // Get the toggle preview mode button
    const toggleButton = page.locator('[data-testid="toggle-preview-mode"]');
    await expect(toggleButton).toBeVisible();

    // Button should have icon (Eye or Pencil)
    const eyeIcon = toggleButton.locator('svg.lucide-eye');
    const pencilIcon = toggleButton.locator('svg.lucide-pencil');

    // One of the icons should be present
    const hasIcon = await (async () => {
      const eyeVisible = await eyeIcon.isVisible().catch(() => false);
      const pencilVisible = await pencilIcon.isVisible().catch(() => false);
      return eyeVisible || pencilVisible;
    })();

    expect(hasIcon).toBe(true);

    // Text label should not be present (or minimal space on mobile)
    const buttonText = await toggleButton.textContent();
    // On mobile, button should have icon only (no "Edit" or "Preview" text visible)
    // The text is wrapped in {!isMobile && <span>}, so it shouldn't render
    expect(buttonText?.trim()).toBe('');
  });

  test('should hide delete button in toolbar on mobile', async ({ page }) => {
    const fileName = 'delete-button-test.md';

    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // Create a test file - on mobile, open the actions panel first
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-markdown-button-mobile');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(page, 'new-markdown-content', '# Delete Button Test');

    await clickElement(page, 'confirm-create-markdown');

    await waitForElementHidden(page, 'create-markdown-dialog', { timeout: 5000 });

    await waitForNetworkIdle(page);
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);
    await waitForFileContentToLoad(page);

    // Delete button in toolbar should be hidden on mobile
    const deleteButton = page.locator('[data-testid="delete-context-file"]');
    await expect(deleteButton).not.toBeVisible();
  });

  test('should show file list at full width on mobile when no file is selected', async ({
    page,
  }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);

    await navigateToContext(page);

    // File list should be visible
    const fileList = page.locator('[data-testid="context-file-list"]');
    await expect(fileList).toBeVisible();

    // On mobile with no file selected, the file list should take full width
    // Check that the file list container has the w-full class (mobile behavior)
    const fileListBox = await fileList.boundingBox();
    expect(fileListBox).not.toBeNull();

    if (fileListBox) {
      // On mobile (Pixel 5 has width 393), the file list should take most of the width
      // We check that it's significantly wider than the desktop w-64 (256px)
      expect(fileListBox.width).toBeGreaterThan(300);
    }

    // Editor panel should be hidden on mobile when no file is selected
    const editor = page.locator('[data-testid="context-editor"]');
    await expect(editor).not.toBeVisible();
  });
});
