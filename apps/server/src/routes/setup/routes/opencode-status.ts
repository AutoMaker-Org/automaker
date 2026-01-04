/**
 * GET /opencode-status endpoint - Get OpenCode CLI status
 */

import type { Request, Response } from 'express';
import { getOpenCodeStatus } from '../get-opencode-status.js';
import { getErrorMessage, logError } from '../common.js';

export function createOpenCodeStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await getOpenCodeStatus();

      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'OpenCode status check failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
