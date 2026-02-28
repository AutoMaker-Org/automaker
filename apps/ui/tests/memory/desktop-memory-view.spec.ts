/**
 * Desktop Memory View E2E Tests
 *
 * Core desktop behavior: file list and editor side-by-side, toolbar layout
 * (no back button, delete visible, buttons with text).
 */

import { test, expect } from '@playwright/test';
import {
  resetMemoryDirectory,
  setupProjectWithFixture,
  getFixturePath,
  createMemoryFileOnDisk,
  navigateToMemory,
  waitForMemoryFile,
  selectMemoryFile,
} from '../utils';

test.use({ viewport: { width: 1280, height: 720 } });

test.describe('Desktop Memory View', () => {
  test.beforeEach(() => {
    resetMemoryDirectory();
  });

  test('shows file list and editor side-by-side with desktop toolbar', async ({ page }) => {
    const fileName = 'desktop-core.md';

    await setupProjectWithFixture(page, getFixturePath());
    createMemoryFileOnDisk(fileName, '# Desktop core test');
    await navigateToMemory(page);

    // Header actions visible on desktop
    await expect(page.locator('[data-testid="create-memory-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="refresh-memory-button"]')).toBeVisible();

    // Open existing file (no create-dialog flow)
    await waitForMemoryFile(page, fileName, 5000);
    await selectMemoryFile(page, fileName, 5000);

    // Core: list and editor side-by-side
    await expect(page.locator('[data-testid="memory-file-list"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="memory-editor"], [data-testid="markdown-preview"]')
    ).toBeVisible();

    // Desktop toolbar: no back button, delete visible, toggle has text
    await expect(page.locator('button[aria-label="Back"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="delete-memory-file"]')).toBeVisible();
    const toggleButton = page.locator('[data-testid="toggle-preview-mode"]');
    await expect(toggleButton).toBeVisible();
    const buttonText = await toggleButton.textContent();
    expect(buttonText?.toLowerCase()).toMatch(/(edit|preview)/);
  });
});
