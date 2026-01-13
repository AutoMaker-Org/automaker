/**
 * GET /status endpoint - Get generation status
 */

import type { Request, Response } from 'express';
import { getSpecRegenerationStatus, getErrorMessage } from '../common.js';

export function createStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      const { isRunning } = getSpecRegenerationStatus(projectPath);
      res.json({ success: true, isRunning, projectPath });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
