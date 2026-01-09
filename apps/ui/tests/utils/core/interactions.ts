import { Page, expect } from '@playwright/test';
import { getByTestId, getButtonByText } from './elements';
import { waitForSplashScreenToDisappear } from './waiting';

/**
 * Get the platform-specific modifier key (Meta for Mac, Control for Windows/Linux)
 * This is used for keyboard shortcuts like Cmd+Enter or Ctrl+Enter
 */
export function getPlatformModifier(): 'Meta' | 'Control' {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

/**
 * Press the platform-specific modifier + a key (e.g., Cmd+Enter or Ctrl+Enter)
 */
export async function pressModifierEnter(page: Page): Promise<void> {
  const modifier = getPlatformModifier();
  await page.keyboard.press(`${modifier}+Enter`);
}

/**
 * Click an element by its data-testid attribute
 * Waits for the element to be visible before clicking to avoid flaky tests
 */
export async function clickElement(page: Page, testId: string): Promise<void> {
  // Wait for splash screen to disappear first (safety net)
  await waitForSplashScreenToDisappear(page, 5000);
  const element = page.locator(`[data-testid="${testId}"]`);
  // Wait for element to be visible and stable before clicking
  await element.waitFor({ state: 'visible', timeout: 10000 });
  await element.click();
}

/**
 * Click a button by its text content
 */
export async function clickButtonByText(page: Page, text: string): Promise<void> {
  const button = await getButtonByText(page, text);
  await button.click();
}

/**
 * Fill an input field by its data-testid attribute
 */
export async function fillInput(page: Page, testId: string, value: string): Promise<void> {
  const input = await getByTestId(page, testId);
  await input.fill(value);
}

/**
 * Press a keyboard shortcut key
 */
export async function pressShortcut(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
}

/**
 * Navigate to a URL with authentication
 * This wrapper ensures authentication happens before navigation
 */
export async function gotoWithAuth(page: Page, url: string): Promise<void> {
  const { authenticateForTests } = await import('../api/client');
  await authenticateForTests(page);
  await page.goto(url);
}

/**
 * Handle login screen if it appears after navigation
 * Returns true if login was handled, false if no login screen was found
 */
export async function handleLoginScreenIfPresent(page: Page): Promise<boolean> {
  // Check for login screen by waiting for either login input or app-container to be visible
  // Use data-testid selector (preferred) with fallback to the old selector
  const loginInput = page
    .locator('[data-testid="login-api-key-input"], input[type="password"][placeholder*="API key"]')
    .first();
  const appContent = page.locator(
    '[data-testid="welcome-view"], [data-testid="board-view"], [data-testid="context-view"], [data-testid="agent-view"]'
  );

  const maxWaitMs = 15000;

  // Race between login screen, a delayed redirect to /login, and actual content
  const loginVisible = await Promise.race([
    page
      .waitForURL((url) => url.pathname.includes('/login'), { timeout: maxWaitMs })
      .then(() => true)
      .catch(() => false),
    loginInput
      .waitFor({ state: 'visible', timeout: maxWaitMs })
      .then(() => true)
      .catch(() => false),
    appContent
      .first()
      .waitFor({ state: 'visible', timeout: maxWaitMs })
      .then(() => false)
      .catch(() => false),
  ]);

  if (loginVisible) {
    const apiKey = process.env.AUTOMAKER_API_KEY || 'test-api-key-for-e2e-tests';
    await loginInput.fill(apiKey);

    // Wait a moment for the button to become enabled
    await page.waitForTimeout(100);

    // Wait for button to be enabled (it's disabled when input is empty)
    const loginButton = page
      .locator('[data-testid="login-submit-button"], button:has-text("Login")')
      .first();
    await expect(loginButton).toBeEnabled({ timeout: 5000 });
    await loginButton.click();

    // Wait for navigation away from login - either to content or URL change
    await Promise.race([
      page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }),
      appContent.first().waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {});

    // Wait for page to load
    await page.waitForLoadState('load');

    return true;
  }

  return false;
}

/**
 * Press a number key (0-9) on the keyboard
 */
export async function pressNumberKey(page: Page, num: number): Promise<void> {
  await page.keyboard.press(num.toString());
}

/**
 * Focus on an input element to test that shortcuts don't fire when typing
 */
export async function focusOnInput(page: Page, testId: string): Promise<void> {
  const input = page.locator(`[data-testid="${testId}"]`);
  await input.focus();
}

/**
 * Close any open dialog by pressing Escape
 * Waits for dialog to be removed from DOM rather than using arbitrary timeout
 */
export async function closeDialogWithEscape(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  // Wait for any dialog overlay to disappear
  await page
    .locator('[data-radix-dialog-overlay], [role="dialog"]')
    .waitFor({ state: 'hidden', timeout: 5000 })
    .catch(() => {
      // Dialog may have already closed or not exist
    });
}
