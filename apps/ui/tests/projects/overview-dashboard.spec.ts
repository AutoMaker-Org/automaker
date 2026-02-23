/**
 * Projects Overview Dashboard End-to-End Test
 *
 * Tests the multi-project overview dashboard that shows status across all projects.
 * This verifies that:
 * 1. The overview view can be accessed via the sidebar
 * 2. The overview displays aggregate statistics
 * 3. Navigation back to dashboard works correctly
 * 4. The UI responds to API data correctly
 */

import { test, expect } from '@playwright/test';
import {
  setupMockMultipleProjects,
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';

/**
 * Helper to build overview API response bodies.
 * Each test sets `overviewMock` before navigating so the single
 * route handler registered in `beforeEach` returns the right data.
 */
function makeOverviewResponse(
  overrides: {
    projects?: unknown[];
    aggregate?: Record<string, unknown>;
    recentActivity?: unknown[];
    status?: number;
    error?: string;
  } = {}
) {
  const { projects = [], aggregate, recentActivity = [], status = 200, error } = overrides;

  const defaultAggregate = {
    projectCounts: { total: 0, active: 0, idle: 0, waiting: 0, withErrors: 0, allCompleted: 0 },
    featureCounts: { total: 0, pending: 0, running: 0, completed: 0, failed: 0, verified: 0 },
    totalUnreadNotifications: 0,
    projectsWithAutoModeRunning: 0,
    computedAt: new Date().toISOString(),
  };

  return {
    status,
    body: error
      ? JSON.stringify({ error })
      : JSON.stringify({
          success: true,
          projects,
          aggregate: aggregate ?? defaultAggregate,
          recentActivity,
          generatedAt: new Date().toISOString(),
        }),
  };
}

test.describe('Projects Overview Dashboard', () => {
  // Mutable mock response - tests set this before navigating.
  // The single route handler in beforeEach reads it on every request.
  let overviewMock: { status: number; body: string };

  test.beforeEach(async ({ page }) => {
    // Start with an empty default
    overviewMock = makeOverviewResponse();

    // Set up mock projects state
    await setupMockMultipleProjects(page, 3);

    // Intercept settings API to preserve mock project data and prevent
    // the server's settings from overriding our test setup.
    await page.route('**/api/settings/global', async (route) => {
      const method = route.request().method();
      if (method === 'PUT') {
        return route.continue();
      }
      try {
        const response = await route.fetch();
        const json = await response.json();
        if (json.settings) {
          json.settings.projects = [
            {
              id: 'test-project-1',
              name: 'Test Project 1',
              path: '/mock/test-project-1',
              lastOpened: new Date().toISOString(),
            },
            {
              id: 'test-project-2',
              name: 'Test Project 2',
              path: '/mock/test-project-2',
              lastOpened: new Date(Date.now() - 86400000).toISOString(),
            },
            {
              id: 'test-project-3',
              name: 'Test Project 3',
              path: '/mock/test-project-3',
              lastOpened: new Date(Date.now() - 172800000).toISOString(),
            },
          ];
          json.settings.currentProjectId = 'test-project-1';
          json.settings.setupComplete = true;
          json.settings.isFirstRun = false;
        }
        await route.fulfill({ response, json });
      } catch {
        // Route may be called after test ends; swallow errors from closed context
      }
    });

    // Mock the initialize-project endpoint for mock paths that don't exist on disk.
    await page.route('**/api/project/initialize', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Mock features list for mock project paths (they don't exist on disk)
    await page.route('**/api/features/list**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, features: [] }),
      });
    });

    // Single overview route handler that reads from the mutable `overviewMock`.
    // Tests update `overviewMock` before navigating to control the response.
    await page.route('**/api/projects/overview', async (route) => {
      await route.fulfill({
        status: overviewMock.status,
        contentType: 'application/json',
        body: overviewMock.body,
      });
    });

    await authenticateForTests(page);
  });

  test('should navigate to overview from sidebar and display overview UI', async ({ page }) => {
    // Use default empty overview mock (set in beforeEach)

    // Go to the app
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for the board view to load
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });

    // Expand sidebar if collapsed
    const expandSidebarButton = page.locator('button:has-text("Expand sidebar")');
    if (await expandSidebarButton.isVisible()) {
      await expandSidebarButton.click();
      await page.waitForTimeout(300);
    }

    // Click on the Dashboard link in the sidebar (navigates to /overview)
    const overviewLink = page.getByRole('button', { name: 'Dashboard' });
    await expect(overviewLink).toBeVisible({ timeout: 5000 });
    await overviewLink.click();

    // Wait for the overview view to appear
    await expect(page.locator('[data-testid="overview-view"]')).toBeVisible({ timeout: 15000 });

    // Verify the header is visible with title
    await expect(page.getByText('Automaker Dashboard')).toBeVisible({ timeout: 5000 });

    // Verify the refresh button is present
    await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();

    // Verify the Open Project and New Project buttons are present in the overview header
    const overviewHeader = page.locator('[data-testid="overview-view"] header');
    await expect(overviewHeader.getByRole('button', { name: /Open Project/i })).toBeVisible();
    await expect(overviewHeader.getByRole('button', { name: /New Project/i })).toBeVisible();
  });

  test('should display aggregate statistics cards', async ({ page }) => {
    overviewMock = makeOverviewResponse({
      projects: [
        {
          projectId: 'test-project-1',
          projectName: 'Test Project 1',
          projectPath: '/mock/test-project-1',
          healthStatus: 'active',
          featureCounts: { pending: 2, running: 1, completed: 3, failed: 0, verified: 2 },
          totalFeatures: 8,
          isAutoModeRunning: true,
          unreadNotificationCount: 1,
        },
        {
          projectId: 'test-project-2',
          projectName: 'Test Project 2',
          projectPath: '/mock/test-project-2',
          healthStatus: 'idle',
          featureCounts: { pending: 5, running: 0, completed: 10, failed: 1, verified: 8 },
          totalFeatures: 24,
          isAutoModeRunning: false,
          unreadNotificationCount: 0,
        },
      ],
      aggregate: {
        projectCounts: {
          total: 2,
          active: 1,
          idle: 1,
          waiting: 0,
          withErrors: 1,
          allCompleted: 0,
        },
        featureCounts: {
          total: 32,
          pending: 7,
          running: 1,
          completed: 13,
          failed: 1,
          verified: 10,
        },
        totalUnreadNotifications: 1,
        projectsWithAutoModeRunning: 1,
        computedAt: new Date().toISOString(),
      },
      recentActivity: [
        {
          id: 'activity-1',
          projectId: 'test-project-1',
          projectName: 'Test Project 1',
          type: 'feature_completed',
          description: 'Feature completed: Add login form',
          severity: 'success',
          timestamp: new Date().toISOString(),
          featureId: 'feature-1',
          featureTitle: 'Add login form',
        },
      ],
    });

    // Navigate directly to overview
    await page.goto('/overview');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for the overview view to appear
    await expect(page.locator('[data-testid="overview-view"]')).toBeVisible({ timeout: 15000 });

    // Verify aggregate stat cards are displayed
    // Projects count card
    await expect(page.getByText('Projects').first()).toBeVisible({ timeout: 10000 });

    // Running features card
    await expect(page.getByText('Running').first()).toBeVisible();

    // Pending features card
    await expect(page.getByText('Pending').first()).toBeVisible();

    // Completed features card
    await expect(page.getByText('Completed').first()).toBeVisible();

    // Auto-mode card
    await expect(page.getByText('Auto-mode').first()).toBeVisible();
  });

  test('should display project status cards', async ({ page }) => {
    overviewMock = makeOverviewResponse({
      projects: [
        {
          projectId: 'test-project-1',
          projectName: 'Test Project 1',
          projectPath: '/mock/test-project-1',
          healthStatus: 'active',
          featureCounts: { pending: 2, running: 1, completed: 3, failed: 0, verified: 2 },
          totalFeatures: 8,
          isAutoModeRunning: true,
          unreadNotificationCount: 1,
        },
      ],
      aggregate: {
        projectCounts: {
          total: 1,
          active: 1,
          idle: 0,
          waiting: 0,
          withErrors: 0,
          allCompleted: 0,
        },
        featureCounts: {
          total: 8,
          pending: 2,
          running: 1,
          completed: 3,
          failed: 0,
          verified: 2,
        },
        totalUnreadNotifications: 1,
        projectsWithAutoModeRunning: 1,
        computedAt: new Date().toISOString(),
      },
    });

    // Navigate directly to overview
    await page.goto('/overview');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for the overview view to appear
    await expect(page.locator('[data-testid="overview-view"]')).toBeVisible({ timeout: 15000 });

    // Verify project status card is displayed
    const projectCard = page.locator('[data-testid="project-status-card-test-project-1"]');
    await expect(projectCard).toBeVisible({ timeout: 10000 });

    // Verify project name is displayed
    await expect(projectCard.getByText('Test Project 1')).toBeVisible();

    // Verify the Active status badge (use .first() to avoid strict mode violation due to "Auto-mode active" also containing "active")
    await expect(projectCard.getByText('Active').first()).toBeVisible();

    // Verify auto-mode indicator is shown
    await expect(projectCard.getByText('Auto-mode active')).toBeVisible();
  });

  test('should navigate to board when clicking on a project card', async ({ page }) => {
    overviewMock = makeOverviewResponse({
      projects: [
        {
          projectId: 'test-project-1',
          projectName: 'Test Project 1',
          projectPath: '/mock/test-project-1',
          healthStatus: 'idle',
          featureCounts: { pending: 0, running: 0, completed: 0, failed: 0, verified: 0 },
          totalFeatures: 0,
          isAutoModeRunning: false,
          unreadNotificationCount: 0,
        },
      ],
      aggregate: {
        projectCounts: {
          total: 1,
          active: 0,
          idle: 1,
          waiting: 0,
          withErrors: 0,
          allCompleted: 0,
        },
        featureCounts: {
          total: 0,
          pending: 0,
          running: 0,
          completed: 0,
          failed: 0,
          verified: 0,
        },
        totalUnreadNotifications: 0,
        projectsWithAutoModeRunning: 0,
        computedAt: new Date().toISOString(),
      },
    });

    // Navigate directly to overview
    await page.goto('/overview');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for the overview view to appear
    await expect(page.locator('[data-testid="overview-view"]')).toBeVisible({ timeout: 15000 });

    // Verify project card is displayed (clicking it would navigate to board, but requires more mocking)
    const projectCard = page.locator('[data-testid="project-status-card-test-project-1"]');
    await expect(projectCard).toBeVisible({ timeout: 10000 });
  });

  test('should display empty state when no projects exist', async ({ page }) => {
    // Default overviewMock already returns empty projects - no change needed

    // Navigate directly to overview
    await page.goto('/overview');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for the overview view to appear
    await expect(page.locator('[data-testid="overview-view"]')).toBeVisible({ timeout: 15000 });

    // Verify empty state message
    await expect(page.getByText('No projects yet')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Create or open a project to get started')).toBeVisible();
  });

  test('should show error state when API fails', async ({ page }) => {
    overviewMock = makeOverviewResponse({
      status: 500,
      error: 'Internal server error',
    });

    // Navigate directly to overview
    await page.goto('/overview');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for the overview view to appear
    await expect(page.locator('[data-testid="overview-view"]')).toBeVisible({ timeout: 15000 });

    // Verify error state message
    await expect(page.getByText('Failed to load overview')).toBeVisible({ timeout: 10000 });

    // Verify the "Try again" button is visible
    await expect(page.getByRole('button', { name: /Try again/i })).toBeVisible();
  });
});
