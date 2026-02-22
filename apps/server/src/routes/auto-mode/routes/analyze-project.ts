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

      // Await the call so that a rejected promise (e.g. "not implemented"
      // thrown by the facade) is caught by the outer try/catch and returned
      // as an actual error rather than silently swallowed while the route
      // returns { success: true }.
      await autoModeService.analyzeProject(projectPath);

      res.json({ success: true, message: 'Project analysis started' });
    } catch (error) {
      logError(error, 'Analyze project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
