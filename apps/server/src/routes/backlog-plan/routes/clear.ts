/**
 * POST /clear endpoint - Clear saved backlog plan
 */

import type { Request, Response } from 'express';
import { clearBacklogPlan, getErrorMessage, logError } from '../common.js';

export function createClearHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      await clearBacklogPlan(projectPath);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Clear backlog plan failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
