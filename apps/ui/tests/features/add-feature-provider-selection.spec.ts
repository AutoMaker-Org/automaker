/**
 * Provider Selection E2E Test
 *
 * Tests for provider dropdown and model selection in Add Feature dialog
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
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('provider-selection-test');

test.describe('Provider Selection in Add Feature Dialog', () => {
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
      `# ${projectName}\n\nA test project for provider selection testing.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should display provider dropdown with available providers', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/board');
    await waitForNetworkIdle(page);

    await clickAddFeature(page);

    await page.click('[data-testid="tab-model"]');

    const providerSelect = page.locator('[data-testid="provider-select"]');
    await expect(providerSelect).toBeVisible();

    await providerSelect.click();
    await page.waitForTimeout(300);

    const claudeOption = page.getByRole('option', { name: /Claude \(SDK\)/ });
    await expect(claudeOption).toBeVisible();
  });

  test('should select Claude provider and show Claude models', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/board');
    await waitForNetworkIdle(page);

    await clickAddFeature(page);

    await page.click('[data-testid="tab-model"]');

    await page.locator('[data-testid="provider-select"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /Claude \(SDK\)/ }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="model-select-opus"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-select-sonnet"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-select-haiku"]')).toBeVisible();

    await expect(
      page.locator('[data-testid="model-select-cursor-opus-thinking"]')
    ).not.toBeVisible();
  });

  test('should switch from Claude to Cursor provider', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/board');
    await waitForNetworkIdle(page);

    await clickAddFeature(page);

    await page.click('[data-testid="tab-model"]');

    await page.locator('[data-testid="provider-select"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /Claude \(SDK\)/ }).click();
    await page.waitForTimeout(300);
    await page.click('[data-testid="model-select-opus"]');

    await page.locator('[data-testid="provider-select"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /Cursor CLI/ }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="model-select-cursor-sonnet"]')).toBeVisible();

    await expect(page.locator('[data-testid="model-select-opus"]')).not.toBeVisible();
  });

  test('should remember model selection per provider', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/board');
    await waitForNetworkIdle(page);

    await clickAddFeature(page);

    await page.click('[data-testid="tab-model"]');

    await page.locator('[data-testid="provider-select"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /Claude \(SDK\)/ }).click();
    await page.waitForTimeout(300);
    await page.click('[data-testid="model-select-opus"]');

    await page.locator('[data-testid="provider-select"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /Cursor CLI/ }).click();
    await page.waitForTimeout(300);
    await page.click('[data-testid="model-select-cursor-sonnet"]');

    await page.locator('[data-testid="provider-select"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /Claude \(SDK\)/ }).click();
    await page.waitForTimeout(300);

    const claudeOpusModel = page.locator('[data-testid="model-select-opus"]');
    await expect(claudeOpusModel).toHaveClass(/bg-primary/);
  });

  test('should persist provider selection when dialog is reopened', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/board');
    await waitForNetworkIdle(page);

    await clickAddFeature(page);

    await page.click('[data-testid="tab-model"]');

    await page.locator('[data-testid="provider-select"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /Cursor CLI/ }).click();
    await page.waitForTimeout(300);
    await page.click('[data-testid="model-select-cursor-sonnet"]');

    await page.keyboard.press('Escape');

    await clickAddFeature(page);

    await page.click('[data-testid="tab-model"]');

    const providerSelect = page.locator('[data-testid="provider-select"]');
    await expect(providerSelect).toContainText('Cursor CLI');
  });

  test('should show only available providers in dropdown', async ({ page }) => {
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/board');
    await waitForNetworkIdle(page);

    await clickAddFeature(page);

    await page.click('[data-testid="tab-model"]');

    await page.locator('[data-testid="provider-select"]').click();
    await page.waitForTimeout(300);

    const claudeOption = page.getByRole('option', { name: /Claude \(SDK\)/ });
    const cursorOption = page.getByRole('option', { name: /Cursor CLI/ });

    await expect(claudeOption).toBeVisible();
    await expect(cursorOption).toBeVisible();
  });
});
