/**
 * GET /opencode-status endpoint - Get OpenCode CLI status
 */

import type { Request, Response } from 'express';
import { OpenCodeProvider } from '../../../providers/opencode-provider.js';
import { getErrorMessage, logError } from '../common.js';

export function createOpenCodeStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = new OpenCodeProvider();
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
          method: status.authenticated ? 'cli' : 'none',
          hasApiKey: status.hasApiKey ?? false,
          apiKeyValid: status.hasApiKey ?? false,
          hasEnvApiKey: false,
        },
      });
    } catch (error) {
      logError(error, 'OpenCode status check failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
