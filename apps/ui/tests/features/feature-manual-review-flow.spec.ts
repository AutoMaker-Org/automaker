/**
 * Feature Manual Review Flow E2E Test
 *
 * Happy path: Manually verify a feature in the waiting_approval column
 *
 * This test verifies that:
 * 1. A feature in waiting_approval column shows the mark as verified button
 * 2. Clicking mark as verified moves the feature to the verified column
 *
 * Note: For waiting_approval features, the button is "mark-as-verified-{id}" not "manual-verify-{id}"
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupRealProject,
  waitForNetworkIdle,
  getKanbanColumn,
  authenticateForTests,
  handleLoginScreenIfPresent,
  sanitizeForTestId,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('manual-review-test');

test.describe('Feature Manual Review Flow', () => {
  let projectPath: string;
  const projectName = `test-project-${Date.now()}`;
  const featureId = 'test-feature-manual-review';

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );

    const automakerDir = path.join(projectPath, '.automaker');
    fs.mkdirSync(automakerDir, { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'features'), { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'context'), { recursive: true });

    fs.writeFileSync(
      path.join(automakerDir, 'categories.json'),
      JSON.stringify({ categories: [] }, null, 2)
    );

    fs.writeFileSync(
      path.join(automakerDir, 'app_spec.txt'),
      `# ${projectName}\n\nA test project for e2e testing.`
    );

    // Create a feature file that is in waiting_approval status
    const featureDir = path.join(automakerDir, 'features', featureId);
    fs.mkdirSync(featureDir, { recursive: true });

    const feature = {
      id: featureId,
      description: 'Test feature for manual review flow',
      category: 'test',
      status: 'waiting_approval',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 2,
    };

    // Note: Feature is created via HTTP API in the test itself, not in beforeAll
    // This ensures the feature exists when the board view loads it
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should manually verify a feature in waiting_approval column', async ({ page }) => {
    // Set up the project in localStorage
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    // Intercept settings API to ensure our test project remains current
    // and doesn't get overridden by server settings
    await page.route('**/api/settings/global', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (json.settings) {
        // Set our test project as the current project
        const testProject = {
          id: `project-${projectName}`,
          name: projectName,
          path: projectPath,
          lastOpened: new Date().toISOString(),
        };

        // Add to projects if not already there
        const existingProjects = json.settings.projects || [];
        const hasProject = existingProjects.some((p: any) => p.path === projectPath);
        if (!hasProject) {
          json.settings.projects = [testProject, ...existingProjects];
        }

        // Set as current project
        json.settings.currentProjectId = testProject.id;
      }
      await route.fulfill({ response, json });
    });

    await authenticateForTests(page);

    // Navigate to board
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Expand sidebar if collapsed to see project name
    const expandSidebarButton = page.locator('button:has-text("Expand sidebar")');
    if (await expandSidebarButton.isVisible()) {
      await expandSidebarButton.click();
      await page.waitForTimeout(300);
    }

    // Verify we're on the correct project (project switcher button shows project name)
    // Use ends-with selector since data-testid format is: project-switcher-{id}-{sanitizedName}
    const sanitizedProjectName = sanitizeForTestId(projectName);
    await expect(page.locator(`[data-testid$="-${sanitizedProjectName}"]`)).toBeVisible({
      timeout: 10000,
    });

    // Create the feature via HTTP API (writes to disk)
    const feature = {
      id: featureId,
      description: 'Test feature for manual review flow',
      category: 'test',
      status: 'waiting_approval',
      skipTests: true,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 2,
    };

    const API_BASE_URL = process.env.VITE_SERVER_URL || 'http://localhost:3008';
    const createResponse = await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature },
      headers: { 'Content-Type': 'application/json' },
    });

    if (!createResponse.ok()) {
      const error = await createResponse.text();
      throw new Error(`Failed to create feature: ${error}`);
    }

    // Reload to pick up the new feature
    await page.reload();
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Wait for the feature card to appear (features are loaded asynchronously)
    const featureCard = page.locator(`[data-testid="kanban-card-${featureId}"]`);
    await expect(featureCard).toBeVisible({ timeout: 20000 });

    // Verify the feature appears in the waiting_approval column
    const waitingApprovalColumn = await getKanbanColumn(page, 'waiting_approval');
    await expect(waitingApprovalColumn).toBeVisible({ timeout: 5000 });

    // Verify the card is in the waiting_approval column
    const cardInColumn = waitingApprovalColumn.locator(`[data-testid="kanban-card-${featureId}"]`);
    await expect(cardInColumn).toBeVisible({ timeout: 5000 });

    // For waiting_approval features, the button is "mark-as-verified-{id}"
    const markAsVerifiedButton = page.locator(`[data-testid="mark-as-verified-${featureId}"]`);
    await expect(markAsVerifiedButton).toBeVisible({ timeout: 5000 });

    // Click the mark as verified button
    await markAsVerifiedButton.click();

    // Wait for the feature to move to verified column
    await expect(async () => {
      const verifiedColumn = await getKanbanColumn(page, 'verified');
      const cardInVerified = verifiedColumn.locator(`[data-testid="kanban-card-${featureId}"]`);
      expect(await cardInVerified.count()).toBe(1);
    }).toPass({ timeout: 15000 });

    // Verify the feature is no longer in waiting_approval column
    await expect(async () => {
      const waitingColumn = await getKanbanColumn(page, 'waiting_approval');
      const cardInWaiting = waitingColumn.locator(`[data-testid="kanban-card-${featureId}"]`);
      expect(await cardInWaiting.count()).toBe(0);
    }).toPass({ timeout: 5000 });
  });
});
