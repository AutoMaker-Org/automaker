/**
 * POST /stop endpoint - Stop generation
 */

import type { Request, Response } from 'express';
import { getSpecRegenerationStatus, setRunningState, getErrorMessage } from '../common.js';

export function createStopHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };
      const { currentAbortController } = getSpecRegenerationStatus(projectPath);
      if (currentAbortController) {
        currentAbortController.abort();
      }
      if (projectPath) {
        setRunningState(projectPath, false, null);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
