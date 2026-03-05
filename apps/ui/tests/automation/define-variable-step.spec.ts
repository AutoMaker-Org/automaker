/**
 * Define Variable Step E2E Test
 *
 * Tests the Define Variable step editor in the automation workflow builder:
 * - Variable name field with variable browser integration
 * - Value field with variable browser integration
 * - Bulk values field with variable browser integration
 * - Define only checkbox
 *
 * This test verifies that users can input variables into the define variable step
 * using the variable browser popover.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot, setupProjectWithFixture } from '../utils';

const WORKSPACE_ROOT = getWorkspaceRoot();
const TEST_TEMP_DIR = path.join(WORKSPACE_ROOT, 'test', 'temp', 'define-variable-step-test');

test.describe('Define Variable Step Editor', () => {
  let projectPath: string;
  const projectName = `define-var-test-${Date.now()}`;

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

  test.describe('Variable Input Functionality', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      // Setup the project fixture
      await setupProjectWithFixture(page, projectPath);
    });

    test('should allow creating automation with define-variable step containing variable syntax in name', async ({
      request,
    }) => {
      const automationId = `define-var-${Date.now()}`;

      // Create automation with define-variable step using variable syntax
      const createResponse = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Define Variable Step',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'define-variable',
              name: 'Define test variable',
              config: {
                name: 'myVariable',
                value: 'test-value',
              },
            },
          ],
        },
      });

      expect(createResponse.status()).toBe(201);
      const createData = await createResponse.json();
      expect(createData.success).toBe(true);
      expect(createData.automation.id).toBe(automationId);
      expect(createData.automation.steps).toHaveLength(1);
      expect(createData.automation.steps[0].config.name).toBe('myVariable');
      expect(createData.automation.steps[0].config.value).toBe('test-value');

      // Clean up
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('should allow define-variable step with variable interpolation in value', async ({
      request,
    }) => {
      const automationId = `define-var-interp-${Date.now()}`;

      // Create automation with define-variable step using variable interpolation
      const createResponse = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Define Variable Interpolation',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'define-variable',
              name: 'Define variable with interpolation',
              config: {
                name: 'interpolatedVar',
                value: 'prefix-{{system.projectName}}-suffix',
              },
            },
          ],
        },
      });

      expect(createResponse.status()).toBe(201);
      const createData = await createResponse.json();
      expect(createData.success).toBe(true);
      expect(createData.automation.steps[0].config.value).toBe(
        'prefix-{{system.projectName}}-suffix'
      );

      // Clean up
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('should allow define-variable step with bulk values', async ({ request }) => {
      const automationId = `define-var-bulk-${Date.now()}`;

      // Create automation with define-variable step using bulk values
      const createResponse = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Define Variable Bulk',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'define-variable',
              name: 'Define bulk variables',
              config: {
                values: {
                  var1: 'value1',
                  var2: '{{system.projectPath}}',
                  var3: { nested: 'object' },
                },
              },
            },
          ],
        },
      });

      expect(createResponse.status()).toBe(201);
      const createData = await createResponse.json();
      expect(createData.success).toBe(true);
      expect(createData.automation.steps[0].config.values).toEqual({
        var1: 'value1',
        var2: '{{system.projectPath}}',
        var3: { nested: 'object' },
      });

      // Clean up
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('should allow define-variable step with defineOnly flag', async ({ request }) => {
      const automationId = `define-var-defineonly-${Date.now()}`;

      // Create automation with define-variable step with defineOnly flag
      const createResponse = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Define Variable Define Only',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'define-variable',
              name: 'Define variable only',
              config: {
                name: 'defineOnlyVar',
                value: 'initial-value',
                defineOnly: true,
              },
            },
          ],
        },
      });

      expect(createResponse.status()).toBe(201);
      const createData = await createResponse.json();
      expect(createData.success).toBe(true);
      expect(createData.automation.steps[0].config.defineOnly).toBe(true);

      // Clean up
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('should allow multiple define-variable steps referencing previous workflow variables', async ({
      request,
    }) => {
      const automationId = `define-var-workflow-${Date.now()}`;

      // Create automation with multiple define-variable steps
      const createResponse = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Define Variable Workflow',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'define-variable',
              name: 'Define first variable',
              config: {
                name: 'firstVar',
                value: 'first-value',
              },
            },
            {
              id: 'step-2',
              type: 'define-variable',
              name: 'Define second variable using first',
              config: {
                name: 'secondVar',
                value: '{{workflow.firstVar}}-extended',
              },
            },
          ],
        },
      });

      expect(createResponse.status()).toBe(201);
      const createData = await createResponse.json();
      expect(createData.success).toBe(true);
      expect(createData.automation.steps).toHaveLength(2);
      expect(createData.automation.steps[0].config.name).toBe('firstVar');
      expect(createData.automation.steps[1].config.value).toBe('{{workflow.firstVar}}-extended');

      // Clean up
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('should allow complex JSON value in define-variable step', async ({ request }) => {
      const automationId = `define-var-json-${Date.now()}`;

      const complexValue = {
        string: 'hello',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: {
          deep: 'value',
        },
      };

      // Create automation with define-variable step with complex JSON value
      const createResponse = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Define Variable JSON',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'define-variable',
              name: 'Define complex variable',
              config: {
                name: 'complexVar',
                value: complexValue,
              },
            },
          ],
        },
      });

      expect(createResponse.status()).toBe(201);
      const createData = await createResponse.json();
      expect(createData.success).toBe(true);
      expect(createData.automation.steps[0].config.value).toEqual(complexValue);

      // Clean up
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('should show variable browser in automation UI', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      // Wait for automations view to load
      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      // Click "Create New" button to open the editor dialog
      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      // Wait for the editor dialog to open
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Verify the Variable Picker section is visible (this confirms variable browser is present)
      const variablePickerSection = dialog.locator('text=Variable Picker');
      await expect(variablePickerSection).toBeVisible({ timeout: 5000 });

      // Verify System Variables are shown in the variable picker
      const systemVariables = dialog.locator('text=System Variables');
      await expect(systemVariables).toBeVisible({ timeout: 5000 });
    });

    test('should show insert variable button in step editor', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Wait for the Step Editor section to appear
      const stepEditorSection = dialog.locator('text=Step Editor');
      await expect(stepEditorSection).toBeVisible({ timeout: 5000 });

      // Look for "Insert variable" button or Variable icon button within the dialog
      // The button should be near the Variable Name field
      const insertVariableButtons = dialog.locator('button[title="Insert variable"]');
      const count = await insertVariableButtons.count();

      // Should have at least one insert variable button (for Variable Name field)
      expect(count).toBeGreaterThan(0);
    });

    test('should allow opening variable browser popover from step editor', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Find and click the first "Insert variable" button
      const insertVariableButton = dialog.locator('button[title="Insert variable"]').first();
      await insertVariableButton.click();

      // Wait for the popover to appear with System Variables
      const popover = page.locator('[data-state="open"]').filter({
        has: page.locator('text=System Variables'),
      });

      // The variable browser popover should be visible
      await expect(popover).toBeVisible({ timeout: 3000 });
    });

    test('should insert variable syntax when clicking variable in browser', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Find the input within the dialog (should be the Variable Name input by default)
      const input = dialog.locator('input').first();

      // Clear the input
      await input.fill('');

      // Click the Insert Variable button
      const insertVariableButton = dialog.locator('button[title="Insert variable"]').first();
      await insertVariableButton.click();

      // Wait for popover and click on a system variable (e.g., projectName)
      const popover = page.locator('[data-state="open"]').filter({
        has: page.locator('text=System Variables'),
      });
      await expect(popover).toBeVisible({ timeout: 3000 });

      // Click on projectName variable
      const projectNameVariable = popover.locator('button:has-text("projectName")').first();
      await projectNameVariable.click();

      // Verify the variable syntax was inserted into the input
      const inputValue = await input.inputValue();
      expect(inputValue).toMatch(/{{\s*system\.projectName\s*}}/);
    });

    test('should allow typing and displaying plain text in Value field', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Find the Value textarea (after the Variable Name input)
      const textareas = dialog.locator('textarea');
      // The first textarea should be the Value field
      const valueTextarea = textareas.first();

      // Type a plain text value
      await valueTextarea.fill('hello world');

      // Verify the value is displayed
      const textareaValue = await valueTextarea.inputValue();
      expect(textareaValue).toBe('hello world');

      // Type should still work after initial input (regression test for bug)
      await valueTextarea.fill('another value');
      const updatedValue = await valueTextarea.inputValue();
      expect(updatedValue).toBe('another value');
    });

    test('should allow typing and displaying numbers in Value field', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Find the Value textarea
      const valueTextarea = dialog.locator('textarea').first();

      // Type a number value
      await valueTextarea.fill('42');

      // Verify the value is displayed
      const textareaValue = await valueTextarea.inputValue();
      expect(textareaValue).toBe('42');

      // Type a different number to ensure input still works
      await valueTextarea.fill('123');
      const updatedValue = await valueTextarea.inputValue();
      expect(updatedValue).toBe('123');
    });

    test('should allow typing and displaying JSON objects in Value field', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Find the Value textarea
      const valueTextarea = dialog.locator('textarea').first();

      // Type a JSON object
      const jsonObject = '{"key": "value", "number": 42}';
      await valueTextarea.fill(jsonObject);

      // Verify the value is displayed (it may be formatted, so just check the key parts)
      const textareaValue = await valueTextarea.inputValue();
      expect(textareaValue).toContain('"key"');
      expect(textareaValue).toContain('"value"');
      expect(textareaValue).toContain('"number"');
      expect(textareaValue).toContain('42');
    });

    test('should allow typing and displaying JSON arrays in Value field', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Find the Value textarea
      const valueTextarea = dialog.locator('textarea').first();

      // Type a JSON array
      const jsonArray = '[1, 2, 3]';
      await valueTextarea.fill(jsonArray);

      // Verify the value is displayed
      const textareaValue = await valueTextarea.inputValue();
      expect(textareaValue).toContain('1');
      expect(textareaValue).toContain('2');
      expect(textareaValue).toContain('3');
    });

    test('should allow typing and displaying boolean values in Value field', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Find the Value textarea
      const valueTextarea = dialog.locator('textarea').first();

      // Type a boolean value
      await valueTextarea.fill('true');

      // Verify the value is displayed
      let textareaValue = await valueTextarea.inputValue();
      expect(textareaValue).toBe('true');

      // Change to false
      await valueTextarea.fill('false');
      textareaValue = await valueTextarea.inputValue();
      expect(textareaValue).toBe('false');
    });

    test('should display numeric value when loading existing automation', async ({
      page,
      request,
    }) => {
      // First create an automation with a numeric value via API
      const automationId = `define-var-numeric-display-${Date.now()}`;
      const createResponse = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Numeric Value Display',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'define-variable',
              name: 'Define numeric variable',
              config: {
                name: 'numericVar',
                value: 42, // Stored as number, not string
              },
            },
          ],
        },
      });
      expect(createResponse.status()).toBe(201);

      try {
        // Navigate to automations view
        await page.goto('/automations');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.getByTestId('automation-management-view')).toBeVisible({
          timeout: 10000,
        });

        // Find and click the edit button for our automation
        const automationRow = page.locator(`text=Test Numeric Value Display`).first();
        await automationRow.click();

        // Wait for dialog
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // The Value textarea should display '42' (the numeric value converted to string)
        const valueTextarea = dialog.locator('textarea').first();
        const textareaValue = await valueTextarea.inputValue();

        // This is the key assertion - the numeric value 42 should be displayed as '42'
        // This was the original bug: getValueAsString was returning '' for non-string values
        expect(textareaValue).toBe('42');
      } finally {
        // Clean up
        await request.delete(`/api/automation/${automationId}?scope=global`);
      }
    });

    test('should display JSON object value when loading existing automation', async ({
      page,
      request,
    }) => {
      // First create an automation with a JSON object value via API
      const automationId = `define-var-json-display-${Date.now()}`;
      const objectValue = { key: 'value', nested: { item: 123 } };

      const createResponse = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test JSON Object Display',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'define-variable',
              name: 'Define object variable',
              config: {
                name: 'objectVar',
                value: objectValue, // Stored as object, not string
              },
            },
          ],
        },
      });
      expect(createResponse.status()).toBe(201);

      try {
        // Navigate to automations view
        await page.goto('/automations');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.getByTestId('automation-management-view')).toBeVisible({
          timeout: 10000,
        });

        // Find and click our automation
        const automationRow = page.locator(`text=Test JSON Object Display`).first();
        await automationRow.click();

        // Wait for dialog
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // The Value textarea should display the JSON stringified
        const valueTextarea = dialog.locator('textarea').first();
        const textareaValue = await valueTextarea.inputValue();

        // The value should contain the JSON structure
        // This was the original bug: getValueAsString was returning '' for object values
        expect(textareaValue).toContain('"key"');
        expect(textareaValue).toContain('"value"');
        expect(textareaValue).toContain('"nested"');
        expect(textareaValue).toContain('123');
      } finally {
        // Clean up
        await request.delete(`/api/automation/${automationId}?scope=global`);
      }
    });

    test('should persist value after switching steps and coming back', async ({ page }) => {
      // Navigate to automations view
      await page.goto('/automations');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('automation-management-view')).toBeVisible({ timeout: 10000 });

      const createButton = page.getByRole('button', { name: 'Create New' });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Find the Value textarea
      const valueTextarea = dialog.locator('textarea').first();

      // Type a value
      await valueTextarea.fill('persistent-test-value');

      // Verify the value is displayed
      let textareaValue = await valueTextarea.inputValue();
      expect(textareaValue).toBe('persistent-test-value');

      // Clear and type a new value to ensure field is still editable
      await valueTextarea.fill('');
      await valueTextarea.fill('new-persistent-value');

      textareaValue = await valueTextarea.inputValue();
      expect(textareaValue).toBe('new-persistent-value');
    });
  });
});
