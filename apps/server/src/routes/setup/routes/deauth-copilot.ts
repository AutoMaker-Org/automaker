/**
 * POST /deauth-copilot endpoint - Disconnect Copilot CLI from the app
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const DISCONNECTED_MARKER_FILE = '.copilot-disconnected';

/**
 * Creates handler for POST /api/setup/deauth-copilot
 * Creates a marker file to disconnect Copilot CLI from the app
 */
export function createDeauthCopilotHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const projectRoot = process.cwd();
      const automakerDir = path.join(projectRoot, '.automaker');

      // Ensure .automaker directory exists
      await fs.mkdir(automakerDir, { recursive: true });

      const markerPath = path.join(automakerDir, DISCONNECTED_MARKER_FILE);

      // Create the disconnection marker
      await fs.writeFile(markerPath, 'Copilot CLI disconnected from app');

      res.json({
        success: true,
        message: 'Copilot CLI disconnected from app',
      });
    } catch (error) {
      logError(error, 'Deauth Copilot failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
