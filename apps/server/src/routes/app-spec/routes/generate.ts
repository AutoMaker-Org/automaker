/**
 * POST /generate endpoint - Generate spec from project definition
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
import { generateSpec } from '../generate-spec.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('SpecRegeneration');

export function createGenerateHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    logger.info('========== /generate endpoint called ==========');
    logger.debug('Request body:', JSON.stringify(req.body, null, 2));

    try {
      const { projectPath, projectDefinition, generateFeatures, analyzeProject, maxFeatures } =
        req.body as {
          projectPath: string;
          projectDefinition: string;
          generateFeatures?: boolean;
          analyzeProject?: boolean;
          maxFeatures?: number;
        };

      logger.debug('Parsed params:');
      logger.debug('  projectPath:', projectPath);
      logger.debug('  projectDefinition length:', `${projectDefinition?.length || 0} chars`);
      logger.debug('  generateFeatures:', generateFeatures);
      logger.debug('  analyzeProject:', analyzeProject);
      logger.debug('  maxFeatures:', maxFeatures);

      if (!projectPath || !projectDefinition) {
        logger.error('Missing required parameters');
        res.status(400).json({
          success: false,
          error: 'projectPath and projectDefinition required',
        });
        return;
      }

      const { isRunning } = getSpecRegenerationStatus(projectPath);
      if (isRunning) {
        logger.warn('Generation already running for project:', projectPath);
        res.json({ success: false, error: 'Spec generation already running for this project' });
        return;
      }

      logAuthStatus('Before starting generation');

      const abortController = new AbortController();
      setRunningState(projectPath, true, abortController);
      logger.info('Starting background generation task...');

      generateSpec(
        projectPath,
        projectDefinition,
        events,
        abortController,
        generateFeatures,
        analyzeProject,
        maxFeatures,
        settingsService
      )
        .catch((error) => {
          logError(error, 'Generation failed with error');
          events.emit('spec-regeneration:event', {
            type: 'spec_regeneration_error',
            error: getErrorMessage(error),
            projectPath: projectPath,
          });
        })
        .finally(() => {
          logger.info('Generation task finished (success or error)');
          setRunningState(projectPath, false, null);
        });

      logger.info('Returning success response (generation running in background)');
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Generate spec route handler failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
