/**
 * List View Priority Column E2E Test
 *
 * Verifies that the list view shows a priority column and allows sorting by priority
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
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('list-view-priority-test');

// TODO: This test is skipped because setupRealProject only sets localStorage,
// but the server's settings.json (set by setup-e2e-fixtures.mjs) takes precedence
// with localStorageMigrated: true. The test creates features in a temp directory,
// but the server loads from the E2E Test Project fixture path.
// Fix: Either modify setupRealProject to also update server settings, or
// have the test add features through the UI instead of on disk.
test.describe.skip('List View Priority Column', () => {
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
    const featuresDir = path.join(automakerDir, 'features');
    fs.mkdirSync(featuresDir, { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'context'), { recursive: true });

    // Create test features with different priorities
    const features = [
      {
        id: 'feature-high-priority',
        description: 'High priority feature',
        priority: 1,
        status: 'backlog',
        category: 'test',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'feature-medium-priority',
        description: 'Medium priority feature',
        priority: 2,
        status: 'backlog',
        category: 'test',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'feature-low-priority',
        description: 'Low priority feature',
        priority: 3,
        status: 'backlog',
        category: 'test',
        createdAt: new Date().toISOString(),
      },
    ];

    // Write each feature to its own directory
    for (const feature of features) {
      const featureDir = path.join(featuresDir, feature.id);
      fs.mkdirSync(featureDir, { recursive: true });
      fs.writeFileSync(path.join(featureDir, 'feature.json'), JSON.stringify(feature, null, 2));
    }

    fs.writeFileSync(
      path.join(automakerDir, 'categories.json'),
      JSON.stringify({ categories: ['test'] }, null, 2)
    );

    fs.writeFileSync(
      path.join(automakerDir, 'app_spec.txt'),
      `# ${projectName}\n\nA test project for e2e testing.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should display priority column in list view and allow sorting', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    // Authenticate before navigating
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Switch to list view
    await page.click('[data-testid="view-toggle-list"]');
    await page.waitForTimeout(500);

    // Verify list view is active
    await expect(page.locator('[data-testid="list-view"]')).toBeVisible({ timeout: 5000 });

    // Verify priority column header exists
    await expect(page.locator('[data-testid="list-header-priority"]')).toBeVisible();
    await expect(page.locator('[data-testid="list-header-priority"]')).toContainText('Priority');

    // Verify priority cells are displayed for our test features
    await expect(
      page.locator('[data-testid="list-row-priority-feature-high-priority"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="list-row-priority-feature-medium-priority"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="list-row-priority-feature-low-priority"]')
    ).toBeVisible();

    // Verify priority badges show H, M, L
    const highPriorityCell = page.locator(
      '[data-testid="list-row-priority-feature-high-priority"]'
    );
    const mediumPriorityCell = page.locator(
      '[data-testid="list-row-priority-feature-medium-priority"]'
    );
    const lowPriorityCell = page.locator('[data-testid="list-row-priority-feature-low-priority"]');

    await expect(highPriorityCell).toContainText('H');
    await expect(mediumPriorityCell).toContainText('M');
    await expect(lowPriorityCell).toContainText('L');

    // Click on priority header to sort
    await page.click('[data-testid="list-header-priority"]');
    await page.waitForTimeout(300);

    // Get all rows within the backlog group and verify they are sorted by priority
    // (High priority first when sorted ascending by priority value 1, 2, 3)
    const backlogGroup = page.locator('[data-testid="list-group-backlog"]');
    const rows = backlogGroup.locator('[data-testid^="list-row-feature-"]');

    // The first row should be high priority (value 1 = lowest number = first in ascending)
    const firstRow = rows.first();
    await expect(firstRow).toHaveAttribute('data-testid', 'list-row-feature-high-priority');

    // Click again to reverse sort (descending - low priority first)
    await page.click('[data-testid="list-header-priority"]');
    await page.waitForTimeout(300);

    // Now the first row should be low priority (value 3 = highest number = first in descending)
    const firstRowDesc = rows.first();
    await expect(firstRowDesc).toHaveAttribute('data-testid', 'list-row-feature-low-priority');
  });
});
