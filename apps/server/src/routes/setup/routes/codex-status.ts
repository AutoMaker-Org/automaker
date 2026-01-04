/**
 * GET /codex-status endpoint - Get Codex CLI status
 */

import type { Request, Response } from 'express';
import { getCodexStatus } from '../get-codex-status.js';
import { getErrorMessage, logError } from '../common.js';

export function createCodexStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await getCodexStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Get Codex status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
