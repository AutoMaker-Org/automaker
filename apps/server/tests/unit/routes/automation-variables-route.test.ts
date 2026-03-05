import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'express';
import { createVariablesRoute } from '@/routes/automation/routes/variables.js';
import type { AutomationVariableService } from '@/services/automation-variable-service.js';
import { TEST_HTTP_PORTS, createTestHttpServer, type TestHttpServer } from '../../utils/helpers.js';

type TestServer = TestHttpServer;

async function createTestServer(router: Router): Promise<TestServer> {
  return createTestHttpServer(router, TEST_HTTP_PORTS.AUTOMATION_VARIABLES_ROUTE);
}

function createMockVariableService(): AutomationVariableService {
  return {
    getSystemVariables: vi.fn().mockResolvedValue({
      now: new Date().toISOString(),
      today: '2026-02-23',
      platform: 'linux',
      arch: 'x64',
      projectPath: null,
      projectName: null,
    }),
    getSystemVariableDescriptors: vi.fn().mockReturnValue([
      { name: 'now', scope: 'system', readOnly: true, description: 'Current ISO timestamp' },
      { name: 'today', scope: 'system', readOnly: true, description: 'Current date (YYYY-MM-DD)' },
    ]),
    loadProjectVariables: vi.fn().mockResolvedValue([]),
    getProjectVariables: vi.fn().mockResolvedValue({}),
    getProjectVariableDescriptors: vi.fn().mockResolvedValue([]),
    setProjectVariable: vi.fn(),
    deleteProjectVariable: vi.fn(),
    getWorkflowVariableDescriptors: vi.fn().mockReturnValue([]),
    getStepOutputDescriptors: vi.fn().mockReturnValue([]),
    listAvailableVariables: vi.fn().mockResolvedValue({
      groups: [{ name: 'system', label: 'System Variables', variables: [] }],
      total: 0,
    }),
    clearCache: vi.fn(),
  } as unknown as AutomationVariableService;
}

describe('createVariablesRoute', () => {
  let testServer: TestServer | null = null;
  let variableService: AutomationVariableService;

  beforeEach(() => {
    variableService = createMockVariableService();
  });

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  describe('GET /variables - list available variables', () => {
    it('returns variable groups with default options', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(`${testServer.url}/variables`);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.groups).toBeDefined();
      expect(vi.mocked(variableService.listAvailableVariables)).toHaveBeenCalledWith(
        expect.objectContaining({
          includeSystem: true,
          includeProject: true,
        })
      );
    });

    it('passes includeSystem=false when requested', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      await fetch(`${testServer.url}/variables?includeSystem=false`);

      expect(vi.mocked(variableService.listAvailableVariables)).toHaveBeenCalledWith(
        expect.objectContaining({ includeSystem: false })
      );
    });

    it('passes includeProject=false when requested', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      await fetch(`${testServer.url}/variables?includeProject=false`);

      expect(vi.mocked(variableService.listAvailableVariables)).toHaveBeenCalledWith(
        expect.objectContaining({ includeProject: false })
      );
    });

    it('parses workflowVariables JSON query parameter', async () => {
      const workflowVars = [{ name: 'myVar', defaultValue: 'default' }];
      testServer = await createTestServer(createVariablesRoute(variableService));
      await fetch(
        `${testServer.url}/variables?workflowVariables=${encodeURIComponent(JSON.stringify(workflowVars))}`
      );

      expect(vi.mocked(variableService.listAvailableVariables)).toHaveBeenCalledWith(
        expect.objectContaining({ workflowVariables: workflowVars })
      );
    });

    it('parses stepOutputs JSON query parameter', async () => {
      const stepOutputs = [{ stepId: 'step1', stepName: 'First Step' }];
      testServer = await createTestServer(createVariablesRoute(variableService));
      await fetch(
        `${testServer.url}/variables?stepOutputs=${encodeURIComponent(JSON.stringify(stepOutputs))}`
      );

      expect(vi.mocked(variableService.listAvailableVariables)).toHaveBeenCalledWith(
        expect.objectContaining({ stepOutputs })
      );
    });

    it('returns 400 for invalid workflowVariables JSON', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(`${testServer.url}/variables?workflowVariables=invalid{json`);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('workflowVariables');
    });

    it('returns 400 for invalid stepOutputs JSON', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(`${testServer.url}/variables?stepOutputs=invalid{json`);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('stepOutputs');
    });

    it('passes projectPath when provided', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      await fetch(`${testServer.url}/variables?projectPath=${encodeURIComponent('/tmp/project')}`);

      expect(vi.mocked(variableService.listAvailableVariables)).toHaveBeenCalledWith(
        expect.objectContaining({ projectPath: '/tmp/project' })
      );
    });
  });

  describe('GET /variables/project - get project variables', () => {
    it('returns 400 when projectPath is missing', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(`${testServer.url}/variables/project`);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('projectPath');
    });

    it('returns project variables when projectPath is provided', async () => {
      vi.mocked(variableService.loadProjectVariables).mockResolvedValue([
        {
          name: 'myVar',
          value: 'myValue',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);

      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(
        `${testServer.url}/variables/project?projectPath=${encodeURIComponent('/tmp/project')}`
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.variables).toHaveLength(1);
      expect(json.variables[0].name).toBe('myVar');
    });

    it('returns empty array when no project variables exist', async () => {
      vi.mocked(variableService.loadProjectVariables).mockResolvedValue([]);

      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(
        `${testServer.url}/variables/project?projectPath=${encodeURIComponent('/tmp/empty')}`
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.variables).toEqual([]);
    });
  });

  describe('GET /variables/system - get system variables', () => {
    it('returns system variables with descriptors', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(`${testServer.url}/variables/system`);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.variables).toBeDefined();
      expect(json.descriptors).toBeDefined();
      expect(Array.isArray(json.descriptors)).toBe(true);
    });

    it('passes projectPath to getSystemVariables', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      await fetch(
        `${testServer.url}/variables/system?projectPath=${encodeURIComponent('/tmp/project')}`
      );

      expect(vi.mocked(variableService.getSystemVariables)).toHaveBeenCalledWith('/tmp/project');
    });
  });

  describe('POST /variables/project - set project variable', () => {
    it('returns 400 when projectPath is missing', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(`${testServer.url}/variables/project`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'myVar', value: 'myValue' }),
      });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('projectPath');
    });

    it('returns 400 when name is missing', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(
        `${testServer.url}/variables/project?projectPath=${encodeURIComponent('/tmp/project')}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: 'myValue' }),
        }
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('name');
    });

    it('returns 400 when value is missing', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(
        `${testServer.url}/variables/project?projectPath=${encodeURIComponent('/tmp/project')}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'myVar' }),
        }
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('value');
    });

    it('sets a project variable and returns it', async () => {
      const savedVar = {
        name: 'newVar',
        value: 'newValue',
        description: 'A new variable',
        createdAt: '2026-02-23T00:00:00.000Z',
        updatedAt: '2026-02-23T00:00:00.000Z',
      };
      vi.mocked(variableService.setProjectVariable).mockResolvedValue(savedVar);

      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(
        `${testServer.url}/variables/project?projectPath=${encodeURIComponent('/tmp/project')}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'newVar',
            value: 'newValue',
            description: 'A new variable',
          }),
        }
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.variable).toEqual(savedVar);
    });

    it('accepts various JSON-serializable value types', async () => {
      vi.mocked(variableService.setProjectVariable).mockResolvedValue({
        name: 'numVar',
        value: 42,
        createdAt: '2026-02-23T00:00:00.000Z',
        updatedAt: '2026-02-23T00:00:00.000Z',
      });

      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(
        `${testServer.url}/variables/project?projectPath=${encodeURIComponent('/tmp/project')}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'numVar', value: 42 }),
        }
      );

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /variables/project/:name - delete project variable', () => {
    it('returns 400 when projectPath is missing', async () => {
      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(`${testServer.url}/variables/project/myVar`, {
        method: 'DELETE',
      });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('projectPath');
    });

    it('returns 200 when variable is deleted successfully', async () => {
      vi.mocked(variableService.deleteProjectVariable).mockResolvedValue(true);

      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(
        `${testServer.url}/variables/project/myVar?projectPath=${encodeURIComponent('/tmp/project')}`,
        { method: 'DELETE' }
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('returns 404 when variable does not exist', async () => {
      vi.mocked(variableService.deleteProjectVariable).mockResolvedValue(false);

      testServer = await createTestServer(createVariablesRoute(variableService));
      const response = await fetch(
        `${testServer.url}/variables/project/nonexistent?projectPath=${encodeURIComponent('/tmp/project')}`,
        { method: 'DELETE' }
      );
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error).toContain('not found');
    });

    it('calls deleteProjectVariable with correct args', async () => {
      vi.mocked(variableService.deleteProjectVariable).mockResolvedValue(true);

      testServer = await createTestServer(createVariablesRoute(variableService));
      await fetch(
        `${testServer.url}/variables/project/targetVar?projectPath=${encodeURIComponent('/tmp/my-project')}`,
        { method: 'DELETE' }
      );

      expect(vi.mocked(variableService.deleteProjectVariable)).toHaveBeenCalledWith(
        '/tmp/my-project',
        'targetVar'
      );
    });
  });
});
