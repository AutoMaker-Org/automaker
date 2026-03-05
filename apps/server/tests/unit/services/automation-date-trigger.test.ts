/**
 * Unit tests for date trigger scheduling and scheduler edge cases
 *
 * Covers:
 * - Date-based one-time trigger scheduling
 * - refreshSchedules for date triggers
 * - cleanupOldRuns (completed/failed run pruning)
 * - emitSchedulerEvent
 * - getAutomationSchedulerService singleton
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AutomationDefinition, AutomationRun } from '@automaker/types';
import { AutomationSchedulerService } from '@/services/automation-scheduler-service.js';
import { createEventEmitter } from '@/lib/events.js';

describe('automation date triggers and scheduler edge cases', () => {
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
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-date-trigger-test-'));
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

  describe('date trigger - one-time scheduling', () => {
    it('schedules run for date trigger automation at specified time', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const result = await scheduler.scheduleRun({
        automationId: 'date-auto',
        scope: 'global',
        scheduledFor: futureDate.toISOString(),
        triggerType: 'date',
      });

      expect(result.success).toBe(true);
      expect(result.scheduledRunId).toBeDefined();

      const run = scheduler.getScheduledRun(result.scheduledRunId!);
      expect(run).not.toBeNull();
      expect(run?.triggerType).toBe('date');
      expect(run?.status).toBe('scheduled');
      expect(new Date(run!.scheduledFor).getTime()).toBeCloseTo(futureDate.getTime(), -2);
    });

    it('accepts date-trigger automation with a past scheduledFor (recovery scenario)', async () => {
      // Past dates are allowed to be scheduled (they'll run immediately in the next check)
      const pastDate = new Date(Date.now() - 60 * 1000).toISOString();

      const result = await scheduler.scheduleRun({
        automationId: 'date-auto-past',
        scope: 'global',
        scheduledFor: pastDate,
        triggerType: 'date',
      });

      expect(result.success).toBe(true);
      expect(result.scheduledRunId).toBeDefined();
    });

    it('executes date-triggered run when scheduler loop fires', async () => {
      const definition: AutomationDefinition = {
        version: 1,
        id: 'date-execution',
        name: 'Date Execution',
        scope: 'global',
        trigger: { type: 'date', date: new Date(Date.now() - 1000).toISOString() },
        steps: [{ id: 's1', type: 'noop' }],
      };

      const run: AutomationRun = {
        id: 'run_date',
        automationId: 'date-execution',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        variables: { system: {}, project: {}, workflow: {}, steps: {} },
        stepRuns: [],
      };

      store.loadAutomationById.mockResolvedValue(definition);
      runtimeEngine.executeById.mockResolvedValue(run);

      // Schedule a run that is due (past scheduled time)
      await scheduler.scheduleRun({
        automationId: 'date-execution',
        scope: 'global',
        scheduledFor: new Date(Date.now() - 1000).toISOString(),
        triggerType: 'date',
      });

      // Initialize to start the scheduler loop
      await scheduler.initialize(events);

      // Wait for scheduler loop to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The run should have been executed
      expect(runtimeEngine.executeById).toHaveBeenCalledWith('date-execution', expect.any(Object));
    });
  });

  describe('refreshSchedules with date triggers', () => {
    it('does not schedule date trigger automations (handled externally)', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'date-auto',
          name: 'Date Automation',
          scope: 'global',
          enabled: true,
          trigger: {
            type: 'date',
            date: new Date(Date.now() + 3600 * 1000).toISOString(),
          },
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      // refreshSchedules only handles 'schedule' type, not 'date' type
      expect(scheduler.getScheduledRuns()).toHaveLength(0);
    });
  });

  describe('cleanupOldRuns - run history pruning', () => {
    it('removes old completed/failed runs when over MAX_SCHEDULED_RUN_HISTORY', async () => {
      // Schedule 105 runs and immediately mark them as completed
      for (let i = 0; i < 105; i++) {
        const result = await scheduler.scheduleRun({
          automationId: `auto-${i}`,
          scope: 'global',
          scheduledFor: new Date(Date.now() + 60000 + i * 1000).toISOString(),
          triggerType: 'manual',
        });

        // Manually update status to completed to trigger cleanup
        const run = scheduler.getScheduledRun(result.scheduledRunId!);
        if (run) {
          (run as any).status = 'completed';
        }
      }

      // Force another scheduleRun to trigger cleanupOldRuns
      await scheduler.scheduleRun({
        automationId: 'trigger-cleanup',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 200000).toISOString(),
        triggerType: 'manual',
      });

      const allRuns = scheduler.getScheduledRuns();
      // After cleanup, completed runs should be pruned to MAX_SCHEDULED_RUN_HISTORY (100)
      // Plus the one new scheduled run = 101
      expect(allRuns.length).toBeLessThanOrEqual(102);
    });
  });

  describe('scheduler event emission', () => {
    it('emits automation:scheduler event when run is scheduled', async () => {
      const receivedEvents: unknown[] = [];
      const unsubscribe = events.subscribe((type, payload) => {
        if (type === ('automation:scheduler' as never)) {
          receivedEvents.push(payload);
        }
      });

      await scheduler.initialize(events);

      await scheduler.scheduleRun({
        automationId: 'event-emit-test',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      const event = receivedEvents[0] as any;
      expect(event.type).toBe('scheduled');
      expect(event.automationId).toBe('event-emit-test');

      unsubscribe();
    });

    it('emits cancelled event when run is cancelled', async () => {
      const receivedEvents: unknown[] = [];
      const unsubscribe = events.subscribe((type, payload) => {
        if (type === ('automation:scheduler' as never)) {
          receivedEvents.push(payload);
        }
      });

      await scheduler.initialize(events);

      const result = await scheduler.scheduleRun({
        automationId: 'cancel-event-test',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      await scheduler.cancelScheduledRun(result.scheduledRunId!);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const cancelledEvents = (receivedEvents as any[]).filter((e) => e.type === 'cancelled');
      expect(cancelledEvents.length).toBeGreaterThanOrEqual(1);
      expect(cancelledEvents[0].scheduledRunId).toBe(result.scheduledRunId);

      unsubscribe();
    });
  });

  describe('scheduler without emitter (before initialize)', () => {
    it('scheduleRun works before initialize is called', async () => {
      // Scheduler not yet initialized (no emitter)
      const result = await scheduler.scheduleRun({
        automationId: 'pre-init-test',
        scope: 'global',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        triggerType: 'manual',
      });

      expect(result.success).toBe(true);
      expect(scheduler.getScheduledRuns()).toHaveLength(1);
    });
  });

  describe('webhook automation not found handling', () => {
    it('returns error when webhook automation is not found', async () => {
      store.loadAutomationById.mockResolvedValue(null);

      const result = await scheduler.handleWebhookTrigger('non-existent', { ping: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('cron schedule - specific time matching', () => {
    it('schedules enabled schedule automation with exact hour/minute cron', async () => {
      // Use a cron that matches at most once per hour (specific minute)
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'exact-time',
          name: 'Exact Time',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '30 9 * * *' }, // 9:30 AM every day
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      const runs = scheduler.getScheduledRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].triggerType).toBe('schedule');

      const scheduledTime = new Date(runs[0].scheduledFor);
      // The scheduled time should have minutes = 30
      expect(scheduledTime.getMinutes()).toBe(30);
      // And hours = 9
      expect(scheduledTime.getHours()).toBe(9);
    });

    it('schedules with day-of-week constraint (weekdays only)', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'weekdays',
          name: 'Weekdays',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '0 8 * * 1-5' }, // 8 AM Mon-Fri
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      const runs = scheduler.getScheduledRuns();
      expect(runs).toHaveLength(1);

      const scheduledTime = new Date(runs[0].scheduledFor);
      // Should be on a weekday (1-5)
      const dayOfWeek = scheduledTime.getDay();
      expect(dayOfWeek).toBeGreaterThanOrEqual(1);
      expect(dayOfWeek).toBeLessThanOrEqual(5);
    });

    it('rejects hour value out of range (0-23)', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'bad-hour',
          name: 'Bad Hour',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '0 24 * * *' }, // 24 is invalid (max 23)
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      // Should not schedule due to invalid cron
      expect(scheduler.getScheduledRuns()).toHaveLength(0);
    });

    it('rejects minute value out of range (0-59)', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'bad-minute',
          name: 'Bad Minute',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '60 * * * *' }, // 60 is invalid (max 59)
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      expect(scheduler.getScheduledRuns()).toHaveLength(0);
    });

    it('rejects month value out of range (1-12)', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'bad-month',
          name: 'Bad Month',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '0 0 1 13 *' }, // month 13 is invalid
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      expect(scheduler.getScheduledRuns()).toHaveLength(0);
    });

    it('rejects day-of-week value out of range (0-6)', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'bad-dow',
          name: 'Bad Day of Week',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '0 0 * * 7' }, // 7 is invalid (max 6)
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      expect(scheduler.getScheduledRuns()).toHaveLength(0);
    });

    it('handles combined list and range in cron', async () => {
      store.listAutomations.mockResolvedValue([
        {
          version: 1,
          id: 'combo-cron',
          name: 'Combo cron',
          scope: 'global',
          enabled: true,
          trigger: { type: 'schedule', cron: '0,30 9-17 * * 1-5' }, // every 30min, 9-5 on weekdays
          steps: [{ id: 's1', type: 'noop' }],
        },
      ]);

      await scheduler.refreshSchedules();

      const runs = scheduler.getScheduledRuns();
      expect(runs).toHaveLength(1);
    });
  });

  describe('initialization - event subscription setup', () => {
    it('subscribes to events only once per initialization', async () => {
      await scheduler.initialize(events);

      // Should not throw or create duplicate subscriptions
      // Verify event triggering still works
      const eventAutomation: AutomationDefinition = {
        version: 1,
        id: 'sub-test-auto',
        name: 'Sub test',
        scope: 'global',
        enabled: true,
        trigger: { type: 'event', event: 'test:sub' },
        steps: [{ id: 's1', type: 'noop' }],
      };

      const run: AutomationRun = {
        id: 'run_sub',
        automationId: 'sub-test-auto',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        variables: { system: {}, project: {}, workflow: {}, steps: {} },
        stepRuns: [],
      };

      store.listAutomations.mockResolvedValue([eventAutomation]);
      store.loadAutomationById.mockResolvedValue(eventAutomation);
      runtimeEngine.executeById.mockResolvedValue(run);

      events.emit('test:sub', { test: true });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should be called exactly once (not duplicate)
      expect(runtimeEngine.executeById).toHaveBeenCalledTimes(1);
    });
  });
});
