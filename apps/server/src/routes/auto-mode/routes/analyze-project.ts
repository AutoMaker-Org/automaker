/**
 * POST /analyze-project endpoint - Analyze project
 */

import type { Request, Response } from 'express';
import type { AutoModeServiceCompat } from '../../../services/auto-mode/index.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createAnalyzeProjectHandler(autoModeService: AutoModeServiceCompat) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Kick off analysis in the background; attach a rejection handler so
      // unhandled-promise warnings don't surface and errors are at least logged.
      // Synchronous throws (e.g. "not implemented") still propagate here.
      const analysisPromise = autoModeService.analyzeProject(projectPath);
      analysisPromise.catch((err) => logError(err, 'Background analyzeProject failed'));

      res.json({ success: true, message: 'Project analysis started' });
    } catch (error) {
      logError(error, 'Analyze project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
