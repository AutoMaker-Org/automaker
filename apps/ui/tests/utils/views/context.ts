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
  await clickElement(page, 'confirm-delete-file');
  await waitForElementHidden(page, 'delete-context-dialog');
}

/**
 * Save the current context file
 */
export async function saveContextFile(page: Page): Promise<void> {
  await clickElement(page, 'save-context-file');
  // Wait for save to complete (button shows "Saved")
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="save-context-file"]')?.textContent?.includes('Saved'),
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
 * Uses retry mechanism to handle race conditions with API/UI updates
 */
export async function waitForContextFile(
  page: Page,
  filename: string,
  timeout: number = 15000
): Promise<void> {
  await expect(async () => {
    const locator = page.locator(`[data-testid="context-file-${filename}"]`);
    await expect(locator).toBeVisible();
  }).toPass({ timeout, intervals: [500, 1000, 2000] });
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

  // Retry click + wait for delete button to handle timing issues
  await expect(async () => {
    // Use JavaScript click to ensure React onClick handler fires
    await fileButton.evaluate((el) => (el as HTMLButtonElement).click());
    // Wait for the file to be selected (toolbar with delete button becomes visible)
    const deleteButton = await getByTestId(page, 'delete-context-file');
    await expect(deleteButton).toBeVisible();
  }).toPass({ timeout, intervals: [500, 1000, 2000] });
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
  }).toPass({ timeout, intervals: [500, 1000, 2000] });
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
