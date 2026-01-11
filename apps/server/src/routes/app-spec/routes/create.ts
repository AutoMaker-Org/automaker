/**
 * POST /create endpoint - Create project spec from overview
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

const logger = createLogger('SpecRegeneration');

export function createCreateHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    logger.info('========== /create endpoint called ==========');
    logger.debug('Request body:', JSON.stringify(req.body, null, 2));

    try {
      const { projectPath, projectOverview, generateFeatures, analyzeProject, maxFeatures } =
        req.body as {
          projectPath: string;
          projectOverview: string;
          generateFeatures?: boolean;
          analyzeProject?: boolean;
          maxFeatures?: number;
        };

      logger.debug('Parsed params:');
      logger.debug('  projectPath:', projectPath);
      logger.debug('  projectOverview length:', `${projectOverview?.length || 0} chars`);
      logger.debug('  generateFeatures:', generateFeatures);
      logger.debug('  analyzeProject:', analyzeProject);
      logger.debug('  maxFeatures:', maxFeatures);

      if (!projectPath || !projectOverview) {
        logger.error('Missing required parameters');
        res.status(400).json({
          success: false,
          error: 'projectPath and projectOverview required',
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

      // Start generation in background
      generateSpec(
        projectPath,
        projectOverview,
        events,
        abortController,
        generateFeatures,
        analyzeProject,
        maxFeatures
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
      logError(error, 'Create spec route handler failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
