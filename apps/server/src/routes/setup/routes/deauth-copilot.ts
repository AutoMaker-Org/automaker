/**
 * POST /deauth-copilot endpoint - Disconnect Copilot CLI from the app
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { disconnectCopilot } from '../../../services/copilot-connection-service.js';

/**
 * Creates handler for POST /api/setup/deauth-copilot
 * Creates a marker file to disconnect Copilot CLI from the app
 */
export function createDeauthCopilotHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      await disconnectCopilot();

      res.json({
        success: true,
        message: 'Copilot CLI disconnected from app',
      });
    } catch (error) {
      logError(error, 'Deauth Copilot failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
