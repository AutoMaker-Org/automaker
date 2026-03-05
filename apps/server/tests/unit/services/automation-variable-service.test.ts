import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  AutomationVariableService,
  getAutomationVariableService,
} from '@/services/automation-variable-service.js';
import type { WorkflowVariableDefinition } from '@automaker/types';

// Mock the secure-fs module with named exports
vi.mock('@/lib/secure-fs.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
}));

// Mock the platform module
vi.mock('@automaker/platform', () => ({
  getAutomakerDir: vi.fn((projectPath: string) => `${projectPath}/.automaker`),
  getProjectAutomationVariablesPath: vi.fn(
    (projectPath: string) => `${projectPath}/.automaker/automation-variables.json`
  ),
}));

import * as secureFs from '@/lib/secure-fs.js';

describe('AutomationVariableService', () => {
  let service: AutomationVariableService;

  beforeEach(() => {
    service = new AutomationVariableService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    service.clearCache();
  });

  describe('System Variables', () => {
    it('provides system variable descriptors', () => {
      const descriptors = service.getSystemVariableDescriptors();

      expect(descriptors.length).toBeGreaterThan(0);

      // Check for essential system variables
      const nowVar = descriptors.find((d) => d.name === 'now');
      expect(nowVar).toBeDefined();
      expect(nowVar?.scope).toBe('system');
      expect(nowVar?.readOnly).toBe(true);

      const todayVar = descriptors.find((d) => d.name === 'today');
      expect(todayVar).toBeDefined();

      const platformVar = descriptors.find((d) => d.name === 'platform');
      expect(platformVar).toBeDefined();

      const projectPathVar = descriptors.find((d) => d.name === 'projectPath');
      expect(projectPathVar).toBeDefined();
    });

    it('returns system variable values', async () => {
      const variables = await service.getSystemVariables('/tmp/project');

      expect(variables.now).toBeDefined();
      expect(typeof variables.now).toBe('string');
      expect(variables.platform).toBe(process.platform);
      expect(variables.arch).toBe(process.arch);
      expect(variables.projectPath).toBe('/tmp/project');
      expect(variables.projectName).toBe('project');
    });

    it('returns null project-related variables when no project path', async () => {
      const variables = await service.getSystemVariables();

      expect(variables.projectPath).toBeNull();
      expect(variables.projectName).toBeNull();
    });

    it('returns date/time variables correctly', async () => {
      const variables = await service.getSystemVariables();

      const now = new Date();

      expect(variables.year).toBe(now.getFullYear());
      expect(variables.month).toBe(now.getMonth() + 1);
      expect(variables.day).toBe(now.getDate());
      expect(variables.hour).toBe(now.getHours());
      expect(variables.minute).toBe(now.getMinutes());

      // Check ISO format
      expect((variables.now as string).endsWith('Z')).toBe(true);
      expect(variables.today as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Project Variables', () => {
    const projectPath = '/tmp/test-project';

    it('returns empty array when no project variables exist', async () => {
      vi.mocked(secureFs.readFile).mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      const variables = await service.loadProjectVariables(projectPath);

      expect(variables).toEqual([]);
    });

    it('loads and parses project variables from file', async () => {
      const mockData = {
        version: 1,
        variables: [
          {
            name: 'apiEndpoint',
            value: 'https://api.example.com',
            description: 'API base URL',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValueOnce(JSON.stringify(mockData));

      const variables = await service.loadProjectVariables(projectPath);

      expect(variables).toHaveLength(1);
      expect(variables[0].name).toBe('apiEndpoint');
      expect(variables[0].value).toBe('https://api.example.com');
    });

    it('caches project variables', async () => {
      const mockData = {
        version: 1,
        variables: [{ name: 'test', value: 'value', createdAt: '', updatedAt: '' }],
      };

      vi.mocked(secureFs.readFile).mockResolvedValueOnce(JSON.stringify(mockData));

      await service.loadProjectVariables(projectPath);
      await service.loadProjectVariables(projectPath);

      expect(secureFs.readFile).toHaveBeenCalledTimes(1);
    });

    it('sets a new project variable', async () => {
      vi.mocked(secureFs.readFile).mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );
      vi.mocked(secureFs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValueOnce(undefined);

      const variable = await service.setProjectVariable(projectPath, {
        name: 'newVar',
        value: 'newValue',
        description: 'A new variable',
      });

      expect(variable.name).toBe('newVar');
      expect(variable.value).toBe('newValue');
      expect(variable.description).toBe('A new variable');
      expect(variable.createdAt).toBeDefined();
      expect(variable.updatedAt).toBeDefined();

      expect(secureFs.writeFile).toHaveBeenCalled();
    });

    it('updates an existing project variable', async () => {
      const existingData = {
        version: 1,
        variables: [
          {
            name: 'existingVar',
            value: 'oldValue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValueOnce(JSON.stringify(existingData));
      vi.mocked(secureFs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(secureFs.writeFile).mockResolvedValueOnce(undefined);

      const variable = await service.setProjectVariable(projectPath, {
        name: 'existingVar',
        value: 'updatedValue',
      });

      expect(variable.value).toBe('updatedValue');
      expect(variable.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(variable.updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
    });

    it('deletes a project variable', async () => {
      const existingData = {
        version: 1,
        variables: [
          {
            name: 'toDelete',
            value: 'value',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValueOnce(JSON.stringify(existingData));
      vi.mocked(secureFs.writeFile).mockResolvedValueOnce(undefined);

      const deleted = await service.deleteProjectVariable(projectPath, 'toDelete');

      expect(deleted).toBe(true);
    });

    it('returns false when deleting non-existent variable', async () => {
      vi.mocked(secureFs.readFile).mockResolvedValueOnce(
        JSON.stringify({ version: 1, variables: [] })
      );

      const deleted = await service.deleteProjectVariable(projectPath, 'nonExistent');

      expect(deleted).toBe(false);
    });

    it('returns project variables as key-value record', async () => {
      const mockData = {
        version: 1,
        variables: [
          { name: 'var1', value: 'value1', createdAt: '', updatedAt: '' },
          { name: 'var2', value: 42, createdAt: '', updatedAt: '' },
        ],
      };

      vi.mocked(secureFs.readFile).mockResolvedValueOnce(JSON.stringify(mockData));

      const record = await service.getProjectVariables(projectPath);

      expect(record.var1).toBe('value1');
      expect(record.var2).toBe(42);
    });
  });

  describe('Workflow Variables', () => {
    it('returns descriptors for workflow variables', () => {
      const workflowVars: WorkflowVariableDefinition[] = [
        { name: 'userInput', defaultValue: 'default', description: 'User input' },
        { name: 'count', defaultValue: 0 },
      ];

      const descriptors = service.getWorkflowVariableDescriptors(workflowVars);

      expect(descriptors).toHaveLength(2);
      expect(descriptors[0].name).toBe('userInput');
      expect(descriptors[0].scope).toBe('workflow');
      expect(descriptors[0].readOnly).toBe(false);
      expect(descriptors[0].example).toBe('"default"');
    });

    it('returns empty array for no workflow variables', () => {
      const descriptors = service.getWorkflowVariableDescriptors();

      expect(descriptors).toEqual([]);
    });
  });

  describe('Step Outputs', () => {
    it('returns descriptors for step outputs', () => {
      const stepOutputs = [{ stepId: 'step1', stepName: 'Fetch Data' }, { stepId: 'step2' }];

      const descriptors = service.getStepOutputDescriptors(stepOutputs);

      expect(descriptors).toHaveLength(2);
      expect(descriptors[0].name).toBe('step1.output');
      expect(descriptors[0].description).toBe('Output from step "Fetch Data"');
      expect(descriptors[0].readOnly).toBe(true);
      expect(descriptors[0].example).toBe('{{steps.step1.output}}');

      expect(descriptors[1].description).toBe('Output from step step2');
    });

    it('returns empty array for no step outputs', () => {
      const descriptors = service.getStepOutputDescriptors();

      expect(descriptors).toEqual([]);
    });
  });

  describe('List Available Variables', () => {
    it('lists all variable groups', async () => {
      vi.mocked(secureFs.readFile).mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      const result = await service.listAvailableVariables({
        projectPath: '/tmp/project',
      });

      expect(result.groups.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);

      const systemGroup = result.groups.find((g) => g.name === 'system');
      expect(systemGroup).toBeDefined();
      expect(systemGroup?.label).toBe('System Variables');
    });

    it('includes workflow variables when provided', async () => {
      const result = await service.listAvailableVariables({
        workflowVariables: [{ name: 'customVar' }],
      });

      const workflowGroup = result.groups.find((g) => g.name === 'workflow');
      expect(workflowGroup).toBeDefined();
      expect(workflowGroup?.variables).toHaveLength(1);
    });

    it('includes step outputs when provided', async () => {
      const result = await service.listAvailableVariables({
        stepOutputs: [{ stepId: 'step1' }],
      });

      const stepsGroup = result.groups.find((g) => g.name === 'steps');
      expect(stepsGroup).toBeDefined();
      expect(stepsGroup?.variables).toHaveLength(1);
    });

    it('can exclude system variables', async () => {
      const result = await service.listAvailableVariables({
        includeSystem: false,
      });

      const systemGroup = result.groups.find((g) => g.name === 'system');
      expect(systemGroup).toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    it('clears cache for specific project', async () => {
      const mockData = {
        version: 1,
        variables: [{ name: 'test', value: 'value', createdAt: '', updatedAt: '' }],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(mockData));

      await service.loadProjectVariables('/project1');
      await service.loadProjectVariables('/project2');

      service.clearCache('/project1');

      // Should read again for project1
      await service.loadProjectVariables('/project1');

      // Should not read again for project2 (still cached)
      await service.loadProjectVariables('/project2');

      expect(secureFs.readFile).toHaveBeenCalledTimes(3);
    });

    it('clears all caches', async () => {
      const mockData = {
        version: 1,
        variables: [{ name: 'test', value: 'value', createdAt: '', updatedAt: '' }],
      };

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(mockData));

      await service.loadProjectVariables('/project1');
      await service.loadProjectVariables('/project2');

      service.clearCache();

      // Should read again for both projects
      await service.loadProjectVariables('/project1');
      await service.loadProjectVariables('/project2');

      expect(secureFs.readFile).toHaveBeenCalledTimes(4);
    });
  });

  describe('Type Inference', () => {
    it('infers type hints from values', async () => {
      vi.mocked(secureFs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          version: 1,
          variables: [
            { name: 'str', value: 'text', createdAt: '', updatedAt: '' },
            { name: 'num', value: 42, createdAt: '', updatedAt: '' },
            { name: 'bool', value: true, createdAt: '', updatedAt: '' },
            { name: 'arr', value: [1, 2, 3], createdAt: '', updatedAt: '' },
            { name: 'obj', value: { key: 'value' }, createdAt: '', updatedAt: '' },
            { name: 'null', value: null, createdAt: '', updatedAt: '' },
          ],
        })
      );

      const descriptors = await service.getProjectVariableDescriptors('/tmp/project');

      expect(descriptors.find((d) => d.name === 'str')?.typeHint).toBe('string');
      expect(descriptors.find((d) => d.name === 'num')?.typeHint).toBe('number');
      expect(descriptors.find((d) => d.name === 'bool')?.typeHint).toBe('boolean');
      expect(descriptors.find((d) => d.name === 'arr')?.typeHint).toBe('array');
      expect(descriptors.find((d) => d.name === 'obj')?.typeHint).toBe('object');
      expect(descriptors.find((d) => d.name === 'null')?.typeHint).toBe('null');
    });
  });
});

describe('getAutomationVariableService singleton', () => {
  it('returns the same instance', () => {
    const instance1 = getAutomationVariableService();
    const instance2 = getAutomationVariableService();

    expect(instance1).toBe(instance2);
  });
});
