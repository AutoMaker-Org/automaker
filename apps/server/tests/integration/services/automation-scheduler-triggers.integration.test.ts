/**
 * Integration tests for automation scheduler trigger workflows
 *
 * Tests the complete trigger system including:
 * - Schedule triggers with cron expressions
 * - Event triggers with internal events
 * - Webhook triggers via HTTP
 * - Manual triggers
 * - State persistence across scheduler restarts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AutomationRuntimeEngine } from '@/services/automation-runtime-engine.js';
import { AutomationSchedulerService } from '@/services/automation-scheduler-service.js';
import { createAutomationRoutes } from '@/routes/automation/index.js';
import { createEventEmitter } from '@/lib/events.js';
import type { AutomationDefinition } from '@automaker/types';
import { TEST_HTTP_PORTS, createTestHttpServer, type TestHttpServer } from '../../utils/helpers.js';

type TestServer = TestHttpServer;

async function createTestApp(
  scheduler: AutomationSchedulerService,
  engine: AutomationRuntimeEngine
): Promise<TestServer> {
  return createTestHttpServer(
    createAutomationRoutes(scheduler, engine),
    TEST_HTTP_PORTS.AUTOMATION_SCHEDULER_TRIGGERS_INTEGRATION,
    { mountPath: '/api/automation' }
  );
}

describe('automation scheduler triggers integration', () => {
  let rootDir: string;
  let dataDir: string;
  let globalAutomationsDir: string;
  let engine: AutomationRuntimeEngine;
  let scheduler: AutomationSchedulerService;
  let events: ReturnType<typeof createEventEmitter>;
  let testServer: TestServer | null = null;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scheduler-integration-'));
    dataDir = path.join(rootDir, 'data');
    globalAutomationsDir = path.join(dataDir, 'automations');
    await fs.mkdir(globalAutomationsDir, { recursive: true });

    events = createEventEmitter();
    engine = new AutomationRuntimeEngine(dataDir);
    scheduler = new AutomationSchedulerService(dataDir, engine);
  });

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
    await scheduler.shutdown();
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  describe('manual trigger workflow', () => {
    it('triggers automation via manual trigger and returns run result', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'manual-test',
        name: 'Manual Test',
        scope: 'global',
        enabled: true,
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop', input: 'test' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'manual-test.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/manual-test/trigger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variables: { testVar: 'hello' },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.runId).toBeDefined();
    });

    it('returns error for disabled automation', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'disabled-test',
        name: 'Disabled Test',
        scope: 'global',
        enabled: false,
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'disabled-test.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/disabled-test/trigger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('disabled');
    });
  });

  describe('webhook trigger workflow', () => {
    it('triggers automation via webhook with valid token', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'webhook-test',
        name: 'Webhook Test',
        scope: 'global',
        enabled: true,
        trigger: { type: 'webhook', secret: 'test-secret' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'webhook-test.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      await scheduler.registerWebhookAutomation('webhook-test', 'test-secret');
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/webhook/webhook-test`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-automation-token': 'test-secret',
        },
        body: JSON.stringify({ event: 'test', data: { foo: 'bar' } }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('rejects webhook with invalid token', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'protected-webhook',
        name: 'Protected Webhook',
        scope: 'global',
        enabled: true,
        trigger: { type: 'webhook', secret: 'correct-secret' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'protected-webhook.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      await scheduler.registerWebhookAutomation('protected-webhook', 'correct-secret');
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/webhook/protected-webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-automation-token': 'wrong-secret',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('token');
    });

    it('accepts webhook without token when no secret configured', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'open-webhook',
        name: 'Open Webhook',
        scope: 'global',
        enabled: true,
        trigger: { type: 'webhook' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'open-webhook.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/webhook/open-webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('scheduled run management', () => {
    it('lists scheduled runs via API', async () => {
      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      // Schedule a run
      await scheduler.scheduleRun({
        automationId: 'scheduled-auto',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 3600000).toISOString(),
        triggerType: 'schedule',
      });

      const response = await fetch(`${testServer.url}/api/automation/scheduled`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.scheduledRuns).toHaveLength(1);
      expect(data.scheduledRuns[0].automationId).toBe('scheduled-auto');
    });

    it('cancels scheduled run via API', async () => {
      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const scheduleResult = await scheduler.scheduleRun({
        automationId: 'cancel-test',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 3600000).toISOString(),
        triggerType: 'schedule',
      });

      const response = await fetch(
        `${testServer.url}/api/automation/scheduled/${scheduleResult.scheduledRunId}`,
        { method: 'DELETE' }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify it's cancelled
      const run = scheduler.getScheduledRun(scheduleResult.scheduledRunId!);
      expect(run?.status).toBe('cancelled');
    });
  });

  describe('runs listing', () => {
    it('lists automation runs via API', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'runs-list-test',
        name: 'Runs List Test',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'runs-list-test.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      // Trigger a run
      await scheduler.triggerAutomation('runs-list-test');

      const response = await fetch(`${testServer.url}/api/automation/runs`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.runs.length).toBeGreaterThanOrEqual(1);
    });

    it('filters runs by automationId', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'filter-runs-test',
        name: 'Filter Runs Test',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'filter-runs-test.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      // Trigger a run
      await scheduler.triggerAutomation('filter-runs-test');

      const response = await fetch(
        `${testServer.url}/api/automation/runs?automationId=filter-runs-test`
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.runs.length).toBeGreaterThanOrEqual(1);
      expect(data.runs[0].automationId).toBe('filter-runs-test');
    });
  });

  describe('automation listing', () => {
    it('lists global automations via API', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'list-test-auto',
        name: 'List Test',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'list-test-auto.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/list?scope=global`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.automations.length).toBeGreaterThanOrEqual(1);

      const found = data.automations.find((a: AutomationDefinition) => a.id === 'list-test-auto');
      expect(found).toBeDefined();
    });
  });

  describe('state persistence across restarts', () => {
    it('persists and recovers scheduled runs', async () => {
      // First scheduler instance
      await scheduler.initialize(events);

      await scheduler.scheduleRun({
        automationId: 'persist-test',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 3600000).toISOString(),
        triggerType: 'schedule',
      });

      await scheduler.registerWebhookAutomation('persist-webhook', 'secret123');

      // Shutdown and create new scheduler
      await scheduler.shutdown();

      const newScheduler = new AutomationSchedulerService(dataDir, engine);
      await newScheduler.initialize(events);

      // Verify state was recovered
      const runs = newScheduler.getScheduledRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].automationId).toBe('persist-test');

      // Webhook secrets should also be persisted
      const stateContent = await fs.readFile(
        path.join(dataDir, 'automation-scheduler-state.json'),
        'utf-8'
      );
      const state = JSON.parse(stateContent);
      expect(state.webhookSecrets['persist-webhook']).toBe('secret123');

      await newScheduler.shutdown();
    });
  });

  describe('event triggers', () => {
    it('triggers automation when matching event is emitted', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'event-trigger-test',
        name: 'Event Trigger Test',
        scope: 'global',
        enabled: true,
        trigger: { type: 'event', event: 'test:trigger' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'event-trigger-test.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);

      // Emit matching event
      events.emit('test:trigger', { source: 'integration-test' });

      // Wait for async event handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check runs were created
      const runs = engine.listRuns('event-trigger-test');
      expect(runs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('webhook with different HTTP methods', () => {
    it('triggers automation via GET webhook', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'get-webhook',
        name: 'GET Webhook',
        scope: 'global',
        enabled: true,
        trigger: { type: 'webhook' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'get-webhook.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(
        `${testServer.url}/api/automation/webhook/get-webhook?foo=bar&baz=qux`
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('triggers automation via PUT webhook', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'put-webhook',
        name: 'PUT Webhook',
        scope: 'global',
        enabled: true,
        trigger: { type: 'webhook' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'put-webhook.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/webhook/put-webhook`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ update: true }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('triggers automation via PATCH webhook', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'patch-webhook',
        name: 'PATCH Webhook',
        scope: 'global',
        enabled: true,
        trigger: { type: 'webhook' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'patch-webhook.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/webhook/patch-webhook`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patch: true }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns 404 for non-existent automation trigger', async () => {
      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/non-existent/trigger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('returns 404 for non-existent webhook automation', async () => {
      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/webhook/non-existent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('returns 404 for non-existent automation get', async () => {
      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/non-existent`);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('returns 404 for non-existent scheduled run', async () => {
      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const response = await fetch(`${testServer.url}/api/automation/scheduled/sr_nonexistent`);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('multiple automations and runs', () => {
    it('handles multiple simultaneous scheduled runs', async () => {
      // Create multiple automations
      for (let i = 1; i <= 3; i++) {
        const automation: AutomationDefinition = {
          version: 1,
          id: `multi-schedule-${i}`,
          name: `Multi Schedule ${i}`,
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: `*/${i} * * * *` },
          steps: [{ id: 's1', type: 'noop' }],
        };

        await fs.writeFile(
          path.join(globalAutomationsDir, `multi-schedule-${i}.json`),
          JSON.stringify(automation),
          'utf-8'
        );
      }

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      // Schedule multiple runs at the same time
      const futureTime = new Date(Date.now() + 7200000).toISOString();
      await scheduler.scheduleRun({
        automationId: 'multi-schedule-1',
        scope: 'global',
        scheduledFor: futureTime,
        triggerType: 'schedule',
      });
      await scheduler.scheduleRun({
        automationId: 'multi-schedule-2',
        scope: 'global',
        scheduledFor: futureTime,
        triggerType: 'schedule',
      });
      await scheduler.scheduleRun({
        automationId: 'multi-schedule-3',
        scope: 'global',
        scheduledFor: futureTime,
        triggerType: 'schedule',
      });

      const response = await fetch(`${testServer.url}/api/automation/scheduled`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.scheduledRuns.length).toBeGreaterThanOrEqual(3);
    });

    it('filters scheduled runs by automation ID', async () => {
      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      const futureTime = new Date(Date.now() + 7200000).toISOString();
      await scheduler.scheduleRun({
        automationId: 'filter-test-a',
        scope: 'global',
        scheduledFor: futureTime,
        triggerType: 'manual',
      });
      await scheduler.scheduleRun({
        automationId: 'filter-test-b',
        scope: 'global',
        scheduledFor: futureTime,
        triggerType: 'manual',
      });

      const response = await fetch(
        `${testServer.url}/api/automation/scheduled?automationId=filter-test-a`
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.scheduledRuns.every((r: any) => r.automationId === 'filter-test-a')).toBe(true);
    });
  });

  describe('scheduler state events', () => {
    it('emits events for scheduled run lifecycle', async () => {
      const receivedEvents: any[] = [];
      const unsubscribe = events.subscribe((type, payload) => {
        if (type === ('automation:scheduler' as never)) {
          receivedEvents.push(payload);
        }
      });

      await scheduler.initialize(events);

      const result = await scheduler.scheduleRun({
        automationId: 'event-test-auto',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      expect(receivedEvents[0].type).toBe('scheduled');
      expect(receivedEvents[0].automationId).toBe('event-test-auto');

      unsubscribe();
    });
  });

  describe('run listing and retrieval', () => {
    it('lists all runs without filter', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'list-all-runs',
        name: 'List All Runs',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'list-all-runs.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      // Trigger multiple runs
      await scheduler.triggerAutomation('list-all-runs');
      await scheduler.triggerAutomation('list-all-runs');

      const response = await fetch(`${testServer.url}/api/automation/runs`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.runs.length).toBeGreaterThanOrEqual(2);
    });

    it('gets a specific run by ID', async () => {
      const automation: AutomationDefinition = {
        version: 1,
        id: 'get-specific-run',
        name: 'Get Specific Run',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      await fs.writeFile(
        path.join(globalAutomationsDir, 'get-specific-run.json'),
        JSON.stringify(automation),
        'utf-8'
      );

      await scheduler.initialize(events);
      testServer = await createTestApp(scheduler, engine);

      // Trigger a run
      const result = await scheduler.triggerAutomation('get-specific-run');
      expect(result.success).toBe(true);

      const response = await fetch(
        `${testServer.url}/api/automation/runs/${result.scheduledRunId}`
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.run.id).toBe(result.scheduledRunId);
    });
  });
});
