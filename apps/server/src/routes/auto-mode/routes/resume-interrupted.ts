/**
 * Resume Interrupted Features Handler
 *
 * Checks for features that were interrupted (in pipeline steps or in_progress)
 * when the server was restarted and resumes them.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { AutoModeService } from '../../../services/auto-mode-service.js';

const logger = createLogger('ResumeInterrupted');

interface ResumeInterruptedRequest {
  projectPath: string;
}

export function createResumeInterruptedHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    const { projectPath } = req.body as ResumeInterruptedRequest;

    if (!projectPath) {
      res.status(400).json({ error: 'Project path is required' });
      return;
    }

    logger.info(`Checking for interrupted features in ${projectPath}`);

    try {
      await autoModeService.resumeInterruptedFeatures(projectPath);
      res.json({
        success: true,
        message: 'Resume check completed',
      });
    } catch (error) {
      logger.error('Error resuming interrupted features:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
