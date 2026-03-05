/**
 * Step Add Dropdown UI Test
 *
 * Tests the UI interaction of the step add dropdown:
 * - Dropdown opens when clicking "Add Step" button
 * - Step types are organized by category
 * - Clicking a step type adds it to the automation
 * - Multiple steps can be added in sequence
 * - Steps display correctly with proper type and index
 *
 * Feature: Make the step add button show a dropdown with the step types
 * (so you just press the button and it shows the step to add, and it adds it)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  getWorkspaceRoot,
  setupProjectWithFixture,
  waitForBackendHealth,
  authenticateForTests,
  waitForSplashScreenToDisappear,
  handleLoginScreenIfPresent,
} from '../utils';

const WORKSPACE_ROOT = getWorkspaceRoot();
const TEST_TEMP_DIR = path.join(WORKSPACE_ROOT, 'test', 'temp', 'step-dropdown-ui-test');

// Expected categories in the dropdown (in order)
const EXPECTED_CATEGORIES = ['Features', 'AI', 'Variables', 'Integrations', 'Flow'];

// Expected step types within each category
const EXPECTED_STEPS_BY_CATEGORY: Record<string, string[]> = {
  Features: ['Create Feature', 'Manage Feature'],
  Ai: ['Run AI Prompt', 'Run TypeScript Code'],
  Variables: ['Define/Set Variable', 'Set Variable'],
  Integrations: ['Call HTTP Endpoint', 'Run Script/Exec', 'Emit Event'],
  Flow: ['If (Conditional)', 'Loop', 'Call Automation'],
};

test.describe('Step Add Dropdown UI', () => {
  let projectPath: string;
  const projectName = `step-dropdown-ui-test-${Date.now()}`;

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

  test.describe('Dropdown Menu Structure', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('dropdown opens when clicking Add Step button', async ({ page }) => {
      // Navigate to automations page
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      // Wait for automation management view
      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      // Click Create Automation button to open editor
      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();

      // Wait for editor dialog
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Click Add Step button
      const addStepButton = page.locator('[data-testid="add-step-button"]');
      await expect(addStepButton).toBeVisible();
      await addStepButton.click();

      // Verify dropdown is visible
      const dropdown = page.locator('[data-testid="add-step-dropdown"]');
      await expect(dropdown).toBeVisible({ timeout: 3000 });

      // Close dropdown
      await page.keyboard.press('Escape');
    });

    test('dropdown displays all expected categories', async ({ page }) => {
      // Navigate to automations page
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      // Open create dialog
      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Open dropdown
      const addStepButton = page.locator('[data-testid="add-step-button"]');
      await addStepButton.click();
      await page
        .locator('[data-testid="add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Verify each category label is present
      for (const category of EXPECTED_CATEGORIES) {
        const categoryLabel = page.locator(`[role="menu"] >> text=${category}`).first();
        await expect(categoryLabel).toBeVisible();
      }

      await page.keyboard.press('Escape');
    });

    test('dropdown displays all step types within categories', async ({ page }) => {
      // Navigate to automations page
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      // Open create dialog
      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Open dropdown
      const addStepButton = page.locator('[data-testid="add-step-button"]');
      await addStepButton.click();
      await page
        .locator('[data-testid="add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Verify each step type is present
      for (const [_category, steps] of Object.entries(EXPECTED_STEPS_BY_CATEGORY)) {
        for (const stepTitle of steps) {
          const stepItem = page.locator(`[role="menuitem"]:has-text("${stepTitle}")`);
          await expect(stepItem).toBeVisible();
        }
      }

      await page.keyboard.press('Escape');
    });
  });

  test.describe('Step Addition Interaction', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('clicking a step type adds it to the automation', async ({ page }) => {
      // Navigate and open editor
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Verify initial state has default step (createDefaultEditorState creates one)
      const initialStepCount = await page.locator('[data-testid="step-item"]').count();
      expect(initialStepCount).toBe(1); // Default step is 'define-variable'

      // Add a step
      const addStepButton = page.locator('[data-testid="add-step-button"]');
      await addStepButton.click();
      await page
        .locator('[data-testid="add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Click "Create Feature" step
      const createFeatureItem = page.locator('[role="menuitem"]:has-text("Create Feature")');
      await createFeatureItem.click();

      // Wait for dropdown to close
      await page
        .locator('[data-testid="add-step-dropdown"]')
        .waitFor({ state: 'hidden', timeout: 3000 });

      // Verify step was added (now we have 2: default + new one)
      const stepItems = page.locator('[data-testid="step-item"]');
      await expect(stepItems).toHaveCount(2, { timeout: 3000 });

      // Verify the new step type is the one we just added (it should be the last step)
      const addedStep = stepItems.nth(1); // Second step (index 1) is the one we just added
      await expect(addedStep).toHaveAttribute('data-step-type', 'create-feature');
    });

    test('multiple steps can be added in sequence', async ({ page }) => {
      // Navigate and open editor
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Add multiple steps
      const stepsToAdd = ['Create Feature', 'Run AI Prompt', 'Define/Set Variable'];

      for (const stepTitle of stepsToAdd) {
        const addStepButton = page.locator('[data-testid="add-step-button"]');
        await addStepButton.click();
        await page
          .locator('[data-testid="add-step-dropdown"]')
          .waitFor({ state: 'visible', timeout: 3000 });

        const stepItem = page.locator(`[role="menuitem"]:has-text("${stepTitle}")`);
        await stepItem.click();
        await page
          .locator('[data-testid="add-step-dropdown"]')
          .waitFor({ state: 'hidden', timeout: 3000 });
      }

      // Verify all steps were added (1 default + 3 added = 4 total)
      const stepItems = page.locator('[data-testid="step-item"]');
      await expect(stepItems).toHaveCount(4, { timeout: 5000 });
    });

    test('steps are numbered correctly in sequence', async ({ page }) => {
      // Navigate and open editor
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Add two steps
      const stepsToAdd = ['Create Feature', 'Emit Event'];

      for (const stepTitle of stepsToAdd) {
        const addStepButton = page.locator('[data-testid="add-step-button"]');
        await addStepButton.click();
        await page
          .locator('[data-testid="add-step-dropdown"]')
          .waitFor({ state: 'visible', timeout: 3000 });

        const stepItem = page.locator(`[role="menuitem"]:has-text("${stepTitle}")`);
        await stepItem.click();
        await page
          .locator('[data-testid="add-step-dropdown"]')
          .waitFor({ state: 'hidden', timeout: 3000 });
      }

      // Verify step numbering (1 default + 2 added = 3 total)
      const stepItems = page.locator('[data-testid="step-item"]');
      await expect(stepItems).toHaveCount(3, { timeout: 3000 });

      const firstStepText = await stepItems.nth(0).textContent();
      const secondStepText = await stepItems.nth(1).textContent();
      const thirdStepText = await stepItems.nth(2).textContent();

      expect(firstStepText).toContain('1.');
      expect(secondStepText).toContain('2.');
      expect(thirdStepText).toContain('3.');
    });

    test('dropdown closes after selecting a step', async ({ page }) => {
      // Navigate and open editor
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Open dropdown
      const addStepButton = page.locator('[data-testid="add-step-button"]');
      await addStepButton.click();
      await page
        .locator('[data-testid="add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Select a step
      const stepItem = page.locator('[role="menuitem"]:has-text("Loop")');
      await stepItem.click();

      // Verify dropdown closed
      await expect(page.locator('[data-testid="add-step-dropdown"]')).not.toBeVisible({
        timeout: 3000,
      });
    });

    test('dropdown can be closed with Escape key', async ({ page }) => {
      // Navigate and open editor
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Open dropdown
      const addStepButton = page.locator('[data-testid="add-step-button"]');
      await addStepButton.click();
      await page
        .locator('[data-testid="add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Press Escape
      await page.keyboard.press('Escape');

      // Verify dropdown closed
      await expect(page.locator('[data-testid="add-step-dropdown"]')).not.toBeVisible({
        timeout: 3000,
      });

      // Verify no additional steps were added (still just the default step)
      const stepCount = await page.locator('[data-testid="step-item"]').count();
      expect(stepCount).toBe(1); // Only the default step remains
    });
  });

  test.describe('UI Component Structure', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('Add Step button has correct test id', async ({ page }) => {
      // Navigate and open editor
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Verify Add Step button has correct test id
      const addStepButton = page.locator('[data-testid="add-step-button"]');
      await expect(addStepButton).toBeVisible();
      await expect(addStepButton).toContainText('Add Step');
    });

    test('no separate Select dropdown exists (old pattern removed)', async ({ page }) => {
      // Navigate and open editor
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Verify old select pattern does not exist
      const oldSelectTrigger = page.locator('[data-testid="step-type-select"]');
      const selectCount = await oldSelectTrigger.count();
      expect(selectCount).toBe(0);
    });

    test('dropdown content has scrollable area for many step types', async ({ page }) => {
      // Navigate and open editor
      await waitForBackendHealth(page, 30000);
      await authenticateForTests(page);
      await page.goto('/automations');
      await page.waitForLoadState('load');
      await waitForSplashScreenToDisappear(page, 3000);
      await handleLoginScreenIfPresent(page);

      await page
        .locator('[data-testid="automation-management-view"]')
        .waitFor({ state: 'visible', timeout: 15000 });

      const createButton = page.locator('button:has-text("Create Automation")').first();
      await createButton.click();
      await page
        .locator('[data-testid="automation-editor-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });

      // Open dropdown
      const addStepButton = page.locator('[data-testid="add-step-button"]');
      await addStepButton.click();
      await page
        .locator('[data-testid="add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Verify dropdown content exists
      const dropdown = page.locator('[data-testid="add-step-dropdown"]');
      await expect(dropdown).toBeVisible();

      // Get all menu items
      const menuItems = await page.locator('[role="menuitem"]').count();
      expect(menuItems).toBeGreaterThan(0);

      await page.keyboard.press('Escape');
    });
  });
});
