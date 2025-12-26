import { Page, Locator } from '@playwright/test';
import { waitForElement } from '../core/waiting';

// ============================================================================
// Model Selector Operations
// ============================================================================

/**
 * Click the model selector dropdown button
 */
export async function clickModelSelector(page: Page): Promise<void> {
  const selector = page.locator('[data-testid="model-selector"]');
  await selector.click();
  // Wait for dropdown to open
  await page.waitForTimeout(200);
}

/**
 * Select a model from the agent view model dropdown
 * @param modelId - The model ID (e.g., 'sonnet', 'cursor-sonnet', 'opus')
 */
export async function selectAgentModel(page: Page, modelId: string): Promise<void> {
  await clickModelSelector(page);
  const option = page.locator(`[data-testid="model-option-${modelId}"]`);
  await option.click();
  // Wait for dropdown to close
  await page.waitForTimeout(200);
}

/**
 * Get the currently selected model label from the selector button
 */
export async function getSelectedModelLabel(page: Page): Promise<string> {
  const selector = page.locator('[data-testid="model-selector"]');
  return (await selector.textContent()) || '';
}

/**
 * Check if a specific model option is visible in the dropdown
 */
export async function isModelOptionVisible(page: Page, modelId: string): Promise<boolean> {
  const option = page.locator(`[data-testid="model-option-${modelId}"]`);
  return await option.isVisible();
}

/**
 * Get the session list element
 */
export async function getSessionList(page: Page): Promise<Locator> {
  return page.locator('[data-testid="session-list"]');
}

/**
 * Get the new session button
 */
export async function getNewSessionButton(page: Page): Promise<Locator> {
  return page.locator('[data-testid="new-session-button"]');
}

/**
 * Click the new session button
 */
export async function clickNewSessionButton(page: Page): Promise<void> {
  const button = await getNewSessionButton(page);
  await button.click();
}

/**
 * Get a session item by its ID
 */
export async function getSessionItem(page: Page, sessionId: string): Promise<Locator> {
  return page.locator(`[data-testid="session-item-${sessionId}"]`);
}

/**
 * Click the archive button for a session
 */
export async function clickArchiveSession(page: Page, sessionId: string): Promise<void> {
  const button = page.locator(`[data-testid="archive-session-${sessionId}"]`);
  await button.click();
}

/**
 * Check if the no session placeholder is visible
 */
export async function isNoSessionPlaceholderVisible(page: Page): Promise<boolean> {
  const placeholder = page.locator('[data-testid="no-session-placeholder"]');
  return await placeholder.isVisible();
}

/**
 * Wait for the no session placeholder to be visible
 */
export async function waitForNoSessionPlaceholder(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, 'no-session-placeholder', options);
}

/**
 * Check if the message list is visible (indicates a session is selected)
 */
export async function isMessageListVisible(page: Page): Promise<boolean> {
  const messageList = page.locator('[data-testid="message-list"]');
  return await messageList.isVisible();
}

/**
 * Count the number of session items in the session list
 */
export async function countSessionItems(page: Page): Promise<number> {
  const sessionList = page.locator('[data-testid="session-list"] [data-testid^="session-item-"]');
  return await sessionList.count();
}

/**
 * Wait for a new session to be created (by checking if a session item appears)
 */
export async function waitForNewSession(page: Page, options?: { timeout?: number }): Promise<void> {
  // Wait for any session item to appear
  const sessionItem = page.locator('[data-testid^="session-item-"]').first();
  await sessionItem.waitFor({
    timeout: options?.timeout ?? 5000,
    state: 'visible',
  });
}
