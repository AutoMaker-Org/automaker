/**
 * POST /generate endpoint - Generate a backlog plan
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import {
  getBacklogPlanStatus,
  setRunningState,
  setRunningDetails,
  getErrorMessage,
  logError,
} from '../common.js';
import { generateBacklogPlan } from '../generate-plan.js';
import type { SettingsService } from '../../../services/settings-service.js';

export function createGenerateHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prompt, model, branchName } = req.body as {
        projectPath: string;
        prompt: string;
        model?: string;
        branchName?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      if (!prompt) {
        res.status(400).json({ success: false, error: 'prompt required' });
        return;
      }

      const { isRunning } = getBacklogPlanStatus();
      if (isRunning) {
        res.json({
          success: false,
          error: 'Backlog plan generation is already running',
        });
        return;
      }

      const abortController = new AbortController();
      setRunningState(true, abortController);
      setRunningDetails({
        projectPath,
        prompt,
        model,
        startedAt: new Date().toISOString(),
      });

      // Start generation in background
      // Note: generateBacklogPlan handles its own error event emission
      // and state cleanup in its finally block, so we only log here
      generateBacklogPlan(
        projectPath,
        prompt,
        events,
        abortController,
        settingsService,
        model,
        branchName
      ).catch((error) => {
        // Just log - error event already emitted by generateBacklogPlan
        logError(error, 'Generate backlog plan failed (background)');
      });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Generate backlog plan failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
