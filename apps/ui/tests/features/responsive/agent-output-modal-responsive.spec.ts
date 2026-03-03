/**
 * E2E tests for AgentOutputModal responsive behavior
 * These tests verify the modal width changes across different screen sizes
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
} from '../../utils';

const TEST_TEMP_DIR = createTempDirPath('responsive-modal-test');

/**
 * Create a verified feature with agent output on disk so the Logs button appears
 */
function createVerifiedFeature(projectPath: string, featureId: string, description: string): void {
  const featureDir = path.join(projectPath, '.automaker', 'features', featureId);
  fs.mkdirSync(featureDir, { recursive: true });

  fs.writeFileSync(
    path.join(featureDir, 'agent-output.md'),
    `## Summary\nFeature implemented successfully.\n\n## Details\n${description}`,
    { encoding: 'utf-8' }
  );

  fs.writeFileSync(
    path.join(featureDir, 'feature.json'),
    JSON.stringify(
      {
        id: featureId,
        title: description,
        category: 'default',
        description,
        status: 'verified',
      },
      null,
      2
    ),
    { encoding: 'utf-8' }
  );
}

test.describe('AgentOutputModal Responsive Behavior', () => {
  let projectPath: string;
  const projectName = `test-responsive-${Date.now()}`;

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
    fs.mkdirSync(path.join(automakerDir, 'features'), { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'context'), { recursive: true });

    fs.writeFileSync(
      path.join(automakerDir, 'categories.json'),
      JSON.stringify({ categories: [] }, null, 2)
    );

    fs.writeFileSync(
      path.join(automakerDir, 'app_spec.txt'),
      `# ${projectName}\n\nA test project for responsive modal testing.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  /**
   * Helper: set up project, create a verified feature on disk, navigate to board,
   * and open the agent output modal via the Logs button.
   */
  async function setupAndOpenModal(page: import('@playwright/test').Page): Promise<string> {
    const featureId = `responsive-feat-${Date.now()}`;
    createVerifiedFeature(projectPath, featureId, 'Responsive test feature');

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

    // Click the Logs button on the verified feature card to open the output modal
    const logsButton = page.locator(`[data-testid="view-output-verified-${featureId}"]`);
    await expect(logsButton).toBeVisible({ timeout: 5000 });
    await logsButton.click();

    // Wait for modal
    await expect(page.locator('[data-testid="agent-output-modal"]')).toBeVisible({
      timeout: 10000,
    });

    return featureId;
  }

  test.describe('Mobile View (< 640px)', () => {
    test('should use full width on mobile screens', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalWidth = await modal.evaluate((el) => el.offsetWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);

      // Modal should be close to full width (within 2rem = 32px margins)
      expect(modalWidth).toBeGreaterThan(viewportWidth - 40);
    });

    test('should have proper max width constraint on mobile', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 320, height: 568 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const classList = await modal.evaluate((el) => el.className);
      expect(classList).toContain('max-w-[calc(100%-2rem)]');
    });
  });

  test.describe('Small View (640px - 768px)', () => {
    test('should use 60vw on small screens', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 640, height: 768 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalWidth = await modal.evaluate((el) => el.offsetWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);

      // At 640px (sm breakpoint), width should be ~60vw = 384px
      const expected60vw = viewportWidth * 0.6;
      expect(modalWidth).toBeLessThanOrEqual(expected60vw + 5);
      expect(modalWidth).toBeGreaterThanOrEqual(expected60vw - 5);
    });

    test('should have 80vh max height on small screens', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 640, height: 768 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const classList = await modal.evaluate((el) => el.className);
      expect(classList).toContain('sm:max-h-[80vh]');
    });
  });

  test.describe('Tablet View (>= 768px)', () => {
    test('should use 90vw on tablet screens', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalWidth = await modal.evaluate((el) => el.offsetWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);

      // At 768px (md breakpoint), width should be ~90vw = ~691px
      const expected90vw = viewportWidth * 0.9;
      expect(modalWidth).toBeLessThanOrEqual(expected90vw + 5);
      expect(modalWidth).toBeGreaterThanOrEqual(expected90vw - 5);
    });

    test('should have 1200px max width on tablet', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const classList = await modal.evaluate((el) => el.className);
      expect(classList).toContain('md:max-w-[1200px]');
    });

    test('should have 85vh max height on tablet screens', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const classList = await modal.evaluate((el) => el.className);
      expect(classList).toContain('md:max-h-[85vh]');
    });

    test('should maintain correct height on larger tablets', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 1024, height: 1366 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalHeight = await modal.evaluate((el) => el.offsetHeight);
      const viewportHeight = await page.evaluate(() => window.innerHeight);

      // Height should be <= 85vh
      const expected85vh = viewportHeight * 0.85;
      expect(modalHeight).toBeLessThanOrEqual(expected85vh + 5);
    });
  });

  test.describe('Responsive Transitions', () => {
    test('should update modal size when resizing from mobile to tablet', async ({ page }) => {
      await setupAndOpenModal(page);

      // Start with mobile size
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const mobileWidth = await modal.evaluate((el) => el.offsetWidth);
      const mobileViewport = 375;

      // Mobile: close to full width
      expect(mobileWidth).toBeGreaterThan(mobileViewport - 40);

      // Resize to tablet
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(200);

      const tabletWidth = await modal.evaluate((el) => el.offsetWidth);
      const tabletViewport = 768;

      // Tablet: should be ~90vw
      const expected90vw = tabletViewport * 0.9;
      expect(tabletWidth).toBeLessThanOrEqual(expected90vw + 5);
      expect(tabletWidth).toBeGreaterThanOrEqual(expected90vw - 5);
    });

    test('should update modal size when resizing from tablet to mobile', async ({ page }) => {
      await setupAndOpenModal(page);

      // Start with tablet size
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const tabletWidth = await modal.evaluate((el) => el.offsetWidth);
      const tabletViewport = 768;

      // Tablet: ~90vw
      expect(tabletWidth).toBeLessThanOrEqual(tabletViewport * 0.9 + 5);

      // Resize to mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(200);

      const mobileWidth = await modal.evaluate((el) => el.offsetWidth);
      const mobileViewport = 375;

      // Mobile: close to full width
      expect(mobileWidth).toBeGreaterThan(mobileViewport - 40);
    });
  });

  test.describe('Content Responsiveness', () => {
    test('should display content correctly on tablet view', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(200);

      // Modal should be visible
      const modal = page.locator('[data-testid="agent-output-modal"]');
      await expect(modal).toBeVisible();

      // Description should be visible
      const description = modal.locator('[data-testid="agent-output-description"]');
      await expect(description).toBeVisible();
    });

    test('should maintain readability on tablet with wider width', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(200);

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalWidth = await modal.evaluate((el) => el.offsetWidth);

      // At 1200px, max-width is 1200px so modal should not exceed that
      expect(modalWidth).toBeLessThanOrEqual(1200);
      expect(modalWidth).toBeGreaterThan(0);
    });
  });

  test.describe('Modal Functionality Across Screens', () => {
    test('should maintain functionality while resizing', async ({ page }) => {
      await setupAndOpenModal(page);

      // Test on mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(200);
      await expect(page.locator('[data-testid="agent-output-modal"]')).toBeVisible();

      // Test on tablet
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(200);
      await expect(page.locator('[data-testid="agent-output-modal"]')).toBeVisible();

      // Close modal and verify
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="agent-output-modal"]')).not.toBeVisible({
        timeout: 5000,
      });
    });

    test('should handle view mode buttons on tablet', async ({ page }) => {
      await setupAndOpenModal(page);

      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(200);

      // Logs button should be visible and clickable
      const logsButton = page.getByTestId('view-mode-parsed');
      await expect(logsButton).toBeVisible();

      // Raw button should be visible
      const rawButton = page.getByTestId('view-mode-raw');
      await expect(rawButton).toBeVisible();
    });
  });
});
