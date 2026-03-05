/**
 * Sidebar Navigation Ordering Test
 *
 * Tests the sidebar navigation entry ordering to ensure that:
 * 1. Dashboard appears first
 * 2. Project section appears second
 * 3. Tools section appears third (with Automations as the last item within it)
 * 4. GitHub section appears fourth (when applicable)
 * 5. Notifications and Project Settings appear last
 *
 * Feature: Move the automation sidebar entry below the tools entry
 * Implementation: Automations is now the last item within the Tools collapsible section
 */

import { test, expect } from '@playwright/test';
import { setupProjectWithFixture, getFixturePath, handleLoginScreenIfPresent } from '../utils';

// Test constants
const TEST_TIMEOUTS = {
  BOARD_LOAD: 15000,
  BUTTON_VISIBLE: 2000,
  AUTOMATIONS_VISIBLE: 5000,
  VIEW_VISIBLE: 10000,
} as const;

const DELAYS = {
  SIDEBAR_EXPANSION: 300,
} as const;

// Section labels used in tests
const SECTION_LABELS = {
  TOOLS: 'Tools',
  PROJECT: 'Project',
  GITHUB: 'GitHub',
} as const;

// Nav button labels
const NAV_LABELS = {
  DASHBOARD: 'Dashboard',
  AUTOMATIONS: 'Automations',
  NOTIFICATIONS: 'Notifications',
  PROJECT_SETTINGS: 'Project Settings',
  IDEATION: 'Ideation',
  SPEC_EDITOR: 'Spec Editor',
  CONTEXT: 'Context',
  MEMORY: 'Memory',
} as const;

/**
 * Expands the sidebar if it's collapsed
 */
async function expandSidebar(page: import('@playwright/test').Page): Promise<void> {
  const expandSidebarButton = page.locator('button:has-text("Expand sidebar")');
  if (
    await expandSidebarButton
      .isVisible({ timeout: TEST_TIMEOUTS.BUTTON_VISIBLE })
      .catch(() => false)
  ) {
    await expandSidebarButton.click();
    await page.waitForTimeout(DELAYS.SIDEBAR_EXPANSION);
  }
}

/**
 * Expands the Tools section to reveal nested items
 */
async function expandToolsSection(page: import('@playwright/test').Page): Promise<void> {
  const toolsToggle = page.locator('button').filter({ hasText: SECTION_LABELS.TOOLS }).first();
  if (await toolsToggle.isVisible({ timeout: TEST_TIMEOUTS.BUTTON_VISIBLE }).catch(() => false)) {
    await toolsToggle.click();
    await page.waitForTimeout(DELAYS.SIDEBAR_EXPANSION);
  }
}

/**
 * Initializes the board view with expanded sidebar and Tools section
 */
async function initializeBoardView(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/board');
  await page.waitForLoadState('load');
  await handleLoginScreenIfPresent(page);

  // Wait for the board view to load
  await expect(page.locator('[data-testid="board-view"]')).toBeVisible({
    timeout: TEST_TIMEOUTS.BOARD_LOAD,
  });

  // Expand sidebar and Tools section
  await expandSidebar(page);
  await expandToolsSection(page);
}

/**
 * Verifies a bounding box is not null
 */
function assertBoundingBoxExists(
  box: { x: number; y: number; width: number; height: number } | null
): asserts box is { x: number; y: number; width: number; height: number } {
  expect(box).not.toBe(null);
}

test.describe('Sidebar Navigation Ordering', () => {
  // Use storageState for authentication
  test.use({ storageState: '.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
    // Set up project with fixture (real file system path)
    await setupProjectWithFixture(page, getFixturePath());
  });

  test('should display Automations entry within Tools section in sidebar', async ({ page }) => {
    await initializeBoardView(page);

    // Verify the expected navigation order by checking positions
    // The order should be: Dashboard -> Project -> Tools (with Automations inside) -> Notifications -> Project Settings

    // 1. Dashboard should be first
    const dashboardButton = page.getByRole('button', { name: NAV_LABELS.DASHBOARD });
    await expect(dashboardButton).toBeVisible();

    // 2. Project section should be after Dashboard
    const projectSectionLabel = page.getByText(SECTION_LABELS.PROJECT).first();
    await expect(projectSectionLabel).toBeVisible();

    // 3. Tools section should be after Project
    const toolsSectionLabel = page.getByText(SECTION_LABELS.TOOLS).first();
    await expect(toolsSectionLabel).toBeVisible();

    // 4. Automations should be visible within Tools section (this is the key verification)
    const automationsButton = page.getByRole('button', { name: NAV_LABELS.AUTOMATIONS });
    await expect(automationsButton).toBeVisible();

    // Verify Automations appears after Tools label by checking their positions in the DOM
    const toolsBoundingBox = await toolsSectionLabel.boundingBox();
    const automationsBoundingBox = await automationsButton.boundingBox();

    assertBoundingBoxExists(toolsBoundingBox);
    assertBoundingBoxExists(automationsBoundingBox);

    // Automations should have a larger Y position than Tools label (appears below it within the section)
    expect(automationsBoundingBox.y).toBeGreaterThan(toolsBoundingBox.y);

    // 5. Notifications should be after Tools section (and thus after Automations)
    const notificationsButton = page.getByRole('button', { name: NAV_LABELS.NOTIFICATIONS });
    await expect(notificationsButton).toBeVisible();

    const notificationsBoundingBox = await notificationsButton.boundingBox();
    assertBoundingBoxExists(notificationsBoundingBox);

    // Notifications should have a larger Y position than Automations
    expect(notificationsBoundingBox.y).toBeGreaterThan(automationsBoundingBox.y);

    // 6. Project Settings should be after Notifications
    const projectSettingsButton = page.getByRole('button', { name: NAV_LABELS.PROJECT_SETTINGS });
    await expect(projectSettingsButton).toBeVisible();

    const projectSettingsBoundingBox = await projectSettingsButton.boundingBox();
    assertBoundingBoxExists(projectSettingsBoundingBox);

    // Project Settings should have a larger Y position than Notifications
    expect(projectSettingsBoundingBox.y).toBeGreaterThan(notificationsBoundingBox.y);
  });

  test('should navigate to Automations view when clicking Automations entry', async ({ page }) => {
    await initializeBoardView(page);

    // Click on the Automations link in the sidebar
    const automationsLink = page.getByRole('button', { name: NAV_LABELS.AUTOMATIONS });
    await expect(automationsLink).toBeVisible({ timeout: TEST_TIMEOUTS.AUTOMATIONS_VISIBLE });
    await automationsLink.click();

    // Wait for navigation to complete and verify we're on the automations page
    await page.waitForURL('**/automations');
    await expect(page).toHaveURL(/\/automations/);

    // Verify the automations view is displayed
    await expect(page.locator('[data-testid="automation-management-view"]')).toBeVisible({
      timeout: TEST_TIMEOUTS.VIEW_VISIBLE,
    });
  });

  test('should display all navigation items in correct order after expanding sections', async ({
    page,
  }) => {
    await initializeBoardView(page);

    // Collect all navigation buttons using role=button
    const allNavButtons = await page.locator('nav button').all();

    // Get the indices of key items
    let dashboardIndex = -1;
    let automationsIndex = -1;
    let notificationsIndex = -1;
    let projectSettingsIndex = -1;

    for (let i = 0; i < allNavButtons.length; i++) {
      const text = await allNavButtons[i].textContent();
      if (text?.includes(NAV_LABELS.DASHBOARD)) dashboardIndex = i;
      if (text?.includes(NAV_LABELS.AUTOMATIONS)) automationsIndex = i;
      if (text?.includes(NAV_LABELS.NOTIFICATIONS)) notificationsIndex = i;
      if (text?.includes(NAV_LABELS.PROJECT_SETTINGS)) projectSettingsIndex = i;
    }

    // Verify all items were found
    expect(dashboardIndex).toBeGreaterThanOrEqual(0);
    expect(automationsIndex).toBeGreaterThanOrEqual(0);
    expect(notificationsIndex).toBeGreaterThanOrEqual(0);
    expect(projectSettingsIndex).toBeGreaterThanOrEqual(0);

    // Verify order: Dashboard < Automations < Notifications < Project Settings
    expect(dashboardIndex).toBeLessThan(automationsIndex);
    expect(automationsIndex).toBeLessThan(notificationsIndex);
    expect(notificationsIndex).toBeLessThan(projectSettingsIndex);
  });

  test('should maintain correct order when GitHub section is present', async ({ page }) => {
    // Mock GitHub remote check to return true
    await page.route('**/api/github/check-remote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, hasGitHubRemote: true }),
      });
    });

    await initializeBoardView(page);

    // Verify GitHub section appears
    const githubSectionLabel = page.getByText(SECTION_LABELS.GITHUB).first();
    await expect(githubSectionLabel).toBeVisible({ timeout: TEST_TIMEOUTS.AUTOMATIONS_VISIBLE });

    // Verify order by checking bounding boxes
    const toolsSectionLabel = page.getByText(SECTION_LABELS.TOOLS).first();
    const automationsButton = page.getByRole('button', { name: NAV_LABELS.AUTOMATIONS });
    const _toolsBoundingBox = await toolsSectionLabel.boundingBox();
    const githubBoundingBox = await githubSectionLabel.boundingBox();
    const automationsBoundingBox = await automationsButton.boundingBox();

    assertBoundingBoxExists(githubBoundingBox);
    assertBoundingBoxExists(automationsBoundingBox);

    // Automations should appear before GitHub (GitHub has larger Y)
    // Automations is within Tools section, which appears before GitHub section
    expect(githubBoundingBox.y).toBeGreaterThan(automationsBoundingBox.y);

    // Verify Notifications appears after GitHub
    const notificationsButton = page.getByRole('button', { name: NAV_LABELS.NOTIFICATIONS });
    const notificationsBoundingBox = await notificationsButton.boundingBox();
    assertBoundingBoxExists(notificationsBoundingBox);

    expect(notificationsBoundingBox.y).toBeGreaterThan(githubBoundingBox.y);
  });

  test('should place Automations as the last item within Tools section', async ({ page }) => {
    await initializeBoardView(page);

    // Verify all expected Tools items are present
    const ideationButton = page.getByRole('button', { name: new RegExp(NAV_LABELS.IDEATION) });
    const specButton = page.getByRole('button', { name: new RegExp(NAV_LABELS.SPEC_EDITOR) });
    const contextButton = page.getByRole('button', { name: new RegExp(NAV_LABELS.CONTEXT) });
    const memoryButton = page.getByRole('button', { name: new RegExp(NAV_LABELS.MEMORY) });
    const automationsButton = page.getByRole('button', {
      name: new RegExp(NAV_LABELS.AUTOMATIONS),
    });

    await expect(ideationButton).toBeVisible();
    await expect(specButton).toBeVisible();
    await expect(contextButton).toBeVisible();
    await expect(memoryButton).toBeVisible();
    await expect(automationsButton).toBeVisible();

    // Verify Automations is the last item by checking Y positions
    const ideationBox = await ideationButton.boundingBox();
    const specBox = await specButton.boundingBox();
    const contextBox = await contextButton.boundingBox();
    const memoryBox = await memoryButton.boundingBox();
    const automationsBox = await automationsButton.boundingBox();

    assertBoundingBoxExists(ideationBox);
    assertBoundingBoxExists(specBox);
    assertBoundingBoxExists(contextBox);
    assertBoundingBoxExists(memoryBox);
    assertBoundingBoxExists(automationsBox);

    // Automations should have the largest Y position (appear last)
    expect(automationsBox.y).toBeGreaterThan(memoryBox.y);
    expect(memoryBox.y).toBeGreaterThan(contextBox.y);
    expect(contextBox.y).toBeGreaterThan(specBox.y);
    expect(specBox.y).toBeGreaterThan(ideationBox.y);
  });
});
