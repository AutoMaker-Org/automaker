/**
 * Suggested Automations E2E Test
 *
 * Tests the "Suggested Automations" feature in the automation management view:
 * - Suggested automations card is visible and collapsible
 * - Category filter pills work correctly
 * - Clicking a suggestion opens the editor dialog with pre-populated data
 * - Editor dialog shows correct template name, trigger, and steps
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot, setupProjectWithFixture } from '../utils';
import { navigateToAutomations } from '../utils/views/automation';

const WORKSPACE_ROOT = getWorkspaceRoot();
const TEST_TEMP_DIR = path.join(WORKSPACE_ROOT, 'test', 'temp', 'suggested-automations-test');

test.describe('Suggested Automations', () => {
  let projectPath: string;
  const projectName = `suggested-automations-test-${Date.now()}`;

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
  });

  test.afterAll(async () => {
    if (fs.existsSync(TEST_TEMP_DIR)) {
      try {
        fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  async function navigateToAutomationsView(page: import('@playwright/test').Page) {
    await navigateToAutomations(page);
  }

  test.describe('Suggestions Card Visibility', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('suggested automations card is visible on the automations page', async ({ page }) => {
      await navigateToAutomationsView(page);

      // The "Suggested Automations" heading should be visible
      const suggestionsHeading = page.locator('text=Suggested Automations').first();
      await expect(suggestionsHeading).toBeVisible({ timeout: 5000 });

      // The description should also be visible
      const description = page.locator(
        'text=Start with a template to quickly set up common workflows'
      );
      await expect(description).toBeVisible();
    });

    test('suggestion cards are rendered in a grid', async ({ page }) => {
      await navigateToAutomationsView(page);

      // Find suggestion cards by their data-testid pattern
      const suggestionCards = page.locator('[data-testid^="suggestion-"]');
      const count = await suggestionCards.count();
      expect(count).toBeGreaterThan(0);
    });

    test('each suggestion card shows icon, name, and description', async ({ page }) => {
      await navigateToAutomationsView(page);

      // Check the bug scanner suggestion specifically
      const bugScannerCard = page.locator('[data-testid="suggestion-scan-recent-commits"]');
      await expect(bugScannerCard).toBeVisible();
      await expect(bugScannerCard).toContainText('Bug Scanner');
      await expect(bugScannerCard).toContainText('Scan recent commits');
    });
  });

  test.describe('Category Filtering', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('category filter pills are displayed', async ({ page }) => {
      await navigateToAutomationsView(page);

      // Check that expected category pills are present
      const categories = ['All', 'Development', 'Quality', 'Reporting', 'Maintenance', 'Workflow'];
      for (const category of categories) {
        const pill = page.locator(`button:has-text("${category}")`).first();
        await expect(pill).toBeVisible();
      }
    });

    test('clicking a category pill filters displayed suggestions', async ({ page }) => {
      await navigateToAutomationsView(page);

      // Get initial count of suggestions (all)
      const allCards = page.locator('[data-testid^="suggestion-"]');
      const allCount = await allCards.count();
      expect(allCount).toBeGreaterThan(0);

      // Click on "Quality" filter
      const qualityPill = page.locator('button:has-text("Quality")').first();
      await qualityPill.click();

      // Wait for the filter to take effect
      await page.waitForTimeout(300);

      // Count filtered cards - should be less than all
      const filteredCards = page.locator('[data-testid^="suggestion-"]');
      const filteredCount = await filteredCards.count();
      expect(filteredCount).toBeLessThan(allCount);
      expect(filteredCount).toBeGreaterThan(0);

      // Click "All" to reset
      const allPill = page.locator('button:has-text("All")').first();
      await allPill.click();
      await page.waitForTimeout(300);

      const resetCount = await page.locator('[data-testid^="suggestion-"]').count();
      expect(resetCount).toBe(allCount);
    });
  });

  test.describe('Opening Editor from Suggestion', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('clicking a suggestion opens the editor dialog', async ({ page }) => {
      await navigateToAutomationsView(page);

      // Click the bug scanner suggestion
      const bugScannerCard = page.locator('[data-testid="suggestion-scan-recent-commits"]');
      await bugScannerCard.click();

      // Wait for editor dialog to open
      const dialog = page.locator('[data-testid="automation-editor-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Dialog should say "Create Automation" (not Edit, since it's new)
      await expect(dialog).toContainText('Create Automation');
    });

    test('editor is pre-populated with template data from bug scanner', async ({ page }) => {
      await navigateToAutomationsView(page);

      // Click the bug scanner suggestion
      const bugScannerCard = page.locator('[data-testid="suggestion-scan-recent-commits"]');
      await bugScannerCard.click();

      // Wait for editor dialog
      const dialog = page.locator('[data-testid="automation-editor-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Check the name field is populated
      const nameInput = dialog.locator('#automation-name');
      await expect(nameInput).toHaveValue('Bug Scanner');

      // Check description is populated
      const descInput = dialog.locator('#automation-description');
      const descValue = await descInput.inputValue();
      expect(descValue).toContain('git commits');

      // Check steps exist (bug scanner has 2 steps)
      const stepItems = dialog.locator('[data-testid="step-item"]');
      await expect(stepItems).toHaveCount(2, { timeout: 3000 });
    });

    test('pre-release checklist template populates 4 steps', async ({ page }) => {
      await navigateToAutomationsView(page);

      // Click the pre-release checklist suggestion
      const card = page.locator('[data-testid="suggestion-pre-release-checklist"]');
      await card.click();

      const dialog = page.locator('[data-testid="automation-editor-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Pre-release checklist should have 4 steps
      const stepItems = dialog.locator('[data-testid="step-item"]');
      await expect(stepItems).toHaveCount(4, { timeout: 3000 });

      // Check name
      const nameInput = dialog.locator('#automation-name');
      await expect(nameInput).toHaveValue('Pre-Release Checklist');
    });

    test('editor can be cancelled without saving', async ({ page }) => {
      await navigateToAutomationsView(page);

      // Click a suggestion
      const card = page.locator('[data-testid="suggestion-daily-standup-summary"]');
      await card.click();

      const dialog = page.locator('[data-testid="automation-editor-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Cancel
      const cancelButton = dialog.locator('button:has-text("Cancel")');
      await cancelButton.click();

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Collapsible Behavior', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('suggestions panel can be collapsed and expanded', async ({ page }) => {
      await navigateToAutomationsView(page);

      // Suggestions should be visible initially
      const suggestionCards = page.locator('[data-testid^="suggestion-"]');
      const initialCount = await suggestionCards.count();
      expect(initialCount).toBeGreaterThan(0);

      // Click the collapsible header to collapse
      const header = page.locator('text=Suggested Automations').first();
      await header.click();

      // Wait for collapse animation
      await page.waitForTimeout(500);

      // After collapsing, suggestion cards should not be visible
      const collapsedCards = page.locator('[data-testid^="suggestion-"]');
      await expect(collapsedCards.first()).not.toBeVisible({ timeout: 3000 });

      // Click header again to expand
      await header.click();
      await page.waitForTimeout(500);

      // Cards should be visible again
      const expandedCards = page.locator('[data-testid^="suggestion-"]');
      const expandedCount = await expandedCards.count();
      expect(expandedCount).toBeGreaterThan(0);
    });
  });
});
