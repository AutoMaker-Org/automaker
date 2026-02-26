import { Page, Locator } from '@playwright/test';
import { clickElement, fillInput, handleLoginScreenIfPresent } from '../core/interactions';
import {
  waitForElement,
  waitForElementHidden,
  waitForSplashScreenToDisappear,
} from '../core/waiting';
import { getByTestId } from '../core/elements';
import { expect } from '@playwright/test';
import { authenticateForTests } from '../api/client';

/**
 * Get the memory file list element
 */
export async function getMemoryFileList(page: Page): Promise<Locator> {
  return page.locator('[data-testid="memory-file-list"]');
}

/**
 * Click on a memory file in the list
 */
export async function clickMemoryFile(page: Page, fileName: string): Promise<void> {
  const fileButton = page.locator(`[data-testid="memory-file-${fileName}"]`);
  await fileButton.click();
}

/**
 * Get the memory editor element
 */
export async function getMemoryEditor(page: Page): Promise<Locator> {
  return page.locator('[data-testid="memory-editor"]');
}

/**
 * Get the memory editor content
 */
export async function getMemoryEditorContent(page: Page): Promise<string> {
  const editor = await getByTestId(page, 'memory-editor');
  return await editor.inputValue();
}

/**
 * Set the memory editor content
 */
export async function setMemoryEditorContent(page: Page, content: string): Promise<void> {
  const editor = await getByTestId(page, 'memory-editor');
  await editor.fill(content);
}

/**
 * Open the create memory file dialog
 */
export async function openCreateMemoryDialog(page: Page): Promise<void> {
  await clickElement(page, 'create-memory-button');
  await waitForElement(page, 'create-memory-dialog');
}

/**
 * Create a memory file via the UI
 */
export async function createMemoryFile(
  page: Page,
  filename: string,
  content: string
): Promise<void> {
  await openCreateMemoryDialog(page);
  await fillInput(page, 'new-memory-name', filename);
  await fillInput(page, 'new-memory-content', content);
  await clickElement(page, 'confirm-create-memory');
  await waitForElementHidden(page, 'create-memory-dialog');
}

/**
 * Delete a memory file via the UI (must be selected first)
 */
export async function deleteSelectedMemoryFile(page: Page): Promise<void> {
  await clickElement(page, 'delete-memory-file');
  await waitForElement(page, 'delete-memory-dialog');
  await clickElement(page, 'confirm-delete-memory');
  await waitForElementHidden(page, 'delete-memory-dialog');
}

/**
 * Save the current memory file
 */
export async function saveMemoryFile(page: Page): Promise<void> {
  await clickElement(page, 'save-memory-file');
  // Wait for save to complete across desktop/mobile variants
  // On desktop: button text shows "Saved"
  // On mobile: icon-only button uses aria-label or title
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="save-memory-file"]');
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
export async function toggleMemoryPreviewMode(page: Page): Promise<void> {
  await clickElement(page, 'toggle-preview-mode');
}

/**
 * Wait for a specific file to appear in the memory file list
 * Uses retry mechanism to handle race conditions with API/UI updates
 */
export async function waitForMemoryFile(
  page: Page,
  filename: string,
  timeout: number = 15000
): Promise<void> {
  await expect(async () => {
    const locator = page.locator(`[data-testid="memory-file-${filename}"]`);
    await expect(locator).toBeVisible();
  }).toPass({ timeout, intervals: [500, 1000, 2000] });
}

/**
 * Click a file in the list and wait for it to be selected (toolbar visible)
 * Uses retry mechanism to handle race conditions where element is visible but not yet interactive
 */
export async function selectMemoryFile(
  page: Page,
  filename: string,
  timeout: number = 15000
): Promise<void> {
  const fileButton = await getByTestId(page, `memory-file-${filename}`);

  // Retry click + wait for content panel to handle timing issues
  // Note: On mobile, delete button is hidden, so we wait for content panel instead
  await expect(async () => {
    // Use JavaScript click to ensure React onClick handler fires
    await fileButton.evaluate((el) => (el as HTMLButtonElement).click());
    // Wait for content to appear (editor or preview)
    const contentLocator = page.locator(
      '[data-testid="memory-editor"], [data-testid="markdown-preview"]'
    );
    await expect(contentLocator).toBeVisible();
  }).toPass({ timeout, intervals: [500, 1000, 2000] });
}

/**
 * Wait for file content panel to load (either editor or preview)
 * Uses retry mechanism to handle race conditions with file selection
 */
export async function waitForMemoryContentToLoad(
  page: Page,
  timeout: number = 15000
): Promise<void> {
  await expect(async () => {
    const contentLocator = page.locator(
      '[data-testid="memory-editor"], [data-testid="markdown-preview"]'
    );
    await expect(contentLocator).toBeVisible();
  }).toPass({ timeout, intervals: [500, 1000, 2000] });
}

/**
 * Switch from preview mode to edit mode for memory files
 * Memory files open in preview mode by default, this helper switches to edit mode
 */
export async function switchMemoryToEditMode(page: Page): Promise<void> {
  // First wait for content to load
  await waitForMemoryContentToLoad(page);

  const markdownPreview = await getByTestId(page, 'markdown-preview');
  const isPreview = await markdownPreview.isVisible().catch(() => false);

  if (isPreview) {
    await clickElement(page, 'toggle-preview-mode');
    await page.waitForSelector('[data-testid="memory-editor"]', {
      timeout: 5000,
    });
  }
}

/**
 * Navigate to the memory view
 * Note: Navigates directly to /memory since index route shows WelcomeView
 */
export async function navigateToMemory(page: Page): Promise<void> {
  // Authenticate before navigating (same pattern as navigateToContext / navigateToBoard)
  await authenticateForTests(page);

  // Wait for any pending navigation to complete before starting a new one
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(100);

  // Navigate directly to /memory route
  await page.goto('/memory', { waitUntil: 'domcontentloaded' });

  // Wait for splash screen to disappear (safety net)
  await waitForSplashScreenToDisappear(page, 3000);

  // Handle login redirect if needed (e.g. when redirected to /logged-out)
  await handleLoginScreenIfPresent(page);

  // Wait for loading to complete (if present)
  const loadingElement = page.locator('[data-testid="memory-view-loading"]');
  try {
    const loadingVisible = await loadingElement.isVisible({ timeout: 2000 });
    if (loadingVisible) {
      // Wait for loading to disappear (memory view will appear)
      await loadingElement.waitFor({ state: 'hidden', timeout: 10000 });
    }
  } catch {
    // Loading element not found or already hidden, continue
  }

  // Wait for the memory view to be visible
  await waitForElement(page, 'memory-view', { timeout: 15000 });

  // On mobile, close the sidebar if open so the header actions trigger is clickable (not covered by backdrop)
  // Use JavaScript click to avoid force:true hitting the sidebar (z-30) instead of the backdrop (z-20)
  const backdrop = page.locator('[data-testid="sidebar-backdrop"]');
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(200);
  }

  // Ensure the header (and actions panel trigger on mobile) is interactive
  await page
    .locator('[data-testid="header-actions-panel-trigger"]')
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {});
}
