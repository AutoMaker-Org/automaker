/**
 * GET /cursor-status endpoint - Get Cursor CLI installation and auth status
 */

import type { Request, Response } from 'express';
import { CursorProvider } from '../../../providers/cursor-provider.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Creates handler for GET /api/setup/cursor-status
 * Returns Cursor CLI installation and authentication status
 */
export function createCursorStatusHandler() {
  const installCommand = 'curl https://cursor.com/install -fsS | bash';
  const loginCommand = 'cursor-agent login';

  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = new CursorProvider();

      const [installed, version, auth] = await Promise.all([
        provider.isInstalled(),
        provider.getVersion(),
        provider.checkAuth(),
      ]);

      // Get CLI path from provider using public accessor
      const cliPath = installed ? provider.getCliPath() : null;

      res.json({
        success: true,
        installed,
        version: version || null,
        path: cliPath,
        auth: {
          authenticated: auth.authenticated,
          method: auth.method,
        },
        installCommand,
        loginCommand,
      });
    } catch (error) {
      logError(error, 'Get Cursor status failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
