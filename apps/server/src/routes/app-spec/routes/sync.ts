/**
 * POST /sync endpoint - Sync spec with codebase and features
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
import { syncSpec } from '../sync-spec.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('SpecSync');

export function createSyncHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    logger.info('========== /sync endpoint called ==========');
    logger.debug('Request body:', JSON.stringify(req.body, null, 2));

    try {
      const { projectPath } = req.body as {
        projectPath: string;
      };

      logger.debug('projectPath:', projectPath);

      if (!projectPath) {
        logger.error('Missing projectPath parameter');
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      const { isRunning } = getSpecRegenerationStatus(projectPath);
      if (isRunning) {
        logger.warn('Generation/sync already running for project:', projectPath);
        res.json({ success: false, error: 'Operation already running for this project' });
        return;
      }

      logAuthStatus('Before starting spec sync');

      const abortController = new AbortController();
      setRunningState(projectPath, true, abortController, 'sync');
      logger.info('Starting background spec sync task...');

      syncSpec(projectPath, events, abortController, settingsService)
        .then((result) => {
          logger.info('Spec sync completed successfully');
          logger.info('Result:', JSON.stringify(result, null, 2));
        })
        .catch((error) => {
          logError(error, 'Spec sync failed with error');
          events.emit('spec-regeneration:event', {
            type: 'spec_regeneration_error',
            error: getErrorMessage(error),
            projectPath,
          });
        })
        .finally(() => {
          logger.info('Spec sync task finished (success or error)');
          setRunningState(projectPath, false, null);
        });

      logger.info('Returning success response (sync running in background)');
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Sync route handler failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
