/**
 * GET /copilot-status endpoint - Get Copilot CLI installation and auth status
 */

import type { Request, Response } from 'express';
import { CopilotProvider } from '../../../providers/copilot-provider.js';
import { getErrorMessage, logError } from '../common.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const DISCONNECTED_MARKER_FILE = '.copilot-disconnected';

async function isCopilotDisconnectedFromApp(): Promise<boolean> {
  try {
    const projectRoot = process.cwd();
    const markerPath = path.join(projectRoot, '.automaker', DISCONNECTED_MARKER_FILE);
    await fs.access(markerPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates handler for GET /api/setup/copilot-status
 * Returns Copilot CLI installation and authentication status
 */
export function createCopilotStatusHandler() {
  const installCommand = 'npm install -g @github/copilot';
  const loginCommand = 'gh auth login';

  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Check if user has manually disconnected from the app
      if (await isCopilotDisconnectedFromApp()) {
        res.json({
          success: true,
          installed: true,
          version: null,
          path: null,
          auth: {
            authenticated: false,
            method: 'none',
          },
          installCommand,
          loginCommand,
        });
        return;
      }

      const provider = new CopilotProvider();
      const status = await provider.detectInstallation();
      const auth = await provider.checkAuth();

      res.json({
        success: true,
        installed: status.installed,
        version: status.version || null,
        path: status.path || null,
        auth: {
          authenticated: auth.authenticated,
          method: auth.method,
          login: auth.login,
          host: auth.host,
          error: auth.error,
        },
        installCommand,
        loginCommand,
      });
    } catch (error) {
      logError(error, 'Get Copilot status failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
