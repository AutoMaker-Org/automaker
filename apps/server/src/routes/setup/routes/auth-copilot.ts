/**
 * POST /auth-copilot endpoint - Connect Copilot CLI to the app
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { connectCopilot } from '../../../services/copilot-connection-service.js';

/**
 * Creates handler for POST /api/setup/auth-copilot
 * Removes the disconnection marker to allow Copilot CLI to be used
 */
export function createAuthCopilotHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      await connectCopilot();

      res.json({
        success: true,
        message: 'Copilot CLI connected to app',
      });
    } catch (error) {
      logError(error, 'Auth Copilot failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
