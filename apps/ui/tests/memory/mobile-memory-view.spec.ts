/**
 * Mobile Memory View E2E Tests
 *
 * Core mobile behavior: list full-width, selecting file hides list and shows
 * back button; back returns to list. Toolbar is icon-only, delete hidden.
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
  waitForElementHidden,
} from '../utils';

test.use({ ...devices['Pixel 5'] });

test.describe('Mobile Memory View', () => {
  test.beforeEach(() => {
    resetMemoryDirectory();
  });

  test('shows list then editor; back returns to list; toolbar is mobile layout', async ({
    page,
  }) => {
    const fileName = 'mobile-view.md';

    await setupProjectWithFixture(page, getFixturePath());
    await navigateToMemory(page);

    // No file selected: list visible, editor not
    await expect(page.locator('[data-testid="memory-file-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="memory-editor"]')).not.toBeVisible();

    // Create and select a file via mobile panel
    await clickElement(page, 'header-actions-panel-trigger');
    await clickElement(page, 'create-memory-button-mobile');
    await page.waitForSelector('[data-testid="create-memory-dialog"]', { timeout: 3000 });
    await fillInput(page, 'new-memory-name', fileName);
    await fillInput(page, 'new-memory-content', '# Mobile view test');
    await clickElement(page, 'confirm-create-memory');
    await waitForElementHidden(page, 'create-memory-dialog', { timeout: 3000 });
    await waitForMemoryFile(page, fileName, 8000);
    await selectMemoryFile(page, fileName, 8000);

    // With file selected: list hidden, back visible, delete hidden, toggle icon-only
    await expect(page.locator('[data-testid="memory-file-list"]')).toBeHidden();
    const backButton = page.locator('button[aria-label="Back"]');
    await expect(backButton).toBeVisible();
    await expect(page.locator('[data-testid="delete-memory-file"]')).not.toBeVisible();
    const toggleButton = page.locator('[data-testid="toggle-preview-mode"]');
    await expect(toggleButton).toBeVisible();
    expect((await toggleButton.textContent())?.trim()).toBe('');

    // Back returns to list
    await backButton.click();
    await expect(page.locator('[data-testid="memory-file-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="memory-editor"]')).not.toBeVisible();
  });
});
