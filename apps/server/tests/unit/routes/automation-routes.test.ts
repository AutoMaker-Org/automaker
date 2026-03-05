import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutomationDefinition } from '@automaker/types';
import { createListRoute } from '@/routes/automation/routes/list.js';
import { createGetRoute } from '@/routes/automation/routes/get.js';
import { createTriggerRoute } from '@/routes/automation/routes/trigger.js';
import { createWebhookRoute } from '@/routes/automation/routes/webhook.js';
import { createScheduleRoute } from '@/routes/automation/routes/schedule.js';
import { createRunsRoute } from '@/routes/automation/routes/runs.js';
import type { Router } from 'express';
import { TEST_HTTP_PORTS, createTestHttpServer, type TestHttpServer } from '../../utils/helpers.js';

type TestServer = TestHttpServer;

async function createTestServer(router: Router): Promise<TestServer> {
  return createTestHttpServer(router, TEST_HTTP_PORTS.AUTOMATION_ROUTES);
}

describe('automation routes', () => {
  let testServer: TestServer | null = null;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  describe('createListRoute', () => {
    it('lists project and global automations when projectPath is provided without scope', async () => {
      const projectAutomation: AutomationDefinition = {
        version: 1,
        id: 'project-auto',
        name: 'Project automation',
        scope: 'project',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };
      const globalAutomation: AutomationDefinition = {
        version: 1,
        id: 'global-auto',
        name: 'Global automation',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      const store = {
        listAutomations: vi
          .fn()
          .mockResolvedValueOnce([projectAutomation])
          .mockResolvedValueOnce([globalAutomation]),
      };

      testServer = await createTestServer(createListRoute(store as any));
      const response = await fetch(
        `${testServer.url}/list?projectPath=${encodeURIComponent('/tmp/project')}`
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.automations).toEqual([projectAutomation, globalAutomation]);
      expect(store.listAutomations).toHaveBeenNthCalledWith(1, {
        scope: 'project',
        projectPath: '/tmp/project',
      });
      expect(store.listAutomations).toHaveBeenNthCalledWith(2, {
        scope: 'global',
      });
    });

    it('falls back to global scope when projectPath is blank', async () => {
      const globalAutomation: AutomationDefinition = {
        version: 1,
        id: 'global-auto',
        name: 'Global automation',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      const store = {
        listAutomations: vi.fn().mockResolvedValue([globalAutomation]),
      };

      testServer = await createTestServer(createListRoute(store as any));
      const response = await fetch(
        `${testServer.url}/list?projectPath=${encodeURIComponent('   ')}`
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.automations).toEqual([globalAutomation]);
      expect(store.listAutomations).toHaveBeenCalledWith({ scope: 'global' });
      expect(store.listAutomations).toHaveBeenCalledTimes(1);
    });
  });

  describe('createGetRoute', () => {
    it('returns 404 when automation is not found', async () => {
      const store = {
        loadAutomationById: vi.fn().mockResolvedValue(null),
      };

      testServer = await createTestServer(createGetRoute(store as any));
      const response = await fetch(`${testServer.url}/missing-id`);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json).toEqual({
        success: false,
        error: 'Automation not found',
      });
    });
  });

  describe('createTriggerRoute', () => {
    it('triggers automation and injects manual metadata', async () => {
      const scheduler = {
        triggerAutomation: vi.fn().mockResolvedValue({
          success: true,
          scheduledRunId: 'run_123',
        }),
      };

      testServer = await createTestServer(createTriggerRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/auto-1/trigger?scope=project`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectPath: '/tmp/project',
          variables: { x: 1 },
          triggerMetadata: { source: 'test' },
        }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        runId: 'run_123',
      });

      const call = vi.mocked(scheduler.triggerAutomation).mock.calls[0];
      expect(call[0]).toBe('auto-1');
      expect(call[1].scope).toBe('project');
      expect(call[1].projectPath).toBe('/tmp/project');
      expect(call[1].variables).toEqual({ x: 1 });
      expect(call[1].triggerMetadata).toEqual(
        expect.objectContaining({
          source: 'test',
          triggeredBy: 'manual',
          triggeredAt: expect.any(String),
        })
      );
    });
  });

  describe('createWebhookRoute', () => {
    it('returns 401 when webhook token is invalid', async () => {
      const scheduler = {
        handleWebhookTrigger: vi.fn().mockResolvedValue({
          success: false,
          error: 'Invalid webhook token',
          errorCode: 'INVALID_TOKEN',
        }),
      };

      testServer = await createTestServer(createWebhookRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/webhook/auto-1`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-automation-token': 'wrong',
        },
        body: JSON.stringify({ payload: true }),
      });
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json).toEqual({
        success: false,
        error: 'Invalid webhook token',
      });
      expect(scheduler.handleWebhookTrigger).toHaveBeenCalledWith(
        'auto-1',
        expect.objectContaining({
          payload: { payload: true },
        }),
        'wrong'
      );
    });

    it('returns 401 for other auth-like webhook errors', async () => {
      const scheduler = {
        handleWebhookTrigger: vi.fn().mockResolvedValue({
          success: false,
          error: 'Webhook secret mismatch',
          errorCode: 'INVALID_TOKEN',
        }),
      };

      testServer = await createTestServer(createWebhookRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/webhook/auto-1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: true }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('createScheduleRoute', () => {
    it('returns scheduled runs and supports filtering by automationId', async () => {
      const scheduler = {
        getScheduledRuns: vi.fn().mockReturnValue([{ id: 'sr_1' }]),
        getScheduledRun: vi.fn(),
        cancelScheduledRun: vi.fn(),
      };

      testServer = await createTestServer(createScheduleRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/scheduled?automationId=auto-1`);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        scheduledRuns: [{ id: 'sr_1' }],
      });
      expect(scheduler.getScheduledRuns).toHaveBeenCalledWith('auto-1');
    });
  });

  describe('createRunsRoute', () => {
    it('returns 404 for unknown run', async () => {
      const engine = {
        listRuns: vi.fn(),
        getRun: vi.fn().mockReturnValue(null),
      };

      testServer = await createTestServer(createRunsRoute(engine as any));
      const response = await fetch(`${testServer.url}/runs/run_missing`);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json).toEqual({
        success: false,
        error: 'Run not found',
      });
    });
  });

  describe('createWebhookRoute additional cases', () => {
    it('handles GET request for webhook trigger', async () => {
      const scheduler = {
        handleWebhookTrigger: vi.fn().mockResolvedValue({
          success: true,
          scheduledRunId: 'run_get',
        }),
      };

      testServer = await createTestServer(createWebhookRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/webhook/auto-get?event=test&data=foo`, {
        method: 'GET',
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(scheduler.handleWebhookTrigger).toHaveBeenCalledWith(
        'auto-get',
        expect.objectContaining({
          method: 'GET',
        }),
        undefined
      );
    });

    it('handles PUT request for webhook trigger', async () => {
      const scheduler = {
        handleWebhookTrigger: vi.fn().mockResolvedValue({
          success: true,
          scheduledRunId: 'run_put',
        }),
      };

      testServer = await createTestServer(createWebhookRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/webhook/auto-put`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ update: true }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('handles PATCH request for webhook trigger', async () => {
      const scheduler = {
        handleWebhookTrigger: vi.fn().mockResolvedValue({
          success: true,
          scheduledRunId: 'run_patch',
        }),
      };

      testServer = await createTestServer(createWebhookRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/webhook/auto-patch`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patch: true }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('returns 400 when automationId is missing', async () => {
      const scheduler = {
        handleWebhookTrigger: vi.fn(),
      };

      testServer = await createTestServer(createWebhookRoute(scheduler as any));
      // Using an empty string for automationId
      const response = await fetch(`${testServer.url}/webhook/%20`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('automationId');
    });

    it('returns 400 for non-auth webhook errors', async () => {
      const scheduler = {
        handleWebhookTrigger: vi.fn().mockResolvedValue({
          success: false,
          error: 'Automation is disabled',
        }),
      };

      testServer = await createTestServer(createWebhookRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/webhook/disabled-auto`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('disabled');
    });

    it('passes headers in payload to scheduler', async () => {
      const scheduler = {
        handleWebhookTrigger: vi.fn().mockResolvedValue({
          success: true,
          scheduledRunId: 'run_headers',
        }),
      };

      testServer = await createTestServer(createWebhookRoute(scheduler as any));
      await fetch(`${testServer.url}/webhook/auto-headers`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'TestAgent/1.0',
          'x-automation-token': 'test-token',
        },
        body: JSON.stringify({ test: true }),
      });

      expect(scheduler.handleWebhookTrigger).toHaveBeenCalledWith(
        'auto-headers',
        expect.objectContaining({
          payload: { test: true },
          headers: {
            'content-type': 'application/json',
            'user-agent': 'TestAgent/1.0',
          },
        }),
        'test-token'
      );
    });
  });

  describe('createScheduleRoute additional cases', () => {
    it('returns all scheduled runs without filter', async () => {
      const scheduler = {
        getScheduledRuns: vi.fn().mockReturnValue([
          { id: 'sr_1', automationId: 'auto-a' },
          { id: 'sr_2', automationId: 'auto-b' },
        ]),
        getScheduledRun: vi.fn(),
        cancelScheduledRun: vi.fn(),
      };

      testServer = await createTestServer(createScheduleRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/scheduled`);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.scheduledRuns).toHaveLength(2);
      expect(scheduler.getScheduledRuns).toHaveBeenCalledWith(undefined);
    });

    it('returns specific scheduled run by ID', async () => {
      const scheduler = {
        getScheduledRuns: vi.fn().mockReturnValue([]),
        getScheduledRun: vi.fn().mockReturnValue({
          id: 'sr_specific',
          automationId: 'auto-1',
          status: 'scheduled',
        }),
        cancelScheduledRun: vi.fn(),
      };

      testServer = await createTestServer(createScheduleRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/scheduled/sr_specific`);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.scheduledRun.id).toBe('sr_specific');
    });

    it('returns 404 for non-existent scheduled run', async () => {
      const scheduler = {
        getScheduledRuns: vi.fn().mockReturnValue([]),
        getScheduledRun: vi.fn().mockReturnValue(null),
        cancelScheduledRun: vi.fn(),
      };

      testServer = await createTestServer(createScheduleRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/scheduled/sr_missing`);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('not found');
    });

    it('cancels scheduled run successfully', async () => {
      const scheduler = {
        getScheduledRuns: vi.fn().mockReturnValue([]),
        getScheduledRun: vi.fn(),
        cancelScheduledRun: vi.fn().mockResolvedValue({
          success: true,
          scheduledRunId: 'sr_cancel',
        }),
      };

      testServer = await createTestServer(createScheduleRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/scheduled/sr_cancel`, {
        method: 'DELETE',
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(scheduler.cancelScheduledRun).toHaveBeenCalledWith('sr_cancel');
    });
  });

  describe('createTriggerRoute additional cases', () => {
    it('handles missing body gracefully', async () => {
      const scheduler = {
        triggerAutomation: vi.fn().mockResolvedValue({
          success: true,
          scheduledRunId: 'run_1',
        }),
      };

      testServer = await createTestServer(createTriggerRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/auto-1/trigger?scope=global`, {
        method: 'POST',
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('returns error when scheduler fails', async () => {
      const scheduler = {
        triggerAutomation: vi.fn().mockResolvedValue({
          success: false,
          error: 'Automation not found: auto-missing',
          errorCode: 'NOT_FOUND',
        }),
      };

      testServer = await createTestServer(createTriggerRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/auto-missing/trigger?scope=global`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await response.json();

      // Returns 404 for "not found" errors, 400 for other client errors
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('not found');
    });

    it('returns 400 for disabled automation', async () => {
      const scheduler = {
        triggerAutomation: vi.fn().mockResolvedValue({
          success: false,
          error: 'Automation is disabled: auto-disabled',
        }),
      };

      testServer = await createTestServer(createTriggerRoute(scheduler as any));
      const response = await fetch(`${testServer.url}/auto-disabled/trigger?scope=global`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('disabled');
    });
  });

  describe('createGetRoute additional cases', () => {
    it('returns automation when found', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'found-auto',
        name: 'Found Automation',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      const store = {
        loadAutomationById: vi.fn().mockResolvedValue(automation),
      };

      testServer = await createTestServer(createGetRoute(store as any));
      const response = await fetch(`${testServer.url}/found-auto`);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.automation.id).toBe('found-auto');
    });
  });

  describe('createRunsRoute additional cases', () => {
    it('lists runs with automationId filter', async () => {
      const engine = {
        listRuns: vi.fn().mockReturnValue([
          { id: 'run_1', automationId: 'auto-1' },
          { id: 'run_2', automationId: 'auto-1' },
        ]),
        getRun: vi.fn(),
      };

      testServer = await createTestServer(createRunsRoute(engine as any));
      const response = await fetch(`${testServer.url}/runs?automationId=auto-1`);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.runs).toHaveLength(2);
      expect(engine.listRuns).toHaveBeenCalledWith('auto-1');
    });

    it('returns run when found by ID', async () => {
      const engine = {
        listRuns: vi.fn(),
        getRun: vi.fn().mockReturnValue({
          id: 'run_found',
          automationId: 'auto-1',
          status: 'completed',
        }),
      };

      testServer = await createTestServer(createRunsRoute(engine as any));
      const response = await fetch(`${testServer.url}/runs/run_found`);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.run.id).toBe('run_found');
    });
  });
});
