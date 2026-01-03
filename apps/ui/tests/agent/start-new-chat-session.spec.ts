/**
 * Start New Chat Session E2E Test
 *
 * Happy path: Start a new agent chat session
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupRealProject,
  waitForNetworkIdle,
  navigateToAgent,
  clickNewSessionButton,
  waitForNewSession,
  countSessionItems,
  authenticateForTests,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('agent-session-test');

test.describe('Agent Chat Session', () => {
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
    fs.mkdirSync(path.join(automakerDir, 'sessions'), { recursive: true });

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

  test('should start a new agent chat session', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/');
    await waitForNetworkIdle(page);

    // Navigate to agent view
    await navigateToAgent(page);

    // Verify we're on the agent view
    await expect(page.locator('[data-testid="agent-view"]')).toBeVisible({ timeout: 10000 });

    // Click new session button
    await clickNewSessionButton(page);

    // Wait for new session to appear in the list
    await waitForNewSession(page, { timeout: 10000 });

    // Verify at least one session exists
    const sessionCount = await countSessionItems(page);
    expect(sessionCount).toBeGreaterThanOrEqual(1);

    // Verify the message list is visible (indicates a session is selected)
    await expect(page.locator('[data-testid="message-list"]')).toBeVisible({ timeout: 5000 });

    // Verify the agent input is visible
    await expect(page.locator('[data-testid="agent-input"]')).toBeVisible();
  });
});
