/**
 * Agent Model Selection E2E Test
 *
 * Tests for model selector dropdown in Agent view
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
  clickModelSelector,
  selectAgentModel,
  getSelectedModelLabel,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('agent-model-test');

test.describe('Agent Model Selection', () => {
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
      `# ${projectName}\n\nA test project for model selection testing.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should display model selector', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToAgent(page);

    // Verify model selector is visible
    const modelSelector = page.locator('[data-testid="model-selector"]');
    await expect(modelSelector).toBeVisible();
  });

  test('should show all models in dropdown', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToAgent(page);

    // Open model selector dropdown
    await clickModelSelector(page);

    // Verify Claude models are visible
    await expect(page.locator('[data-testid="model-option-haiku"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-option-sonnet"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-option-opus"]')).toBeVisible();

    // Verify Cursor models are visible
    await expect(page.locator('[data-testid="model-option-cursor-opus-thinking"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-option-cursor-sonnet"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-option-cursor-gpt5"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-option-cursor-composer"]')).toBeVisible();
  });

  test('should select a Cursor model', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToAgent(page);

    // Select Cursor Sonnet model
    await selectAgentModel(page, 'cursor-sonnet');

    // Verify selection is reflected in the button
    const selectedLabel = await getSelectedModelLabel(page);
    expect(selectedLabel).toContain('Sonnet');
  });

  test('should show provider badge for each model', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToAgent(page);

    // Open model selector dropdown
    await clickModelSelector(page);

    // Check that Claude models show 'claude' provider
    const claudeSonnetOption = page.locator('[data-testid="model-option-sonnet"]');
    await expect(claudeSonnetOption).toContainText('claude');

    // Check that Cursor models show 'cursor' provider
    const cursorSonnetOption = page.locator('[data-testid="model-option-cursor-sonnet"]');
    await expect(cursorSonnetOption).toContainText('cursor');
  });

  test('should switch between Claude and Cursor models', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToAgent(page);

    // Default should be Sonnet (Claude)
    let selectedLabel = await getSelectedModelLabel(page);
    expect(selectedLabel).toContain('Sonnet');

    // Switch to Cursor GPT-5
    await selectAgentModel(page, 'cursor-gpt5');
    selectedLabel = await getSelectedModelLabel(page);
    expect(selectedLabel).toContain('GPT-5');

    // Switch back to Claude Opus
    await selectAgentModel(page, 'opus');
    selectedLabel = await getSelectedModelLabel(page);
    expect(selectedLabel).toContain('Opus');
  });
});
