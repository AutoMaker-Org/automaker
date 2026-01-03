/**
 * Project Creation E2E Test
 *
 * Happy path: Create a new blank project from welcome view
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
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
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    await expect(page.locator('[data-testid="welcome-view"]')).toBeVisible({ timeout: 10000 });

    await page.locator('[data-testid="create-new-project"]').click();
    await page.locator('[data-testid="quick-setup-option"]').click();

    await expect(page.locator('[data-testid="new-project-modal"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="project-name-input"]').fill(projectName);
    await expect(page.getByText('Will be created at:')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="confirm-create-project"]').click();

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator('[data-testid="project-selector"]').getByText(projectName)
    ).toBeVisible({ timeout: 5000 });

    const projectPath = path.join(TEST_TEMP_DIR, projectName);
    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.existsSync(path.join(projectPath, '.automaker'))).toBe(true);
  });
});
