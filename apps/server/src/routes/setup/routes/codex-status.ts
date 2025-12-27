/**
 * GET /codex-status endpoint - Get Codex CLI status
 */

import type { Request, Response } from 'express';
import { CodexProvider } from '../../../providers/codex-provider.js';
import { getErrorMessage, logError } from '../common.js';

export function createCodexStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = new CodexProvider();
      const status = await provider.detectInstallation();

      res.json({
        success: true,
        status: status.installed ? 'installed' : 'not_installed',
        installed: status.installed,
        method: status.method || 'cli',
        version: status.version,
        path: status.path,
        auth: {
          authenticated: status.authenticated ?? false,
          method: status.hasApiKey ? 'api_key' : status.authenticated ? 'cli' : 'none',
          hasApiKey: status.hasApiKey ?? false,
          apiKeyValid: status.hasApiKey ?? false,
          hasEnvApiKey: !!process.env.OPENAI_API_KEY,
        },
      });
    } catch (error) {
      logError(error, 'Codex status check failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
