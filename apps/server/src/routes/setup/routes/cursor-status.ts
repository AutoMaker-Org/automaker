/**
 * GET /cursor-status endpoint - Get Cursor CLI status
 */

import type { Request, Response } from 'express';
import { getCursorStatus } from '../get-cursor-status.js';
import { getErrorMessage, logError } from '../common.js';

export function createCursorStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await getCursorStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Get Cursor status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
