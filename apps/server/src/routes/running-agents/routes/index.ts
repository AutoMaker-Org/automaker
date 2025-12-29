/**
 * GET / endpoint - Get all running agents
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createIndexHandler(autoModeService: AutoModeService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const runningAgents = await autoModeService.getRunningAgents();

      res.json({
        success: true,
        runningAgents,
        totalCount: runningAgents.length,
      });
    } catch (error) {
      logError(error, 'Get running agents failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
