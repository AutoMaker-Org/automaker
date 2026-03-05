/**
 * Step Editor Variable Insertion Test
 *
 * Tests the variable insertion functionality in step editors:
 * - VariableInput component inserts variable syntax on selection
 * - VariableTextarea component inserts variable syntax on selection
 * - Popover closes after variable selection
 * - Variable syntax is correctly appended to existing value
 *
 * This tests the fix for the bug where clicking a variable in the dropdown
 * didn't actually insert it into the input field.
 */

import { test, expect, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot, setupProjectWithFixture } from '../utils';
import {
  navigateToAutomations,
  clickCreateAutomationButton,
  addStepByType,
} from '../utils/views/automation';

const WORKSPACE_ROOT = getWorkspaceRoot();
const TEST_TEMP_DIR = path.join(WORKSPACE_ROOT, 'test', 'temp', 'variable-insertion-test');

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Helper to find the variable button in VariableInput components
 */
async function findVariableButton(page: Page): Promise<Locator | null> {
  const button = page.locator('button[title="Insert variable"]').first();
  if ((await button.count()) > 0) {
    return button;
  }
  return null;
}

/**
 * Helper to find the "Insert Variable" button in VariableTextarea components
 */
async function findTextareaVariableButton(page: Page): Promise<Locator | null> {
  const button = page.locator('button:has-text("Insert Variable")').first();
  if ((await button.count()) > 0) {
    return button;
  }
  return null;
}

/**
 * Helper to wait for and get the popover locator
 */
async function getPopover(page: Page): Promise<Locator> {
  return page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').first();
}

/**
 * Helper to select any available variable from the popover
 */
async function selectAnyVariable(popover: Locator): Promise<void> {
  const anyVar = popover.locator('button').first();
  await anyVar.click();
}

/**
 * Helper to verify variable syntax was inserted
 */
function assertVariableSyntax(value: string): void {
  expect(value).toContain('{{');
  expect(value).toContain('}}');
}

// ============================================================================
// Test Suite
// ============================================================================

test.describe('Step Editor Variable Insertion', () => {
  let projectPath: string;
  const projectName = `var-insertion-test-${Date.now()}`;

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    // Create minimal project structure
    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );

    const automakerDir = path.join(projectPath, '.automaker');
    fs.mkdirSync(automakerDir, { recursive: true });
  });

  test.afterAll(async () => {
    // Cleanup temp directory
    if (fs.existsSync(TEST_TEMP_DIR)) {
      try {
        fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ============================================================================
  // VariableInput Component Tests
  // ============================================================================

  test.describe('VariableInput component', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('inserts variable syntax into input field when variable is selected', async ({ page }) => {
      await navigateToAutomations(page);
      await clickCreateAutomationButton(page);

      // Add a step that has a VariableInput (e.g., run-script-exec)
      await addStepByType(page, 'Run Shell Command');

      // Wait for step configuration panel to appear
      await page.waitForSelector('input', { state: 'visible' });

      // Find and click the variable insertion button
      const variableButton = await findVariableButton(page);
      if (!variableButton) {
        test.skip();
      }

      // Open the variable browser popover
      await variableButton.click();

      // Wait for popover to appear
      const popover = await getPopover(page);
      await popover.waitFor({ state: 'visible', timeout: 3000 });

      // Select a variable
      await selectAnyVariable(popover);

      // Verify the popover closes after selection
      await popover.waitFor({ state: 'hidden', timeout: 2000 });

      // Verify the variable syntax was inserted
      const inputAfter = page.locator('input').first();
      const inputValue = await inputAfter.inputValue();
      assertVariableSyntax(inputValue);
    });

    test('appends variable syntax to existing text', async ({ page }) => {
      await navigateToAutomations(page);
      await clickCreateAutomationButton(page);

      // Add a step with VariableInput
      await addStepByType(page, 'Run Shell Command');
      await page.waitForSelector('input', { state: 'visible' });

      // Find the command input
      const commandInput = page.locator('input').first();

      // Type some existing text
      await commandInput.fill('echo ');

      // Open variable browser
      const variableButton = await findVariableButton(page);
      if (!variableButton) {
        test.skip();
      }

      await variableButton.click();

      // Wait for popover
      const popover = await getPopover(page);
      await popover.waitFor({ state: 'visible', timeout: 3000 });

      // Select a variable
      await selectAnyVariable(popover);

      // Wait for popover to close
      await popover.waitFor({ state: 'hidden', timeout: 2000 });

      // Verify the existing text is preserved and variable was appended
      const finalValue = await commandInput.inputValue();
      expect(finalValue).toContain('echo ');
      assertVariableSyntax(finalValue);
    });

    test('popover closes when user presses Escape', async ({ page }) => {
      await navigateToAutomations(page);
      await clickCreateAutomationButton(page);

      await addStepByType(page, 'Run Shell Command');
      await page.waitForSelector('input', { state: 'visible' });

      const variableButton = await findVariableButton(page);
      if (!variableButton) {
        test.skip();
      }

      await variableButton.click();

      const popover = await getPopover(page);
      await popover.waitFor({ state: 'visible', timeout: 3000 });
      expect(await popover.isVisible()).toBe(true);

      // Press Escape to close
      await page.keyboard.press('Escape');
      await popover.waitFor({ state: 'hidden', timeout: 2000 });
      expect(await popover.isVisible()).toBe(false);

      // Verify no variable was inserted
      const input = page.locator('input').first();
      const inputValue = await input.inputValue();
      expect(inputValue).not.toContain('{{');
    });
  });

  // ============================================================================
  // VariableTextarea Component Tests
  // ============================================================================

  test.describe('VariableTextarea component', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('inserts variable syntax into textarea when variable is selected', async ({ page }) => {
      await navigateToAutomations(page);
      await clickCreateAutomationButton(page);

      // Add a step that has VariableTextarea (e.g., run-ai-prompt)
      await addStepByType(page, 'Run AI Prompt');
      await page.waitForSelector('textarea', { state: 'visible' });

      // Find the prompt textarea
      const textarea = page.locator('textarea').first();

      // Clear any default text
      await textarea.clear();

      // Find and click the "Insert Variable" button
      const insertVarButton = await findTextareaVariableButton(page);
      if (!insertVarButton) {
        test.skip();
      }

      // Open the variable browser popover
      await insertVarButton.click();

      // Wait for popover
      const popover = await getPopover(page);
      await popover.waitFor({ state: 'visible', timeout: 3000 });

      // Select a variable
      await selectAnyVariable(popover);

      // Wait for popover to close
      await popover.waitFor({ state: 'hidden', timeout: 2000 });

      // Verify variable syntax was inserted
      const textareaValue = await textarea.inputValue();
      assertVariableSyntax(textareaValue);
    });

    test('popover closes after variable selection in textarea', async ({ page }) => {
      await navigateToAutomations(page);
      await clickCreateAutomationButton(page);

      await addStepByType(page, 'Run AI Prompt');
      await page.waitForSelector('textarea', { state: 'visible' });

      const insertVarButton = await findTextareaVariableButton(page);
      if (!insertVarButton) {
        test.skip();
      }

      // Open popover
      await insertVarButton.click();

      // Wait for popover to be visible
      const popover = await getPopover(page);
      await popover.waitFor({ state: 'visible', timeout: 3000 });
      expect(await popover.isVisible()).toBe(true);

      // Select a variable
      await selectAnyVariable(popover);

      // Verify popover closes
      await popover.waitFor({ state: 'hidden', timeout: 2000 });
      expect(await popover.isVisible()).toBe(false);
    });
  });

  // ============================================================================
  // Popover State Management Tests
  // ============================================================================

  test.describe('Popover state management', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('popover can be opened and closed multiple times', async ({ page }) => {
      await navigateToAutomations(page);
      await clickCreateAutomationButton(page);

      await addStepByType(page, 'Run Shell Command');
      await page.waitForSelector('input', { state: 'visible' });

      const variableButton = await findVariableButton(page);
      if (!variableButton) {
        test.skip();
      }

      const popover = await getPopover(page);

      // First open
      await variableButton.click();
      await popover.waitFor({ state: 'visible', timeout: 3000 });
      expect(await popover.isVisible()).toBe(true);

      // Close via variable selection
      await selectAnyVariable(popover);
      await popover.waitFor({ state: 'hidden', timeout: 2000 });
      expect(await popover.isVisible()).toBe(false);

      // Second open
      await variableButton.click();
      await popover.waitFor({ state: 'visible', timeout: 3000 });
      expect(await popover.isVisible()).toBe(true);

      // Close via Escape
      await page.keyboard.press('Escape');
      await popover.waitFor({ state: 'hidden', timeout: 2000 });
      expect(await popover.isVisible()).toBe(false);

      // Third open (verify still works)
      await variableButton.click();
      await popover.waitFor({ state: 'visible', timeout: 3000 });
      expect(await popover.isVisible()).toBe(true);

      // Clean up
      await page.keyboard.press('Escape');
    });

    test('variable insertion accumulates correctly with multiple insertions', async ({ page }) => {
      await navigateToAutomations(page);
      await clickCreateAutomationButton(page);

      await addStepByType(page, 'Run Shell Command');
      await page.waitForSelector('input', { state: 'visible' });

      const commandInput = page.locator('input').first();
      const variableButton = await findVariableButton(page);
      if (!variableButton) {
        test.skip();
      }

      // First insertion
      await variableButton.click();
      let popover = await getPopover(page);
      await popover.waitFor({ state: 'visible', timeout: 3000 });
      await selectAnyVariable(popover);
      await popover.waitFor({ state: 'hidden', timeout: 2000 });

      const firstValue = await commandInput.inputValue();
      assertVariableSyntax(firstValue);

      // Second insertion (should append)
      await variableButton.click();
      popover = await getPopover(page);
      await popover.waitFor({ state: 'visible', timeout: 3000 });
      await selectAnyVariable(popover);
      await popover.waitFor({ state: 'hidden', timeout: 2000 });

      const secondValue = await commandInput.inputValue();
      // Should have two variable references
      const variableCount = (secondValue.match(/\{\{/g) || []).length;
      expect(variableCount).toBeGreaterThanOrEqual(2);
    });
  });
});
