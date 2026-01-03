/**
 * Context File Management E2E Test
 *
 * Happy path: Create a markdown context file
 */

import { test, expect } from '@playwright/test';
import {
  resetContextDirectory,
  setupProjectWithFixture,
  getFixturePath,
  navigateToContext,
  waitForFileContentToLoad,
  switchToEditMode,
  waitForContextFile,
  clickElement,
  fillInput,
  getByTestId,
  waitForNetworkIdle,
  getContextEditorContent,
  authenticateForTests,
} from '../utils';

test.describe('Context File Management', () => {
  test.beforeEach(async () => {
    resetContextDirectory();
  });

  test.afterEach(async () => {
    resetContextDirectory();
  });

  test('should create a new markdown context file', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', { timeout: 5000 });

    await fillInput(page, 'new-markdown-name', 'test-context.md');
    const testContent = '# Test Context\n\nThis is test content';
    await fillInput(page, 'new-markdown-content', testContent);

    await clickElement(page, 'confirm-create-markdown');

    await page.waitForFunction(
      () => !document.querySelector('[data-testid="create-markdown-dialog"]'),
      { timeout: 5000 }
    );

    await waitForNetworkIdle(page);
    await waitForContextFile(page, 'test-context.md');

    const fileButton = await getByTestId(page, 'context-file-test-context.md');
    await expect(fileButton).toBeVisible();

    await fileButton.click();
    await waitForFileContentToLoad(page);
    await switchToEditMode(page);

    await page.waitForSelector('[data-testid="context-editor"]', { timeout: 5000 });

    const editorContent = await getContextEditorContent(page);
    expect(editorContent).toBe(testContent);
  });
});
