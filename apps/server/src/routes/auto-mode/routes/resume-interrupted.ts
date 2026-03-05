/**
 * Resume Interrupted Features Handler
 *
 * Checks for features that were interrupted (in pipeline steps or in_progress)
 * when the server was restarted and resumes them.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { AutoModeServiceCompat } from '../../../services/auto-mode/index.js';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('ResumeInterrupted');

export function createResumeInterruptedHandler(autoModeService: AutoModeServiceCompat) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      logger.info(`Checking for interrupted features in ${projectPath}`);

      await autoModeService.resumeInterruptedFeatures(projectPath);

      res.json({
        success: true,
        message: 'Resume check completed',
      });
    } catch (error) {
      logError(error, 'Resume interrupted features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
