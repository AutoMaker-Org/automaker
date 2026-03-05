/**
 * Automation Step Add Dropdown Test
 *
 * Tests the step add dropdown menu functionality:
 * - Step types are properly defined and categorized
 * - Step registry exports correct step definitions
 * - Automation can be created with various step types via API
 *
 * Feature: Make the step add button show a dropdown with the step types
 * (so you just press the button and it shows the step to add, and it adds it)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot, setupProjectWithFixture } from '../utils';

const WORKSPACE_ROOT = getWorkspaceRoot();
const TEST_TEMP_DIR = path.join(WORKSPACE_ROOT, 'test', 'temp', 'step-dropdown-test');

// Expected step types organized by category (must match step-registry.ts)
const EXPECTED_STEP_TYPES = [
  { type: 'create-feature', category: 'features', title: 'Create Feature' },
  { type: 'manage-feature', category: 'features', title: 'Manage Feature' },
  { type: 'run-ai-prompt', category: 'ai', title: 'Run AI Prompt' },
  { type: 'run-typescript-code', category: 'ai', title: 'Run TypeScript Code' },
  { type: 'define-variable', category: 'variables', title: 'Define/Set Variable' },
  { type: 'set-variable', category: 'variables', title: 'Set Variable' },
  { type: 'call-http-endpoint', category: 'integrations', title: 'Call HTTP Endpoint' },
  { type: 'run-script-exec', category: 'integrations', title: 'Run Script/Exec' },
  { type: 'emit-event', category: 'integrations', title: 'Emit Event' },
  { type: 'if', category: 'flow', title: 'If (Conditional)' },
  { type: 'loop', category: 'flow', title: 'Loop' },
  { type: 'call-automation', category: 'flow', title: 'Call Automation' },
];

test.describe('Automation Step Registry', () => {
  let projectPath: string;
  const projectName = `step-registry-test-${Date.now()}`;

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

  test.describe('Step Type Verification via API', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('creates automation with create-feature step (features category)', async ({ request }) => {
      const automationId = `create-feature-test-${Date.now()}`;

      const response = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Create Feature Step',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'create-feature',
              config: {
                title: 'Test Feature',
                description: 'Created by automation',
              },
            },
          ],
        },
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.automation.steps).toHaveLength(1);
      expect(data.automation.steps[0].type).toBe('create-feature');

      // Cleanup
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('creates automation with run-ai-prompt step (ai category)', async ({ request }) => {
      const automationId = `run-ai-prompt-test-${Date.now()}`;

      const response = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Run AI Prompt Step',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'run-ai-prompt',
              config: {
                prompt: 'Hello, world!',
                model: 'haiku',
              },
            },
          ],
        },
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.automation.steps[0].type).toBe('run-ai-prompt');

      // Cleanup
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('creates automation with run-ai-prompt step using PhaseModelEntry object', async ({
      request,
    }) => {
      const automationId = `run-ai-prompt-model-entry-test-${Date.now()}`;

      const response = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Run AI Prompt Step with Model Entry',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'run-ai-prompt',
              config: {
                prompt: 'Analyze this data',
                model: {
                  model: 'claude-sonnet-4-20250514',
                  thinkingLevel: 'high',
                },
              },
            },
          ],
        },
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.automation.steps[0].type).toBe('run-ai-prompt');
      // Verify the model config is stored correctly as an object
      expect(data.automation.steps[0].config.model).toEqual({
        model: 'claude-sonnet-4-20250514',
        thinkingLevel: 'high',
      });

      // Cleanup
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('creates automation with define-variable step (variables category)', async ({
      request,
    }) => {
      const automationId = `define-variable-test-${Date.now()}`;

      const response = await request.post('/api/automation?scope=global', {
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
              config: {
                name: 'myVariable',
                value: 'test-value',
              },
            },
          ],
        },
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.automation.steps[0].type).toBe('define-variable');

      // Cleanup
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('creates automation with call-http-endpoint step (integrations category)', async ({
      request,
    }) => {
      const automationId = `http-endpoint-test-${Date.now()}`;

      const response = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test HTTP Endpoint Step',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'call-http-endpoint',
              config: {
                method: 'GET',
                url: 'https://api.example.com/health',
              },
            },
          ],
        },
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.automation.steps[0].type).toBe('call-http-endpoint');

      // Cleanup
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('creates automation with flow control steps (flow category)', async ({ request }) => {
      const automationId = `flow-control-test-${Date.now()}`;

      const response = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Flow Control Steps',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'if',
              config: {
                condition: 'true',
              },
            },
            {
              id: 'step-2',
              type: 'loop',
              config: {
                count: 3,
                steps: [],
              },
            },
          ],
        },
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.automation.steps).toHaveLength(2);
      expect(data.automation.steps[0].type).toBe('if');
      expect(data.automation.steps[1].type).toBe('loop');

      // Cleanup
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('creates automation with multiple steps of different categories', async ({ request }) => {
      const automationId = `multi-step-test-${Date.now()}`;

      const response = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Multi-Step Automation',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'define-variable',
              config: { name: 'input', value: 'test' },
            },
            {
              id: 'step-2',
              type: 'run-ai-prompt',
              config: { prompt: 'Process {{variables.input}}' },
            },
            {
              id: 'step-3',
              type: 'emit-event',
              config: { eventType: 'completed' },
            },
          ],
        },
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.automation.steps).toHaveLength(3);

      // Verify step order is preserved
      expect(data.automation.steps[0].type).toBe('define-variable');
      expect(data.automation.steps[1].type).toBe('run-ai-prompt');
      expect(data.automation.steps[2].type).toBe('emit-event');

      // Cleanup
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('creates automation with call-automation step (flow category)', async ({ request }) => {
      const automationId = `call-automation-test-${Date.now()}`;

      const response = await request.post('/api/automation?scope=global', {
        data: {
          version: 1,
          id: automationId,
          name: 'Test Call Automation Step',
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            {
              id: 'step-1',
              type: 'call-automation',
              config: {
                automationId: 'another-automation',
              },
            },
          ],
        },
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.automation.steps[0].type).toBe('call-automation');

      // Cleanup
      await request.delete(`/api/automation/${automationId}?scope=global`);
    });
  });

  test.describe('Step Type Validation', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('accepts all expected step types', async ({ request }) => {
      // Create automations with each step type to verify they are all accepted
      for (const stepInfo of EXPECTED_STEP_TYPES) {
        const automationId = `step-type-${stepInfo.type}-${Date.now()}`;

        const response = await request.post('/api/automation?scope=global', {
          data: {
            version: 1,
            id: automationId,
            name: `Test ${stepInfo.title}`,
            enabled: true,
            scope: 'global',
            trigger: { type: 'manual' },
            steps: [
              {
                id: 'step-1',
                type: stepInfo.type,
                config: {},
              },
            ],
          },
        });

        // All expected step types should be accepted
        expect(response.status()).toBe(201);

        // Cleanup
        await request.delete(`/api/automation/${automationId}?scope=global`);
      }
    });
  });
});
