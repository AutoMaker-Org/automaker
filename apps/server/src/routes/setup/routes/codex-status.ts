/**
 * GET /codex-status endpoint - Get Codex CLI installation and auth status
 */

import type { Request, Response } from 'express';
import { CodexProvider } from '../../../providers/codex-provider.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Creates handler for GET /api/setup/codex-status
 * Returns Codex CLI installation and authentication status
 */
export function createCodexStatusHandler() {
  const installCommand = 'npm install -g @openai/codex';
  const loginCommand = 'codex login';

  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = new CodexProvider();
      const status = await provider.detectInstallation();

      // Derive auth method from authenticated status and API key presence
      let authMethod = 'none';
      if (status.authenticated) {
        authMethod = status.hasApiKey ? 'api_key_env' : 'cli_authenticated';
      }

      res.json({
        success: true,
        installed: status.installed,
        version: status.version || null,
        path: status.path || null,
        auth: {
          authenticated: status.authenticated || false,
          method: authMethod,
          hasApiKey: status.hasApiKey || false,
        },
        installCommand,
        loginCommand,
      });
    } catch (error) {
      logError(error, 'Get Codex status failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
