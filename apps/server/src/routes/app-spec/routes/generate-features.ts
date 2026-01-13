/**
 * POST /generate-features endpoint - Generate features from existing spec
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import { createLogger } from '@automaker/utils';
import {
  getSpecRegenerationStatus,
  setRunningState,
  logAuthStatus,
  logError,
  getErrorMessage,
} from '../common.js';
import { generateFeaturesFromSpec } from '../generate-features-from-spec.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('SpecRegeneration');

export function createGenerateFeaturesHandler(
  events: EventEmitter,
  settingsService?: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    logger.info('========== /generate-features endpoint called ==========');
    logger.debug('Request body:', JSON.stringify(req.body, null, 2));

    try {
      const { projectPath, maxFeatures } = req.body as {
        projectPath: string;
        maxFeatures?: number;
      };

      logger.debug('projectPath:', projectPath);
      logger.debug('maxFeatures:', maxFeatures);

      if (!projectPath) {
        logger.error('Missing projectPath parameter');
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      const { isRunning } = getSpecRegenerationStatus(projectPath);
      if (isRunning) {
        logger.warn('Generation already running for project:', projectPath);
        res.json({ success: false, error: 'Generation already running for this project' });
        return;
      }

      logAuthStatus('Before starting feature generation');

      const abortController = new AbortController();
      setRunningState(projectPath, true, abortController);
      logger.info('Starting background feature generation task...');

      generateFeaturesFromSpec(projectPath, events, abortController, maxFeatures, settingsService)
        .catch((error) => {
          logError(error, 'Feature generation failed with error');
          events.emit('spec-regeneration:event', {
            type: 'features_error',
            error: getErrorMessage(error),
          });
        })
        .finally(() => {
          logger.info('Feature generation task finished (success or error)');
          setRunningState(projectPath, false, null);
        });

      logger.info('Returning success response (generation running in background)');
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Generate features route handler failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
