/**
 * Feature Deep Link E2E Test
 *
 * Tests that navigating to /board?featureId=xxx opens the board and shows
 * the output modal for the specified feature.
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
  authenticateForTests,
  handleLoginScreenIfPresent,
  waitForAgentOutputModal,
  getOutputModalDescription,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('feature-deep-link-test');

test.describe('Feature Deep Link', () => {
  let projectPath: string;
  let projectName: string;

  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(async ({}, testInfo) => {
    projectName = `test-project-${testInfo.workerIndex}-${Date.now()}`;
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

  test.afterEach(async () => {
    if (projectPath && fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should open output modal when navigating to /board?featureId=xxx', async ({ page }) => {
    const featureDescription = `Deep link test feature ${Date.now()}`;

    // Setup project
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    const authOk = await authenticateForTests(page);
    expect(authOk).toBe(true);

    // Create a feature first
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="kanban-column-backlog"]')).toBeVisible({
      timeout: 5000,
    });

    // Create a feature
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
    }).toPass({ timeout: 20000 });

    // Get the feature ID from the card
    const featureCard = page
      .locator('[data-testid="kanban-column-backlog"]')
      .locator('[data-testid^="kanban-card-"]')
      .filter({ hasText: featureDescription })
      .first();
    const cardTestId = await featureCard.getAttribute('data-testid');
    const featureId = cardTestId?.replace('kanban-card-', '') || null;
    expect(featureId).toBeTruthy();

    // Close any open modals first
    const modal = page.locator('[data-testid="agent-output-modal"]');
    if (await modal.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden({ timeout: 3000 });
    }

    // Now navigate to the board with the featureId query parameter
    await page.goto(`/board?featureId=${encodeURIComponent(featureId ?? '')}`);
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // The output modal should automatically open
    await waitForAgentOutputModal(page, { timeout: 10000 });
    const modalVisible = await page.locator('[data-testid="agent-output-modal"]').isVisible();
    expect(modalVisible).toBe(true);

    // Verify the modal shows the correct feature
    const modalDescription = await getOutputModalDescription(page);
    expect(modalDescription).toContain(featureDescription);
  });

  test('should handle invalid featureId gracefully', async ({ page }) => {
    // Setup project
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    const authOk2 = await authenticateForTests(page);
    expect(authOk2).toBe(true);

    // Navigate with a non-existent feature ID
    const nonExistentId = 'non-existent-feature-id-12345';
    await page.goto(`/board?featureId=${nonExistentId}`);
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Board should still load
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Output modal should NOT appear (feature doesn't exist)
    const modal = page.locator('[data-testid="agent-output-modal"]');
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

  test('should handle navigation without featureId', async ({ page }) => {
    // Setup project
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    const authOk3 = await authenticateForTests(page);
    expect(authOk3).toBe(true);

    // Navigate without featureId
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Board should load normally
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="kanban-column-backlog"]')).toBeVisible({
      timeout: 5000,
    });

    // Output modal should NOT appear
    const modal = page.locator('[data-testid="agent-output-modal"]');
    await expect(modal).toBeHidden({ timeout: 2000 });
  });
});
