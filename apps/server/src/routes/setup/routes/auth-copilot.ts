/**
 * POST /auth-copilot endpoint - Connect Copilot CLI to the app
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const DISCONNECTED_MARKER_FILE = '.copilot-disconnected';

/**
 * Creates handler for POST /api/setup/auth-copilot
 * Removes the disconnection marker to allow Copilot CLI to be used
 */
export function createAuthCopilotHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const projectRoot = process.cwd();
      const automakerDir = path.join(projectRoot, '.automaker');
      const markerPath = path.join(automakerDir, DISCONNECTED_MARKER_FILE);

      // Remove the disconnection marker if it exists
      try {
        await fs.unlink(markerPath);
      } catch {
        // File doesn't exist, nothing to remove
      }

      res.json({
        success: true,
        message: 'Copilot CLI connected to app',
      });
    } catch (error) {
      logError(error, 'Auth Copilot failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
