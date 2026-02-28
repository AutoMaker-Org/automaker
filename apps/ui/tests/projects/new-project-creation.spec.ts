/**
 * Project Creation E2E Test
 *
 * Happy path: Create a new blank project from welcome view
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import {
  createTempDirPath,
  cleanupTempDir,
  setupWelcomeView,
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('project-creation-test');

test.describe('Project Creation', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should create a new blank project from welcome view', async ({ page }) => {
    const projectName = `test-project-${Date.now()}`;

    await setupWelcomeView(page, { workspaceDir: TEST_TEMP_DIR });

    // Intercept settings API BEFORE authenticateForTests (which navigates to the page).
    // Force empty project list on ALL GETs until we click "Create Project", so that
    // background refetches from TanStack Query don't race and flip hasProjects=true
    // (which would replace the empty-state card with the project-list header).
    // Once projectCreated=true, subsequent GETs pass through so the store picks up
    // the newly created project and navigates to the board.
    let projectCreated = false;
    await page.route('**/api/settings/global', async (route) => {
      const method = route.request().method();
      if (method === 'PUT') {
        return route.continue();
      }
      const response = await route.fetch();
      const json = await response.json();
      if (!projectCreated && json.settings) {
        json.settings.currentProjectId = null;
        json.settings.projects = [];
        json.settings.setupComplete = true;
        json.settings.isFirstRun = false;
        json.settings.lastProjectDir = TEST_TEMP_DIR;
        await route.fulfill({ response, json });
      } else {
        await route.fulfill({ response, json });
      }
    });

    // Mock workspace config API to return a valid default directory.
    // In CI, ALLOWED_ROOT_DIRECTORY is unset and Documents path is unavailable,
    // so without this mock, getDefaultWorkspaceDirectory() returns null and the
    // "Will be created at:" text never renders in the new project modal.
    await page.route('**/api/workspace/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          configured: false,
          defaultDir: TEST_TEMP_DIR,
        }),
      });
    });

    // Mock init-git to avoid hangs in CI. Git init + commit can block when user.name/email
    // are unset or git prompts for input. The test still exercises mkdir, initializeProject
    // structure, writeFile, and store updates—we only bypass the actual git process.
    await page.route('**/api/worktree/init-git', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            result: { initialized: true, message: 'Git repository initialized (mocked)' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock filesystem APIs so project creation completes deterministically without
    // depending on server filesystem. The real server may hang or fail in CI when
    // ALLOWED_ROOT_DIRECTORY is unset or paths differ between test and server process.
    const fsJson = (status: number, body: object) => ({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    const workspaceDir = TEST_TEMP_DIR.replace(/\/$/, '');
    await page.route('**/api/fs/exists', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON?.() ?? {};
        const filePath = (body?.filePath as string | undefined) ?? '';
        const normalized = filePath.replace(/\/$/, '');
        const isWorkspace = normalized === workspaceDir;
        const isProjectDir =
          normalized.startsWith(workspaceDir + '/') &&
          normalized.slice(workspaceDir.length + 1).indexOf('/') === -1;
        const exists = isWorkspace || isProjectDir;
        await route.fulfill(fsJson(200, { success: true, exists }));
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/fs/stat', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill(
          fsJson(200, { success: true, stats: { isDirectory: true, isFile: false } })
        );
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/fs/mkdir', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill(fsJson(200, { success: true }));
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/fs/write', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill(fsJson(200, { success: true }));
      } else {
        await route.continue();
      }
    });

    await authenticateForTests(page);

    // Navigate directly to dashboard to avoid auto-open logic
    await page.goto('/dashboard');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for dashboard view
    await expect(page.locator('[data-testid="dashboard-view"]')).toBeVisible({ timeout: 15000 });

    await page.locator('[data-testid="create-new-project"]').click();
    await page.locator('[data-testid="quick-setup-option-no-projects"]').click();

    await expect(page.locator('[data-testid="new-project-modal"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="project-name-input"]').fill(projectName);
    await expect(page.getByText('Will be created at:')).toBeVisible({ timeout: 5000 });

    // Allow subsequent settings GETs to pass through so the store picks up the new project
    projectCreated = true;
    await page.locator('[data-testid="confirm-create-project"]').click();

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });

    // Expand sidebar if collapsed to see project name
    const expandSidebarButton = page.locator('button:has-text("Expand sidebar")');
    if (await expandSidebarButton.isVisible()) {
      await expandSidebarButton.click();
      await page
        .locator('button:has-text("Collapse sidebar")')
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => {});
    }

    // Wait for project to be set as current and visible on the page
    // The project name appears in the project dropdown trigger
    await expect(
      page.locator('[data-testid="project-dropdown-trigger"]').getByText(projectName)
    ).toBeVisible({
      timeout: 15000,
    });

    // Project was created successfully if we're on board view with project name visible
    // Note: The actual project directory is created in the server's default workspace,
    // not necessarily TEST_TEMP_DIR. This is expected behavior.
  });
});
