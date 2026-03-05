import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'express';
import type { AutomationDefinition, AutomationScope } from '@automaker/types';
import { createManageRoute } from '@/routes/automation/routes/manage.js';
import { TEST_HTTP_PORTS, createTestHttpServer, type TestHttpServer } from '../../utils/helpers.js';

type TestServer = TestHttpServer;

type StoreOptions = {
  scope: AutomationScope;
  projectPath?: string;
  overwrite?: boolean;
};

type MockStore = {
  saveAutomation: ReturnType<typeof vi.fn>;
  loadAutomationById: ReturnType<typeof vi.fn>;
  listAutomations: ReturnType<typeof vi.fn>;
  deleteAutomation: ReturnType<typeof vi.fn>;
};

async function createTestServer(router: Router): Promise<TestServer> {
  return createTestHttpServer(router, TEST_HTTP_PORTS.AUTOMATION_MANAGE_ROUTE);
}

function createBaseAutomation(id = 'test-auto'): AutomationDefinition {
  return {
    version: 1,
    id,
    name: `Automation ${id}`,
    scope: 'global',
    trigger: { type: 'manual' },
    steps: [{ id: 'step-1', type: 'noop' }],
    enabled: true,
  };
}

function createMockStore(): MockStore {
  return {
    saveAutomation: vi.fn(),
    loadAutomationById: vi.fn(),
    listAutomations: vi.fn(),
    deleteAutomation: vi.fn(),
  };
}

describe('createManageRoute', () => {
  let testServer: TestServer | null = null;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('creates automation with sanitized fallback id and refreshes schedules', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };
    const saved = createBaseAutomation('my-new-automation');
    store.saveAutomation.mockResolvedValue(saved);

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...createBaseAutomation(''),
        id: '',
        name: 'My New Automation',
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(store.saveAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'my-new-automation',
        scope: 'global',
      }),
      expect.objectContaining<StoreOptions>({
        scope: 'global',
        overwrite: false,
      })
    );
    expect(scheduler.refreshSchedules).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for invalid automation id on create', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...createBaseAutomation('bad id with spaces'),
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('automation id');
    expect(store.saveAutomation).not.toHaveBeenCalled();
  });

  it('returns 400 for project scope requests without projectPath', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/?scope=project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBaseAutomation('project-missing-path')),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('projectPath');
  });

  it('updates an automation while preserving original createdAt', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };
    const existing = {
      ...createBaseAutomation('auto-update'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    store.loadAutomationById.mockResolvedValue(existing);
    store.saveAutomation.mockResolvedValue({
      ...existing,
      name: 'Updated',
      updatedAt: '2026-02-24T00:00:00.000Z',
    });

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/auto-update?scope=global`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...existing,
        name: 'Updated',
      }),
    });

    expect(response.status).toBe(200);
    expect(store.saveAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'auto-update',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      expect.objectContaining<StoreOptions>({ overwrite: true })
    );
    expect(scheduler.refreshSchedules).toHaveBeenCalledTimes(1);
  });

  it('toggles enabled state and persists the result', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };
    const existing = createBaseAutomation('auto-toggle');
    store.loadAutomationById.mockResolvedValue(existing);
    store.saveAutomation.mockResolvedValue({ ...existing, enabled: false });

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/auto-toggle/enabled?scope=global`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.automation.enabled).toBe(false);
    expect(store.saveAutomation).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
      expect.any(Object)
    );
    expect(scheduler.refreshSchedules).toHaveBeenCalledTimes(1);
  });

  it('duplicates automation and increments suffix when target id already exists', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };
    const existing = createBaseAutomation('auto-1');
    store.loadAutomationById
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null);
    store.saveAutomation.mockResolvedValue({
      ...existing,
      id: 'auto-1-copy-2',
      name: 'Automation auto-1 (Copy)',
    });

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/auto-1/duplicate?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.automation.id).toBe('auto-1-copy-2');
    expect(store.saveAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'auto-1-copy-2',
        name: 'Automation auto-1 (Copy)',
      }),
      expect.objectContaining<StoreOptions>({ overwrite: false })
    );
    expect(scheduler.refreshSchedules).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate requests with invalid newId after sanitization', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };
    const existing = createBaseAutomation('auto-1');
    store.loadAutomationById.mockResolvedValue(existing);

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/auto-1/duplicate?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newId: '!!!' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('automation id');
    expect(store.saveAutomation).not.toHaveBeenCalled();
    expect(scheduler.refreshSchedules).not.toHaveBeenCalled();
  });

  it('exports selected automations by ids', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };
    const autoA = createBaseAutomation('a');
    const autoB = createBaseAutomation('b');
    store.loadAutomationById.mockImplementation(async (id: string) => {
      if (id === 'a') return autoA;
      if (id === 'b') return autoB;
      return null;
    });

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/export?scope=global&automationIds=a,b,missing`);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.automations).toEqual([autoA, autoB]);
  });

  it('rejects export query when any automation id is invalid', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(
      `${testServer.url}/export?scope=global&automationIds=good,bad%20id`
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('Invalid automation id');
    expect(store.loadAutomationById).not.toHaveBeenCalled();
  });

  it('imports automations with partial failures and refreshes when at least one succeeds', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };
    const imported = createBaseAutomation('import-ok');
    store.saveAutomation
      .mockResolvedValueOnce(imported)
      .mockRejectedValueOnce(new Error('duplicate id'));

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/import?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        automations: [createBaseAutomation('import-ok'), createBaseAutomation('import-bad')],
        overwrite: false,
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(false);
    expect(json.imported).toHaveLength(1);
    expect(json.failures).toHaveLength(1);
    expect(json.failures[0].error).toContain('duplicate id');
    expect(scheduler.refreshSchedules).toHaveBeenCalledTimes(1);
  });

  it('records invalid import candidates as failures and skips scheduler refresh when none succeed', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/import?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        automations: ['invalid-entry', { ...createBaseAutomation(''), id: 'bad id' }],
        overwrite: false,
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(false);
    expect(json.imported).toHaveLength(0);
    expect(json.failures).toHaveLength(2);
    expect(json.failures[0].error).toContain('object');
    expect(json.failures[1].error).toContain('automation id');
    expect(store.saveAutomation).not.toHaveBeenCalled();
    expect(scheduler.refreshSchedules).not.toHaveBeenCalled();
  });

  it('rejects import of automation with missing version field', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/import?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        automations: [
          {
            id: 'no-version',
            name: 'No Version',
            scope: 'global',
            trigger: { type: 'manual' },
            steps: [{ id: 'step-1', type: 'noop' }],
          },
        ],
        overwrite: false,
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(false);
    expect(json.imported).toHaveLength(0);
    expect(json.failures).toHaveLength(1);
    expect(json.failures[0].error).toContain('version');
    expect(store.saveAutomation).not.toHaveBeenCalled();
    expect(scheduler.refreshSchedules).not.toHaveBeenCalled();
  });

  it('rejects import of automation with unsupported schema version', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/import?scope=global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        automations: [{ ...createBaseAutomation('future-version'), version: 99 }],
        overwrite: false,
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(false);
    expect(json.imported).toHaveLength(0);
    expect(json.failures).toHaveLength(1);
    expect(json.failures[0].error).toContain('unsupported schema version');
    expect(json.failures[0].error).toContain('99');
    expect(store.saveAutomation).not.toHaveBeenCalled();
    expect(scheduler.refreshSchedules).not.toHaveBeenCalled();
  });

  it('rejects ZIP export when no automations exist', async () => {
    const store = createMockStore();
    const scheduler = { refreshSchedules: vi.fn().mockResolvedValue(undefined) };
    store.listAutomations.mockResolvedValue([]);

    testServer = await createTestServer(createManageRoute(store as any, scheduler as any));
    const response = await fetch(`${testServer.url}/export?scope=global&format=zip`);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('No automations to export');
  });
});
