import { Page } from '@playwright/test';
import { clickElement, closeDialogWithEscape } from '../core/interactions';
import { handleLoginScreenIfPresent } from '../core/interactions';
import { waitForElement } from '../core/waiting';
import { authenticateForTests } from '../api/client';

/**
 * Navigate to the board/kanban view
 * Note: Navigates directly to /board since index route shows WelcomeView
 */
export async function navigateToBoard(page: Page): Promise<void> {
  // Authenticate before navigating (fast-path: skips if already authed via storageState)
  await authenticateForTests(page);

  // Navigate directly to /board route
  await page.goto('/board', { waitUntil: 'domcontentloaded' });

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
  // Authenticate before navigating (fast-path: skips if already authed via storageState)
  await authenticateForTests(page);

  // Navigate directly to /context route
  await page.goto('/context', { waitUntil: 'domcontentloaded' });

  // Handle login redirect if needed
  await handleLoginScreenIfPresent(page);

  // Wait for one of: context-view, context-view-no-project, or context-view-loading.
  // Store hydration and loadContextFiles can be async, so we accept any of these first.
  const viewSelector =
    '[data-testid="context-view"], [data-testid="context-view-no-project"], [data-testid="context-view-loading"]';
  await page.locator(viewSelector).first().waitFor({ state: 'visible', timeout: 15000 });

  // If we see "no project", give hydration a moment then re-check (avoids flake when store hydrates after first paint).
  const noProject = page.locator('[data-testid="context-view-no-project"]');
  if (await noProject.isVisible().catch(() => false)) {
    // Poll for the view to appear rather than a fixed timeout
    await page
      .locator('[data-testid="context-view"], [data-testid="context-view-loading"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {
        throw new Error(
          'Context view showed "No project selected". Ensure setupProjectWithFixture runs before navigateToContext and store has time to hydrate.'
        );
      });
  }

  // Wait for loading to complete (if present)
  const loadingElement = page.locator('[data-testid="context-view-loading"]');
  if (await loadingElement.isVisible().catch(() => false)) {
    await loadingElement.waitFor({ state: 'hidden', timeout: 15000 });
  }

  // Wait for the context view to be visible
  await waitForElement(page, 'context-view', { timeout: 15000 });

  // On mobile, close the sidebar if open so the header actions trigger is clickable (not covered by backdrop)
  // Use JavaScript click to avoid force:true hitting the sidebar (z-30) instead of the backdrop (z-20)
  const backdrop = page.locator('[data-testid="sidebar-backdrop"]');
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.evaluate((el) => (el as HTMLElement).click());
  }

  // Dismiss any open dialog that may block interactions (e.g. sandbox warning, onboarding)
  await closeDialogWithEscape(page, { timeout: 2000 });
}

/**
 * Navigate to the spec view
 * Note: Navigates directly to /spec since index route shows WelcomeView
 */
export async function navigateToSpec(page: Page): Promise<void> {
  // Authenticate before navigating (fast-path: skips if already authed via storageState)
  await authenticateForTests(page);

  // Navigate directly to /spec route
  await page.goto('/spec', { waitUntil: 'domcontentloaded' });

  // Wait for loading state to complete first (if present)
  const loadingElement = page.locator('[data-testid="spec-view-loading"]');
  if (await loadingElement.isVisible().catch(() => false)) {
    await loadingElement.waitFor({ state: 'hidden', timeout: 10000 });
  }

  // Wait for either the main spec view or empty state to be visible
  await page
    .locator('[data-testid="spec-view"], [data-testid="spec-view-empty"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Navigate to the agent view
 * Note: Navigates directly to /agent since index route shows WelcomeView
 */
export async function navigateToAgent(page: Page): Promise<void> {
  // Authenticate before navigating (fast-path: skips if already authed via storageState)
  await authenticateForTests(page);

  // Navigate directly to /agent route
  await page.goto('/agent', { waitUntil: 'domcontentloaded' });

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
  // Authenticate before navigating (fast-path: skips if already authed via storageState)
  await authenticateForTests(page);

  // Navigate directly to /settings route
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

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
 * Navigate to the welcome/dashboard view (clear project selection)
 * Note: The app redirects from / to /dashboard when no project is selected
 */
export async function navigateToWelcome(page: Page): Promise<void> {
  // Authenticate before navigating (fast-path: skips if already authed via storageState)
  await authenticateForTests(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Handle login redirect if needed
  await handleLoginScreenIfPresent(page);

  // Wait for either welcome-view, dashboard-view, or overview-view (app redirects based on project state)
  await page
    .locator(
      '[data-testid="welcome-view"], [data-testid="dashboard-view"], [data-testid="overview-view"]'
    )
    .first()
    .waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Navigate to a specific view using the sidebar navigation
 */
export async function navigateToView(page: Page, viewId: string): Promise<void> {
  const navSelector = viewId === 'settings' ? 'settings-button' : `nav-${viewId}`;
  await clickElement(page, navSelector);
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
