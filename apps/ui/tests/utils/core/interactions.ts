import { Page, expect } from '@playwright/test';
import { getByTestId, getButtonByText } from './elements';

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
  // Splash screen waits are handled by navigation helpers (navigateToContext, navigateToMemory, etc.)
  // before any clickElement calls, so we skip the splash check here to avoid blocking when
  // other fixed overlays (e.g. HeaderActionsPanel backdrop at z-[60]) are present on the page.
  const element = page.locator(`[data-testid="${testId}"]`);
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

/** Selector matching any top-level app view by data-testid, used to detect that the app has loaded. */
const APP_CONTENT_SELECTOR =
  '[data-testid="welcome-view"], [data-testid="dashboard-view"], [data-testid="board-view"], [data-testid="context-view"], [data-testid="agent-view"], [data-testid="overview-view"]';

/**
 * Handle login screen if it appears after navigation
 * Returns true if login was handled, false if no login screen was found
 *
 * Optimized: uses a short timeout (3s) since we're pre-authenticated via storageState.
 * Login screens should only appear in exceptional cases (session expired, etc.)
 */
export async function handleLoginScreenIfPresent(page: Page): Promise<boolean> {
  // Short timeout: with storageState auth, login should rarely appear
  const maxWaitMs = 3000;

  const appContent = page.locator(APP_CONTENT_SELECTOR);
  const loginInput = page
    .locator('[data-testid="login-api-key-input"], input[type="password"][placeholder*="API key"]')
    .first();
  const loggedOutPage = page.getByRole('heading', { name: /logged out/i });
  const goToLoginButton = page.locator('button:has-text("Go to login")');

  // Race between login screen, logged-out page, a delayed redirect to /login, and actual content
  // App content check is first in the array to win ties (most common case)
  const result = await Promise.race([
    appContent
      .first()
      .waitFor({ state: 'visible', timeout: maxWaitMs })
      .then(() => 'app-content' as const)
      .catch(() => null),
    page
      .waitForURL((url) => url.pathname.includes('/login'), { timeout: maxWaitMs })
      .then(() => 'login-redirect' as const)
      .catch(() => null),
    loginInput
      .waitFor({ state: 'visible', timeout: maxWaitMs })
      .then(() => 'login-input' as const)
      .catch(() => null),
    loggedOutPage
      .waitFor({ state: 'visible', timeout: maxWaitMs })
      .then(() => 'logged-out' as const)
      .catch(() => null),
  ]);

  // Happy path: app content loaded, no login needed
  if (result === 'app-content' || result === null) {
    return false;
  }

  // Handle logged-out page - click "Go to login" button and then login
  if (result === 'logged-out') {
    await goToLoginButton.click();
    await page.waitForLoadState('domcontentloaded');
    // Now handle the login screen
    return handleLoginScreenIfPresent(page);
  }

  const loginVisible = result === 'login-redirect' || result === 'login-input';

  if (loginVisible) {
    // Wait for login input to be visible if we were redirected
    await loginInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    const apiKey = process.env.AUTOMAKER_API_KEY || 'test-api-key-for-e2e-tests';
    await loginInput.fill(apiKey);

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

    await page.waitForLoadState('domcontentloaded');

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
 * Waits for dialog overlay to disappear. Use shorter timeout when no dialog expected (e.g. navigation).
 * @param options.timeout - Max wait for dialog to close (default 5000). Use ~1500 when dialog may not exist.
 */
export async function closeDialogWithEscape(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  await page.keyboard.press('Escape');
  const timeout = options?.timeout ?? 5000;
  const openDialog = page.locator('[role="dialog"][data-state="open"]').first();
  if ((await openDialog.count()) > 0) {
    await openDialog.waitFor({ state: 'hidden', timeout }).catch(() => {});
  }
}
