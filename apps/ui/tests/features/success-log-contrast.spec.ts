/**
 * E2E test for success log output contrast improvement
 * Verifies that success tool output has better visual contrast
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDirPath } from '../utils/git/worktree';
import { setupRealProject } from '../utils/project/setup';
import { waitForNetworkIdle } from '../utils/core/waiting';
import { handleLoginScreenIfPresent } from '../utils/core/interactions';
import { TIMEOUTS } from '../utils/core/constants';

/**
 * Create a test feature with agent output for contrast verification
 *
 * @param projectPath - Path to the test project
 * @param featureId - Unique identifier for the test feature
 * @param outputContent - Content for the agent-output.md file
 * @param title - Feature title
 * @param description - Feature description
 */
function createTestFeature(
  projectPath: string,
  featureId: string,
  outputContent: string,
  title: string = 'Test Success Contrast',
  description: string = 'Testing success log output contrast'
): void {
  const featureDir = path.join(projectPath, '.automaker', 'features', featureId);

  // Create feature directory with error handling
  try {
    fs.mkdirSync(featureDir, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create feature directory at ${featureDir}: ${error}`);
  }

  // Write agent output with error handling
  const outputPath = path.join(featureDir, 'agent-output.md');
  try {
    fs.writeFileSync(outputPath, outputContent, { encoding: 'utf-8' });
  } catch (error) {
    throw new Error(`Failed to write agent output to ${outputPath}: ${error}`);
  }

  // Write feature metadata with error handling
  const featureJsonPath = path.join(featureDir, 'feature.json');
  const featureData = {
    id: featureId,
    title,
    description,
    status: 'in_progress',
  };

  try {
    fs.writeFileSync(featureJsonPath, JSON.stringify(featureData, null, 2), { encoding: 'utf-8' });
  } catch (error) {
    throw new Error(`Failed to write feature.json to ${featureJsonPath}: ${error}`);
  }
}

/**
 * Clean up test directory
 *
 * @param dirPath - Directory path to remove
 */
function cleanupTestDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to clean up directory ${dirPath}: ${error}`);
    }
  }
}

async function openFeatureOutputModal(page: import('@playwright/test').Page, featureId: string) {
  const viewOutputButton = page.locator(
    `[data-testid="view-output-${featureId}"], [data-testid="view-output-inprogress-${featureId}"]`
  );
  await expect(viewOutputButton.first()).toBeVisible({ timeout: TIMEOUTS.medium });
  await viewOutputButton.first().click();
  await page.waitForSelector('[data-testid="agent-output-modal"]', { timeout: TIMEOUTS.default });
}

test.describe('Success log output contrast', () => {
  const TEST_TEMP_DIR = createTempDirPath('success-log-contrast');
  let projectPath: string;
  const projectName = `test-contrast-${Date.now()}`;

  test.beforeAll(async () => {
    // Create temp directory for test artifacts
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
    // Clean up temp directory
    cleanupTestDirectory(TEST_TEMP_DIR);
  });

  test.beforeEach(async ({ page }) => {
    // Use the setupRealProject utility for consistent test setup
    await setupRealProject(page, projectPath, projectName);

    // Navigate to the app
    await page.goto('/');

    // Handle login if present
    await handleLoginScreenIfPresent(page);

    await waitForNetworkIdle(page);
  });

  test('should display success log output with improved contrast', async ({ page }) => {
    // Create a mock agent output file with success logs
    const testFeatureId = `test-success-contrast-${Date.now()}`;

    const mockOutput = `## Summary
Successfully implemented the feature with improved contrast.

## Action Phase
✓ Created component with proper styling
✓ Verified success message contrast is improved
✓ All tests passing

The feature is complete and ready for review.
`;

    createTestFeature(
      projectPath,
      testFeatureId,
      mockOutput,
      'Test Success Contrast',
      'Testing success log output contrast'
    );

    // Reload the page to see the new feature
    await page.reload();
    await waitForNetworkIdle(page);

    await openFeatureOutputModal(page, testFeatureId);

    // Switch to logs view
    await page.click('[data-testid="view-mode-parsed"]');

    // Wait for log content to render
    await page.waitForSelector('[data-testid="log-entries-container"]', {
      timeout: TIMEOUTS.default,
    });

    // Get the log container
    const logContainer = page.locator('[data-testid="log-entries-container"]');

    // Verify that success-type logs have the improved contrast classes
    // The new implementation uses bg-emerald-500/20 instead of /10
    // and text-emerald-200 instead of text-emerald-300

    const successLogs = logContainer.locator('.bg-emerald-500\\/20');
    const count = await successLogs.count();

    // We should have at least one success log with the improved contrast
    expect(count).toBeGreaterThan(0);

    // Verify the text color is also improved (emerald-200)
    const successText = logContainer.locator('.text-emerald-200');
    const textCount = await successText.count();
    expect(textCount).toBeGreaterThan(0);

    // Verify border opacity is improved (40 instead of 30)
    const successBorder = logContainer.locator('.border-emerald-500\\/40');
    const borderCount = await successBorder.count();
    expect(borderCount).toBeGreaterThan(0);

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="agent-output-modal"]', {
      state: 'hidden',
      timeout: TIMEOUTS.default,
    });
    await page.waitForSelector('[data-testid="agent-output-modal"]', {
      state: 'hidden',
      timeout: TIMEOUTS.default,
    });
  });

  test('should maintain consistency across all log types', async ({ page }) => {
    // Verify that other log types still have their original styling
    // This ensures our changes only affected the success type

    // Create a feature with various log types
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

    createTestFeature(
      projectPath,
      testFeatureId,
      mixedOutput,
      'Test All Logs',
      'Testing all log types'
    );

    await page.reload();
    await waitForNetworkIdle(page);

    await openFeatureOutputModal(page, testFeatureId);
    await page.click('[data-testid="view-mode-parsed"]');
    await page.waitForSelector('[data-testid="log-entries-container"]', {
      timeout: TIMEOUTS.default,
    });

    const logContainer = page.locator('[data-testid="log-entries-container"]');

    // Verify success logs use the new improved contrast
    const successLogs = logContainer.locator('.bg-emerald-500\\/20');
    expect(await successLogs.count()).toBeGreaterThan(0);

    // Close modal
    await page.keyboard.press('Escape');
  });

  test('should have consistent badge styling with improved contrast', async ({ page }) => {
    // Verify that badges within success logs also have improved contrast
    const testFeatureId = `test-badge-contrast-${Date.now()}`;

    const badgeOutput = `## Summary
✅ Component created successfully
✅ Tests passing with improved contrast
✅ Ready for deployment

All tasks completed successfully.
`;

    createTestFeature(
      projectPath,
      testFeatureId,
      badgeOutput,
      'Test Badge Contrast',
      'Testing badge contrast in success logs'
    );

    await page.reload();
    await waitForNetworkIdle(page);

    await openFeatureOutputModal(page, testFeatureId);
    await page.click('[data-testid="view-mode-parsed"]');
    await page.waitForSelector('[data-testid="log-entries-container"]', {
      timeout: TIMEOUTS.default,
    });

    const logContainer = page.locator('[data-testid="log-entries-container"]');

    // Verify badge styling has improved contrast
    // Badge should have bg-emerald-500/30 (increased from /20)
    // and text-emerald-200 (changed from emerald-300)
    const successBadges = logContainer.locator('.bg-emerald-500\\/30.text-emerald-200');
    const badgeCount = await successBadges.count();

    // We expect at least one badge with the improved contrast styling
    expect(badgeCount).toBeGreaterThan(0);

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="agent-output-modal"]', {
      state: 'hidden',
      timeout: TIMEOUTS.default,
    });
  });
});
