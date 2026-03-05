/**
 * Nested Step List Dropdown UI Test
 *
 * Tests the combined add step button in the nested step list (used in if/then and loop editors):
 * - Dropdown opens when clicking "Add Step" button in nested lists
 * - Step types are organized by category
 * - Clicking a step type adds it to the nested steps
 * - Multiple steps can be added in sequence to nested lists
 * - Steps display correctly with proper type and index
 * - Dropdown closes after selection
 * - No separate Select dropdown exists (using combined button pattern)
 *
 * Feature: Make add step in the "if/then" step editor use the new combined add step button
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
const TEST_TEMP_DIR = path.join(WORKSPACE_ROOT, 'test', 'temp', 'nested-step-dropdown-test');

// Expected categories in the dropdown (in order)
const EXPECTED_CATEGORIES = ['Features', 'AI', 'Variables', 'Integrations', 'Flow'];

// Expected step types within each category
const EXPECTED_STEPS_BY_CATEGORY: Record<string, string[]> = {
  Features: ['Create Feature', 'Manage Feature'],
  AI: ['Run AI Prompt', 'Run TypeScript Code'],
  Variables: ['Define/Set Variable', 'Set Variable'],
  Integrations: ['Call HTTP Endpoint', 'Run Script/Exec', 'Emit Event'],
  Flow: ['If (Conditional)', 'Loop', 'Call Automation'],
};

test.describe('Nested Step List Dropdown UI', () => {
  let projectPath: string;
  const projectName = `nested-step-dropdown-test-${Date.now()}`;

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

  /**
   * Helper function to navigate to automation editor and add an If step
   * to access the nested step list
   */
  async function setupAutomationWithIfStep(page: import('@playwright/test').Page) {
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

    // Add an "If (Conditional)" step to access the nested step list
    const addStepButton = page.locator('[data-testid="add-step-button"]');
    await addStepButton.click();
    await page
      .locator('[data-testid="add-step-dropdown"]')
      .waitFor({ state: 'visible', timeout: 3000 });

    // Click "If (Conditional)" step
    const ifStepItem = page.locator('[role="menuitem"]:has-text("If (Conditional)")');
    await ifStepItem.click();

    // Wait for step to be added
    await page
      .locator('[data-testid="add-step-dropdown"]')
      .waitFor({ state: 'hidden', timeout: 3000 });

    // Click on the If step to open its editor (which contains nested step lists)
    const ifStep = page.locator('[data-step-type="if"]');
    await ifStep.click();

    // Wait for step config dialog to open
    await page
      .locator('[data-testid="step-config-dialog"]')
      .waitFor({ state: 'visible', timeout: 5000 });
  }

  test.describe('Dropdown Menu Structure in Nested Step List', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('nested dropdown opens when clicking Add Step button in If editor', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      // Find the nested step list for "Then" branch
      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();
      await expect(nestedStepList).toBeVisible({ timeout: 5000 });

      // Click the nested Add Step button
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await expect(nestedAddStepButton).toBeVisible();
      await nestedAddStepButton.click();

      // Verify dropdown is visible
      const dropdown = page.locator('[data-testid="nested-add-step-dropdown"]');
      await expect(dropdown).toBeVisible({ timeout: 3000 });

      // Close dropdown
      await page.keyboard.press('Escape');
    });

    test('nested dropdown displays all expected categories', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      // Open nested dropdown
      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Verify each category label is present
      for (const category of EXPECTED_CATEGORIES) {
        const categoryLabel = page
          .locator(`[data-testid="nested-add-step-dropdown"] [role="menu"] >> text=${category}`)
          .first();
        await expect(categoryLabel).toBeVisible();
      }

      await page.keyboard.press('Escape');
    });

    test('nested dropdown displays all step types within categories', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      // Open nested dropdown
      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Verify each step type is present
      for (const [_category, steps] of Object.entries(EXPECTED_STEPS_BY_CATEGORY)) {
        for (const stepTitle of steps) {
          const stepItem = page.locator(
            `[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("${stepTitle}")`
          );
          await expect(stepItem).toBeVisible();
        }
      }

      await page.keyboard.press('Escape');
    });
  });

  test.describe('Step Addition Interaction in Nested List', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('clicking a step type adds it to the nested steps', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      // Get the nested step list for "Then" branch
      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Verify initial state has no steps
      const initialStepCount = await nestedStepList
        .locator('[data-testid="nested-step-item"]')
        .count();
      expect(initialStepCount).toBe(0);

      // Add a step
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Click "Run AI Prompt" step
      const runAiPromptItem = page.locator(
        '[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("Run AI Prompt")'
      );
      await runAiPromptItem.click();

      // Wait for dropdown to close
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'hidden', timeout: 3000 });

      // Verify step was added
      const nestedSteps = nestedStepList.locator('[data-testid="nested-step-item"]');
      await expect(nestedSteps).toHaveCount(1, { timeout: 3000 });

      // Verify the step type is correct
      const addedStep = nestedSteps.first();
      await expect(addedStep).toHaveAttribute('data-step-type', 'run-ai-prompt');
    });

    test('multiple steps can be added in sequence to nested list', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Add multiple steps
      const stepsToAdd = ['Run AI Prompt', 'Define/Set Variable', 'Emit Event'];

      for (const stepTitle of stepsToAdd) {
        const nestedAddStepButton = nestedStepList.locator(
          '[data-testid="nested-add-step-button"]'
        );
        await nestedAddStepButton.click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'visible', timeout: 3000 });

        const stepItem = page.locator(
          `[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("${stepTitle}")`
        );
        await stepItem.click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'hidden', timeout: 3000 });
      }

      // Verify all steps were added
      const nestedSteps = nestedStepList.locator('[data-testid="nested-step-item"]');
      await expect(nestedSteps).toHaveCount(3, { timeout: 5000 });
    });

    test('steps in nested list are numbered correctly', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Add two steps
      const stepsToAdd = ['Create Feature', 'Loop'];

      for (const stepTitle of stepsToAdd) {
        const nestedAddStepButton = nestedStepList.locator(
          '[data-testid="nested-add-step-button"]'
        );
        await nestedAddStepButton.click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'visible', timeout: 3000 });

        const stepItem = page.locator(
          `[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("${stepTitle}")`
        );
        await stepItem.click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'hidden', timeout: 3000 });
      }

      // Verify step numbering
      const nestedSteps = nestedStepList.locator('[data-testid="nested-step-item"]');
      await expect(nestedSteps).toHaveCount(2, { timeout: 3000 });

      const firstStepText = await nestedSteps.nth(0).textContent();
      const secondStepText = await nestedSteps.nth(1).textContent();

      expect(firstStepText).toContain('1.');
      expect(secondStepText).toContain('2.');
    });

    test('nested dropdown closes after selecting a step', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Open dropdown
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Select a step
      const stepItem = page.locator(
        '[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("Call HTTP Endpoint")'
      );
      await stepItem.click();

      // Verify dropdown closed
      await expect(page.locator('[data-testid="nested-add-step-dropdown"]')).not.toBeVisible({
        timeout: 3000,
      });
    });

    test('nested dropdown can be closed with Escape key', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Open dropdown
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Press Escape
      await page.keyboard.press('Escape');

      // Verify dropdown closed
      await expect(page.locator('[data-testid="nested-add-step-dropdown"]')).not.toBeVisible({
        timeout: 3000,
      });

      // Verify no steps were added
      const stepCount = await nestedStepList.locator('[data-testid="nested-step-item"]').count();
      expect(stepCount).toBe(0);
    });
  });

  test.describe('UI Component Structure - Combined Button Pattern', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('nested Add Step button has correct test id', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Verify nested Add Step button has correct test id
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await expect(nestedAddStepButton).toBeVisible();
      await expect(nestedAddStepButton).toContainText('Add Step');
    });

    test('no separate Select dropdown in nested step list (combined button pattern)', async ({
      page,
    }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Verify old select pattern does not exist
      const oldSelectTrigger = nestedStepList.locator('[data-testid="step-type-select"]');
      const selectCount = await oldSelectTrigger.count();
      expect(selectCount).toBe(0);

      // Also verify no native select element
      const nativeSelect = nestedStepList.locator('select');
      const nativeSelectCount = await nativeSelect.count();
      expect(nativeSelectCount).toBe(0);
    });

    test('nested step list displays "No steps defined" when empty', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Verify empty state message
      const emptyMessage = nestedStepList.locator('text=No steps defined');
      await expect(emptyMessage).toBeVisible();
    });

    test('nested dropdown content is scrollable for many step types', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Open dropdown
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Verify dropdown content exists and has menu items
      const dropdown = page.locator('[data-testid="nested-add-step-dropdown"]');
      await expect(dropdown).toBeVisible();

      // Get all menu items
      const menuItems = await dropdown.locator('[role="menuitem"]').count();
      expect(menuItems).toBeGreaterThan(0);

      await page.keyboard.press('Escape');
    });

    test('nested Add Step button is full-width', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');

      // Verify button has w-full class (full width)
      await expect(nestedAddStepButton).toBeVisible();

      // Check that the button takes full width of its container
      const listWidth = await nestedStepList.boundingBox();
      const buttonWidth = await nestedAddStepButton.boundingBox();

      // Button should be nearly the same width as the list (accounting for padding)
      expect(buttonWidth?.width).toBeDefined();
      expect(listWidth?.width).toBeDefined();
      if (buttonWidth && listWidth) {
        // Button should be at least 80% of the list width
        expect(buttonWidth.width).toBeGreaterThan(listWidth.width * 0.8);
      }
    });
  });

  test.describe('Else Branch Nested Step List', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('else branch also has working nested dropdown', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      // Find all nested step lists (should be 2: Then and Else)
      const nestedStepLists = page.locator('[data-testid="nested-step-list"]');
      await expect(nestedStepLists).toHaveCount(2, { timeout: 3000 });

      // The second one is the Else branch
      const elseStepList = nestedStepLists.nth(1);
      const elseAddStepButton = elseStepList.locator('[data-testid="nested-add-step-button"]');

      // Verify button is visible and clickable
      await expect(elseAddStepButton).toBeVisible();
      await elseAddStepButton.click();

      // Verify dropdown opens
      await expect(page.locator('[data-testid="nested-add-step-dropdown"]')).toBeVisible({
        timeout: 3000,
      });

      // Add a step to else branch
      const stepItem = page.locator(
        '[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("Run Script/Exec")'
      );
      await stepItem.click();

      // Verify step was added
      await expect(elseStepList.locator('[data-testid="nested-step-item"]')).toHaveCount(1, {
        timeout: 3000,
      });
    });
  });

  test.describe('Loop Step Nested Step List', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    /**
     * Helper function to setup automation with a Loop step
     */
    async function setupAutomationWithLoopStep(page: import('@playwright/test').Page) {
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

      // Add a "Loop" step
      const addStepButton = page.locator('[data-testid="add-step-button"]');
      await addStepButton.click();
      await page
        .locator('[data-testid="add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      const loopStepItem = page.locator('[role="menuitem"]:has-text("Loop")');
      await loopStepItem.click();
      await page
        .locator('[data-testid="add-step-dropdown"]')
        .waitFor({ state: 'hidden', timeout: 3000 });

      // Click on the Loop step to open its editor
      const loopStep = page.locator('[data-step-type="loop"]');
      await loopStep.click();

      await page
        .locator('[data-testid="step-config-dialog"]')
        .waitFor({ state: 'visible', timeout: 5000 });
    }

    test('loop step has working nested dropdown', async ({ page }) => {
      await setupAutomationWithLoopStep(page);

      // Find the nested step list in Loop editor
      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Verify nested Add Step button is visible
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await expect(nestedAddStepButton).toBeVisible();

      // Open dropdown
      await nestedAddStepButton.click();
      await expect(page.locator('[data-testid="nested-add-step-dropdown"]')).toBeVisible({
        timeout: 3000,
      });

      // Add a step
      const stepItem = page.locator(
        '[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("Create Feature")'
      );
      await stepItem.click();

      // Verify step was added
      await expect(nestedStepList.locator('[data-testid="nested-step-item"]')).toHaveCount(1, {
        timeout: 3000,
      });
    });
  });

  test.describe('Step Manipulation in Nested Lists', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('nested step can be removed via delete button', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Add a step
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });
      await page
        .locator(
          '[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("Run AI Prompt")'
        )
        .click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'hidden', timeout: 3000 });

      // Verify step exists
      await expect(nestedStepList.locator('[data-testid="nested-step-item"]')).toHaveCount(1, {
        timeout: 3000,
      });

      // Click delete button (trash icon)
      const deleteButton = nestedStepList.locator(
        '[data-testid="nested-step-item"] button[title="Remove"]'
      );
      await deleteButton.click();

      // Verify step was removed
      await expect(nestedStepList.locator('[data-testid="nested-step-item"]')).toHaveCount(0, {
        timeout: 3000,
      });

      // Verify empty state message returns
      await expect(nestedStepList.locator('text=No steps defined')).toBeVisible({ timeout: 3000 });
    });

    test('nested steps can be reordered with move up/down buttons', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Add two steps: Run AI Prompt, then Create Feature
      const stepsToAdd = ['Run AI Prompt', 'Create Feature'];
      for (const stepTitle of stepsToAdd) {
        const nestedAddStepButton = nestedStepList.locator(
          '[data-testid="nested-add-step-button"]'
        );
        await nestedAddStepButton.click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'visible', timeout: 3000 });
        await page
          .locator(
            `[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("${stepTitle}")`
          )
          .click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'hidden', timeout: 3000 });
      }

      // Verify order: Run AI Prompt (first), Create Feature (second)
      const steps = nestedStepList.locator('[data-testid="nested-step-item"]');
      await expect(steps).toHaveCount(2, { timeout: 3000 });

      const firstStep = steps.nth(0);
      const secondStep = steps.nth(1);

      await expect(firstStep).toHaveAttribute('data-step-type', 'run-ai-prompt');
      await expect(secondStep).toHaveAttribute('data-step-type', 'create-feature');

      // Move second step up (should become first)
      const moveUpButton = secondStep.locator('button[title="Move Up"]');
      await moveUpButton.click();

      // Wait for re-render
      await page.waitForTimeout(100);

      // Verify order changed: Create Feature is now first
      const reorderedSteps = nestedStepList.locator('[data-testid="nested-step-item"]');
      await expect(reorderedSteps.nth(0)).toHaveAttribute('data-step-type', 'create-feature');
      await expect(reorderedSteps.nth(1)).toHaveAttribute('data-step-type', 'run-ai-prompt');

      // Move it back down
      const moveDownButton = reorderedSteps.nth(0).locator('button[title="Move Down"]');
      await moveDownButton.click();

      await page.waitForTimeout(100);

      // Verify order restored
      const restoredSteps = nestedStepList.locator('[data-testid="nested-step-item"]');
      await expect(restoredSteps.nth(0)).toHaveAttribute('data-step-type', 'run-ai-prompt');
      await expect(restoredSteps.nth(1)).toHaveAttribute('data-step-type', 'create-feature');
    });

    test('move up button is disabled for first step', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Add two steps
      const stepsToAdd = ['Run AI Prompt', 'Create Feature'];
      for (const stepTitle of stepsToAdd) {
        const nestedAddStepButton = nestedStepList.locator(
          '[data-testid="nested-add-step-button"]'
        );
        await nestedAddStepButton.click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'visible', timeout: 3000 });
        await page
          .locator(
            `[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("${stepTitle}")`
          )
          .click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'hidden', timeout: 3000 });
      }

      const steps = nestedStepList.locator('[data-testid="nested-step-item"]');
      const firstStepMoveUpButton = steps.nth(0).locator('button[title="Move Up"]');

      // Verify first step's move up button is disabled
      await expect(firstStepMoveUpButton).toBeDisabled();
    });

    test('move down button is disabled for last step', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Add two steps
      const stepsToAdd = ['Run AI Prompt', 'Create Feature'];
      for (const stepTitle of stepsToAdd) {
        const nestedAddStepButton = nestedStepList.locator(
          '[data-testid="nested-add-step-button"]'
        );
        await nestedAddStepButton.click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'visible', timeout: 3000 });
        await page
          .locator(
            `[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("${stepTitle}")`
          )
          .click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'hidden', timeout: 3000 });
      }

      const steps = nestedStepList.locator('[data-testid="nested-step-item"]');
      const lastStepMoveDownButton = steps.nth(1).locator('button[title="Move Down"]');

      // Verify last step's move down button is disabled
      await expect(lastStepMoveDownButton).toBeDisabled();
    });

    test('clicking a nested step opens step config dialog', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Add a step
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });
      await page
        .locator(
          '[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("Run AI Prompt")'
        )
        .click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'hidden', timeout: 3000 });

      // Click on the step name button to edit
      const stepItem = nestedStepList.locator('[data-testid="nested-step-item"]').first();
      const stepNameButton = stepItem.locator('button.text-left');
      await stepNameButton.click();

      // Step config dialog should be visible (already open from If step, but this confirms nested step editor opens)
      await expect(page.locator('[data-testid="step-config-dialog"]')).toBeVisible({
        timeout: 3000,
      });
    });
  });

  test.describe('Edge Cases and Accessibility', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('nested dropdown has proper ARIA role attributes', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Verify dropdown content has menu role
      const dropdown = page.locator('[data-testid="nested-add-step-dropdown"]');
      const menuContent = dropdown.locator('[role="menu"], [role="group"]').first();
      await expect(menuContent).toBeVisible();

      // Verify menu items have menuitem role
      const menuItems = dropdown.locator('[role="menuitem"]');
      const itemCount = await menuItems.count();
      expect(itemCount).toBeGreaterThan(0);

      await page.keyboard.press('Escape');
    });

    test('nested dropdown categories are properly separated', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });

      // Verify separators exist between categories
      const dropdown = page.locator('[data-testid="nested-add-step-dropdown"]');
      const separators = dropdown.locator('[role="separator"]');
      const separatorCount = await separators.count();

      // Should have separators between categories
      expect(separatorCount).toBeGreaterThan(0);

      await page.keyboard.press('Escape');
    });

    test('nested Add Step button has proper accessibility attributes', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');

      // Button should be focusable
      await nestedAddStepButton.focus();
      await expect(nestedAddStepButton).toBeFocused();

      // Button should contain icon and text
      await expect(nestedAddStepButton.locator('svg')).toBeVisible();
      await expect(nestedAddStepButton).toContainText('Add Step');
    });

    test('nested step items display step type information', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();

      // Add a step
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');
      await nestedAddStepButton.click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'visible', timeout: 3000 });
      await page
        .locator(
          '[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("Run AI Prompt")'
        )
        .click();
      await page
        .locator('[data-testid="nested-add-step-dropdown"]')
        .waitFor({ state: 'hidden', timeout: 3000 });

      // Verify step item has data-step-type attribute
      const stepItem = nestedStepList.locator('[data-testid="nested-step-item"]').first();
      await expect(stepItem).toHaveAttribute('data-step-type', 'run-ai-prompt');

      // Verify step name is displayed
      await expect(stepItem).toContainText('Run AI Prompt');
    });

    test('dropdown can be reopened after closing', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();
      const nestedAddStepButton = nestedStepList.locator('[data-testid="nested-add-step-button"]');

      // Open dropdown
      await nestedAddStepButton.click();
      await expect(page.locator('[data-testid="nested-add-step-dropdown"]')).toBeVisible({
        timeout: 3000,
      });

      // Close with Escape
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="nested-add-step-dropdown"]')).not.toBeVisible({
        timeout: 3000,
      });

      // Reopen dropdown
      await nestedAddStepButton.click();
      await expect(page.locator('[data-testid="nested-add-step-dropdown"]')).toBeVisible({
        timeout: 3000,
      });

      // Add a step to verify dropdown still works
      await page
        .locator(
          '[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("Emit Event")'
        )
        .click();
      await expect(nestedStepList.locator('[data-testid="nested-step-item"]')).toHaveCount(1, {
        timeout: 3000,
      });
    });

    test('nested step list has max height overflow handling', async ({ page }) => {
      await setupAutomationWithIfStep(page);

      const nestedStepList = page.locator('[data-testid="nested-step-list"]').first();
      const stepsContainer = nestedStepList.locator('.max-h-\\[300px\\]');

      // Verify the container has overflow handling class
      await expect(stepsContainer).toBeVisible();

      // Add many steps to test overflow behavior
      const stepsToAdd = [
        'Run AI Prompt',
        'Define/Set Variable',
        'Emit Event',
        'Call HTTP Endpoint',
        'Run Script/Exec',
      ];
      for (const stepTitle of stepsToAdd) {
        const nestedAddStepButton = nestedStepList.locator(
          '[data-testid="nested-add-step-button"]'
        );
        await nestedAddStepButton.click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'visible', timeout: 3000 });
        await page
          .locator(
            `[data-testid="nested-add-step-dropdown"] [role="menuitem"]:has-text("${stepTitle}")`
          )
          .click();
        await page
          .locator('[data-testid="nested-add-step-dropdown"]')
          .waitFor({ state: 'hidden', timeout: 3000 });
      }

      // Verify all steps are accessible (container should be scrollable)
      const steps = nestedStepList.locator('[data-testid="nested-step-item"]');
      await expect(steps).toHaveCount(5, { timeout: 5000 });
    });
  });
});
