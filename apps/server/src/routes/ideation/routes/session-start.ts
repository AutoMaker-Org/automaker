/**
 * POST /session/start - Start a new ideation session
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import type { StartSessionOptions } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createSessionStartHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, options } = req.body as {
        projectPath: string;
        options?: StartSessionOptions;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const session = await ideationService.startSession(projectPath, options);
      res.json({ success: true, session });
    } catch (error) {
      logError(error, 'Start session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
