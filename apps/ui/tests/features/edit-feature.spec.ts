/**
 * Edit Feature E2E Test
 *
 * Happy path: Edit an existing feature's description and verify changes persist
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
  fillAddFeatureDialog,
  confirmAddFeature,
  clickElement,
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('edit-feature-test');

test.describe('Edit Feature', () => {
  let projectPath: string;
  const projectName = `test-project-${Date.now()}`;

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    projectPath = path.resolve(path.join(TEST_TEMP_DIR, projectName));
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
      `# ${projectName}\n\nA test project for e2e testing.`
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should edit an existing feature description', async ({ page }) => {
    const originalDescription = `Original feature ${Date.now()}`;
    const updatedDescription = `Updated feature ${Date.now()}`;

    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });

    await authenticateForTests(page);
    await page.goto('/board');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="kanban-column-backlog"]')).toBeVisible({
      timeout: 5000,
    });

    // Create a feature first — wait for create API to complete so we know the server wrote feature.json
    const createResponsePromise = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.request().url().includes('/api/features/create') &&
        res.status() === 200,
      { timeout: 20000 }
    );

    await clickAddFeature(page);
    await fillAddFeatureDialog(page, originalDescription);
    await confirmAddFeature(page);

    // Wait for the feature to appear in the backlog (optimistic UI)
    await expect(async () => {
      const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
      const featureCard = backlogColumn.locator('[data-testid^="kanban-card-"]').filter({
        hasText: originalDescription,
      });
      expect(await featureCard.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });

    // Ensure create API completed so feature.json exists on disk
    const createResponse = await createResponsePromise;
    const createJson = (await createResponse.json()) as {
      success?: boolean;
      feature?: { id: string };
    };
    const featureId = createJson?.feature?.id;
    expect(createJson?.success).toBe(true);
    expect(featureId).toBeTruthy();

    const featureFilePath = path.join(
      projectPath,
      '.automaker',
      'features',
      featureId || '',
      'feature.json'
    );
    // Server writes file before sending 200; allow a short delay for filesystem sync
    await expect(async () => {
      expect(fs.existsSync(featureFilePath)).toBe(true);
    }).toPass({ timeout: 5000 });

    // Collapse the sidebar first to avoid it intercepting clicks
    const collapseSidebarButton = page.locator('button:has-text("Collapse sidebar")');
    if (await collapseSidebarButton.isVisible()) {
      await collapseSidebarButton.click();
      // Wait for sidebar to finish collapsing
      await page
        .locator('button:has-text("Expand sidebar")')
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => {});
    }

    // Click the edit button on the card using JavaScript click to bypass pointer interception
    const editButton = page.locator(`[data-testid="edit-backlog-${featureId}"]`);
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.evaluate((el) => (el as HTMLElement).click());

    // Wait for edit dialog to appear
    await expect(page.locator('[data-testid="edit-feature-dialog"]')).toBeVisible({
      timeout: 10000,
    });

    // Update the description - use the textarea inside the dialog so React state updates
    const descriptionInput = page
      .locator('[data-testid="edit-feature-dialog"]')
      .locator('[data-testid="feature-description-input"]');
    await expect(descriptionInput).toBeVisible({ timeout: 5000 });
    await descriptionInput.click();
    await descriptionInput.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await descriptionInput.pressSequentially(updatedDescription, { delay: 0 });
    await expect(descriptionInput).toHaveValue(updatedDescription, { timeout: 3000 });

    // Save changes
    await clickElement(page, 'confirm-edit-feature');

    // Wait for dialog to close
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="edit-feature-dialog"]'),
      { timeout: 5000 }
    );

    // Verify persistence on disk first (source of truth for feature metadata).
    // Check file exists first so we retry on assertion failure instead of throwing ENOENT.
    await expect(async () => {
      expect(fs.existsSync(featureFilePath)).toBe(true);
      const raw = fs.readFileSync(featureFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as { description?: string };
      expect(parsed.description).toBe(updatedDescription);
    }).toPass({ timeout: 15000 });

    // The optimistic update can be overwritten by a stale React Query refetch
    // (e.g. from a prior feature-create invalidation that races with the edit).
    // Force a fresh board refresh to ensure the UI reads the confirmed server state.
    const refreshButton = page.locator('button[title="Refresh board state from server"]');
    if (await refreshButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await refreshButton.click();
    }

    // Wait for the card to show the updated description.
    await expect(
      page
        .locator('[data-testid="kanban-column-backlog"]')
        .locator(`[data-testid="kanban-card-${featureId}"]`)
        .filter({ hasText: updatedDescription })
    ).toBeVisible({ timeout: 15000 });
  });
});
