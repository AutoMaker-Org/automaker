/**
 * Auto Mode Usage Limit E2E Tests
 *
 * Tests the behavior when usage limits are reached:
 * - Pause dialog appears when enabling auto mode at limit
 * - Persistent indicator shows paused state
 * - Scheduled resume functionality
 * - Re-opening dialog from indicator
 * - Tasks don't bounce when paused
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  waitForNetworkIdle,
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('auto-mode-usage-limit-test');

// Mock usage data type
interface MockUsageData {
  sessionPercentage: number;
  weeklyPercentage: number;
  sessionResetTime?: string;
  weeklyResetTime?: string;
}

// Helper to mock Claude usage via localStorage/IPC
async function mockClaudeUsage(page: import('@playwright/test').Page, usage: MockUsageData) {
  // We'll need to intercept the usage check API calls
  await page.evaluate((usageData: MockUsageData) => {
    // Store mock data that our app can read
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__mockClaudeUsage = {
      sessionPercentage: usageData.sessionPercentage,
      weeklyPercentage: usageData.weeklyPercentage,
      sessionResetTime: usageData.sessionResetTime || null,
      weeklyResetTime: usageData.weeklyResetTime || null,
      sessionTokensUsed: usageData.sessionPercentage * 100,
      sessionLimit: 10000,
      weeklyTokensUsed: usageData.weeklyPercentage * 100,
      weeklyLimit: 10000,
      sonnetWeeklyTokensUsed: 0,
      sonnetWeeklyPercentage: 0,
      sonnetResetText: '',
      costUsed: null,
      costLimit: null,
      costCurrency: null,
      sessionResetText: usageData.sessionResetTime ? 'Resets soon' : '',
      weeklyResetText: usageData.weeklyResetTime ? 'Resets later' : '',
      userTimezone: 'UTC',
      lastUpdated: new Date().toISOString(),
    };
  }, usage);
}

test.describe('Auto Mode Usage Limit Feature', () => {
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

    // Create a test feature in backlog
    const featureId = 'test-feature-' + Date.now();
    fs.writeFileSync(
      path.join(automakerDir, 'features', `${featureId}.json`),
      JSON.stringify(
        {
          id: featureId,
          description: 'Test feature for usage limit testing',
          status: 'backlog',
          priority: 1,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    fs.writeFileSync(
      path.join(automakerDir, 'app_spec.txt'),
      `# ${projectName}\n\nA test project for usage limit e2e testing.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should show pause dialog when enabling auto mode at usage limit', async ({ page }) => {
    await authenticateForTests(page);

    // Navigate to the app
    await page.goto(`file://${projectPath}`);
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Mock usage at 100%
    await mockClaudeUsage(page, {
      sessionPercentage: 100,
      weeklyPercentage: 50,
      sessionResetTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });

    // Click auto mode toggle
    const autoModeToggle = page.getByTestId('auto-mode-toggle');
    await autoModeToggle.click();

    // Pause dialog should appear
    const pauseDialog = page.getByRole('dialog');
    await expect(pauseDialog).toBeVisible({ timeout: 5000 });
    await expect(pauseDialog.getByText(/usage limit/i)).toBeVisible();
  });

  test('should show persistent indicator when paused without scheduling', async ({ page }) => {
    await authenticateForTests(page);
    await page.goto(`file://${projectPath}`);
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Mock usage at 100%
    await mockClaudeUsage(page, {
      sessionPercentage: 100,
      weeklyPercentage: 50,
      sessionResetTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });

    // Click auto mode toggle
    const autoModeToggle = page.getByTestId('auto-mode-toggle');
    await autoModeToggle.click();

    // Wait for dialog
    const pauseDialog = page.getByRole('dialog');
    await expect(pauseDialog).toBeVisible({ timeout: 5000 });

    // Click "Keep Paused"
    await pauseDialog.getByRole('button', { name: /keep paused/i }).click();

    // Dialog should close
    await expect(pauseDialog).not.toBeVisible({ timeout: 3000 });

    // Persistent indicator should show in header
    const pausedIndicator = page.getByText(/paused.*at limit/i);
    await expect(pausedIndicator).toBeVisible();
  });

  test('should show scheduled resume indicator after scheduling', async ({ page }) => {
    await authenticateForTests(page);
    await page.goto(`file://${projectPath}`);
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Mock usage at 100%
    await mockClaudeUsage(page, {
      sessionPercentage: 100,
      weeklyPercentage: 50,
      sessionResetTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });

    // Click auto mode toggle
    const autoModeToggle = page.getByTestId('auto-mode-toggle');
    await autoModeToggle.click();

    // Wait for dialog
    const pauseDialog = page.getByRole('dialog');
    await expect(pauseDialog).toBeVisible({ timeout: 5000 });

    // Select 1 hour duration
    await pauseDialog.getByRole('button', { name: '1h' }).click();

    // Click "Schedule Resume"
    await pauseDialog.getByRole('button', { name: /schedule resume/i }).click();

    // Dialog should close
    await expect(pauseDialog).not.toBeVisible({ timeout: 3000 });

    // Scheduled resume indicator should show in header
    const resumeIndicator = page.getByText(/resume at/i);
    await expect(resumeIndicator).toBeVisible();
  });

  test('should cancel scheduled resume when clicking cancel button', async ({ page }) => {
    await authenticateForTests(page);
    await page.goto(`file://${projectPath}`);
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Mock usage at 100%
    await mockClaudeUsage(page, {
      sessionPercentage: 100,
      weeklyPercentage: 50,
      sessionResetTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });

    // Click auto mode toggle
    const autoModeToggle = page.getByTestId('auto-mode-toggle');
    await autoModeToggle.click();

    // Wait for dialog and schedule resume
    const pauseDialog = page.getByRole('dialog');
    await expect(pauseDialog).toBeVisible({ timeout: 5000 });
    await pauseDialog.getByRole('button', { name: '1h' }).click();
    await pauseDialog.getByRole('button', { name: /schedule resume/i }).click();

    // Find and click cancel button
    const resumeIndicator = page.getByText(/resume at/i);
    await expect(resumeIndicator).toBeVisible();

    // Find the cancel button (X) next to the resume indicator
    const cancelButton = resumeIndicator.locator('..').getByRole('button', { name: /cancel/i });
    await cancelButton.click();

    // Scheduled indicator should be gone, paused indicator should show
    await expect(resumeIndicator).not.toBeVisible({ timeout: 3000 });
    const pausedIndicator = page.getByText(/paused.*at limit/i);
    await expect(pausedIndicator).toBeVisible();
  });

  test('should re-open dialog when clicking paused indicator', async ({ page }) => {
    await authenticateForTests(page);
    await page.goto(`file://${projectPath}`);
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Mock usage at 100%
    await mockClaudeUsage(page, {
      sessionPercentage: 100,
      weeklyPercentage: 50,
      sessionResetTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });

    // Click auto mode toggle
    const autoModeToggle = page.getByTestId('auto-mode-toggle');
    await autoModeToggle.click();

    // Wait for dialog and click Keep Paused
    const pauseDialog = page.getByRole('dialog');
    await expect(pauseDialog).toBeVisible({ timeout: 5000 });
    await pauseDialog.getByRole('button', { name: /keep paused/i }).click();
    await expect(pauseDialog).not.toBeVisible({ timeout: 3000 });

    // Click the paused indicator to re-open dialog
    const pausedIndicator = page.getByText(/paused.*at limit/i);
    await pausedIndicator.click();

    // Dialog should re-open
    await expect(pauseDialog).toBeVisible({ timeout: 3000 });
  });

  test('should not allow enabling auto mode while at limit', async ({ page }) => {
    await authenticateForTests(page);
    await page.goto(`file://${projectPath}`);
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Mock usage at 100%
    await mockClaudeUsage(page, {
      sessionPercentage: 100,
      weeklyPercentage: 50,
      sessionResetTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });

    // Click auto mode toggle
    const autoModeToggle = page.getByTestId('auto-mode-toggle');
    await autoModeToggle.click();

    // Wait for dialog
    const pauseDialog = page.getByRole('dialog');
    await expect(pauseDialog).toBeVisible({ timeout: 5000 });
    await pauseDialog.getByRole('button', { name: /keep paused/i }).click();

    // Auto mode toggle should be off
    await expect(autoModeToggle).not.toBeChecked();
  });

  test('should allow normal auto mode when usage is below limit', async ({ page }) => {
    await authenticateForTests(page);
    await page.goto(`file://${projectPath}`);
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Mock usage at 50%
    await mockClaudeUsage(page, {
      sessionPercentage: 50,
      weeklyPercentage: 30,
    });

    // Click auto mode toggle
    const autoModeToggle = page.getByTestId('auto-mode-toggle');
    await autoModeToggle.click();

    // Auto mode should be enabled
    await expect(autoModeToggle).toBeChecked();

    // No pause dialog should appear
    const pauseDialog = page.getByRole('dialog');
    await expect(pauseDialog).not.toBeVisible({ timeout: 1000 });
  });
});
