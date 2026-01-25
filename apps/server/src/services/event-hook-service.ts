/**
 * Event Hook Service - Executes custom actions when system events occur
 *
 * Listens to the event emitter and triggers configured hooks:
 * - Shell commands: Executed with configurable timeout
 * - HTTP webhooks: POST/GET/PUT/PATCH requests with variable substitution
 *
 * Also stores events to history for debugging and replay.
 *
 * Supported events:
 * - feature_created: A new feature was created
 * - feature_success: Feature completed successfully
 * - feature_error: Feature failed with an error
 * - auto_mode_complete: Auto mode finished all features (idle state)
 * - auto_mode_error: Auto mode encountered a critical error
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { EventHistoryService } from './event-history-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type {
  EventHook,
  EventHookTrigger,
  EventHookShellAction,
  EventHookHttpAction,
} from '@automaker/types';

const execAsync = promisify(exec);
const logger = createLogger('EventHooks');

/** Default timeout for shell commands (30 seconds) */
const DEFAULT_SHELL_TIMEOUT = 30000;

/** Default timeout for HTTP requests (10 seconds) */
const DEFAULT_HTTP_TIMEOUT = 10000;

/**
 * Context available for variable substitution in hooks
 */
interface HookContext {
  featureId?: string;
  featureName?: string;
  projectPath?: string;
  projectName?: string;
  error?: string;
  errorType?: string;
  timestamp: string;
  eventType: EventHookTrigger;
}

/**
 * Auto-mode event payload structure
 */
interface AutoModeEventPayload {
  type?: string;
  featureId?: string;
  featureName?: string;
  passes?: boolean;
  message?: string;
  error?: string;
  errorType?: string;
  projectPath?: string;
}

/**
 * Feature created event payload structure
 */
interface FeatureCreatedPayload {
  featureId: string;
  featureName?: string;
  projectPath: string;
}

/**
 * Event Hook Service
 *
 * Manages execution of user-configured event hooks in response to system events.
 * Also stores events to history for debugging and replay.
 */
export class EventHookService {
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private eventHistoryService: EventHistoryService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize the service with event emitter, settings service, event history service, and feature loader
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    eventHistoryService?: EventHistoryService,
    featureLoader?: FeatureLoader
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.eventHistoryService = eventHistoryService || null;
    this.featureLoader = featureLoader || null;

    // Subscribe to events
    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'auto-mode:event') {
        this.handleAutoModeEvent(payload as AutoModeEventPayload);
      } else if (type === 'feature:created') {
        this.handleFeatureCreatedEvent(payload as FeatureCreatedPayload);
      }
    });

    logger.info('Event hook service initialized');
  }

  /**
   * Cleanup subscriptions
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.emitter = null;
    this.settingsService = null;
    this.eventHistoryService = null;
    this.featureLoader = null;
  }

  /**
   * Handle auto-mode events and trigger matching hooks
   */
  private async handleAutoModeEvent(payload: AutoModeEventPayload): Promise<void> {
    if (!payload.type) return;

    // Map internal event types to hook triggers
    let trigger: EventHookTrigger | null = null;

    switch (payload.type) {
      case 'auto_mode_feature_complete':
        trigger = payload.passes ? 'feature_success' : 'feature_error';
        break;
      case 'auto_mode_error':
        // Feature-level error (has featureId) vs auto-mode level error
        trigger = payload.featureId ? 'feature_error' : 'auto_mode_error';
        break;
      case 'auto_mode_idle':
        trigger = 'auto_mode_complete';
        break;
      default:
        // Other event types don't trigger hooks
        return;
    }

    if (!trigger) return;

    // Load feature name if we have featureId but no featureName
    let featureName: string | undefined = undefined;
    if (payload.featureId && payload.projectPath && this.featureLoader) {
      try {
        const feature = await this.featureLoader.get(payload.projectPath, payload.featureId);
        if (feature?.title) {
          featureName = feature.title;
        }
      } catch (error) {
        logger.warn(`Failed to load feature ${payload.featureId} for event hook:`, error);
      }
    }

    // Build context for variable substitution
    const context: HookContext = {
      featureId: payload.featureId,
      featureName: payload.featureName,
      projectPath: payload.projectPath,
      projectName: payload.projectPath ? this.extractProjectName(payload.projectPath) : undefined,
      error: payload.error || payload.message,
      errorType: payload.errorType,
      timestamp: new Date().toISOString(),
      eventType: trigger,
    };

    // Execute matching hooks (pass passes for feature completion events)
    await this.executeHooksForTrigger(trigger, context, { passes: payload.passes });
  }

  /**
   * Handle feature:created events and trigger matching hooks
   */
  private async handleFeatureCreatedEvent(payload: FeatureCreatedPayload): Promise<void> {
    const context: HookContext = {
      featureId: payload.featureId,
      featureName: payload.featureName,
      projectPath: payload.projectPath,
      projectName: this.extractProjectName(payload.projectPath),
      timestamp: new Date().toISOString(),
      eventType: 'feature_created',
    };

    await this.executeHooksForTrigger('feature_created', context);
  }

  /**
   * Execute all enabled hooks matching the given trigger and store event to history
   */
  private async executeHooksForTrigger(
    trigger: EventHookTrigger,
    context: HookContext,
    additionalData?: { passes?: boolean }
  ): Promise<void> {
    // Store event to history (even if no hooks match)
    if (this.eventHistoryService && context.projectPath) {
      try {
        await this.eventHistoryService.storeEvent({
          trigger,
          projectPath: context.projectPath,
          featureId: context.featureId,
          featureName: context.featureName,
          error: context.error,
          errorType: context.errorType,
          passes: additionalData?.passes,
        });
      } catch (error) {
        logger.error('Failed to store event to history:', error);
      }
    }

    if (!this.settingsService) {
      logger.warn('Settings service not available');
      return;
    }

    try {
      const settings = await this.settingsService.getGlobalSettings();
      const hooks = settings.eventHooks || [];

      // Filter to enabled hooks matching this trigger
      const matchingHooks = hooks.filter((hook) => hook.enabled && hook.trigger === trigger);

      if (matchingHooks.length === 0) {
        return;
      }

      logger.info(`Executing ${matchingHooks.length} hook(s) for trigger: ${trigger}`);

      // Execute hooks in parallel (don't wait for one to finish before starting next)
      await Promise.allSettled(matchingHooks.map((hook) => this.executeHook(hook, context)));
    } catch (error) {
      logger.error('Error executing hooks:', error);
    }
  }

  /**
   * Execute a single hook
   */
  private async executeHook(hook: EventHook, context: HookContext): Promise<void> {
    const hookName = hook.name || hook.id;

    try {
      if (hook.action.type === 'shell') {
        await this.executeShellHook(hook.action, context, hookName);
      } else if (hook.action.type === 'http') {
        await this.executeHttpHook(hook.action, context, hookName);
      }
    } catch (error) {
      logger.error(`Hook "${hookName}" failed:`, error);
    }
  }

  /**
   * Execute a shell command hook
   */
  private async executeShellHook(
    action: EventHookShellAction,
    context: HookContext,
    hookName: string
  ): Promise<void> {
    const command = this.substituteVariables(action.command, context);
    const timeout = action.timeout || DEFAULT_SHELL_TIMEOUT;

    logger.info(`Executing shell hook "${hookName}": ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
      });

      if (stdout) {
        logger.debug(`Hook "${hookName}" stdout: ${stdout.trim()}`);
      }
      if (stderr) {
        logger.warn(`Hook "${hookName}" stderr: ${stderr.trim()}`);
      }

      logger.info(`Shell hook "${hookName}" completed successfully`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
        logger.error(`Shell hook "${hookName}" timed out after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Execute an HTTP webhook hook
   */
  private async executeHttpHook(
    action: EventHookHttpAction,
    context: HookContext,
    hookName: string
  ): Promise<void> {
    const url = this.substituteVariables(action.url, context);
    const method = action.method || 'POST';

    // Substitute variables in headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (action.headers) {
      for (const [key, value] of Object.entries(action.headers)) {
        headers[key] = this.substituteVariables(value, context);
      }
    }

    // Substitute variables in body
    let body: string | undefined;
    if (action.body) {
      body = this.substituteVariables(action.body, context);
    } else if (method !== 'GET') {
      // Default body with context information
      body = JSON.stringify({
        eventType: context.eventType,
        timestamp: context.timestamp,
        featureId: context.featureId,
        featureName: context.featureName,
        projectPath: context.projectPath,
        projectName: context.projectName,
        error: context.error,
      });
    }

    logger.info(`Executing HTTP hook "${hookName}": ${method} ${url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_HTTP_TIMEOUT);

      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' ? body : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn(`HTTP hook "${hookName}" received status ${response.status}`);
      } else {
        logger.info(`HTTP hook "${hookName}" completed successfully (status: ${response.status})`);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.error(`HTTP hook "${hookName}" timed out after ${DEFAULT_HTTP_TIMEOUT}ms`);
      }
      throw error;
    }
  }

  /**
   * Substitute {{variable}} placeholders in a string
   */
  private substituteVariables(template: string, context: HookContext): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      const value = context[variable as keyof HookContext];
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  /**
   * Extract project name from path
   */
  private extractProjectName(projectPath: string): string {
    const parts = projectPath.split(/[/\\]/);
    return parts[parts.length - 1] || projectPath;
  }
}

// Singleton instance
export const eventHookService = new EventHookService();
