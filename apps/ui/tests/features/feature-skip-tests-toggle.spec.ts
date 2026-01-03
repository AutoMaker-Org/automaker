/**
 * Feature Skip Tests Toggle E2E Test
 *
 * Happy path: Create a feature with default settings (skipTests=true) and verify the badge appears
 *
 * Note: The app defaults to skipTests=true (manual verification required), so we don't need to
 * toggle anything. We just verify the badge appears by default.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupRealProject,
  waitForNetworkIdle,
  clickAddFeature,
  fillAddFeatureDialog,
  confirmAddFeature,
  isSkipTestsBadgeVisible,
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('skip-tests-toggle-test');

test.describe('Feature Skip Tests Badge', () => {
  let projectPath: string;
  const projectName = `test-project-${Date.now()}`;

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

  test('should show skip tests badge for new feature with default settings', async ({ page }) => {
    const featureDescription = `Skip tests feature ${Date.now()}`;

    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="kanban-column-backlog"]')).toBeVisible({
      timeout: 5000,
    });

    // Open the add feature dialog and add feature with default settings
    // Default is skipTests=true (manual verification required)
    await clickAddFeature(page);
    await fillAddFeatureDialog(page, featureDescription);
    await confirmAddFeature(page);

    // Wait for the feature to appear in the backlog
    await expect(async () => {
      const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
      const featureCard = backlogColumn.locator('[data-testid^="kanban-card-"]').filter({
        hasText: featureDescription,
      });
      expect(await featureCard.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });

    // Get the feature ID from the card
    const featureCard = page
      .locator('[data-testid="kanban-column-backlog"]')
      .locator('[data-testid^="kanban-card-"]')
      .filter({ hasText: featureDescription })
      .first();
    const cardTestId = await featureCard.getAttribute('data-testid');
    const featureId = cardTestId?.replace('kanban-card-', '');

    // Verify the skip tests badge is visible on the card (should be there by default)
    expect(featureId).toBeDefined();
    await expect(async () => {
      const badgeVisible = await isSkipTestsBadgeVisible(page, featureId!);
      expect(badgeVisible).toBe(true);
    }).toPass({ timeout: 5000 });
  });
});
