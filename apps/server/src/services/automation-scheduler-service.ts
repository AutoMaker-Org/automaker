/**
 * Automation Scheduler Service - Manages trigger execution for automations
 *
 * Features:
 * - Schedule triggers (cron-based scheduling)
 * - Date triggers (one-time execution)
 * - Webhook triggers (HTTP endpoint triggers)
 * - Event triggers (internal AutoMaker events)
 * - Manual triggers (API/UI-initiated)
 * - State persistence for server restart survival
 */

import path from 'path';
import { createLogger } from '@automaker/utils';
import { getAutomationSchedulerStatePath, ensureDataDir } from '@automaker/platform';
import type {
  AutomationDefinition,
  AutomationTriggerType,
  AutomationSchedulerState,
  ScheduledRun,
  ScheduledRunStatus,
  AutomationSchedulerEvent,
  TriggerAutomationOptions,
  SchedulerOperationResult,
  AutomationScope,
  AutomationVariableValue,
  AutoModeOperations,
} from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import { AutomationRuntimeEngine, AutomationDefinitionStore } from './automation-runtime-engine.js';
import * as secureFs from '../lib/secure-fs.js';

const logger = createLogger('AutomationScheduler');

/** Scheduler state file version */
const SCHEDULER_STATE_VERSION = 1;

/** Default check interval for scheduled runs (1 minute) */
const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000;

/** Milliseconds in one minute - used for cron calculations */
const ONE_MINUTE_MS = 60 * 1000;

/** Maximum scheduled runs to keep in history */
const MAX_SCHEDULED_RUN_HISTORY = 100;

/** Maximum minutes to look ahead when finding next cron match (1 year) */
const MAX_CRON_LOOKAHEAD_MINUTES = 365 * 24 * 60;

/** Generate unique ID for scheduled runs */
function generateScheduledRunId(): string {
  return `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Current ISO timestamp */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Used for webhook token validation.
 *
 * Both strings are compared over the full length of the longer one so
 * that the execution time does not leak the lengths of either value.
 */
function constantTimeEquals(a: string, b: string): boolean {
  // Compare lengths without short-circuiting (XOR result folded in)
  let result = a.length ^ b.length;

  // Compare characters up to the longer string; out-of-bounds reads return
  // NaN from charCodeAt, which XOR-folds to 0 — harmless for the length
  // mismatch already captured above.
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

/**
 * Automation Scheduler Service
 *
 * Manages trigger execution for automations including schedule, webhook, event, and manual triggers.
 * Persists state to survive server restarts and continues scheduled runs on recovery.
 */
export class AutomationSchedulerService {
  private dataDir: string;
  private emitter: EventEmitter | null = null;
  private runtimeEngine: AutomationRuntimeEngine;
  private definitionStore: AutomationDefinitionStore;
  private state: AutomationSchedulerState;
  private stateFilePath: string;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private checkIntervalMs: number;
  private eventUnsubscribe: (() => void) | null = null;
  private runningScheduledRuns = new Set<string>();
  private autoModeOperations: AutoModeOperations | undefined;

  constructor(
    dataDir: string,
    runtimeEngine: AutomationRuntimeEngine,
    checkIntervalMs: number = DEFAULT_CHECK_INTERVAL_MS
  ) {
    this.dataDir = dataDir;
    this.runtimeEngine = runtimeEngine;
    this.definitionStore = runtimeEngine.getDefinitionStore();
    this.checkIntervalMs = checkIntervalMs;
    this.stateFilePath = getAutomationSchedulerStatePath(dataDir);
    this.state = this.getDefaultState();
    this.autoModeOperations = undefined;
  }

  /**
   * Set auto mode operations for automation steps that need to control auto mode
   */
  setAutoModeOperations(operations: AutoModeOperations): void {
    this.autoModeOperations = operations;
  }

  /**
   * Initialize the scheduler service
   */
  async initialize(emitter: EventEmitter): Promise<void> {
    this.emitter = emitter;

    // Load persisted state
    await this.loadState();

    // Subscribe to internal events for event-triggered automations
    this.subscribeToEvents();

    // Start the scheduler loop
    this.startSchedulerLoop();

    // Recover any scheduled runs that should have run during downtime
    await this.recoverMissedRuns();

    logger.info('Automation scheduler service initialized');
  }

  /**
   * Cleanup and shutdown the scheduler
   */
  async shutdown(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = null;
    }

    // Save final state
    await this.saveState();

    logger.info('Automation scheduler service shut down');
  }

  /**
   * Get default scheduler state
   */
  private getDefaultState(): AutomationSchedulerState {
    return {
      version: SCHEDULER_STATE_VERSION,
      updatedAt: nowIso(),
      scheduledRuns: [],
      webhookSecrets: {},
    };
  }

  /**
   * Load persisted scheduler state from disk
   */
  private async loadState(): Promise<void> {
    try {
      await ensureDataDir(this.dataDir);
      const content = await secureFs.readFile(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(content as string) as AutomationSchedulerState;

      if (parsed.version === SCHEDULER_STATE_VERSION) {
        this.state = parsed;
        logger.info(
          `Loaded scheduler state with ${this.state.scheduledRuns.length} scheduled runs`
        );
      } else {
        logger.warn(
          `Scheduler state version mismatch (expected ${SCHEDULER_STATE_VERSION}, got ${parsed.version}), using defaults`
        );
        this.state = this.getDefaultState();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No existing scheduler state found, starting fresh');
        this.state = this.getDefaultState();
      } else {
        logger.error('Failed to load scheduler state:', error);
        this.state = this.getDefaultState();
      }
    }
  }

  /**
   * Save scheduler state to disk
   */
  private async saveState(): Promise<void> {
    try {
      this.state.updatedAt = nowIso();
      await ensureDataDir(this.dataDir);
      await secureFs.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Failed to save scheduler state:', error);
    }
  }

  /**
   * Subscribe to internal events for event-triggered automations
   */
  private subscribeToEvents(): void {
    if (!this.emitter) return;

    this.eventUnsubscribe = this.emitter.subscribe(async (type, payload) => {
      await this.handleInternalEvent(type, payload);
    });
  }

  /**
   * Handle internal AutoMaker events and trigger matching automations
   */
  private async handleInternalEvent(eventType: string, payload: unknown): Promise<void> {
    try {
      // Load all automations with event triggers
      const automations = await this.getAllAutomationsWithEventTriggers(eventType);

      for (const automation of automations) {
        if (automation.enabled === false) continue;

        // Check if event matches the automation's trigger
        if (this.matchesEventTrigger(automation, eventType, payload)) {
          logger.info(`Triggering automation ${automation.id} via event: ${eventType}`);

          await this.triggerAutomation(automation.id, {
            scope: automation.scope,
            triggerMetadata: {
              type: 'event',
              event: eventType,
              payload,
              triggeredAt: nowIso(),
            },
          });
        }
      }
    } catch (error) {
      logger.error('Error handling internal event:', error);
    }
  }

  /**
   * Get all automations that have event triggers matching the given event type
   */
  private async getAllAutomationsWithEventTriggers(
    eventType: string
  ): Promise<AutomationDefinition[]> {
    const matching: AutomationDefinition[] = [];

    try {
      // Check global automations
      const globalAutomations = await this.definitionStore.listAutomations({
        scope: 'global',
      });
      for (const auto of globalAutomations) {
        if (auto.trigger.type === 'event' && auto.trigger.event === eventType) {
          matching.push(auto);
        }
      }

      // Note: Project-scoped automations would require iterating through all projects
      // For now, we focus on global automations. Project automations can be added later.
    } catch (error) {
      logger.error('Error loading automations for event trigger:', error);
    }

    return matching;
  }

  /**
   * Check if an event matches an automation's trigger configuration
   */
  private matchesEventTrigger(
    automation: AutomationDefinition,
    eventType: string,
    _payload: unknown
  ): boolean {
    const trigger = automation.trigger;
    if (trigger.type !== 'event') return false;

    // Check if event type matches
    if (trigger.event !== eventType) return false;

    // TODO: Implement filter expression evaluation if trigger.filter is present
    // For now, just match on event type

    return true;
  }

  /**
   * Start the scheduler loop for time-based triggers
   */
  private startSchedulerLoop(): void {
    this.checkInterval = setInterval(() => {
      this.checkScheduledRuns().catch((error) => {
        logger.error('Error in scheduler loop:', error);
      });
    }, this.checkIntervalMs);

    // Run initial check immediately
    this.checkScheduledRuns().catch((error) => {
      logger.error('Error in initial scheduler check:', error);
    });
  }

  /**
   * Check and execute any scheduled runs that are due
   */
  private async checkScheduledRuns(): Promise<void> {
    const now = new Date();
    const dueRuns = this.state.scheduledRuns.filter(
      (run) =>
        run.status === 'scheduled' &&
        new Date(run.scheduledFor) <= now &&
        !this.runningScheduledRuns.has(run.id)
    );

    for (const run of dueRuns) {
      // Mark as running to prevent duplicate execution
      this.runningScheduledRuns.add(run.id);

      try {
        await this.executeScheduledRun(run);
      } catch (error) {
        logger.error(`Failed to execute scheduled run ${run.id}:`, error);
      } finally {
        this.runningScheduledRuns.delete(run.id);
      }
    }
  }

  /**
   * Execute a scheduled run
   */
  private async executeScheduledRun(run: ScheduledRun): Promise<void> {
    logger.info(`Executing scheduled run ${run.id} for automation ${run.automationId}`);

    // Update status to running
    run.status = 'running';
    run.updatedAt = nowIso();
    this.emitSchedulerEvent('started', run);
    await this.saveState();

    try {
      const executionRun = await this.runtimeEngine.executeById(run.automationId, {
        scope: run.scope,
        projectPath: run.projectPath,
        trigger: {
          type: run.triggerType,
          metadata: { scheduledRunId: run.id },
        },
        autoMode: this.autoModeOperations,
      });

      run.runId = executionRun.id;
      // Map execution run status to scheduled run status.
      // 'cancelled' preserves the cancellation signal; everything else that
      // isn't 'completed' is treated as a failure.
      run.status =
        executionRun.status === 'completed'
          ? 'completed'
          : executionRun.status === 'cancelled'
            ? 'cancelled'
            : 'failed';
      run.error = executionRun.error?.message;
      run.updatedAt = nowIso();

      this.emitSchedulerEvent(run.status === 'completed' ? 'completed' : 'failed', run);

      logger.info(`Scheduled run ${run.id} ${run.status}${run.error ? `: ${run.error}` : ''}`);
    } catch (error) {
      run.status = 'failed';
      run.error = error instanceof Error ? error.message : String(error);
      run.updatedAt = nowIso();

      this.emitSchedulerEvent('failed', run);

      logger.error(`Scheduled run ${run.id} failed:`, error);
    }

    await this.saveState();

    // If this was a date trigger (one-time), schedule next if needed
    // For recurring schedules, schedule the next occurrence
    if (run.triggerType === 'schedule') {
      await this.scheduleNextRun(run.automationId, run.scope, run.projectPath);
    }
  }

  /**
   * Schedule the next run for a recurring automation
   */
  private async scheduleNextRun(
    automationId: string,
    scope: AutomationScope,
    projectPath?: string
  ): Promise<void> {
    try {
      const automation = await this.definitionStore.loadAutomationById(automationId, {
        scope,
        projectPath,
      });

      if (!automation || automation.enabled === false) return;
      if (automation.trigger.type !== 'schedule') return;

      const nextRun = this.calculateNextRun(automation);
      if (nextRun) {
        await this.scheduleRun({
          automationId: automation.id,
          scope: automation.scope,
          projectPath,
          scheduledFor: nextRun.toISOString(),
          triggerType: 'schedule',
        });
      }
    } catch (error) {
      logger.error(`Failed to schedule next run for automation ${automationId}:`, error);
    }
  }

  /**
   * Calculate the next run time for a scheduled automation
   */
  private calculateNextRun(automation: AutomationDefinition): Date | null {
    const trigger = automation.trigger;
    if (trigger.type !== 'schedule' || !trigger.cron) return null;

    try {
      // Simple cron parser for basic expressions
      // Format: minute hour day-of-month month day-of-week
      const nextTime = this.parseCronAndGetNext(trigger.cron, trigger.timezone);
      return nextTime;
    } catch (error) {
      logger.error(`Failed to parse cron expression "${trigger.cron}":`, error);
      return null;
    }
  }

  /**
   * Parse a cron expression and get the next run time
   * Supports basic cron format: minute hour day-of-month month day-of-week
   */
  private parseCronAndGetNext(cronExpr: string, _timezone?: string): Date | null {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    this.validateCronField(minute, 0, 59, 'minute');
    this.validateCronField(hour, 0, 23, 'hour');
    this.validateCronField(dayOfMonth, 1, 31, 'day-of-month');
    this.validateCronField(month, 1, 12, 'month');
    this.validateCronField(dayOfWeek, 0, 6, 'day-of-week');

    // Start from the next whole minute (≥ now + 1s) to avoid firing immediately.
    // We advance by 1 minute and zero out sub-minute components so the first
    // candidate is exactly at the next minute boundary.
    const now = new Date();
    let candidate = new Date(now.getTime() + ONE_MINUTE_MS);
    candidate.setSeconds(0, 0);

    // Search for next matching time (up to 1 year ahead)
    for (let i = 0; i < MAX_CRON_LOOKAHEAD_MINUTES; i++) {
      if (
        this.cronFieldMatches(minute, candidate.getMinutes(), 0, 59) &&
        this.cronFieldMatches(hour, candidate.getHours(), 0, 23) &&
        this.cronFieldMatches(dayOfMonth, candidate.getDate(), 1, 31) &&
        this.cronFieldMatches(month, candidate.getMonth() + 1, 1, 12) &&
        this.cronFieldMatches(dayOfWeek, candidate.getDay(), 0, 6)
      ) {
        return candidate;
      }

      // Advance by 1 minute
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    logger.warn(`Could not find next run time for cron: ${cronExpr}`);
    return null;
  }

  /**
   * Check if a cron field matches a value
   */
  private cronFieldMatches(field: string, value: number, min: number, max: number): boolean {
    if (field === '*') return true;

    // Handle lists (e.g., "1,3,5")
    if (field.includes(',')) {
      return field.split(',').some((part) => this.cronFieldMatches(part, value, min, max));
    }

    // Handle ranges (e.g., "1-5") — requires exactly 2 parts
    if (field.includes('-')) {
      const rangeParts = field.split('-');
      if (rangeParts.length !== 2) return false;
      const start = parseInt(rangeParts[0], 10);
      const end = parseInt(rangeParts[1], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
      if (start > end) return false;
      return value >= start && value <= end;
    }

    // Handle step values (e.g., "*/5")
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      if (!Number.isFinite(step) || step <= 0) return false;
      return (value - min) % step === 0;
    }

    // Handle exact values
    const fieldValue = parseInt(field, 10);
    if (isNaN(fieldValue)) return false;
    return value === fieldValue;
  }

  private validateCronField(field: string, min: number, max: number, label: string): void {
    if (field === '*') return;

    if (field.includes(',')) {
      for (const part of field.split(',')) {
        this.validateCronField(part, min, max, label);
      }
      return;
    }

    if (field.includes('-')) {
      const rangeParts = field.split('-');
      if (rangeParts.length !== 2) {
        throw new Error(`Invalid ${label} range: ${field}`);
      }
      const [startStr, endStr] = rangeParts;
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < min ||
        end > max ||
        start > end
      ) {
        throw new Error(`Invalid ${label} range: ${field}`);
      }
      return;
    }

    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`Invalid ${label} step: ${field}`);
      }
      return;
    }

    const exact = parseInt(field, 10);
    if (!Number.isInteger(exact) || exact < min || exact > max) {
      throw new Error(`Invalid ${label} value: ${field}`);
    }
  }

  /**
   * Recover scheduled runs that should have run while server was down
   */
  private async recoverMissedRuns(): Promise<void> {
    const now = new Date();
    const missedRuns = this.state.scheduledRuns.filter(
      (run) => run.status === 'scheduled' && new Date(run.scheduledFor) <= now
    );

    if (missedRuns.length === 0) return;

    logger.info(`Recovering ${missedRuns.length} missed scheduled runs`);

    for (const run of missedRuns) {
      logger.info(`Executing missed run ${run.id} for automation ${run.automationId}`);
      try {
        await this.executeScheduledRun(run);
      } catch (error) {
        logger.error(`Failed to recover run ${run.id}:`, error);
      }
    }
  }

  /**
   * Schedule a new run for an automation
   *
   * @param options - Scheduling options
   * @param options.automationId - Unique identifier of the automation to run
   * @param options.scope - Scope of the automation ('global' or 'project')
   * @param options.projectPath - Required for project-scoped automations
   * @param options.scheduledFor - ISO 8601 timestamp for when to run
   * @param options.triggerType - Type of trigger that initiated this schedule
   * @returns Result indicating success/failure and scheduled run ID
   */
  async scheduleRun(options: {
    automationId: string;
    scope: AutomationScope;
    projectPath?: string;
    scheduledFor: string;
    triggerType: AutomationTriggerType;
  }): Promise<SchedulerOperationResult> {
    // Validate inputs
    if (!options.automationId?.trim()) {
      return { success: false, error: 'automationId is required' };
    }

    if (!options.scope || (options.scope !== 'global' && options.scope !== 'project')) {
      return { success: false, error: 'scope must be "global" or "project"' };
    }

    // Validate scheduledFor is a valid date
    const scheduledDate = new Date(options.scheduledFor);
    if (isNaN(scheduledDate.getTime())) {
      return { success: false, error: 'scheduledFor must be a valid ISO 8601 date string' };
    }

    // Project-scoped automations require projectPath
    if (options.scope === 'project' && !options.projectPath?.trim()) {
      return { success: false, error: 'projectPath is required for project-scoped automations' };
    }

    const scheduledRun: ScheduledRun = {
      id: generateScheduledRunId(),
      automationId: options.automationId,
      scope: options.scope,
      projectPath: options.projectPath,
      scheduledFor: options.scheduledFor,
      triggerType: options.triggerType,
      status: 'scheduled',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    // Add to state and cleanup old runs
    this.state.scheduledRuns.push(scheduledRun);
    this.cleanupOldRuns();
    await this.saveState();

    this.emitSchedulerEvent('scheduled', scheduledRun);

    logger.info(
      `Scheduled run ${scheduledRun.id} for automation ${options.automationId} at ${options.scheduledFor}`
    );

    return { success: true, scheduledRunId: scheduledRun.id };
  }

  /**
   * Cleanup old completed/failed runs to prevent unbounded growth
   */
  private cleanupOldRuns(): void {
    const nonScheduled = this.state.scheduledRuns.filter((run) => run.status !== 'scheduled');

    if (nonScheduled.length > MAX_SCHEDULED_RUN_HISTORY) {
      // Sort by updatedAt descending and keep only the most recent
      nonScheduled.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      const toKeep = new Set(nonScheduled.slice(0, MAX_SCHEDULED_RUN_HISTORY).map((run) => run.id));

      this.state.scheduledRuns = this.state.scheduledRuns.filter(
        (run) => run.status === 'scheduled' || toKeep.has(run.id)
      );
    }
  }

  /**
   * Trigger an automation manually or via webhook/event
   */
  async triggerAutomation(
    automationId: string,
    options: TriggerAutomationOptions = {}
  ): Promise<SchedulerOperationResult> {
    try {
      // Load the automation definition
      const automation = await this.definitionStore.loadAutomationById(automationId, {
        scope: options.scope,
        projectPath: options.projectPath,
      });

      if (!automation) {
        return {
          success: false,
          error: `Automation not found: ${automationId}`,
          errorCode: 'NOT_FOUND',
        };
      }

      if (automation.enabled === false) {
        return {
          success: false,
          error: `Automation is disabled: ${automationId}`,
          errorCode: 'DISABLED',
        };
      }

      // Resolve the effective trigger type: prefer the caller-supplied metadata
      // type (e.g. 'event', 'webhook') so that the run record reflects the
      // actual origin; fall back to 'manual' for UI/API-initiated calls.
      const effectiveTriggerType =
        typeof options.triggerMetadata?.type === 'string' &&
        ['manual', 'event', 'webhook', 'schedule', 'date'].includes(
          options.triggerMetadata.type as string
        )
          ? (options.triggerMetadata.type as AutomationTriggerType)
          : ('manual' as const);

      // Execute the automation
      const run = await this.runtimeEngine.executeById(automationId, {
        scope: options.scope ?? automation.scope,
        projectPath: options.projectPath,
        variables: options.variables,
        trigger: {
          type: effectiveTriggerType,
          metadata: options.triggerMetadata,
        },
        autoMode: this.autoModeOperations,
      });

      logger.info(`Triggered automation ${automationId}, run ${run.id}, status: ${run.status}`);

      return {
        success: run.status === 'completed',
        scheduledRunId: run.id,
        error: run.error?.message,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to trigger automation ${automationId}:`, error);
      return { success: false, error: message };
    }
  }

  /**
   * Handle a webhook trigger request
   */
  async handleWebhookTrigger(
    automationId: string,
    payload: unknown,
    token?: string
  ): Promise<SchedulerOperationResult> {
    try {
      // Load the automation
      const automation = await this.definitionStore.loadAutomationById(automationId);

      if (!automation) {
        return {
          success: false,
          error: `Automation not found: ${automationId}`,
          errorCode: 'NOT_FOUND',
        };
      }

      // Verify it's a webhook-triggered automation
      if (automation.trigger.type !== 'webhook') {
        return {
          success: false,
          error: `Automation ${automationId} is not webhook-triggered`,
          errorCode: 'METHOD_NOT_ALLOWED',
        };
      }

      // Validate token if configured (use constant-time comparison to prevent timing attacks)
      const expectedSecret = this.state.webhookSecrets[automationId];
      if (expectedSecret) {
        if (!token || !constantTimeEquals(expectedSecret, token)) {
          return { success: false, error: 'Invalid webhook token', errorCode: 'INVALID_TOKEN' };
        }
      }

      // Trigger the automation
      return this.triggerAutomation(automationId, {
        scope: automation.scope,
        triggerMetadata: {
          type: 'webhook',
          payload,
          triggeredAt: nowIso(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to handle webhook trigger for ${automationId}:`, error);
      return { success: false, error: message };
    }
  }

  /**
   * Register a webhook automation with its secret
   */
  async registerWebhookAutomation(automationId: string, secret?: string): Promise<string> {
    // Generate a secret if not provided
    const webhookSecret =
      secret || `whsec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

    this.state.webhookSecrets[automationId] = webhookSecret;
    await this.saveState();

    logger.info(`Registered webhook for automation ${automationId}`);
    return webhookSecret;
  }

  /**
   * Unregister a webhook automation
   */
  async unregisterWebhookAutomation(automationId: string): Promise<void> {
    delete this.state.webhookSecrets[automationId];
    await this.saveState();
    logger.info(`Unregistered webhook for automation ${automationId}`);
  }

  /**
   * Cancel a scheduled run
   *
   * @param scheduledRunId - Unique identifier of the scheduled run to cancel
   * @returns Result indicating success/failure
   */
  async cancelScheduledRun(scheduledRunId: string): Promise<SchedulerOperationResult> {
    // Validate input
    if (!scheduledRunId?.trim()) {
      return { success: false, error: 'scheduledRunId is required' };
    }

    const run = this.state.scheduledRuns.find((r) => r.id === scheduledRunId);

    if (!run) {
      return {
        success: false,
        errorCode: 'NOT_FOUND',
        error: `Scheduled run not found: ${scheduledRunId}`,
      };
    }

    // Cannot cancel runs that are already completed, failed, or cancelled
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      return {
        success: false,
        error: `Cannot cancel run with status: ${run.status}`,
      };
    }

    // If the run is currently running, it cannot be cancelled
    // (it must finish or fail naturally)
    if (run.status === 'running') {
      return {
        success: false,
        error: 'Cannot cancel a run that is currently executing',
      };
    }

    run.status = 'cancelled';
    run.updatedAt = nowIso();
    await this.saveState();

    this.emitSchedulerEvent('cancelled', run);

    logger.info(`Cancelled scheduled run ${scheduledRunId}`);
    return { success: true, scheduledRunId };
  }

  /**
   * Get all scheduled runs
   */
  getScheduledRuns(automationId?: string): ScheduledRun[] {
    const runs = this.state.scheduledRuns;
    if (automationId) {
      return runs.filter((run) => run.automationId === automationId);
    }
    return runs;
  }

  /**
   * Get a specific scheduled run
   */
  getScheduledRun(scheduledRunId: string): ScheduledRun | null {
    return this.state.scheduledRuns.find((run) => run.id === scheduledRunId) || null;
  }

  /**
   * Emit a scheduler event
   */
  private emitSchedulerEvent(type: AutomationSchedulerEvent['type'], run: ScheduledRun): void {
    if (!this.emitter) return;

    const event: AutomationSchedulerEvent = {
      type,
      scheduledRunId: run.id,
      automationId: run.automationId,
      scheduledFor: run.scheduledFor,
      runId: run.runId,
      error: run.error,
      timestamp: nowIso(),
    };

    this.emitter.emit('automation:scheduler' as never, event);
  }

  /**
   * Refresh schedules for all automations (called when automations are updated)
   */
  async refreshSchedules(): Promise<void> {
    try {
      // Clear existing scheduled runs that haven't started
      this.state.scheduledRuns = this.state.scheduledRuns.filter(
        (run) => run.status !== 'scheduled'
      );

      // Load all automations and schedule their next runs
      const automations = await this.definitionStore.listAutomations({ scope: 'global' });
      let scheduledCount = 0;
      const scheduleErrors: string[] = [];

      for (const automation of automations) {
        if (automation.enabled === false) continue;

        if (automation.trigger.type === 'schedule') {
          try {
            const nextRun = this.calculateNextRun(automation);
            if (nextRun) {
              await this.scheduleRun({
                automationId: automation.id,
                scope: automation.scope,
                scheduledFor: nextRun.toISOString(),
                triggerType: 'schedule',
              });
              scheduledCount += 1;
            }
          } catch (automationError) {
            const message =
              automationError instanceof Error ? automationError.message : String(automationError);
            scheduleErrors.push(`${automation.id}: ${message}`);
            logger.warn(`Failed to schedule automation ${automation.id}:`, automationError);
          }
        }
      }

      await this.saveState();

      if (scheduleErrors.length > 0) {
        logger.warn(
          `Refreshed automation schedules with ${scheduleErrors.length} error(s). Scheduled: ${scheduledCount}. Failures: ${scheduleErrors.join('; ')}`
        );
      } else {
        logger.info(`Refreshed automation schedules. Scheduled: ${scheduledCount}`);
      }
    } catch (error) {
      logger.error('Failed to refresh schedules:', error);
    }
  }
}

// Singleton instance (created during server initialization)
let schedulerServiceInstance: AutomationSchedulerService | null = null;

/**
 * Get the scheduler service instance
 */
export function getAutomationSchedulerService(): AutomationSchedulerService | null {
  return schedulerServiceInstance;
}

/**
 * Initialize the scheduler service singleton
 */
export async function initializeAutomationSchedulerService(
  dataDir: string,
  emitter: EventEmitter,
  runtimeEngine: AutomationRuntimeEngine
): Promise<AutomationSchedulerService> {
  if (schedulerServiceInstance) {
    return schedulerServiceInstance;
  }

  schedulerServiceInstance = new AutomationSchedulerService(dataDir, runtimeEngine);
  await schedulerServiceInstance.initialize(emitter);
  return schedulerServiceInstance;
}

/**
 * Shutdown the scheduler service singleton
 */
export async function shutdownAutomationSchedulerService(): Promise<void> {
  if (schedulerServiceInstance) {
    await schedulerServiceInstance.shutdown();
    schedulerServiceInstance = null;
  }
}
