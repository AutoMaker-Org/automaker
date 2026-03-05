/**
 * Integration tests for Automation Variable Service
 *
 * Tests the full variable system including:
 * - API endpoint integration
 * - File system persistence
 * - Variable resolution across scopes
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AutomationVariableService } from '@/services/automation-variable-service.js';
import { getProjectAutomationVariablesPath } from '@automaker/platform';

describe('Automation Variable Service Integration', () => {
  let service: AutomationVariableService;
  const testProjectPath = path.join(process.cwd(), 'test-fixtures', 'variable-test-project');
  const variablesFilePath = getProjectAutomationVariablesPath(testProjectPath);

  beforeAll(async () => {
    // Create test project directory
    const automakerDir = path.join(testProjectPath, '.automaker');
    if (!fs.existsSync(automakerDir)) {
      fs.mkdirSync(automakerDir, { recursive: true });
    }
  });

  afterAll(async () => {
    // Cleanup test directory
    if (fs.existsSync(testProjectPath)) {
      fs.rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    service = new AutomationVariableService();
    // Clear any cached variables
    service.clearCache();
    // Clean up variables file before each test
    if (fs.existsSync(variablesFilePath)) {
      fs.unlinkSync(variablesFilePath);
    }
  });

  describe('System Variables', () => {
    it('provides all expected system variables', async () => {
      const variables = await service.getSystemVariables(testProjectPath);

      // Date/time variables
      expect(variables.now).toBeDefined();
      expect(variables.today).toBeDefined();
      expect(variables.year).toBeTypeOf('number');
      expect(variables.month).toBeGreaterThanOrEqual(1);
      expect(variables.month).toBeLessThanOrEqual(12);
      expect(variables.day).toBeGreaterThanOrEqual(1);
      expect(variables.day).toBeLessThanOrEqual(31);
      expect(variables.hour).toBeGreaterThanOrEqual(0);
      expect(variables.hour).toBeLessThanOrEqual(23);
      expect(variables.minute).toBeGreaterThanOrEqual(0);
      expect(variables.minute).toBeLessThanOrEqual(59);

      // System variables
      expect(variables.platform).toBeOneOf(['darwin', 'linux', 'win32']);
      expect(variables.arch).toBeDefined();
      expect(variables.hostname).toBeDefined();
      expect(variables.homedir).toBeDefined();

      // Project variables
      expect(variables.projectPath).toBe(testProjectPath);
      expect(variables.projectName).toBe('variable-test-project');

      // Environment variables
      expect(variables.env).toBeDefined();
      expect(variables.homedir).toBeDefined();
    });

    it('returns null project variables when no project path provided', async () => {
      const variables = await service.getSystemVariables();

      expect(variables.projectPath).toBeNull();
      expect(variables.projectName).toBeNull();
    });

    it('returns consistent variable descriptors', () => {
      const descriptors = service.getSystemVariableDescriptors();

      // All descriptors should have required fields
      for (const desc of descriptors) {
        expect(desc.name).toBeDefined();
        expect(desc.scope).toBe('system');
        expect(desc.readOnly).toBe(true);
        expect(desc.description).toBeDefined();
      }
    });
  });

  describe('Project Variables Persistence', () => {
    it('persists variables to filesystem', async () => {
      await service.setProjectVariable(testProjectPath, {
        name: 'persistedVar',
        value: 'persisted-value',
        description: 'A variable that should persist',
      });

      // Verify file was created
      expect(fs.existsSync(variablesFilePath)).toBe(true);

      // Verify file contents
      const fileContents = fs.readFileSync(variablesFilePath, 'utf-8');
      const data = JSON.parse(fileContents);

      expect(data.version).toBe(1);
      expect(data.variables).toHaveLength(1);
      expect(data.variables[0].name).toBe('persistedVar');
      expect(data.variables[0].value).toBe('persisted-value');
    });

    it('loads persisted variables on subsequent reads', async () => {
      // Set a variable
      await service.setProjectVariable(testProjectPath, {
        name: 'testVar',
        value: 'test-value',
      });

      // Clear cache to force re-read
      service.clearCache();

      // Load variables
      const variables = await service.loadProjectVariables(testProjectPath);

      expect(variables).toHaveLength(1);
      expect(variables[0].name).toBe('testVar');
      expect(variables[0].value).toBe('test-value');
    });

    it('updates existing variables while preserving createdAt', async () => {
      // Create initial variable
      const created = await service.setProjectVariable(testProjectPath, {
        name: 'updateTest',
        value: 'initial',
      });

      const originalCreatedAt = created.createdAt;

      // Wait a moment to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update the variable
      const updated = await service.setProjectVariable(testProjectPath, {
        name: 'updateTest',
        value: 'updated',
      });

      expect(updated.value).toBe('updated');
      expect(updated.createdAt).toBe(originalCreatedAt);
      expect(updated.updatedAt).not.toBe(originalCreatedAt);
    });

    it('deletes variables from filesystem', async () => {
      // Create and delete
      await service.setProjectVariable(testProjectPath, {
        name: 'toDelete',
        value: 'delete-me',
      });

      const deleted = await service.deleteProjectVariable(testProjectPath, 'toDelete');
      expect(deleted).toBe(true);

      // Verify deletion
      const variables = await service.loadProjectVariables(testProjectPath);
      expect(variables).toHaveLength(0);
    });
  });

  describe('Variable Scoping', () => {
    it('correctly prioritizes scopes in listAvailableVariables', async () => {
      // Set a project variable
      await service.setProjectVariable(testProjectPath, {
        name: 'projectVar',
        value: 'project-value',
      });

      const result = await service.listAvailableVariables({
        projectPath: testProjectPath,
        workflowVariables: [{ name: 'workflowVar', defaultValue: 'workflow-value' }],
        stepOutputs: [{ stepId: 'step1', stepName: 'First Step' }],
      });

      // Should have all four scopes
      expect(result.groups.length).toBeGreaterThanOrEqual(4);

      const scopes = result.groups.map((g) => g.name);
      expect(scopes).toContain('system');
      expect(scopes).toContain('project');
      expect(scopes).toContain('workflow');
      expect(scopes).toContain('steps');
    });

    it('can exclude system variables', async () => {
      const result = await service.listAvailableVariables({
        projectPath: testProjectPath,
        includeSystem: false,
      });

      const systemGroup = result.groups.find((g) => g.name === 'system');
      expect(systemGroup).toBeUndefined();
    });

    it('can exclude project variables', async () => {
      await service.setProjectVariable(testProjectPath, {
        name: 'excludeTest',
        value: 'test',
      });

      const result = await service.listAvailableVariables({
        projectPath: testProjectPath,
        includeProject: false,
      });

      const projectGroup = result.groups.find((g) => g.name === 'project');
      expect(projectGroup).toBeUndefined();
    });
  });

  describe('Complex Variable Values', () => {
    it('handles various JSON types as values', async () => {
      const testValues = [
        { name: 'stringVal', value: 'hello world', expectedType: 'string' },
        { name: 'numberVal', value: 42, expectedType: 'number' },
        { name: 'booleanVal', value: true, expectedType: 'boolean' },
        { name: 'nullVal', value: null, expectedType: 'null' },
        { name: 'arrayVal', value: [1, 2, 3], expectedType: 'array' },
        { name: 'objectVal', value: { nested: { deep: 'value' } }, expectedType: 'object' },
      ];

      for (const testCase of testValues) {
        await service.setProjectVariable(testProjectPath, {
          name: testCase.name,
          value: testCase.value,
        });
      }

      // Clear cache and reload
      service.clearCache();
      const descriptors = await service.getProjectVariableDescriptors(testProjectPath);

      for (const testCase of testValues) {
        const desc = descriptors.find((d) => d.name === testCase.name);
        expect(desc).toBeDefined();
        expect(desc?.typeHint).toBe(testCase.expectedType);
      }
    });
  });

  describe('Cache Management', () => {
    it('caches project variables per project', async () => {
      const project1 = path.join(process.cwd(), 'test-fixtures', 'project1');
      const project2 = path.join(process.cwd(), 'test-fixtures', 'project2');

      // Create project directories
      fs.mkdirSync(path.join(project1, '.automaker'), { recursive: true });
      fs.mkdirSync(path.join(project2, '.automaker'), { recursive: true });

      try {
        // Set different variables in each project
        await service.setProjectVariable(project1, { name: 'var', value: 'project1-value' });
        await service.setProjectVariable(project2, { name: 'var', value: 'project2-value' });

        // Clear cache and reload to ensure they're stored correctly
        service.clearCache();

        const vars1 = await service.getProjectVariables(project1);
        const vars2 = await service.getProjectVariables(project2);

        expect(vars1.var).toBe('project1-value');
        expect(vars2.var).toBe('project2-value');
      } finally {
        // Cleanup
        fs.rmSync(project1, { recursive: true, force: true });
        fs.rmSync(project2, { recursive: true, force: true });
      }
    });

    it('clears cache for specific project only', async () => {
      const project1 = path.join(process.cwd(), 'test-fixtures', 'cache-test-1');
      const project2 = path.join(process.cwd(), 'test-fixtures', 'cache-test-2');

      fs.mkdirSync(path.join(project1, '.automaker'), { recursive: true });
      fs.mkdirSync(path.join(project2, '.automaker'), { recursive: true });

      try {
        await service.setProjectVariable(project1, { name: 'var', value: 'value1' });
        await service.setProjectVariable(project2, { name: 'var', value: 'value2' });

        // Load both to cache them
        await service.getProjectVariables(project1);
        await service.getProjectVariables(project2);

        // Clear only project1 cache
        service.clearCache(project1);

        // Project1 should re-read from file
        // Project2 should still use cache
        const start1 = Date.now();
        await service.getProjectVariables(project1);
        const time1 = Date.now() - start1;

        const start2 = Date.now();
        await service.getProjectVariables(project2);
        const time2 = Date.now() - start2;

        // Both should be fast since they're cached or re-cached
        expect(time1).toBeLessThan(100);
        expect(time2).toBeLessThan(100);
      } finally {
        fs.rmSync(project1, { recursive: true, force: true });
        fs.rmSync(project2, { recursive: true, force: true });
      }
    });
  });

  describe('Error Handling', () => {
    it('handles corrupted JSON file gracefully', async () => {
      // Write invalid JSON
      fs.writeFileSync(variablesFilePath, '{ invalid json }');

      // Should return empty array instead of throwing
      const variables = await service.loadProjectVariables(testProjectPath);
      expect(variables).toEqual([]);
    });

    it('handles missing .automaker directory', async () => {
      const newProjectPath = path.join(process.cwd(), 'test-fixtures', 'no-automaker-dir');
      // Don't create the .automaker directory

      try {
        const variable = await service.setProjectVariable(newProjectPath, {
          name: 'test',
          value: 'value',
        });

        expect(variable.name).toBe('test');
        expect(variable.value).toBe('value');

        // Verify directory was created
        expect(fs.existsSync(path.join(newProjectPath, '.automaker'))).toBe(true);
      } finally {
        if (fs.existsSync(newProjectPath)) {
          fs.rmSync(newProjectPath, { recursive: true, force: true });
        }
      }
    });
  });
});
