import { Page } from '@playwright/test';
import { handleLoginScreenIfPresent } from '../core/interactions';
import { waitForElement, waitForSplashScreenToDisappear } from '../core/waiting';
import { authenticateForTests, waitForBackendHealth } from '../api/client';

/**
 * Navigate to the automations management view
 */
export async function navigateToAutomations(page: Page): Promise<void> {
  // Wait for backend to be healthy first
  await waitForBackendHealth(page, 30000);

  await authenticateForTests(page);

  await page.goto('/automations');
  await page.waitForLoadState('load');

  await waitForSplashScreenToDisappear(page, 3000);
  await handleLoginScreenIfPresent(page);

  // Wait for the automation management view to be visible
  await waitForElement(page, 'automation-management-view', { timeout: 15000 });
}

/**
 * Navigate to the automation activity view
 */
export async function navigateToAutomationActivity(page: Page): Promise<void> {
  // Wait for backend to be healthy first
  await waitForBackendHealth(page, 30000);

  await authenticateForTests(page);

  await page.goto('/automation-activity');
  await page.waitForLoadState('load');

  await waitForSplashScreenToDisappear(page, 3000);
  await handleLoginScreenIfPresent(page);

  // Wait for the automation activity view to be visible
  await waitForElement(page, 'automation-activity-view', { timeout: 15000 });
}

/**
 * Click the "Create Automation" button to open the create dialog
 */
export async function clickCreateAutomationButton(page: Page): Promise<void> {
  const createButton = page.locator('button:has-text("Create Automation")').first();
  await createButton.click();
  // Wait for the editor dialog to appear
  await page
    .locator('[data-testid="automation-editor-dialog"]')
    .waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Click the "Add Step" dropdown button
 */
export async function clickAddStepDropdown(page: Page): Promise<void> {
  const addStepButton = page.locator('button:has-text("Add Step")').first();
  await addStepButton.click();
  // Wait for dropdown content to appear
  await page.locator('[role="menu"]').waitFor({ state: 'visible', timeout: 3000 });
}

/**
 * Get all available step types from the dropdown menu
 */
export async function getAvailableStepTypes(page: Page): Promise<string[]> {
  await clickAddStepDropdown(page);

  // Get all menu items
  const menuItems = await page.locator('[role="menuitem"]').allTextContents();

  // Close the dropdown by pressing Escape
  await page.keyboard.press('Escape');
  await page.locator('[role="menu"]').waitFor({ state: 'hidden', timeout: 2000 });

  return menuItems.map((text) => text.trim()).filter((text) => text.length > 0);
}

/**
 * Get all step category labels from the dropdown menu
 */
export async function getStepCategories(page: Page): Promise<string[]> {
  await clickAddStepDropdown(page);

  // Get all menu labels (category headers)
  const labels = await page
    .locator('[role="menu"] [data-radix-dropdown-menu-label]')
    .allTextContents();

  // Close the dropdown by pressing Escape
  await page.keyboard.press('Escape');
  await page.locator('[role="menu"]').waitFor({ state: 'hidden', timeout: 2000 });

  return labels.map((text) => text.trim()).filter((text) => text.length > 0);
}

/**
 * Add a step by clicking on it in the dropdown
 */
export async function addStepByType(page: Page, stepType: string): Promise<void> {
  await clickAddStepDropdown(page);

  // Click on the specific step type
  const stepMenuItem = page.locator(`[role="menuitem"]:has-text("${stepType}")`).first();
  await stepMenuItem.click();

  // Wait for dropdown to close
  await page.locator('[role="menu"]').waitFor({ state: 'hidden', timeout: 2000 });
}

/**
 * Get the number of steps currently in the automation
 */
export async function getStepCount(page: Page): Promise<number> {
  // Count step items in the step builder section
  const stepItems = await page.locator('[data-testid="step-item"]').count();
  return stepItems;
}

/**
 * Check if the old Select dropdown exists (for backward compatibility verification)
 */
export async function hasOldSelectDropdown(page: Page): Promise<boolean> {
  // Look for the old pattern: a select trigger followed by an Add button
  const selectTrigger = page.locator('[data-testid="step-type-select"]');
  return (await selectTrigger.count()) > 0;
}

/**
 * Verify the new dropdown menu structure exists
 */
export async function hasNewDropdownMenu(page: Page): Promise<boolean> {
  // Look for the new pattern: single "Add Step" button that triggers a dropdown
  const addStepButton = page.locator('button:has-text("Add Step")');
  return (await addStepButton.count()) > 0;
}

/**
 * Get all visible suggested automation cards
 */
export async function getSuggestedAutomationCards(page: Page): Promise<string[]> {
  const cards = page.locator('[data-testid^="suggestion-"]');
  const count = await cards.count();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const testId = await cards.nth(i).getAttribute('data-testid');
    if (testId) ids.push(testId.replace('suggestion-', ''));
  }
  return ids;
}

/**
 * Click a suggested automation card by its ID
 */
export async function clickSuggestedAutomation(page: Page, suggestionId: string): Promise<void> {
  const card = page.locator(`[data-testid="suggestion-${suggestionId}"]`);
  await card.click();
  // Wait for the editor dialog to appear
  await page
    .locator('[data-testid="automation-editor-dialog"]')
    .waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Click a category filter pill in the suggested automations section
 */
export async function clickSuggestionCategoryFilter(page: Page, category: string): Promise<void> {
  const pill = page.locator(`button:has-text("${category}")`).first();
  await pill.click();
  // Small delay for the filter to take effect
  await page.waitForTimeout(300);
}
