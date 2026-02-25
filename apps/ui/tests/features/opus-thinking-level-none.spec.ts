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
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('opus-thinking-level-none');

test.describe('Opus thinking level', () => {
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
      `# ${projectName}\n\nA test project for Opus thinking level e2e coverage.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('persists thinkingLevel none when selected for Claude Opus', async ({ page }) => {
    const featureDescription = `Opus none thinking ${Date.now()}`;

    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await clickAddFeature(page);
    await fillAddFeatureDialog(page, featureDescription);

    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[cmdk-input]').fill('opus');

    const opusItem = page.locator('[cmdk-item]').filter({ hasText: 'Claude Opus' }).first();
    await expect(opusItem).toBeVisible({ timeout: 10000 });
    await opusItem.locator('button[title="Adjust thinking level"]').click();

    // Wait for the thinking level popover to appear
    // The nested popover contains "Thinking Level" text and "None" option
    // Radix UI popovers need a brief delay for the animation to complete
    const POPOVER_OPEN_DELAY_MS = 500;
    await page.waitForTimeout(POPOVER_OPEN_DELAY_MS);

    // Find and click the None button
    // The button's accessible name includes description: "None No extended thinking"
    const noneOption = page.getByRole('button', { name: /None.*No extended thinking/i }).first();
    await expect(noneOption).toBeVisible({ timeout: 5000 });
    await noneOption.click();

    // Wait for the popover to close and the state to update
    // The React state update needs a brief moment to propagate to the badge
    const STATE_UPDATE_DELAY_MS = 300;
    await page.waitForTimeout(STATE_UPDATE_DELAY_MS);

    // When "None" is selected, the badge should NOT show "Adaptive"
    await expect(page.locator('[data-testid="model-selector"]')).not.toContainText('Adaptive');

    await confirmAddFeature(page);

    const featuresDir = path.join(projectPath, '.automaker', 'features');
    await expect.poll(() => fs.readdirSync(featuresDir).length).toBe(1);

    const featureDir = fs.readdirSync(featuresDir)[0];
    const featureJsonPath = path.join(featuresDir, featureDir, 'feature.json');
    const featureJson = JSON.parse(fs.readFileSync(featureJsonPath, 'utf-8')) as {
      description: string;
      thinkingLevel: string;
    };

    expect(featureJson.description).toBe(featureDescription);
    expect(featureJson.thinkingLevel).toBe('none');
  });
});
