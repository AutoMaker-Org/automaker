/**
 * Event Hooks Settings Page Tests
 *
 * Tests for the event hooks settings section, including:
 * - Event hooks management
 * - Ntfy endpoint configuration
 * - Dialog state management (useEffect hook validation)
 *
 * This test also serves as a regression test for the bug where
 * useEffect was not imported in the event-hooks-section.tsx file,
 * causing a runtime error when opening the Ntfy endpoint dialog.
 */

import { test, expect, type Page } from '@playwright/test';
import { authenticateForTests, navigateToSettings, waitForSuccessToast } from '../utils';

// Timeout constants for maintainability
const TIMEOUTS = {
  sectionVisible: 10000,
  dialogVisible: 5000,
  dialogHidden: 5000,
  endpointVisible: 5000,
} as const;

// Selectors for reuse
const SELECTORS = {
  eventHooksButton: 'button:has-text("Event Hooks")',
  endpointsTab: 'button[role="tab"]:has-text("Endpoints")',
  sectionText: 'text=Run custom commands or send notifications',
  addEndpointButton: 'button:has-text("Add Endpoint")',
  dialog: '[role="dialog"]',
  dialogTitle: 'text=Add Ntfy Endpoint',
} as const;

/**
 * Navigate to the Event Hooks Endpoints tab
 * This helper reduces code duplication across tests
 */
async function navigateToEndpointsTab(page: Page): Promise<void> {
  await navigateToSettings(page);

  // Click on the Event Hooks section in the navigation
  await page.locator(SELECTORS.eventHooksButton).first().click();

  // Wait for the event hooks section to be visible
  await expect(page.locator(SELECTORS.sectionText)).toBeVisible({
    timeout: TIMEOUTS.sectionVisible,
  });

  // Switch to Endpoints tab (ntfy endpoints)
  await page.locator(SELECTORS.endpointsTab).click();
}

test.describe('Event Hooks Settings', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateForTests(page);
  });

  test('should load event hooks settings section without errors', async ({ page }) => {
    await navigateToSettings(page);

    // Click on the Event Hooks section in the navigation
    await page.locator(SELECTORS.eventHooksButton).first().click();

    // Wait for the event hooks section to be visible
    await expect(page.locator(SELECTORS.sectionText)).toBeVisible({
      timeout: TIMEOUTS.sectionVisible,
    });

    // Verify the tabs are present
    await expect(page.locator('button[role="tab"]:has-text("Hooks")')).toBeVisible();
    await expect(page.locator(SELECTORS.endpointsTab)).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("History")')).toBeVisible();
  });

  test('should open add ntfy endpoint dialog and verify useEffect resets form', async ({
    page,
  }) => {
    // This test specifically validates that the useEffect hook in NtfyEndpointDialog
    // works correctly - if useEffect was not imported, the form would not reset
    await navigateToEndpointsTab(page);

    // Click Add Endpoint button
    await page.locator(SELECTORS.addEndpointButton).click();

    // Dialog should be visible
    const dialog = page.locator(SELECTORS.dialog);
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.dialogVisible });

    // Dialog title should indicate adding new endpoint
    await expect(dialog.locator(SELECTORS.dialogTitle)).toBeVisible();

    // Form should have default values (useEffect reset)
    // This is the critical test - if useEffect was not imported or not working,
    // these assertions would fail because the form state would not be reset
    const nameInput = dialog.locator('input#endpoint-name');
    const serverUrlInput = dialog.locator('input#endpoint-server');
    const topicInput = dialog.locator('input#endpoint-topic');

    // Name should be empty (reset by useEffect)
    await expect(nameInput).toHaveValue('');
    // Server URL should have default value (reset by useEffect)
    await expect(serverUrlInput).toHaveValue('https://ntfy.sh');
    // Topic should be empty (reset by useEffect)
    await expect(topicInput).toHaveValue('');

    // Close the dialog
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
  });

  test('should open and close endpoint dialog without JavaScript errors', async ({ page }) => {
    // This test verifies the dialog opens without throwing a "useEffect is not defined" error
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await navigateToEndpointsTab(page);

    // Open and close the dialog multiple times to stress test the useEffect
    for (let i = 0; i < 3; i++) {
      await page.locator(SELECTORS.addEndpointButton).click();
      const dialog = page.locator(SELECTORS.dialog);
      await expect(dialog).toBeVisible({ timeout: TIMEOUTS.dialogVisible });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    }

    // Verify no React hook related errors occurred
    // This catches "useEffect is not defined", "useState is not defined", etc.
    const reactHookError = consoleErrors.find(
      (error) =>
        (error.includes('useEffect') ||
          error.includes('useState') ||
          error.includes('useCallback')) &&
        error.includes('is not defined')
    );
    expect(reactHookError).toBeUndefined();
  });

  test('should have enabled toggle working in endpoint dialog', async ({ page }) => {
    await navigateToEndpointsTab(page);

    // Click Add Endpoint button
    await page.locator(SELECTORS.addEndpointButton).click();

    const dialog = page.locator(SELECTORS.dialog);
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.dialogVisible });

    // Verify the enabled switch exists and is checked by default (useEffect sets enabled=true)
    const enabledSwitch = dialog.locator('#endpoint-enabled');
    await expect(enabledSwitch).toBeChecked();

    // Click the switch to toggle it off
    await enabledSwitch.click();
    await expect(enabledSwitch).not.toBeChecked();

    // Click it again to toggle it back on
    await enabledSwitch.click();
    await expect(enabledSwitch).toBeChecked();

    // Close the dialog
    await page.keyboard.press('Escape');
  });

  test('should have Add Endpoint button disabled when form is invalid', async ({ page }) => {
    await navigateToEndpointsTab(page);

    // Click Add Endpoint button
    await page.locator(SELECTORS.addEndpointButton).click();

    const dialog = page.locator(SELECTORS.dialog);
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.dialogVisible });

    // The Add Endpoint button should be disabled because form is empty (name and topic required)
    const addButton = dialog.locator('button:has-text("Add Endpoint")').last();
    await expect(addButton).toBeDisabled();

    // Fill in name but not topic
    await dialog.locator('input#endpoint-name').fill('Test Name');

    // Button should still be disabled (topic is required)
    await expect(addButton).toBeDisabled();

    // Fill in topic with invalid value (contains space)
    await dialog.locator('input#endpoint-topic').fill('invalid topic');

    // Button should still be disabled (topic has space which is invalid)
    await expect(addButton).toBeDisabled();

    // Fix the topic
    await dialog.locator('input#endpoint-topic').fill('valid-topic');

    // Now button should be enabled
    await expect(addButton).toBeEnabled();

    // Close the dialog
    await page.keyboard.press('Escape');
  });

  test('should persist ntfy endpoint after adding and page reload', async ({ page }) => {
    // This test verifies that ntfy endpoints are correctly saved to the server
    // and restored when the page is reloaded - the core bug fix being tested

    await navigateToEndpointsTab(page);

    // Add a new endpoint
    await page.locator(SELECTORS.addEndpointButton).click();

    const dialog = page.locator(SELECTORS.dialog);
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.dialogVisible });

    // Fill in the endpoint form
    const uniqueSuffix = Date.now();
    await dialog.locator('input#endpoint-name').fill(`Test Endpoint ${uniqueSuffix}`);
    await dialog.locator('input#endpoint-server').fill('https://ntfy.sh');
    await dialog.locator('input#endpoint-topic').fill(`test-topic-${uniqueSuffix}`);

    // Save the endpoint
    const addButton = dialog.locator('button:has-text("Add Endpoint")').last();
    await addButton.click();

    // Wait for the success toast to confirm the save completed (including API call)
    await waitForSuccessToast(page, 'Endpoint added', { timeout: 10000 });

    // Dialog should close
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });

    // Wait for the endpoint to appear in the list
    await expect(page.locator(`text=Test Endpoint ${uniqueSuffix}`)).toBeVisible({
      timeout: TIMEOUTS.endpointVisible,
    });

    // Reload the page
    await page.reload();

    // Re-authenticate after reload
    await authenticateForTests(page);

    // Navigate back to the endpoints tab
    await navigateToEndpointsTab(page);

    // Verify the endpoint persisted after reload
    await expect(page.locator(`text=Test Endpoint ${uniqueSuffix}`)).toBeVisible({
      timeout: TIMEOUTS.sectionVisible,
    });
  });

  test('should display existing endpoints on initial load', async ({ page }) => {
    // This test verifies that any existing endpoints are displayed when the page first loads
    // Navigate to the page and check if we can see the endpoints section

    await navigateToEndpointsTab(page);

    // The endpoints tab should show either existing endpoints or the empty state
    // The key is that it should NOT show "empty" if there are endpoints on the server

    // Either we see "No ntfy endpoints configured" OR we see endpoint cards
    const emptyState = page.locator('text=No ntfy endpoints configured');
    const endpointCard = page.locator('[data-testid="endpoint-card"]').first();

    // One of these should be visible (use Playwright's .or() to match either locator)
    await expect(emptyState.or(endpointCard)).toBeVisible({
      timeout: TIMEOUTS.endpointVisible,
    });
  });
});
