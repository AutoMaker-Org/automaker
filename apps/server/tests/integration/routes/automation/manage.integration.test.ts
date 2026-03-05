import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'express';
import type { AutomationDefinition, AutomationScope } from '@automaker/types';
import { createAutomationRoutes } from '@/routes/automation/index.js';
import {
  TEST_HTTP_PORTS,
  createTestHttpServer,
  type TestHttpServer,
} from '../../../utils/helpers.js';

type TestServer = TestHttpServer;

class InMemoryAutomationStore {
  private readonly byScope = new Map<string, Map<string, AutomationDefinition>>();

  private getKey(options: { scope: AutomationScope; projectPath?: string }): string {
    return `${options.scope}:${options.projectPath ?? ''}`;
  }

  private getBucket(options: {
    scope: AutomationScope;
    projectPath?: string;
  }): Map<string, AutomationDefinition> {
    const key = this.getKey(options);
    const existing = this.byScope.get(key);
    if (existing) return existing;
    const created = new Map<string, AutomationDefinition>();
    this.byScope.set(key, created);
    return created;
  }

  async listAutomations(options: {
    scope?: AutomationScope;
    projectPath?: string;
  }): Promise<AutomationDefinition[]> {
    const scope = options.scope ?? 'global';
    return [...this.getBucket({ scope, projectPath: options.projectPath }).values()];
  }

  async loadAutomationById(
    automationId: string,
    options: { scope?: AutomationScope; projectPath?: string }
  ): Promise<AutomationDefinition | null> {
    const scope = options.scope ?? 'global';
    return this.getBucket({ scope, projectPath: options.projectPath }).get(automationId) ?? null;
  }

  async saveAutomation(
    automation: AutomationDefinition,
    options: { scope?: AutomationScope; projectPath?: string; overwrite?: boolean }
  ): Promise<AutomationDefinition> {
    const scope = options.scope ?? automation.scope ?? 'global';
    const bucket = this.getBucket({ scope, projectPath: options.projectPath });
    if (!options.overwrite && bucket.has(automation.id)) {
      throw new Error(`Automation "${automation.id}" already exists`);
    }
    const now = new Date().toISOString();
    const existing = bucket.get(automation.id);
    const saved: AutomationDefinition = {
      ...automation,
      scope,
      enabled: automation.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    bucket.set(saved.id, saved);
    return saved;
  }

  async deleteAutomation(
    automationId: string,
    options: { scope?: AutomationScope; projectPath?: string }
  ): Promise<boolean> {
    const scope = options.scope ?? 'global';
    return this.getBucket({ scope, projectPath: options.projectPath }).delete(automationId);
  }
}

async function createTestServer(router: Router): Promise<TestServer> {
  return createTestHttpServer(router, TEST_HTTP_PORTS.AUTOMATION_MANAGE_INTEGRATION, {
    mountPath: '/api/automation',
  });
}

function sampleAutomation(id: string): AutomationDefinition {
  return {
    version: 1,
    id,
    name: `Automation ${id}`,
    description: `Description for ${id}`,
    scope: 'global',
    trigger: { type: 'manual' },
    steps: [{ id: 's1', type: 'noop' }],
    enabled: true,
  };
}

describe('automation routes integration - manage endpoints', () => {
  let server: TestServer | null = null;
  let store: InMemoryAutomationStore;

  const scheduler = {
    refreshSchedules: vi.fn().mockResolvedValue(undefined),
    triggerAutomation: vi.fn().mockResolvedValue({ success: true, scheduledRunId: 'run-1' }),
    handleWebhookTrigger: vi.fn().mockResolvedValue({ success: true }),
    getScheduledRuns: vi.fn().mockReturnValue([]),
    getScheduledRun: vi.fn().mockReturnValue(null),
    cancelScheduledRun: vi.fn().mockReturnValue(false),
    getUpcomingScheduledRuns: vi.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    store = new InMemoryAutomationStore();
    const engine = {
      getDefinitionStore: () => store,
      listRuns: vi.fn().mockReturnValue([]),
      getRun: vi.fn().mockReturnValue(null),
    };
    const variableService = {
      listAvailableVariables: vi.fn().mockResolvedValue({ groups: [], total: 0 }),
      getSystemVariables: vi.fn().mockResolvedValue({}),
      getSystemVariableDescriptors: vi.fn().mockReturnValue([]),
      loadProjectVariables: vi.fn().mockResolvedValue([]),
      setProjectVariable: vi.fn(),
      deleteProjectVariable: vi.fn(),
    };

    server = await createTestServer(
      createAutomationRoutes(scheduler as any, engine as any, variableService as any)
    );
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    vi.clearAllMocks();
  });

  it('supports create/list/update/toggle/duplicate/export/import/delete workflow', async () => {
    const createResponse = await fetch(`${server!.url}/api/automation?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleAutomation('workflow-auto')),
    });
    expect(createResponse.status).toBe(201);

    const listResponse = await fetch(`${server!.url}/api/automation/list?scope=global`);
    const listJson = await listResponse.json();
    expect(listResponse.status).toBe(200);
    expect(listJson.automations).toHaveLength(1);
    expect(listJson.automations[0].id).toBe('workflow-auto');

    const updateResponse = await fetch(`${server!.url}/api/automation/workflow-auto?scope=global`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...sampleAutomation('ignored-by-route'),
        name: 'Workflow Updated',
      }),
    });
    const updateJson = await updateResponse.json();
    expect(updateResponse.status).toBe(200);
    expect(updateJson.automation.id).toBe('workflow-auto');
    expect(updateJson.automation.name).toBe('Workflow Updated');

    const toggleResponse = await fetch(
      `${server!.url}/api/automation/workflow-auto/enabled?scope=global`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }
    );
    const toggleJson = await toggleResponse.json();
    expect(toggleResponse.status).toBe(200);
    expect(toggleJson.automation.enabled).toBe(false);

    const duplicateResponse = await fetch(
      `${server!.url}/api/automation/workflow-auto/duplicate?scope=global`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }
    );
    const duplicateJson = await duplicateResponse.json();
    expect(duplicateResponse.status).toBe(201);
    expect(duplicateJson.automation.id).toBe('workflow-auto-copy');

    const exportResponse = await fetch(`${server!.url}/api/automation/export?scope=global`);
    const exportJson = await exportResponse.json();
    expect(exportResponse.status).toBe(200);
    expect(exportJson.automations).toHaveLength(2);

    const importResponse = await fetch(`${server!.url}/api/automation/import?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        automations: [sampleAutomation('imported-auto')],
      }),
    });
    const importJson = await importResponse.json();
    expect(importResponse.status).toBe(200);
    expect(importJson.success).toBe(true);
    expect(importJson.imported).toHaveLength(1);

    const deleteResponse = await fetch(`${server!.url}/api/automation/workflow-auto?scope=global`, {
      method: 'DELETE',
    });
    const deleteJson = await deleteResponse.json();
    expect(deleteResponse.status).toBe(200);
    expect(deleteJson.success).toBe(true);

    expect(scheduler.refreshSchedules).toHaveBeenCalled();
  });

  it('prioritizes /export route over /:automationId route matching', async () => {
    const loadSpy = vi.spyOn(store, 'loadAutomationById');

    const response = await fetch(`${server!.url}/api/automation/export?scope=global`);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(loadSpy).not.toHaveBeenCalledWith('export', expect.anything());
  });
});
