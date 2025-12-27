/**
 * POST /stop endpoint - Stop the current backlog plan generation
 */

import type { Request, Response } from 'express';
import { getAbortController, setRunningState, getErrorMessage, logError } from '../common.js';

export function createStopHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const abortController = getAbortController();
      if (abortController) {
        abortController.abort();
        setRunningState(false, null);
      }
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stop backlog plan failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
