import { Page, Locator } from '@playwright/test';

/**
 * Wait for the page to load
 * Uses 'load' state instead of 'networkidle' because the app has persistent
 * connections (websockets/polling) that prevent network from ever being idle.
 * Tests should wait for specific elements to verify page is ready.
 */
export async function waitForNetworkIdle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
}

/**
 * Wait for an element with a specific data-testid to appear
 */
export async function waitForElement(
  page: Page,
  testId: string,
  options?: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' }
): Promise<Locator> {
  const element = page.locator(`[data-testid="${testId}"]`);
  await element.waitFor({
    timeout: options?.timeout ?? 5000,
    state: options?.state ?? 'visible',
  });
  return element;
}

/**
 * Wait for an element with a specific data-testid to be hidden
 */
export async function waitForElementHidden(
  page: Page,
  testId: string,
  options?: { timeout?: number }
): Promise<void> {
  const element = page.locator(`[data-testid="${testId}"]`);
  await element.waitFor({
    timeout: options?.timeout ?? 5000,
    state: 'hidden',
  });
}

/**
 * Wait for the splash screen to disappear
 * The splash screen has z-[9999] and blocks interactions, so we need to wait for it
 */
export async function waitForSplashScreenToDisappear(page: Page, timeout = 5000): Promise<void> {
  try {
    // Check if splash screen is shown via sessionStorage first (fastest check)
    const splashShown = await page.evaluate(() => {
      return sessionStorage.getItem('automaker-splash-shown') === 'true';
    });

    // If splash is already marked as shown, it won't appear, so we're done
    if (splashShown) {
      return;
    }

    // Otherwise, wait for the splash screen element to disappear
    // The splash screen is a div with z-[9999] and fixed inset-0
    // We check for elements that match the splash screen pattern
    await page.waitForFunction(
      () => {
        // Check if splash is marked as shown in sessionStorage
        if (sessionStorage.getItem('automaker-splash-shown') === 'true') {
          return true;
        }

        // Check for splash screen element by looking for fixed inset-0 with high z-index
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
          const style = window.getComputedStyle(div);
          const classes = div.className || '';
          // Check if it matches splash screen pattern: fixed, inset-0, and high z-index
          if (
            style.position === 'fixed' &&
            (classes.includes('inset-0') ||
              (style.top === '0px' &&
                style.left === '0px' &&
                style.right === '0px' &&
                style.bottom === '0px')) &&
            (classes.includes('z-[') || parseInt(style.zIndex) >= 9999)
          ) {
            // Check if it's visible and blocking (opacity > 0 and pointer-events not none)
            if (style.opacity !== '0' && style.pointerEvents !== 'none') {
              return false; // Splash screen is still visible
            }
          }
        }
        return true; // No visible splash screen found
      },
      { timeout }
    );
  } catch {
    // Splash screen might not exist or already gone, which is fine
    // No need to wait - if it doesn't exist, we're good
  }
}
