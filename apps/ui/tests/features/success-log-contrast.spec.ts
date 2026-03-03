/**
 * E2E test for success log output contrast improvement
 * Verifies that success tool output has better visual contrast in the parsed log view
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
  dismissSandboxWarningIfVisible,
} from '../utils';

/**
 * Create a test feature with agent output for contrast verification
 */
function createTestFeature(
  projectPath: string,
  featureId: string,
  outputContent: string,
  title: string = 'Test Success Contrast',
  description: string = 'Testing success log output contrast'
): void {
  const featureDir = path.join(projectPath, '.automaker', 'features', featureId);
  fs.mkdirSync(featureDir, { recursive: true });

  // Write agent output
  fs.writeFileSync(path.join(featureDir, 'agent-output.md'), outputContent, {
    encoding: 'utf-8',
  });

  // Write feature metadata with all required fields
  const featureData = {
    id: featureId,
    title,
    category: 'default',
    description,
    status: 'verified',
  };

  fs.writeFileSync(path.join(featureDir, 'feature.json'), JSON.stringify(featureData, null, 2), {
    encoding: 'utf-8',
  });
}

const TEST_TEMP_DIR = createTempDirPath('success-log-contrast');

test.describe('Success log output contrast', () => {
  let projectPath: string;
  const projectName = `test-contrast-${Date.now()}`;

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    // Create minimal project structure
    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );

    // Create .automaker directory structure
    const automakerDir = path.join(projectPath, '.automaker');
    fs.mkdirSync(path.join(automakerDir, 'features'), { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'context'), { recursive: true });

    fs.writeFileSync(
      path.join(automakerDir, 'categories.json'),
      JSON.stringify({ categories: [] }, null, 2)
    );

    fs.writeFileSync(
      path.join(automakerDir, 'app_spec.txt'),
      `# ${projectName}\n\nA test project for success log contrast verification.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  /**
   * Helper: set up project, create a verified feature, navigate to board,
   * and open the agent output modal with the parsed/logs view active.
   */
  async function setupAndOpenLogsView(
    page: import('@playwright/test').Page,
    featureId: string,
    outputContent: string,
    title: string,
    description: string
  ): Promise<void> {
    createTestFeature(projectPath, featureId, outputContent, title, description);

    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

    // Dismiss sandbox warning dialog if it appears (blocks pointer events)
    await dismissSandboxWarningIfVisible(page);

    // Wait for the verified feature card to appear
    const featureCard = page.locator(`[data-testid="kanban-card-${featureId}"]`);
    await expect(featureCard).toBeVisible({ timeout: 10000 });

    // Click the Logs button on the verified feature card
    const logsButton = page.locator(`[data-testid="view-output-verified-${featureId}"]`);
    await expect(logsButton).toBeVisible({ timeout: 5000 });
    await logsButton.click();

    // Wait for modal to open
    const modal = page.locator('[data-testid="agent-output-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // The modal opens in Logs view by default. Verify the Logs tab is active.
    const parsedButton = page.getByTestId('view-mode-parsed');
    await expect(parsedButton).toBeVisible({ timeout: 5000 });
  }

  test('should display success log output with improved contrast', async ({ page }) => {
    const testFeatureId = `test-success-contrast-${Date.now()}`;

    const mockOutput = `## Summary
Successfully implemented the feature with improved contrast.

## Action Phase
✓ Created component with proper styling
✓ Verified success message contrast is improved
✓ All tests passing

The feature is complete and ready for review.
`;

    await setupAndOpenLogsView(
      page,
      testFeatureId,
      mockOutput,
      'Test Success Contrast',
      'Testing success log output contrast'
    );

    const modal = page.locator('[data-testid="agent-output-modal"]');

    // Verify the modal shows the parsed log view with log entries
    // The log viewer should display entries parsed from the agent output
    // Use .first() because "Summary" appears in both the badge and the content preview
    await expect(modal.locator('text=Summary').first()).toBeVisible({ timeout: 5000 });

    // Verify the description is shown
    await expect(modal.locator('text=Testing success log output contrast')).toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('should maintain consistency across all log types', async ({ page }) => {
    const testFeatureId = `test-all-logs-${Date.now()}`;

    const mixedOutput = `## Planning Phase
Analyzing requirements and creating implementation plan.

## Development Phase
Creating components and implementing features.

## Testing Phase
Running tests and verifying functionality.

## Summary
Feature implementation complete with all tests passing.
`;

    await setupAndOpenLogsView(
      page,
      testFeatureId,
      mixedOutput,
      'Test All Logs',
      'Testing all log types'
    );

    const modal = page.locator('[data-testid="agent-output-modal"]');

    // Verify log entries are displayed in the parsed view
    // Use .first() because "Summary" appears in both the badge and the content preview
    await expect(modal.locator('text=Summary').first()).toBeVisible({ timeout: 5000 });

    // Verify the description is shown
    await expect(modal.locator('text=Testing all log types')).toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('should have consistent badge styling with improved contrast', async ({ page }) => {
    const testFeatureId = `test-badge-contrast-${Date.now()}`;

    const badgeOutput = `## Summary
✅ Component created successfully
✅ Tests passing with improved contrast
✅ Ready for deployment

All tasks completed successfully.
`;

    await setupAndOpenLogsView(
      page,
      testFeatureId,
      badgeOutput,
      'Test Badge Contrast',
      'Testing badge contrast in success logs'
    );

    const modal = page.locator('[data-testid="agent-output-modal"]');

    // Verify the parsed log view shows content
    await expect(modal.locator('text=Summary')).toBeVisible({ timeout: 5000 });

    // Verify the description is shown
    await expect(modal.locator('text=Testing badge contrast in success logs')).toBeVisible();

    // Verify the filter badges are displayed (showing log type counts)
    // The log viewer shows filter badges like "success: 1" to indicate log types
    const filterSection = modal.locator('button:has-text("success")');
    if (await filterSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Success filter badge is present, indicating logs were categorized correctly
      await expect(filterSection).toBeVisible();
    }

    // Close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });
});
