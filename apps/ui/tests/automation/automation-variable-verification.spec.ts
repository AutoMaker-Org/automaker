/**
 * Automation Variable System Verification Test
 *
 * Tests the variable system API endpoints:
 * - List available variables (system, project)
 * - Get system variables with current values
 * - Create, update, delete project variables
 *
 * This verifies the backend variable API works correctly for automation workflows.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot, setupProjectWithFixture } from '../utils';

const WORKSPACE_ROOT = getWorkspaceRoot();
const TEST_TEMP_DIR = path.join(WORKSPACE_ROOT, 'test', 'temp', 'automation-variable-test');

test.describe('Automation Variable System', () => {
  let projectPath: string;
  const projectName = `variable-test-${Date.now()}`;

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

  test.describe('Variable API', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      // Setup the project fixture
      await setupProjectWithFixture(page, projectPath);
    });

    test('lists system variables', async ({ request }) => {
      const response = await request.get(
        `/api/automation/variables?projectPath=${encodeURIComponent(projectPath)}&includeSystem=true&includeProject=false`
      );

      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      // Verify structure
      expect(data).toHaveProperty('groups');
      expect(data).toHaveProperty('total');
      expect(data.total).toBeGreaterThan(0);

      // Find system group
      const systemGroup = data.groups.find((g: { name: string }) => g.name === 'system');
      expect(systemGroup).toBeDefined();
      expect(systemGroup.label).toBe('System Variables');
      expect(systemGroup.variables.length).toBeGreaterThan(0);

      // Check for essential system variables
      const nowVar = systemGroup.variables.find((v: { name: string }) => v.name === 'now');
      expect(nowVar).toBeDefined();
      expect(nowVar.readOnly).toBe(true);
      expect(nowVar.scope).toBe('system');
    });

    test('gets system variables with values', async ({ request }) => {
      const response = await request.get(
        `/api/automation/variables/system?projectPath=${encodeURIComponent(projectPath)}`
      );

      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      expect(data).toHaveProperty('variables');
      expect(data).toHaveProperty('descriptors');

      // Verify system variables have actual values
      expect(data.variables.now).toBeDefined();
      expect(typeof data.variables.now).toBe('string');
      expect(data.variables.platform).toBe(process.platform);
      expect(data.variables.projectPath).toBe(projectPath);
      expect(data.variables.projectName).toBe(projectName);
    });

    test('creates, updates, and deletes project variables', async ({ request }) => {
      // Create a project variable
      const createResponse = await request.post('/api/automation/variables/project', {
        data: {
          name: 'testApiEndpoint',
          value: 'https://api.example.com',
          description: 'Test API endpoint',
        },
        params: { projectPath },
      });

      expect(createResponse.ok()).toBeTruthy();
      const createData = await createResponse.json();
      expect(createData.success).toBe(true);
      expect(createData.variable.name).toBe('testApiEndpoint');
      expect(createData.variable.value).toBe('https://api.example.com');
      expect(createData.variable.description).toBe('Test API endpoint');
      expect(createData.variable.createdAt).toBeDefined();

      // Update the project variable
      const updateResponse = await request.post('/api/automation/variables/project', {
        data: {
          name: 'testApiEndpoint',
          value: 'https://updated-api.example.com',
          description: 'Updated API endpoint',
        },
        params: { projectPath },
      });

      expect(updateResponse.ok()).toBeTruthy();
      const updateData = await updateResponse.json();
      expect(updateData.success).toBe(true);
      expect(updateData.variable.value).toBe('https://updated-api.example.com');
      expect(updateData.variable.description).toBe('Updated API endpoint');
      // createdAt should remain the same
      expect(updateData.variable.createdAt).toBe(createData.variable.createdAt);

      // Get project variables to verify
      const getResponse = await request.get(
        `/api/automation/variables/project?projectPath=${encodeURIComponent(projectPath)}`
      );

      expect(getResponse.ok()).toBeTruthy();
      const getData = await getResponse.json();
      expect(getData.variables).toHaveLength(1);
      expect(getData.variables[0].name).toBe('testApiEndpoint');

      // Delete the project variable
      const deleteResponse = await request.delete(
        `/api/automation/variables/project/testApiEndpoint?projectPath=${encodeURIComponent(projectPath)}`
      );

      expect(deleteResponse.ok()).toBeTruthy();
      const deleteData = await deleteResponse.json();
      expect(deleteData.success).toBe(true);

      // Verify deletion
      const verifyResponse = await request.get(
        `/api/automation/variables/project?projectPath=${encodeURIComponent(projectPath)}`
      );

      expect(verifyResponse.ok()).toBeTruthy();
      const verifyData = await verifyResponse.json();
      expect(verifyData.variables).toHaveLength(0);
    });

    test('handles complex variable values', async ({ request }) => {
      // Test with different types of values
      const testCases = [
        { name: 'stringVar', value: 'hello world' },
        { name: 'numberVar', value: 42 },
        { name: 'booleanVar', value: true },
        { name: 'arrayVar', value: [1, 2, 3] },
        { name: 'objectVar', value: { key: 'value', nested: { a: 1 } } },
      ];

      for (const testCase of testCases) {
        const response = await request.post('/api/automation/variables/project', {
          data: testCase,
          params: { projectPath },
        });

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.variable.value).toEqual(testCase.value);
      }

      // Verify all variables exist
      const getResponse = await request.get(
        `/api/automation/variables/project?projectPath=${encodeURIComponent(projectPath)}`
      );

      expect(getResponse.ok()).toBeTruthy();
      const getData = await getResponse.json();
      expect(getData.variables.length).toBe(testCases.length);

      // Cleanup
      for (const testCase of testCases) {
        await request.delete(
          `/api/automation/variables/project/${testCase.name}?projectPath=${encodeURIComponent(projectPath)}`
        );
      }
    });

    test('lists variables including project scope', async ({ request }) => {
      // Create a project variable first
      await request.post('/api/automation/variables/project', {
        data: { name: 'listTestVar', value: 'test-value' },
        params: { projectPath },
      });

      // List all variables
      const response = await request.get(
        `/api/automation/variables?projectPath=${encodeURIComponent(projectPath)}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // Should have both system and project groups
      expect(data.groups.length).toBeGreaterThanOrEqual(2);

      const systemGroup = data.groups.find((g: { name: string }) => g.name === 'system');
      const projectGroup = data.groups.find((g: { name: string }) => g.name === 'project');

      expect(systemGroup).toBeDefined();
      expect(projectGroup).toBeDefined();

      // Project group should have our variable
      const testVar = projectGroup.variables.find(
        (v: { name: string }) => v.name === 'listTestVar'
      );
      expect(testVar).toBeDefined();
      expect(testVar.readOnly).toBe(false);

      // Cleanup
      await request.delete(
        `/api/automation/variables/project/listTestVar?projectPath=${encodeURIComponent(projectPath)}`
      );
    });

    test('includes workflow variables when provided', async ({ request }) => {
      const workflowVariables = [
        { name: 'customInput', defaultValue: 'default', description: 'User input' },
        { name: 'iteration', defaultValue: 0 },
      ];

      const response = await request.get('/api/automation/variables', {
        params: {
          projectPath,
          includeSystem: 'false',
          includeProject: 'false',
          workflowVariables: JSON.stringify(workflowVariables),
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      const workflowGroup = data.groups.find((g: { name: string }) => g.name === 'workflow');
      expect(workflowGroup).toBeDefined();
      expect(workflowGroup.variables).toHaveLength(2);

      const customInputVar = workflowGroup.variables.find(
        (v: { name: string }) => v.name === 'customInput'
      );
      expect(customInputVar).toBeDefined();
      expect(customInputVar.description).toBe('User input');
      expect(customInputVar.readOnly).toBe(false);
    });

    test('includes step outputs when provided', async ({ request }) => {
      const stepOutputs = [{ stepId: 'step1', stepName: 'Fetch Data' }, { stepId: 'step2' }];

      const response = await request.get('/api/automation/variables', {
        params: {
          projectPath,
          includeSystem: 'false',
          includeProject: 'false',
          stepOutputs: JSON.stringify(stepOutputs),
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      const stepsGroup = data.groups.find((g: { name: string }) => g.name === 'steps');
      expect(stepsGroup).toBeDefined();
      expect(stepsGroup.variables).toHaveLength(2);

      const step1Var = stepsGroup.variables.find((v: { name: string }) => v.name === 'step1');
      expect(step1Var).toBeDefined();
      expect(step1Var.description).toBe('Output from step "Fetch Data"');
      expect(step1Var.readOnly).toBe(true);
      expect(step1Var.example).toBe('{{steps.step1.output}}');
    });

    test('validates required fields for project variables', async ({ request }) => {
      // Missing name
      const noNameResponse = await request.post('/api/automation/variables/project', {
        data: { value: 'test' },
        params: { projectPath },
      });
      expect(noNameResponse.status()).toBe(400);

      // Missing value
      const noValueResponse = await request.post('/api/automation/variables/project', {
        data: { name: 'test' },
        params: { projectPath },
      });
      expect(noValueResponse.status()).toBe(400);

      // Missing projectPath
      const noProjectResponse = await request.post('/api/automation/variables/project', {
        data: { name: 'test', value: 'test' },
      });
      expect(noProjectResponse.status()).toBe(400);
    });

    test('returns 404 for non-existent variable deletion', async ({ request }) => {
      const response = await request.delete(
        `/api/automation/variables/project/nonExistentVar?projectPath=${encodeURIComponent(projectPath)}`
      );

      expect(response.status()).toBe(404);
    });
  });
});
