/**
 * POST /auth-codex endpoint - Auth Codex CLI
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';

const CODEX_LOGIN_COMMAND = 'codex login';

export function createAuthCodexHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        requiresManualAuth: true,
        command: CODEX_LOGIN_COMMAND,
        message: `Please run '${CODEX_LOGIN_COMMAND}' in your terminal to authenticate`,
      });
    } catch (error) {
      logError(error, 'Auth Codex failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
