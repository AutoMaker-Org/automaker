/**
 * POST /auth-codex endpoint - Authenticate Codex CLI
 */

import type { Request, Response } from 'express';
import { logError, getErrorMessage } from '../common.js';

/**
 * Creates handler for POST /api/setup/auth-codex
 * Returns instructions for manual Codex CLI authentication
 */
export function createAuthCodexHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const loginCommand = 'codex login';

      res.json({
        success: true,
        requiresManualAuth: true,
        command: loginCommand,
        message: `Please authenticate Codex CLI manually by running: ${loginCommand}`,
      });
    } catch (error) {
      logError(error, 'Auth Codex failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
