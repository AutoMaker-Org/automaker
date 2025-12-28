/**
 * Delete Context File E2E Test
 *
 * Happy path: Delete a context file via the UI
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  resetContextDirectory,
  setupProjectWithFixture,
  getFixturePath,
  navigateToContext,
  waitForContextFile,
  selectContextFile,
  deleteSelectedContextFile,
  clickElement,
  fillInput,
  waitForNetworkIdle,
} from '../utils';

test.describe('Delete Context File', () => {
  test.beforeEach(async () => {
    resetContextDirectory();
  });

  test.afterEach(async () => {
    resetContextDirectory();
  });

  test('should delete a context file via the UI', async ({ page }) => {
    const fileName = 'to-delete.md';

    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // First create a context file to delete
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', fileName);
    await fillInput(page, 'new-markdown-content', '# Test File\n\nThis file will be deleted.');

    await clickElement(page, 'confirm-create-markdown');

    await page.waitForFunction(
      () => !document.querySelector('[data-testid="create-markdown-dialog"]'),
      { timeout: 5000 }
    );

    // Wait for the file to appear in the list
    await waitForContextFile(page, fileName);

    // Select the file
    await selectContextFile(page, fileName);

    // Delete the selected file
    await deleteSelectedContextFile(page);

    // Verify the file is no longer in the list
    await expect(async () => {
      const fileButton = page.locator(`[data-testid="context-file-${fileName}"]`);
      expect(await fileButton.count()).toBe(0);
    }).toPass({ timeout: 10000 });

    // Verify the file is deleted from the filesystem
    const fixturePath = getFixturePath();
    const contextPath = path.join(fixturePath, '.automaker', 'context', fileName);
    expect(fs.existsSync(contextPath)).toBe(false);
  });
});
