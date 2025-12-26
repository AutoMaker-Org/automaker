/**
 * GET /status endpoint - Get backlog plan generation status
 */

import type { Request, Response } from 'express';
import { getBacklogPlanStatus, getErrorMessage, logError } from '../common.js';

export function createStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = getBacklogPlanStatus();
      res.json({ success: true, ...status });
    } catch (error) {
      logError(error, 'Get backlog plan status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
