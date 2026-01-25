/**
 * GET /status endpoint - Get backlog plan generation status
 */

import type { Request, Response } from 'express';
import { getBacklogPlanStatus, loadBacklogPlan, getErrorMessage, logError } from '../common.js';

export function createStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const status = getBacklogPlanStatus();
      const projectPath = typeof req.query.projectPath === 'string' ? req.query.projectPath : '';
      const savedPlan = projectPath ? await loadBacklogPlan(projectPath) : null;
      res.json({ success: true, ...status, savedPlan });
    } catch (error) {
      logError(error, 'Get backlog plan status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
