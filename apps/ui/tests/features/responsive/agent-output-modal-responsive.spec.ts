/**
 * E2E tests for AgentOutputModal responsive behavior.
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { cleanupTempDir, createTempDirPath } from '../../utils/git/worktree';
import { handleLoginScreenIfPresent } from '../../utils/core/interactions';
import { setupRealProject } from '../../utils/project/setup';
import { waitForNetworkIdle } from '../../utils/core/waiting';

const TEST_TEMP_DIR = createTempDirPath('agent-output-modal-responsive');
let projectPath = '';
const projectName = `responsive-project-${Date.now()}`;

function createFeatureWithOutput(featureId: string, description: string): void {
  const featureDir = path.join(projectPath, '.automaker', 'features', featureId);
  fs.mkdirSync(featureDir, { recursive: true });

  fs.writeFileSync(
    path.join(featureDir, 'feature.json'),
    JSON.stringify(
      {
        id: featureId,
        title: description,
        description,
        status: 'in_progress',
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(featureDir, 'agent-output.md'),
    `## Summary\n${description}\n\n## Action Phase\nCompleted responsive modal checks.`
  );
}

async function openAgentOutputModalFromFeature(page: Page, description: string): Promise<void> {
  const featureId = `responsive-feature-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createFeatureWithOutput(featureId, description);

  await page.reload();
  await waitForNetworkIdle(page);

  const viewOutputButton = page.locator(
    `[data-testid="view-output-${featureId}"], [data-testid="view-output-inprogress-${featureId}"]`
  );
  await expect(viewOutputButton.first()).toBeVisible({ timeout: 10000 });
  await viewOutputButton.first().click();

  await expect(page.locator('[data-testid="agent-output-modal"]')).toBeVisible({ timeout: 10000 });
}

async function getModalMetrics(page: Page) {
  const modal = page.locator('[data-testid="agent-output-modal"]');
  const box = await modal.boundingBox();
  if (!box) throw new Error('Agent output modal has no bounding box');

  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Viewport size unavailable');

  return {
    width: box.width,
    height: box.height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  };
}

test.describe('AgentOutputModal Responsive Behavior', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );

    const automakerDir = path.join(projectPath, '.automaker');
    fs.mkdirSync(path.join(automakerDir, 'features'), { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'context'), { recursive: true });
    fs.writeFileSync(
      path.join(automakerDir, 'categories.json'),
      JSON.stringify({ categories: [] })
    );
    fs.writeFileSync(
      path.join(automakerDir, 'app_spec.txt'),
      `# ${projectName}\n\nResponsive modal tests.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test.beforeEach(async ({ page }) => {
    await setupRealProject(page, projectPath, projectName);
    await page.goto('/');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
  });

  test('uses near full width on mobile', async ({ page }) => {
    await openAgentOutputModalFromFeature(page, 'Mobile responsive test');

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(120);

    const { width } = await getModalMetrics(page);
    expect(width).toBeGreaterThanOrEqual(300);
    expect(width).toBeLessThanOrEqual(500);
  });

  test('uses ~60vw on small screens', async ({ page }) => {
    await openAgentOutputModalFromFeature(page, 'Small screen responsive test');

    await page.setViewportSize({ width: 640, height: 768 });
    await page.waitForTimeout(120);

    const { width, height, viewportWidth, viewportHeight } = await getModalMetrics(page);
    expect(Math.abs(width - viewportWidth * 0.6)).toBeLessThanOrEqual(52);
    expect(height).toBeLessThanOrEqual(viewportHeight * 0.8 + 24);
  });

  test('uses ~60vw on tablet screens', async ({ page }) => {
    await openAgentOutputModalFromFeature(page, 'Tablet responsive test');

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(120);

    const { width, height, viewportWidth, viewportHeight } = await getModalMetrics(page);
    expect(Math.abs(width - viewportWidth * 0.6)).toBeLessThanOrEqual(52);
    expect(height).toBeLessThanOrEqual(viewportHeight * 0.85 + 24);
  });

  test('respects 1200px max width cap on large screens', async ({ page }) => {
    await openAgentOutputModalFromFeature(page, 'Large screen cap test');

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(120);

    const { width } = await getModalMetrics(page);
    expect(width).toBeLessThanOrEqual(1212);
  });

  test('remains functional while resizing and switching views', async ({ page }) => {
    await openAgentOutputModalFromFeature(page, 'Functionality test');

    const modal = page.locator('[data-testid="agent-output-modal"]');
    await expect(modal).toBeVisible();

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(120);
    await expect(modal).toBeVisible();

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(120);
    await expect(modal).toBeVisible();

    await expect(page.getByTestId('view-mode-parsed')).toBeVisible();
    await expect(page.getByTestId('view-mode-raw')).toBeVisible();
    await expect(page.getByTestId('view-mode-changes')).toBeVisible();

    await page.getByTestId('view-mode-raw').click();
    await expect(modal).toContainText('Agent Output');
  });
});
