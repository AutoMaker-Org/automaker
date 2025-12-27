/**
 * POST /generate endpoint - Generate suggestions
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import { createLogger } from '@automaker/utils';
import { getSuggestionsStatus, setRunningState, getErrorMessage, logError } from '../common.js';
import { generateSuggestions } from '../generate-suggestions.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('Suggestions');

export function createGenerateHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, suggestionType = 'features' } = req.body as {
        projectPath: string;
        suggestionType?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      const { isRunning } = getSuggestionsStatus();
      if (isRunning) {
        res.json({
          success: false,
          error: 'Suggestions generation is already running',
        });
        return;
      }

      setRunningState(true);
      const abortController = new AbortController();
      setRunningState(true, abortController);

      // Start generation in background
      generateSuggestions(projectPath, suggestionType, events, abortController, settingsService)
        .catch((error) => {
          logError(error, 'Generate suggestions failed (background)');
          events.emit('suggestions:event', {
            type: 'suggestions_error',
            error: getErrorMessage(error),
          });
        })
        .finally(() => {
          setRunningState(false, null);
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Generate suggestions failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
