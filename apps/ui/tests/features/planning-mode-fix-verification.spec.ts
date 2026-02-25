/**
 * Planning Mode Fix Verification E2E Test
 *
 * Verifies GitHub issue #671 fixes:
 * 1. Planning mode selector is enabled for all models (not restricted to Claude)
 * 2. All planning mode options are accessible
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
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';
import { DEFAULT_ELEMENT_TIMEOUT_MS } from '../utils/core/waiting';

const TEST_TEMP_DIR = createTempDirPath('planning-mode-verification-test');

test.describe('Planning Mode Fix Verification (GitHub #671)', () => {
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
      `# ${projectName}\n\nA test project for planning mode verification.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('planning mode selector should be enabled and accessible in add feature dialog', async ({
    page,
  }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({
      timeout: DEFAULT_ELEMENT_TIMEOUT_MS,
    });
    await expect(page.locator('[data-testid="kanban-column-backlog"]')).toBeVisible({
      timeout: 5000,
    });

    // Open the add feature dialog
    await clickAddFeature(page);

    // Wait for dialog to be visible (clickAddFeature already waits, but this adds an extra check)
    await expect(page.locator('[data-testid="add-feature-dialog"]')).toBeVisible({
      timeout: DEFAULT_ELEMENT_TIMEOUT_MS,
    });

    // Find the planning mode select trigger
    const planningModeSelectTrigger = page.locator(
      '[data-testid="add-feature-planning-select-trigger"]'
    );

    // Verify the planning mode selector is visible
    await expect(planningModeSelectTrigger).toBeVisible({ timeout: 5000 });

    // Verify the planning mode selector is NOT disabled
    // This is the key check for GitHub #671 - planning mode should be enabled for all models
    await expect(planningModeSelectTrigger).not.toBeDisabled();

    // Click the trigger to open the dropdown
    await planningModeSelectTrigger.click();

    // Wait for dropdown to open
    await page.waitForTimeout(300);

    // Verify all planning mode options are visible
    const skipOption = page.locator('[data-testid="add-feature-planning-option-skip"]');
    const liteOption = page.locator('[data-testid="add-feature-planning-option-lite"]');
    const specOption = page.locator('[data-testid="add-feature-planning-option-spec"]');
    const fullOption = page.locator('[data-testid="add-feature-planning-option-full"]');

    await expect(skipOption).toBeVisible({ timeout: 3000 });
    await expect(liteOption).toBeVisible({ timeout: 3000 });
    await expect(specOption).toBeVisible({ timeout: 3000 });
    await expect(fullOption).toBeVisible({ timeout: 3000 });

    // Select 'spec' mode to verify interaction works
    await specOption.click();
    await page.waitForTimeout(200);

    // Verify the selection changed (the trigger should now show "Spec")
    await expect(planningModeSelectTrigger).toContainText('Spec');

    // Check that require approval checkbox appears for spec/full modes
    const requireApprovalCheckbox = page.locator(
      '[data-testid="add-feature-planning-require-approval-checkbox"]'
    );
    await expect(requireApprovalCheckbox).toBeVisible({ timeout: 3000 });
    await expect(requireApprovalCheckbox).not.toBeDisabled();

    // Close the dialog
    await page.keyboard.press('Escape');
  });
});
