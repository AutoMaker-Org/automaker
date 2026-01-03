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

    fs.writeFileSync(path.join(featureDir, 'feature.json'), JSON.stringify(feature, null, 2));
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should manually verify a feature in waiting_approval column', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Verify the feature appears in the waiting_approval column
    const waitingApprovalColumn = await getKanbanColumn(page, 'waiting_approval');
    await expect(waitingApprovalColumn).toBeVisible({ timeout: 5000 });

    const featureCard = page.locator(`[data-testid="kanban-card-${featureId}"]`);
    await expect(featureCard).toBeVisible({ timeout: 10000 });

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
