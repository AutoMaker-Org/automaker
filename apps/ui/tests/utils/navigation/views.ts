import { Page } from '@playwright/test';
import { clickElement } from '../core/interactions';
import { handleLoginScreenIfPresent } from '../core/interactions';
import { waitForElement, waitForSplashScreenToDisappear } from '../core/waiting';
import { authenticateForTests } from '../api/client';

/**
 * Navigate to the board/kanban view
 * Note: Navigates directly to /board since index route shows WelcomeView
 */
export async function navigateToBoard(page: Page): Promise<void> {
  // Authenticate before navigating
  await authenticateForTests(page);

  // Navigate directly to /board route
  await page.goto('/board');
  await page.waitForLoadState('load');

  // Wait for splash screen to disappear (safety net)
  await waitForSplashScreenToDisappear(page, 3000);

  // Handle login redirect if needed
  await handleLoginScreenIfPresent(page);

  // Wait for the board view to be visible
  await waitForElement(page, 'board-view', { timeout: 10000 });
}

/**
 * Navigate to the context view
 * Note: Navigates directly to /context since index route shows WelcomeView
 */
export async function navigateToContext(page: Page): Promise<void> {
  // Authenticate before navigating
  await authenticateForTests(page);

  // Navigate directly to /context route
  await page.goto('/context');
  await page.waitForLoadState('load');

  // Wait for splash screen to disappear (safety net)
  await waitForSplashScreenToDisappear(page, 3000);

  // Handle login redirect if needed
  await handleLoginScreenIfPresent(page);

  // Wait for loading to complete (if present)
  const loadingElement = page.locator('[data-testid="context-view-loading"]');
  try {
    const loadingVisible = await loadingElement.isVisible({ timeout: 2000 });
    if (loadingVisible) {
      // Wait for loading to disappear (context view will appear)
      await loadingElement.waitFor({ state: 'hidden', timeout: 10000 });
    }
  } catch {
    // Loading element not found or already hidden, continue
  }

  // Wait for the context view to be visible
  // Increase timeout to handle slower server startup
  await waitForElement(page, 'context-view', { timeout: 15000 });
}

/**
 * Navigate to the spec view
 * Note: Navigates directly to /spec since index route shows WelcomeView
 */
export async function navigateToSpec(page: Page): Promise<void> {
  // Authenticate before navigating
  await authenticateForTests(page);

  // Navigate directly to /spec route
  await page.goto('/spec');
  await page.waitForLoadState('load');

  // Wait for splash screen to disappear (safety net)
  await waitForSplashScreenToDisappear(page, 3000);

  // Wait for loading state to complete first (if present)
  const loadingElement = page.locator('[data-testid="spec-view-loading"]');
  try {
    const loadingVisible = await loadingElement.isVisible({ timeout: 2000 });
    if (loadingVisible) {
      // Wait for loading to disappear (spec view or empty state will appear)
      await loadingElement.waitFor({ state: 'hidden', timeout: 10000 });
    }
  } catch {
    // Loading element not found or already hidden, continue
  }

  // Wait for either the main spec view or empty state to be visible
  // The spec-view element appears when loading is complete and spec exists
  // The spec-view-empty element appears when loading is complete and spec doesn't exist
  await Promise.race([
    waitForElement(page, 'spec-view', { timeout: 10000 }).catch(() => null),
    waitForElement(page, 'spec-view-empty', { timeout: 10000 }).catch(() => null),
  ]);
}

/**
 * Navigate to the agent view
 * Note: Navigates directly to /agent since index route shows WelcomeView
 */
export async function navigateToAgent(page: Page): Promise<void> {
  // Authenticate before navigating
  await authenticateForTests(page);

  // Navigate directly to /agent route
  await page.goto('/agent');
  await page.waitForLoadState('load');

  // Wait for splash screen to disappear (safety net)
  await waitForSplashScreenToDisappear(page, 3000);

  // Handle login redirect if needed
  await handleLoginScreenIfPresent(page);

  // Wait for the agent view to be visible
  await waitForElement(page, 'agent-view', { timeout: 10000 });
}

/**
 * Navigate to the settings view
 * Note: Navigates directly to /settings since index route shows WelcomeView
 */
export async function navigateToSettings(page: Page): Promise<void> {
  // Authenticate before navigating
  await authenticateForTests(page);

  // Navigate directly to /settings route
  await page.goto('/settings');
  await page.waitForLoadState('load');

  // Wait for splash screen to disappear (safety net)
  await waitForSplashScreenToDisappear(page, 3000);

  // Wait for the settings view to be visible
  await waitForElement(page, 'settings-view', { timeout: 10000 });
}

/**
 * Navigate to the setup view directly
 * Note: This function uses setupFirstRun from project/setup to avoid circular dependency
 */
export async function navigateToSetup(page: Page): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { setupFirstRun } = await import('../project/setup');
  await setupFirstRun(page);
  await page.goto('/');
  await page.waitForLoadState('load');
  await waitForElement(page, 'setup-view', { timeout: 10000 });
}

/**
 * Navigate to the welcome view (clear project selection)
 */
export async function navigateToWelcome(page: Page): Promise<void> {
  // Authenticate before navigating
  await authenticateForTests(page);

  await page.goto('/');
  await page.waitForLoadState('load');

  // Wait for splash screen to disappear (safety net)
  await waitForSplashScreenToDisappear(page, 3000);

  // Handle login redirect if needed
  await handleLoginScreenIfPresent(page);

  await waitForElement(page, 'welcome-view', { timeout: 10000 });
}

/**
 * Navigate to a specific view using the sidebar navigation
 */
export async function navigateToView(page: Page, viewId: string): Promise<void> {
  const navSelector = viewId === 'settings' ? 'settings-button' : `nav-${viewId}`;
  await clickElement(page, navSelector);
  await page.waitForTimeout(100);
}

/**
 * Get the current view from the URL or store (checks which view is active)
 */
export async function getCurrentView(page: Page): Promise<string | null> {
  // Get the current view from zustand store via localStorage
  const storage = await page.evaluate(() => {
    const item = localStorage.getItem('automaker-storage');
    return item ? JSON.parse(item) : null;
  });

  return storage?.state?.currentView || null;
}
