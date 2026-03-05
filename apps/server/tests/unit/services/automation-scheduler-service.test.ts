import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AutomationDefinition, AutomationRun } from '@automaker/types';
import { AutomationSchedulerService } from '@/services/automation-scheduler-service.js';
import { createEventEmitter } from '@/lib/events.js';

describe('automation-scheduler-service.ts', () => {
  let rootDir: string;
  let dataDir: string;
  let store: {
    loadAutomationById: ReturnType<typeof vi.fn>;
    listAutomations: ReturnType<typeof vi.fn>;
  };
  let runtimeEngine: {
    getDefinitionStore: ReturnType<typeof vi.fn>;
    executeById: ReturnType<typeof vi.fn>;
  };
  let scheduler: AutomationSchedulerService;
  let events: ReturnType<typeof createEventEmitter>;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-scheduler-test-'));
    dataDir = path.join(rootDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });

    store = {
      loadAutomationById: vi.fn(),
      listAutomations: vi.fn().mockResolvedValue([]),
    };

    runtimeEngine = {
      getDefinitionStore: vi.fn(() => store),
      executeById: vi.fn(),
    };

    events = createEventEmitter();
    scheduler = new AutomationSchedulerService(dataDir, runtimeEngine as any);
  });

  afterEach(async () => {
    await scheduler.shutdown();
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('returns not found when triggering missing automation', async () => {
    store.loadAutomationById.mockResolvedValue(null);

    const result = await scheduler.triggerAutomation('missing-auto', {
      scope: 'global',
    });

    expect(result).toEqual({
      success: false,
      error: 'Automation not found: missing-auto',
      errorCode: 'NOT_FOUND',
    });
    expect(runtimeEngine.executeById).not.toHaveBeenCalled();
  });

  it('executes enabled automation and maps execution result', async () => {
    const definition: AutomationDefinition = {
      version: 1,
      id: 'auto-1',
      name: 'Automation',
      scope: 'project',
      trigger: { type: 'manual' },
      steps: [{ id: 'step1', type: 'noop' }],
    };

    const run: AutomationRun = {
      id: 'run_1',
      automationId: definition.id,
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      variables: { system: {}, project: {}, workflow: {}, steps: {} },
      stepRuns: [],
    };

    store.loadAutomationById.mockResolvedValue(definition);
    runtimeEngine.executeById.mockResolvedValue(run);

    const result = await scheduler.triggerAutomation(definition.id, {
      scope: 'project',
      projectPath: '/tmp/project',
      variables: { fromCaller: 'yes' },
      triggerMetadata: { source: 'api' },
    });

    expect(runtimeEngine.executeById).toHaveBeenCalledWith(definition.id, {
      scope: 'project',
      projectPath: '/tmp/project',
      variables: { fromCaller: 'yes' },
      trigger: {
        type: 'manual',
        metadata: { source: 'api' },
      },
    });
    expect(result).toEqual({
      success: true,
      scheduledRunId: 'run_1',
      error: undefined,
    });
  });

  it('validates webhook trigger type and token', async () => {
    const nonWebhook: AutomationDefinition = {
      version: 1,
      id: 'not-webhook',
      name: 'Not webhook',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [{ id: 's1', type: 'noop' }],
    };

    store.loadAutomationById.mockResolvedValue(nonWebhook);
    const invalidType = await scheduler.handleWebhookTrigger(
      'not-webhook',
      { ping: true },
      'token'
    );

    expect(invalidType.success).toBe(false);
    expect(invalidType.error).toContain('not webhook-triggered');

    const webhookDefinition: AutomationDefinition = {
      ...nonWebhook,
      id: 'webhook-auto',
      trigger: { type: 'webhook' },
    };
    store.loadAutomationById.mockResolvedValue(webhookDefinition);

    await scheduler.registerWebhookAutomation('webhook-auto', 'secret-1');
    const invalidToken = await scheduler.handleWebhookTrigger(
      'webhook-auto',
      { ping: true },
      'wrong'
    );

    expect(invalidToken).toEqual({
      success: false,
      error: 'Invalid webhook token',
      errorCode: 'INVALID_TOKEN',
    });
    expect(runtimeEngine.executeById).not.toHaveBeenCalled();
  });

  it('cancels scheduled runs and rejects non-scheduled runs', async () => {
    const scheduleResult = await scheduler.scheduleRun({
      automationId: 'auto-1',
      scope: 'global',
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
      triggerType: 'manual',
    });

    const scheduledRunId = scheduleResult.scheduledRunId!;
    const cancelled = await scheduler.cancelScheduledRun(scheduledRunId);
    expect(cancelled).toEqual({
      success: true,
      scheduledRunId,
    });

    const cancelledAgain = await scheduler.cancelScheduledRun(scheduledRunId);
    expect(cancelledAgain).toEqual({
      success: false,
      error: 'Cannot cancel run with status: cancelled',
    });
  });

  it('refreshSchedules enqueues only enabled schedule automations', async () => {
    store.listAutomations.mockResolvedValue([
      {
        version: 1,
        id: 'scheduled-enabled',
        name: 'Scheduled enabled',
        scope: 'global',
        enabled: true,
        trigger: { type: 'schedule', cron: '*/5 * * * *' },
        steps: [{ id: 's1', type: 'noop' }],
      },
      {
        version: 1,
        id: 'scheduled-disabled',
        name: 'Scheduled disabled',
        scope: 'global',
        enabled: false,
        trigger: { type: 'schedule', cron: '*/5 * * * *' },
        steps: [{ id: 's1', type: 'noop' }],
      },
      {
        version: 1,
        id: 'manual',
        name: 'Manual',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      },
    ]);

    await scheduler.refreshSchedules();

    const runs = scheduler.getScheduledRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].automationId).toBe('scheduled-enabled');
    expect(runs[0].status).toBe('scheduled');
    expect(runs[0].triggerType).toBe('schedule');
  });

  it('refreshSchedules skips invalid cron expressions', async () => {
    store.listAutomations.mockResolvedValue([
      {
        version: 1,
        id: 'bad-cron',
        name: 'Bad cron',
        scope: 'global',
        enabled: true,
        trigger: { type: 'schedule', cron: '70 * * * *' },
        steps: [{ id: 's1', type: 'noop' }],
      },
    ]);

    await scheduler.refreshSchedules();

    expect(scheduler.getScheduledRuns()).toHaveLength(0);
  });

  describe('cron parsing edge cases', () => {
    it('parses wildcard cron expressions', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'every-minute',
          name: 'Every minute',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '* * * * *' },
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      const runs = scheduler.getScheduledRuns();
      expect(runs).toHaveLength(1);

      const scheduledTime = new Date(runs[0].scheduledFor);
      expect(scheduledTime.getTime()).toBeGreaterThan(Date.now());
    });

    it('parses range cron expressions (e.g., 0-5)', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'range-cron',
          name: 'Range cron',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '0-5 * * * *' },
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      const runs = scheduler.getScheduledRuns();
      expect(runs).toHaveLength(1);
    });

    it('parses step cron expressions (e.g., */15)', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'step-cron',
          name: 'Step cron',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '*/15 * * * *' },
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      const runs = scheduler.getScheduledRuns();
      expect(runs).toHaveLength(1);
    });

    it('parses list cron expressions (e.g., 1,15,30)', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'list-cron',
          name: 'List cron',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '1,15,30 * * * *' },
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      const runs = scheduler.getScheduledRuns();
      expect(runs).toHaveLength(1);
    });

    it('rejects cron expressions with wrong number of fields', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'wrong-fields',
          name: 'Wrong fields',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '* * * *' }, // Only 4 fields
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      expect(scheduler.getScheduledRuns()).toHaveLength(0);
    });
  });

  describe('state persistence', () => {
    it('persists scheduler state to disk after schedule operations', async () => {
      await scheduler.scheduleRun({
        automationId: 'persist-test',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60_000).toISOString(),
        triggerType: 'manual',
      });

      // Read the state file directly
      const statePath = path.join(dataDir, 'automation-scheduler-state.json');
      const content = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(content);

      expect(state.version).toBe(1);
      expect(state.scheduledRuns).toHaveLength(1);
      expect(state.scheduledRuns[0].automationId).toBe('persist-test');
    });

    it('loads persisted state on initialization', async () => {
      // Create a pre-existing state file
      const statePath = path.join(dataDir, 'automation-scheduler-state.json');
      const existingState = {
        version: 1,
        updatedAt: new Date().toISOString(),
        scheduledRuns: [
          {
            id: 'sr_existing',
            automationId: 'existing-auto',
            scope: 'global',
            scheduledFor: new Date(Date.now() + 3600000).toISOString(),
            triggerType: 'schedule',
            status: 'scheduled',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        webhookSecrets: { 'existing-auto': 'secret123' },
      };
      await fs.writeFile(statePath, JSON.stringify(existingState), 'utf-8');

      // Create a new scheduler instance
      const newScheduler = new AutomationSchedulerService(dataDir, runtimeEngine as any);
      await newScheduler.initialize(events);

      const runs = newScheduler.getScheduledRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].id).toBe('sr_existing');

      await newScheduler.shutdown();
    });

    it('handles corrupted state file gracefully', async () => {
      const statePath = path.join(dataDir, 'automation-scheduler-state.json');
      await fs.writeFile(statePath, 'invalid json {{{', 'utf-8');

      // Should not throw, should start with default state
      await scheduler.initialize(events);

      expect(scheduler.getScheduledRuns()).toHaveLength(0);
    });

    it('persists webhook secrets', async () => {
      await scheduler.registerWebhookAutomation('webhook-1', 'my-secret');

      const statePath = path.join(dataDir, 'automation-scheduler-state.json');
      const content = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(content);

      expect(state.webhookSecrets['webhook-1']).toBe('my-secret');
    });

    it('unregisters webhook secrets', async () => {
      await scheduler.registerWebhookAutomation('webhook-1', 'my-secret');
      await scheduler.unregisterWebhookAutomation('webhook-1');

      const statePath = path.join(dataDir, 'automation-scheduler-state.json');
      const content = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(content);

      expect(state.webhookSecrets['webhook-1']).toBeUndefined();
    });
  });

  describe('event triggers', () => {
    it('triggers automation when matching event is emitted', async () => {
      const eventAutomation: AutomationDefinition = {
        version: 1,
        id: 'event-auto',
        name: 'Event Automation',
        scope: 'global',
        enabled: true,
        trigger: { type: 'event', event: 'feature:completed' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      store.listAutomations.mockResolvedValue([eventAutomation]);
      store.loadAutomationById.mockResolvedValue(eventAutomation);

      const run: AutomationRun = {
        id: 'run_event',
        automationId: 'event-auto',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        variables: { system: {}, project: {}, workflow: {}, steps: {} },
        stepRuns: [],
      };
      runtimeEngine.executeById.mockResolvedValue(run);

      await scheduler.initialize(events);

      // Emit matching event
      events.emit('feature:completed', { featureId: 'f1', projectPath: '/tmp/p' });

      // Wait for async event handling
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(runtimeEngine.executeById).toHaveBeenCalledWith('event-auto', expect.any(Object));
    });

    it('does not trigger automation for non-matching events', async () => {
      const eventAutomation: AutomationDefinition = {
        version: 1,
        id: 'event-auto',
        name: 'Event Automation',
        scope: 'global',
        enabled: true,
        trigger: { type: 'event', event: 'feature:completed' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      store.listAutomations.mockResolvedValue([eventAutomation]);
      store.loadAutomationById.mockResolvedValue(eventAutomation);

      await scheduler.initialize(events);

      // Emit non-matching event
      events.emit('feature:created', { featureId: 'f1' });

      // Wait for async event handling
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(runtimeEngine.executeById).not.toHaveBeenCalled();
    });

    it('does not trigger disabled event automations', async () => {
      const disabledAutomation: AutomationDefinition = {
        version: 1,
        id: 'disabled-event',
        name: 'Disabled Event Automation',
        scope: 'global',
        enabled: false,
        trigger: { type: 'event', event: 'feature:completed' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      store.listAutomations.mockResolvedValue([disabledAutomation]);

      await scheduler.initialize(events);

      events.emit('feature:completed', { featureId: 'f1' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(runtimeEngine.executeById).not.toHaveBeenCalled();
    });
  });

  describe('disabled automation handling', () => {
    it('returns error when triggering disabled automation', async () => {
      const disabled: AutomationDefinition = {
        version: 1,
        id: 'disabled-auto',
        name: 'Disabled',
        scope: 'global',
        enabled: false,
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      store.loadAutomationById.mockResolvedValue(disabled);

      const result = await scheduler.triggerAutomation('disabled-auto');

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
      expect(runtimeEngine.executeById).not.toHaveBeenCalled();
    });
  });

  describe('scheduled run status tracking', () => {
    it('tracks scheduled run lifecycle through completion', async () => {
      const definition: AutomationDefinition = {
        version: 1,
        id: 'lifecycle-auto',
        name: 'Lifecycle',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      const run: AutomationRun = {
        id: 'run_lifecycle',
        automationId: 'lifecycle-auto',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        variables: { system: {}, project: {}, workflow: {}, steps: {} },
        stepRuns: [],
      };

      store.loadAutomationById.mockResolvedValue(definition);
      runtimeEngine.executeById.mockResolvedValue(run);

      const result = await scheduler.triggerAutomation('lifecycle-auto');

      expect(result.success).toBe(true);
      expect(result.scheduledRunId).toBe('run_lifecycle');
    });

    it('tracks failed run status', async () => {
      const definition: AutomationDefinition = {
        version: 1,
        id: 'fail-auto',
        name: 'Fail',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      const failedRun: AutomationRun = {
        id: 'run_fail',
        automationId: 'fail-auto',
        status: 'failed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: { code: 'STEP_FAILED', message: 'Step failed', stepId: 's1' },
        variables: { system: {}, project: {}, workflow: {}, steps: {} },
        stepRuns: [],
      };

      store.loadAutomationById.mockResolvedValue(definition);
      runtimeEngine.executeById.mockResolvedValue(failedRun);

      const result = await scheduler.triggerAutomation('fail-auto');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Step failed');
    });

    it('handles exception during execution', async () => {
      const definition: AutomationDefinition = {
        version: 1,
        id: 'exception-auto',
        name: 'Exception',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      store.loadAutomationById.mockResolvedValue(definition);
      runtimeEngine.executeById.mockRejectedValue(new Error('Unexpected error'));

      const result = await scheduler.triggerAutomation('exception-auto');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected error');
    });
  });

  describe('getScheduledRuns filtering', () => {
    it('filters scheduled runs by automationId', async () => {
      await scheduler.scheduleRun({
        automationId: 'auto-a',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      await scheduler.scheduleRun({
        automationId: 'auto-b',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 120000).toISOString(),
        triggerType: 'manual',
      });

      const runsA = scheduler.getScheduledRuns('auto-a');
      expect(runsA).toHaveLength(1);
      expect(runsA[0].automationId).toBe('auto-a');

      const runsB = scheduler.getScheduledRuns('auto-b');
      expect(runsB).toHaveLength(1);
      expect(runsB[0].automationId).toBe('auto-b');

      const allRuns = scheduler.getScheduledRuns();
      expect(allRuns).toHaveLength(2);
    });
  });

  describe('getScheduledRun by ID', () => {
    it('returns null for non-existent run', () => {
      const run = scheduler.getScheduledRun('non-existent');
      expect(run).toBeNull();
    });

    it('returns scheduled run by ID', async () => {
      const result = await scheduler.scheduleRun({
        automationId: 'test-auto',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      const run = scheduler.getScheduledRun(result.scheduledRunId!);
      expect(run).not.toBeNull();
      expect(run?.automationId).toBe('test-auto');
    });
  });

  describe('webhook secret generation', () => {
    it('generates secret when not provided', async () => {
      const secret = await scheduler.registerWebhookAutomation('auto-1');

      expect(secret).toBeDefined();
      expect(secret).toContain('whsec_');
    });

    it('uses provided secret', async () => {
      const secret = await scheduler.registerWebhookAutomation('auto-1', 'custom-secret');

      expect(secret).toBe('custom-secret');
    });
  });

  describe('scheduleRun input validation', () => {
    it('rejects empty automationId', async () => {
      const result = await scheduler.scheduleRun({
        automationId: '',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('automationId is required');
    });

    it('rejects whitespace-only automationId', async () => {
      const result = await scheduler.scheduleRun({
        automationId: '   ',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('automationId is required');
    });

    it('rejects invalid scope', async () => {
      const result = await scheduler.scheduleRun({
        automationId: 'auto-1',
        scope: 'invalid' as any,
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('scope must be');
    });

    it('rejects project scope without projectPath', async () => {
      const result = await scheduler.scheduleRun({
        automationId: 'auto-1',
        scope: 'project',
        projectPath: '',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('projectPath is required');
    });

    it('rejects invalid scheduledFor date', async () => {
      const result = await scheduler.scheduleRun({
        automationId: 'auto-1',
        scope: 'global',
        scheduledFor: 'not-a-date',
        triggerType: 'manual',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('valid ISO 8601');
    });

    it('accepts project scope with projectPath', async () => {
      const result = await scheduler.scheduleRun({
        automationId: 'auto-1',
        scope: 'project',
        projectPath: '/tmp/project',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      expect(result.success).toBe(true);
      expect(result.scheduledRunId).toBeDefined();
    });
  });

  describe('cancelScheduledRun edge cases', () => {
    it('rejects empty scheduledRunId', async () => {
      const result = await scheduler.cancelScheduledRun('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('scheduledRunId is required');
    });

    it('returns error for non-existent run', async () => {
      const result = await scheduler.cancelScheduledRun('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('rejects cancelling a running execution', async () => {
      const scheduleResult = await scheduler.scheduleRun({
        automationId: 'auto-1',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      // Manually set status to running
      const run = scheduler.getScheduledRun(scheduleResult.scheduledRunId!);
      if (run) {
        (run as any).status = 'running';
      }

      const result = await scheduler.cancelScheduledRun(scheduleResult.scheduledRunId!);

      expect(result.success).toBe(false);
      expect(result.error).toContain('currently executing');
    });
  });

  describe('constant-time comparison (webhook security)', () => {
    it('rejects webhook with wrong token length', async () => {
      const webhookDefinition: AutomationDefinition = {
        version: 1,
        id: 'webhook-len-test',
        name: 'Webhook Length Test',
        scope: 'global',
        trigger: { type: 'webhook' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      store.loadAutomationById.mockResolvedValue(webhookDefinition);
      await scheduler.registerWebhookAutomation('webhook-len-test', 'long-secret-token');

      const result = await scheduler.handleWebhookTrigger(
        'webhook-len-test',
        { ping: true },
        'short'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid webhook token');
      expect(runtimeEngine.executeById).not.toHaveBeenCalled();
    });

    it('accepts webhook with correct token', async () => {
      const webhookDefinition: AutomationDefinition = {
        version: 1,
        id: 'webhook-correct',
        name: 'Webhook Correct',
        scope: 'global',
        enabled: true,
        trigger: { type: 'webhook' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      const run: AutomationRun = {
        id: 'run_webhook',
        automationId: 'webhook-correct',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        variables: { system: {}, project: {}, workflow: {}, steps: {} },
        stepRuns: [],
      };

      store.loadAutomationById.mockResolvedValue(webhookDefinition);
      runtimeEngine.executeById.mockResolvedValue(run);

      await scheduler.registerWebhookAutomation('webhook-correct', 'correct-token');

      const result = await scheduler.handleWebhookTrigger(
        'webhook-correct',
        { ping: true },
        'correct-token'
      );

      expect(result.success).toBe(true);
      expect(runtimeEngine.executeById).toHaveBeenCalled();
    });
  });

  describe('recoverMissedRuns', () => {
    it('recovers scheduled runs that should have run during downtime', async () => {
      // Create a state file with a missed run (scheduled in the past)
      const statePath = path.join(dataDir, 'automation-scheduler-state.json');
      const pastTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const existingState = {
        version: 1,
        updatedAt: new Date().toISOString(),
        scheduledRuns: [
          {
            id: 'sr_missed',
            automationId: 'missed-auto',
            scope: 'global',
            scheduledFor: pastTime,
            triggerType: 'schedule' as const,
            status: 'scheduled',
            createdAt: pastTime,
            updatedAt: pastTime,
          },
        ],
        webhookSecrets: {},
      };
      await fs.writeFile(statePath, JSON.stringify(existingState), 'utf-8');

      const definition: AutomationDefinition = {
        version: 1,
        id: 'missed-auto',
        name: 'Missed Automation',
        scope: 'global',
        trigger: { type: 'schedule', cron: '0 * * * *' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      const run: AutomationRun = {
        id: 'run_recovered',
        automationId: 'missed-auto',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        variables: { system: {}, project: {}, workflow: {}, steps: {} },
        stepRuns: [],
      };

      store.loadAutomationById.mockResolvedValue(definition);
      runtimeEngine.executeById.mockResolvedValue(run);

      // Create new scheduler instance that will load state and recover missed runs
      const newScheduler = new AutomationSchedulerService(dataDir, runtimeEngine as any);
      await newScheduler.initialize(events);

      // Wait for async recovery to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the missed run was executed
      expect(runtimeEngine.executeById).toHaveBeenCalledWith('missed-auto', expect.any(Object));

      await newScheduler.shutdown();
    });
  });

  describe('state version handling', () => {
    it('resets state when version mismatch', async () => {
      const statePath = path.join(dataDir, 'automation-scheduler-state.json');
      const oldState = {
        version: 999, // Wrong version
        updatedAt: new Date().toISOString(),
        scheduledRuns: [
          {
            id: 'sr_old',
            automationId: 'old-auto',
            scope: 'global',
            scheduledFor: new Date(Date.now() + 3600000).toISOString(),
            triggerType: 'schedule',
            status: 'scheduled',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        webhookSecrets: {},
      };
      await fs.writeFile(statePath, JSON.stringify(oldState), 'utf-8');

      // Initialize should detect version mismatch and use defaults
      await scheduler.initialize(events);

      // State should be reset (empty)
      expect(scheduler.getScheduledRuns()).toHaveLength(0);
    });
  });

  describe('scheduled run cleanup', () => {
    it('removes old completed runs when limit exceeded', async () => {
      // Schedule more than MAX_SCHEDULED_RUN_HISTORY runs
      const promises = [];
      for (let i = 0; i < 105; i++) {
        promises.push(
          scheduler.scheduleRun({
            automationId: `auto-${i}`,
            scope: 'global',
            scheduledFor: new Date(Date.now() + 60000 + i * 1000).toISOString(),
            triggerType: 'manual',
          })
        );
      }
      await Promise.all(promises);

      const runs = scheduler.getScheduledRuns();
      // All scheduled runs should still be present (cleanup only removes completed/failed)
      expect(runs.length).toBe(105);
    });
  });
});
