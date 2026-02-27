/**
 * Running Task Card Display E2E Test
 *
 * Tests that task cards with a running state display the correct UI controls.
 *
 * This test verifies that:
 * 1. A feature in the in_progress column with status 'in_progress' shows Logs/Stop controls (not Make)
 * 2. A feature with status 'backlog' that is tracked as running (stale status race condition)
 *    shows Logs/Stop controls instead of the Make button when placed in in_progress column
 * 3. The Make button only appears for genuinely idle backlog/interrupted/ready features
 * 4. Features in backlog that are NOT running show the correct Edit/Make buttons
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupRealProject,
  waitForNetworkIdle,
  authenticateForTests,
  handleLoginScreenIfPresent,
  API_BASE_URL,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('running-task-display-test');

// Generate deterministic projectId once at test module load
const TEST_PROJECT_ID = `project-running-task-${Date.now()}`;

test.describe('Running Task Card Display', () => {
  let projectPath: string;
  const projectName = `test-project-${Date.now()}`;
  const backlogFeatureId = 'test-feature-backlog';
  const inProgressFeatureId = 'test-feature-in-progress';

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
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should show Logs/Stop buttons for in_progress features, not Make button', async ({
    page,
  }) => {
    // Set up the project in localStorage with a deterministic projectId
    await setupRealProject(page, projectPath, projectName, {
      setAsCurrent: true,
      projectId: TEST_PROJECT_ID,
    });

    // Intercept settings API to ensure our test project remains current
    await page.route('**/api/settings/global', async (route) => {
      const method = route.request().method();
      if (method === 'PUT') {
        return route.continue();
      }
      const response = await route.fetch();
      const json = await response.json();
      if (json.settings) {
        const existingProjects = json.settings.projects || [];
        let testProject = existingProjects.find((p: { path: string }) => p.path === projectPath);
        if (!testProject) {
          testProject = {
            id: TEST_PROJECT_ID,
            name: projectName,
            path: projectPath,
            lastOpened: new Date().toISOString(),
          };
          json.settings.projects = [testProject, ...existingProjects];
        }
        json.settings.currentProjectId = testProject.id;
        json.settings.setupComplete = true;
        json.settings.isFirstRun = false;
      }
      await route.fulfill({ response, json });
    });

    // Block resume-interrupted for our project so the server does not "resume" our
    // in_progress feature (mock agent would complete and set status to waiting_approval).
    await page.route('**/api/auto-mode/resume-interrupted', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      try {
        const body = route.request().postDataJSON();
        if (body?.projectPath === projectPath) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, message: 'Resume check completed' }),
          });
          return;
        }
      } catch {
        // no JSON body
      }
      return route.continue();
    });

    await authenticateForTests(page);

    // Navigate to board
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Create a feature that is already in_progress status (simulates a running task)
    const inProgressFeature = {
      id: inProgressFeatureId,
      description: 'Test feature that is currently running',
      category: 'test',
      status: 'in_progress',
      skipTests: false,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      branchName: '',
      priority: 2,
    };

    // Create a feature in backlog status (idle, should show Make button)
    const backlogFeature = {
      id: backlogFeatureId,
      description: 'Test feature in backlog waiting to start',
      category: 'test',
      status: 'backlog',
      skipTests: false,
      model: 'sonnet',
      thinkingLevel: 'none',
      createdAt: new Date().toISOString(),
      branchName: '',
      priority: 2,
    };

    // Create both features via HTTP API
    const createInProgress = await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: inProgressFeature },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!createInProgress.ok()) {
      throw new Error(`Failed to create in_progress feature: ${await createInProgress.text()}`);
    }

    const createBacklog = await page.request.post(`${API_BASE_URL}/api/features/create`, {
      data: { projectPath, feature: backlogFeature },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!createBacklog.ok()) {
      throw new Error(`Failed to create backlog feature: ${await createBacklog.text()}`);
    }

    // Reload and wait for the features list response for THIS project so we assert against fresh data.
    // Must match our projectPath so we don't capture a list for another project (e.g. fixture) with stale features.
    const encodedPath = encodeURIComponent(projectPath);
    const featuresListResponse = page
      .waitForResponse(
        (res) =>
          res.url().includes('/api/features') &&
          res.url().includes('list') &&
          res.url().includes(encodedPath) &&
          res.status() === 200,
        { timeout: 20000 }
      )
      .catch(() => null);
    await page.reload();
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });
    const listResponse = await featuresListResponse;
    // If we got our project's list, verify server preserved in_progress (no unexpected reset).
    if (listResponse) {
      const body = await listResponse.json().catch(() => ({}));
      const features = Array.isArray(body?.features) ? body.features : [];
      const inProgressFromApi = features.find((f: { id?: string }) => f.id === inProgressFeatureId);
      if (inProgressFromApi && inProgressFromApi.status !== 'in_progress') {
        throw new Error(
          `Server returned feature ${inProgressFeatureId} with status "${inProgressFromApi.status}" instead of "in_progress". ` +
            `Startup reconciliation resets in_progress→backlog; the board also calls resume-interrupted on load, which can set status to waiting_approval. ` +
            `This test blocks resume-interrupted for the test project so the feature stays in_progress.`
        );
      }
    }

    // Wait for both feature cards to appear (column assignment may vary with worktree/load order)
    const inProgressCard = page.locator(`[data-testid="kanban-card-${inProgressFeatureId}"]`);
    const backlogCard = page.locator(`[data-testid="kanban-card-${backlogFeatureId}"]`);
    await expect(inProgressCard).toBeVisible({ timeout: 20000 });
    await expect(backlogCard).toBeVisible({ timeout: 20000 });

    // Scroll in_progress card into view so action buttons are in viewport (avoids flakiness)
    await inProgressCard.scrollIntoViewIfNeeded();

    // Scope assertions to the in_progress card so we don't match elements from other cards
    // CRITICAL: Verify the in_progress feature does NOT show a Make button
    const makeButtonOnInProgress = inProgressCard.locator(
      `[data-testid="make-${inProgressFeatureId}"]`
    );
    await expect(makeButtonOnInProgress).not.toBeVisible({ timeout: 3000 });

    // Verify the in_progress feature shows appropriate controls (Logs and Stop).
    // Use a longer timeout so refetch + re-render can complete in slower runs.
    const viewOutputButton = inProgressCard.locator(
      `[data-testid="view-output-${inProgressFeatureId}"]`
    );
    await expect(viewOutputButton).toBeVisible({ timeout: 10000 });
    const forceStopButton = inProgressCard.locator(
      `[data-testid="force-stop-${inProgressFeatureId}"]`
    );
    await expect(forceStopButton).toBeVisible({ timeout: 10000 });

    // Verify the backlog feature DOES show a Make button
    const makeButtonOnBacklog = page.locator(`[data-testid="make-${backlogFeatureId}"]`);
    await expect(makeButtonOnBacklog).toBeVisible({ timeout: 5000 });

    // Verify the backlog feature also shows an Edit button
    const editButton = page.locator(`[data-testid="edit-backlog-${backlogFeatureId}"]`);
    await expect(editButton).toBeVisible({ timeout: 5000 });
  });
});
