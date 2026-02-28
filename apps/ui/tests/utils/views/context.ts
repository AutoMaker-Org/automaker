import { Page, Locator } from '@playwright/test';
import { clickElement, fillInput } from '../core/interactions';
import { waitForElement, waitForElementHidden } from '../core/waiting';
import { getByTestId } from '../core/elements';
import { expect } from '@playwright/test';

/**
 * Get the context file list element
 */
export async function getContextFileList(page: Page): Promise<Locator> {
  return page.locator('[data-testid="context-file-list"]');
}

/**
 * Click on a context file in the list
 */
export async function clickContextFile(page: Page, fileName: string): Promise<void> {
  const fileButton = page.locator(`[data-testid="context-file-${fileName}"]`);
  await fileButton.click();
}

/**
 * Get the context editor element
 */
export async function getContextEditor(page: Page): Promise<Locator> {
  return page.locator('[data-testid="context-editor"]');
}

/**
 * Get the context editor content
 */
export async function getContextEditorContent(page: Page): Promise<string> {
  const editor = await getByTestId(page, 'context-editor');
  return await editor.inputValue();
}

/**
 * Set the context editor content
 */
export async function setContextEditorContent(page: Page, content: string): Promise<void> {
  const editor = await getByTestId(page, 'context-editor');
  await editor.fill(content);
}

/**
 * Open the add context file dialog
 */
export async function openAddContextFileDialog(page: Page): Promise<void> {
  await clickElement(page, 'add-context-file');
  await waitForElement(page, 'add-context-dialog');
}

/**
 * Create a text context file via the UI
 */
export async function createContextFile(
  page: Page,
  filename: string,
  content: string
): Promise<void> {
  await openAddContextFileDialog(page);
  await clickElement(page, 'add-text-type');
  await fillInput(page, 'new-file-name', filename);
  await fillInput(page, 'new-file-content', content);
  await clickElement(page, 'confirm-add-file');
  await waitForElementHidden(page, 'add-context-dialog');
}

/**
 * Create an image context file via the UI
 */
export async function createContextImage(
  page: Page,
  filename: string,
  imagePath: string
): Promise<void> {
  await openAddContextFileDialog(page);
  await clickElement(page, 'add-image-type');
  await fillInput(page, 'new-file-name', filename);
  await page.setInputFiles('[data-testid="image-upload-input"]', imagePath);
  await clickElement(page, 'confirm-add-file');
  await waitForElementHidden(page, 'add-context-dialog');
}

/**
 * Delete a context file via the UI (must be selected first)
 */
export async function deleteSelectedContextFile(page: Page): Promise<void> {
  await clickElement(page, 'delete-context-file');
  await waitForElement(page, 'delete-context-dialog');
  // Click the confirm button scoped to the dialog to avoid multiple matches
  const dialog = page.locator('[data-testid="delete-context-dialog"]');
  await dialog.locator('[data-testid="confirm-delete-file"]').click();
  // Wait for dialog to close (server delete can take a moment)
  await waitForElementHidden(page, 'delete-context-dialog', { timeout: 15000 });
}

/**
 * Save the current context file
 */
export async function saveContextFile(page: Page): Promise<void> {
  await clickElement(page, 'save-context-file');
  // Wait for save to complete across desktop/mobile variants
  // On desktop: button text shows "Saved"
  // On mobile: icon-only button uses aria-label or title
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="save-context-file"]');
      if (!btn) return false;
      const stateText = [
        btn.textContent ?? '',
        btn.getAttribute('aria-label') ?? '',
        btn.getAttribute('title') ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return stateText.includes('saved');
    },
    { timeout: 5000 }
  );
}

/**
 * Toggle markdown preview mode
 */
export async function toggleContextPreviewMode(page: Page): Promise<void> {
  await clickElement(page, 'toggle-preview-mode');
}

/**
 * Wait for a specific file to appear in the context file list
 * Uses retry mechanism to handle race conditions with API/UI updates.
 * On mobile, scrolls the file list into view first so new items are visible.
 */
export async function waitForContextFile(
  page: Page,
  filename: string,
  timeout: number = 20000
): Promise<void> {
  // Ensure file list is in view (helps on mobile when list is scrollable)
  const fileList = page.locator('[data-testid="context-file-list"]');
  await fileList.scrollIntoViewIfNeeded().catch(() => {});

  const locator = page.locator(`[data-testid="context-file-${filename}"]`);
  // Use a longer per-attempt timeout so slow API/state updates can complete
  await expect(locator).toBeVisible({ timeout });
}

/**
 * Click a file in the list and wait for it to be selected (toolbar visible)
 * Uses retry mechanism to handle race conditions where element is visible but not yet interactive
 */
export async function selectContextFile(
  page: Page,
  filename: string,
  timeout: number = 15000
): Promise<void> {
  const fileButton = await getByTestId(page, `context-file-${filename}`);

  // Retry click + wait for content panel to handle timing issues
  // Note: On mobile, delete button is hidden, so we wait for content panel instead
  await expect(async () => {
    // Use JavaScript click to ensure React onClick handler fires
    await fileButton.evaluate((el) => (el as HTMLButtonElement).click());
    // Wait for content to appear (editor, preview, or image)
    const contentLocator = page.locator(
      '[data-testid="context-editor"], [data-testid="markdown-preview"], [data-testid="image-preview"]'
    );
    await expect(contentLocator).toBeVisible();
  }).toPass({ timeout, intervals: [200, 500, 1000] });
}

/**
 * Wait for file content panel to load (either editor, preview, or image)
 * Uses retry mechanism to handle race conditions with file selection
 */
export async function waitForFileContentToLoad(page: Page, timeout: number = 15000): Promise<void> {
  await expect(async () => {
    const contentLocator = page.locator(
      '[data-testid="context-editor"], [data-testid="markdown-preview"], [data-testid="image-preview"]'
    );
    await expect(contentLocator).toBeVisible();
  }).toPass({ timeout, intervals: [200, 500, 1000] });
}

/**
 * Switch from preview mode to edit mode for markdown files
 * Markdown files open in preview mode by default, this helper switches to edit mode
 */
export async function switchToEditMode(page: Page): Promise<void> {
  // First wait for content to load
  await waitForFileContentToLoad(page);

  const markdownPreview = await getByTestId(page, 'markdown-preview');
  const isPreview = await markdownPreview.isVisible().catch(() => false);

  if (isPreview) {
    await clickElement(page, 'toggle-preview-mode');
    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });
  }
}
