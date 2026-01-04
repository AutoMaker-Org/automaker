/**
 * POST /install-codex endpoint - Install Codex CLI
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';

const INSTALL_COMMAND = 'npm install -g @openai/codex';

export function createInstallCodexHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: false,
        error:
          'CLI installation requires terminal access. Please install manually using: ' +
          INSTALL_COMMAND,
      });
    } catch (error) {
      logError(error, 'Install Codex CLI failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
