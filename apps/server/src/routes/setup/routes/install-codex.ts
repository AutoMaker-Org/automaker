/**
 * POST /install-codex endpoint - Install Codex CLI
 */

import type { Request, Response } from 'express';
import { logError, getErrorMessage } from '../common.js';

/**
 * Creates handler for POST /api/setup/install-codex
 * Installs Codex CLI (currently returns instructions for manual install)
 */
export function createInstallCodexHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // For now, return manual installation instructions
      // In the future, this could potentially trigger npm global install
      const installCommand = 'npm install -g @openai/codex';

      res.json({
        success: true,
        message: `Please install Codex CLI manually by running: ${installCommand}`,
        requiresManualInstall: true,
        installCommand,
      });
    } catch (error) {
      logError(error, 'Install Codex failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
