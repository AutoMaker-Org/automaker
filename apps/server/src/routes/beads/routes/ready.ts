/**
 * POST /ready endpoint - Get ready work (issues with no open blockers)
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createReadyWorkHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, limit } = req.body as {
        projectPath: string;
        limit?: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const issues = await beadsService.getReadyWork(projectPath, limit);
      res.json({ success: true, issues });
    } catch (error) {
      logError(error, 'Get ready work failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
