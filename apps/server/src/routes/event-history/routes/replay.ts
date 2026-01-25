/**
 * POST /api/event-history/replay - Replay an event to trigger hooks
 *
 * Request body: {
 *   projectPath: string,
 *   eventId: string,
 *   hookIds?: string[]  // Optional: specific hooks to run (if not provided, runs all enabled matching hooks)
 * }
 * Response: { success: true, result: EventReplayResult }
 */

import type { Request, Response } from 'express';
import type { EventHistoryService } from '../../../services/event-history-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import type { EventReplayResult, EventReplayHookResult, EventHook } from '@automaker/types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError, logger } from '../common.js';

const execAsync = promisify(exec);

/** Default timeout for shell commands (30 seconds) */
const DEFAULT_SHELL_TIMEOUT = 30000;

/** Default timeout for HTTP requests (10 seconds) */
const DEFAULT_HTTP_TIMEOUT = 10000;

interface HookContext {
  featureId?: string;
  featureName?: string;
  projectPath?: string;
  projectName?: string;
  error?: string;
  errorType?: string;
  timestamp: string;
  eventType: string;
}

/**
 * Substitute {{variable}} placeholders in a string
 */
function substituteVariables(template: string, context: HookContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
    const value = context[variable as keyof HookContext];
    if (value === undefined || value === null) {
      return '';
    }
    return String(value);
  });
}

/**
 * Execute a single hook and return the result
 */
async function executeHook(hook: EventHook, context: HookContext): Promise<EventReplayHookResult> {
  const hookName = hook.name || hook.id;
  const startTime = Date.now();

  try {
    if (hook.action.type === 'shell') {
      const command = substituteVariables(hook.action.command, context);
      const timeout = hook.action.timeout || DEFAULT_SHELL_TIMEOUT;

      logger.info(`Replaying shell hook "${hookName}": ${command}`);

      await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024,
      });

      return {
        hookId: hook.id,
        hookName: hook.name,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } else if (hook.action.type === 'http') {
      const url = substituteVariables(hook.action.url, context);
      const method = hook.action.method || 'POST';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (hook.action.headers) {
        for (const [key, value] of Object.entries(hook.action.headers)) {
          headers[key] = substituteVariables(value, context);
        }
      }

      let body: string | undefined;
      if (hook.action.body) {
        body = substituteVariables(hook.action.body, context);
      } else if (method !== 'GET') {
        body = JSON.stringify({
          eventType: context.eventType,
          timestamp: context.timestamp,
          featureId: context.featureId,
          projectPath: context.projectPath,
          projectName: context.projectName,
          error: context.error,
        });
      }

      logger.info(`Replaying HTTP hook "${hookName}": ${method} ${url}`);

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
        return {
          hookId: hook.id,
          hookName: hook.name,
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        hookId: hook.id,
        hookName: hook.name,
        success: true,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      hookId: hook.id,
      hookName: hook.name,
      success: false,
      error: 'Unknown hook action type',
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.name === 'AbortError'
          ? 'Request timed out'
          : error.message
        : String(error);

    return {
      hookId: hook.id,
      hookName: hook.name,
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

export function createReplayHandler(
  eventHistoryService: EventHistoryService,
  settingsService: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, eventId, hookIds } = req.body as {
        projectPath: string;
        eventId: string;
        hookIds?: string[];
      };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!eventId || typeof eventId !== 'string') {
        res.status(400).json({ success: false, error: 'eventId is required' });
        return;
      }

      // Get the event
      const event = await eventHistoryService.getEvent(projectPath, eventId);
      if (!event) {
        res.status(404).json({ success: false, error: 'Event not found' });
        return;
      }

      // Get hooks from settings
      const settings = await settingsService.getGlobalSettings();
      let hooks = settings.eventHooks || [];

      // Filter to matching trigger and enabled hooks
      hooks = hooks.filter((h) => h.enabled && h.trigger === event.trigger);

      // If specific hook IDs requested, filter to those
      if (hookIds && hookIds.length > 0) {
        hooks = hooks.filter((h) => hookIds.includes(h.id));
      }

      // Build context for variable substitution
      const context: HookContext = {
        featureId: event.featureId,
        featureName: event.featureName,
        projectPath: event.projectPath,
        projectName: event.projectName,
        error: event.error,
        errorType: event.errorType,
        timestamp: event.timestamp,
        eventType: event.trigger,
      };

      // Execute all hooks in parallel
      const hookResults = await Promise.all(hooks.map((hook) => executeHook(hook, context)));

      const result: EventReplayResult = {
        eventId,
        hooksTriggered: hooks.length,
        hookResults,
      };

      logger.info(`Replayed event ${eventId}: ${hooks.length} hooks triggered`);

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      logError(error, 'Replay event failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
